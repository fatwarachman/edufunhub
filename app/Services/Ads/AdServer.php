<?php

namespace App\Services\Ads;

use App\Models\AdCampaign;
use App\Models\AdCreative;
use App\Models\AdDailyStat;
use App\Models\AdEvent;
use App\Models\AdPlacementSetting;
use App\Models\Setting;
use App\Models\User;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Collection;
use Illuminate\Database\UniqueConstraintViolationException;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;

/**
 * Picks which creatives fill a game page's placements and records what
 * players saw. Selection is weighted by campaign weight among live
 * campaigns that target the game and the player's grade and still have
 * impressions left (total and today). Every served creative carries a signed
 * serve token so tracking calls cannot be forged or replayed for another ad.
 */
class AdServer
{
    public const SETTING_ENABLED = 'ads.enabled';

    /**
     * Whether this viewer should see ads at all: the global switch is on and
     * the account is not excluded (per-user "disable ads").
     */
    public function showsAdsTo(?User $user): bool
    {
        if (! filter_var(Setting::get(self::SETTING_ENABLED, '1'), FILTER_VALIDATE_BOOLEAN)) {
            return false;
        }

        return ! ($user?->ads_disabled ?? false);
    }

    /**
     * Ads for a game page, keyed by placement. A static placement gets one
     * creative per page view; a rotating placement gets up to N creatives
     * (weighted order) that the client cycles through. A creative is not
     * repeated across visual placements when another one is available.
     *
     * @return array<string, array<string, mixed>>
     */
    public function forGame(string $game, ?User $user, ?string $device = null): array
    {
        if (! $this->showsAdsTo($user)) {
            return [];
        }
        $grade = $user?->playerProfile?->grade;
        $settings = AdPlacementSetting::resolved();
        $pool = $this->eligible($game, $grade);
        if ($pool->isEmpty()) {
            return [];
        }

        $served = [];
        $used = [];
        foreach ($settings as $placement => $rule) {
            if ($placement === 'shop.item' || ! $rule['is_enabled']) {
                continue;
            }
            $candidates = $pool->filter(fn (AdCreative $c): bool => in_array($placement, $c->placements ?? [], true)
                && $this->fits($c, $placement));
            if ($candidates->isEmpty()) {
                continue;
            }

            if ($rule['mode'] === 'rotate') {
                $order = $this->weightedOrder($candidates, $rule['max_creatives']);
                $items = $order->map(fn (AdCreative $c): array => $this->present($c, $placement, $game, $user, $device))->values()->all();
                $served[$placement] = [...$items[0], 'mode' => 'rotate', 'rotate_seconds' => $rule['rotate_seconds'], 'items' => $items];
                array_push($used, ...$order->modelKeys());

                continue;
            }

            $fresh = $candidates->reject(fn (AdCreative $c): bool => in_array($c->id, $used, true));
            $pick = $this->weightedPick($fresh->isNotEmpty() ? $fresh : $candidates);
            if ($pick === null) {
                continue;
            }
            $used[] = $pick->id;
            $served[$placement] = [...$this->present($pick, $placement, $game, $user, $device), 'mode' => 'static'];
        }

        return $served;
    }

    /**
     * Sponsored character item ids with the sponsor's name, for the shop.
     *
     * @return array<int, array{advertiser: string, logo_url: ?string, motto: ?string, serve: string}>
     */
    public function sponsoredItems(?User $user): array
    {
        if (! $this->showsAdsTo($user) || ! (AdPlacementSetting::resolved()['shop.item']['is_enabled'] ?? true)) {
            return [];
        }
        $grade = $user?->playerProfile?->grade;

        return $this->eligible(null, $grade)
            ->filter(fn (AdCreative $c): bool => $c->type === 'item' && $c->character_item_id !== null && in_array('shop.item', $c->placements ?? [], true))
            ->mapWithKeys(fn (AdCreative $c): array => [$c->character_item_id => [
                'advertiser' => (string) ($c->campaign->advertiser->brand ?: $c->campaign->advertiser->name),
                'logo_url' => $c->image_url ?? $c->campaign->advertiser->logo_url,
                'motto' => $c->motto,
                'serve' => $this->serveToken($c, 'shop.item', null, $user),
            ]])
            ->all();
    }

    /**
     * Records an impression, click or jingle play from a serve token.
     * Duplicates for the same serve are ignored. Returns false for invalid
     * tokens or creatives that no longer exist.
     */
    public function track(string $token, string $type, ?User $user): bool
    {
        $claims = $this->verify($token);
        if ($claims === null || ! in_array($type, AdEvent::TYPES, true)) {
            return false;
        }
        if ($claims['u'] !== null && $claims['u'] !== $user?->id) {
            return false;
        }
        $creative = AdCreative::query()->find($claims['c']);
        if ($creative === null) {
            return false;
        }

        try {
            DB::transaction(function () use ($creative, $claims, $type, $user): void {
                AdEvent::query()->create([
                    'ad_creative_id' => $creative->id,
                    'ad_campaign_id' => $creative->ad_campaign_id,
                    'user_id' => $user?->id,
                    'type' => $type,
                    'placement' => $claims['p'],
                    'game_key' => $claims['g'],
                    'device' => $claims['d'],
                    'grade' => $user?->playerProfile?->grade,
                    'serve_id' => $claims['s'],
                ]);
                $column = ['impression' => 'impressions', 'click' => 'clicks', 'play' => 'plays'][$type];
                $key = [
                    'day' => now()->toDateString(),
                    'ad_creative_id' => $creative->id,
                    'placement' => $claims['p'],
                    'game_key' => (string) $claims['g'],
                ];
                AdDailyStat::query()->insertOrIgnore([...$key, 'ad_campaign_id' => $creative->ad_campaign_id]);
                AdDailyStat::query()->where($key)->increment($column);
            });
        } catch (UniqueConstraintViolationException) {
            return true;
        }

        return true;
    }

    /** Click target for a serve token (after recording the click). */
    public function clickUrl(string $token): ?string
    {
        $claims = $this->verify($token);
        $url = $claims ? AdCreative::query()->whereKey($claims['c'])->value('click_url') : null;

        return is_string($url) && str_starts_with($url, 'https://') ? $url : null;
    }

    /** @return Collection<int, AdCreative> */
    private function eligible(?string $game, ?int $grade): Collection
    {
        $campaigns = AdCampaign::query()
            ->live()
            ->with(['advertiser', 'creatives' => fn ($q) => $q->where('is_active', true)])
            ->get()
            ->filter(fn (AdCampaign $c): bool => ($game === null || $c->targetsGame($game)) && $c->targetsGrade($grade));

        $ids = $campaigns->modelKeys();
        if ($ids === []) {
            return new Collection;
        }
        $totals = AdDailyStat::query()->whereIn('ad_campaign_id', $ids)
            ->groupBy('ad_campaign_id')->selectRaw('ad_campaign_id, SUM(impressions) as total')->pluck('total', 'ad_campaign_id');
        $today = AdDailyStat::query()->whereIn('ad_campaign_id', $ids)->whereDate('day', now()->toDateString())
            ->groupBy('ad_campaign_id')->selectRaw('ad_campaign_id, SUM(impressions) as total')->pluck('total', 'ad_campaign_id');

        return new Collection($campaigns
            ->filter(fn (AdCampaign $c): bool => ($c->max_impressions === null || (int) ($totals[$c->id] ?? 0) < $c->max_impressions)
                && ($c->daily_max_impressions === null || (int) ($today[$c->id] ?? 0) < $c->daily_max_impressions))
            ->flatMap(fn (AdCampaign $c) => $c->creatives->each(fn (AdCreative $cr) => $cr->setRelation('campaign', $c)))
            ->values()
            ->all());
    }

    private function fits(AdCreative $creative, string $placement): bool
    {
        $spec = (array) (config('ads.placements')[$placement] ?? []);
        if (! in_array($creative->type, $spec['types'] ?? [], true)) {
            return false;
        }
        if ($creative->type === 'logo' && ! empty($spec['sizes'])) {
            return in_array($creative->size, $spec['sizes'], true);
        }
        if ($creative->type === 'jingle') {
            return $creative->audio_path !== null;
        }

        return true;
    }

    /**
     * Weighted random order without replacement, capped at $limit.
     *
     * @param  \Illuminate\Support\Collection<int, AdCreative>  $creatives
     * @return Collection<int, AdCreative>
     */
    private function weightedOrder($creatives, int $limit): Collection
    {
        $left = $creatives->values();
        $order = new Collection;
        while ($left->isNotEmpty() && $order->count() < max(1, $limit)) {
            $pick = $this->weightedPick($left);
            if ($pick === null) {
                break;
            }
            $order->push($pick);
            $left = $left->reject(fn (AdCreative $c): bool => $c->id === $pick->id)->values();
        }

        return $order;
    }

    /** @param  \Illuminate\Support\Collection<int, AdCreative>  $creatives */
    private function weightedPick($creatives): ?AdCreative
    {
        $total = $creatives->sum(fn (AdCreative $c): int => max(1, (int) $c->campaign->weight));
        if ($total <= 0) {
            return null;
        }
        $roll = random_int(1, $total);
        foreach ($creatives as $creative) {
            $roll -= max(1, (int) $creative->campaign->weight);
            if ($roll <= 0) {
                return $creative;
            }
        }

        return null;
    }

    /** @return array<string, mixed> */
    private function present(AdCreative $creative, string $placement, ?string $game, ?User $user, ?string $device = null): array
    {
        $advertiser = $creative->campaign->advertiser;

        return [
            'type' => $creative->type,
            'placement' => $placement,
            'advertiser' => (string) ($advertiser->brand ?: $advertiser->name),
            'image_url' => $creative->image_url ?? ($creative->type === 'motto' ? $advertiser->logo_url : null),
            'audio_url' => $creative->audio_url,
            'motto' => $creative->motto,
            'size' => $creative->size,
            'has_link' => is_string($creative->click_url) && str_starts_with($creative->click_url, 'https://'),
            'background_color' => $creative->background_color,
            'text_color' => $creative->text_color,
            'display_seconds' => $creative->display_seconds,
            'moment' => config('ads.placements')[$placement]['moment'] ?? null,
            'serve' => $this->serveToken($creative, $placement, $game, $user, $device),
        ];
    }

    private function serveToken(AdCreative $creative, string $placement, ?string $game, ?User $user, ?string $device = null): string
    {
        $payload = rtrim(strtr(base64_encode((string) json_encode([
            'c' => $creative->id,
            'p' => $placement,
            'g' => $game,
            'u' => $user?->id,
            'd' => in_array($device, ['mobile', 'tablet', 'desktop'], true) ? $device : null,
            's' => Str::lower(Str::random(20)),
            'e' => now()->addSeconds((int) config('ads.serve_ttl'))->getTimestamp(),
        ])), '+/', '-_'), '=');

        return $payload.'.'.hash_hmac('sha256', $payload, $this->secret());
    }

    /** @return array{c: int, p: string, g: ?string, u: ?int, d: ?string, s: string, e: int}|null */
    private function verify(string $token): ?array
    {
        $parts = explode('.', $token);
        if (count($parts) !== 2 || ! hash_equals(hash_hmac('sha256', $parts[0], $this->secret()), $parts[1])) {
            return null;
        }
        $claims = json_decode((string) base64_decode(strtr($parts[0], '-_', '+/')), true);
        if (! is_array($claims) || ! isset($claims['c'], $claims['p'], $claims['s'], $claims['e']) || $claims['e'] < now()->getTimestamp()) {
            return null;
        }
        if (! array_key_exists((string) $claims['p'], (array) config('ads.placements'))) {
            return null;
        }

        return [
            'c' => (int) $claims['c'],
            'p' => (string) $claims['p'],
            'g' => isset($claims['g']) ? Str::limit((string) $claims['g'], 40, '') : null,
            'u' => isset($claims['u']) ? (int) $claims['u'] : null,
            'd' => in_array($claims['d'] ?? null, ['mobile', 'tablet', 'desktop'], true) ? $claims['d'] : null,
            's' => Str::limit((string) $claims['s'], 40, ''),
            'e' => (int) $claims['e'],
        ];
    }

    private function secret(): string
    {
        return hash('sha256', 'ads|'.config('app.key'));
    }

    /**
     * Campaign totals for the admin list.
     *
     * @param  list<int>  $campaignIds
     * @return array<int, array{impressions: int, clicks: int, plays: int, today: int}>
     */
    public function totals(array $campaignIds): array
    {
        if ($campaignIds === []) {
            return [];
        }
        $rows = AdDailyStat::query()->whereIn('ad_campaign_id', $campaignIds)
            ->groupBy('ad_campaign_id')
            ->selectRaw('ad_campaign_id, SUM(impressions) as impressions, SUM(clicks) as clicks, SUM(plays) as plays')
            ->get()->keyBy('ad_campaign_id');
        $today = AdDailyStat::query()->whereIn('ad_campaign_id', $campaignIds)->whereDate('day', now()->toDateString())
            ->groupBy('ad_campaign_id')->selectRaw('ad_campaign_id, SUM(impressions) as total')->pluck('total', 'ad_campaign_id');

        return collect($campaignIds)->mapWithKeys(fn (int $id): array => [$id => [
            'impressions' => (int) ($rows[$id]->impressions ?? 0),
            'clicks' => (int) ($rows[$id]->clicks ?? 0),
            'plays' => (int) ($rows[$id]->plays ?? 0),
            'today' => (int) ($today[$id] ?? 0),
        ]])->all();
    }

    /**
     * Campaign analytics: delivery over time, reach and frequency, CTR per
     * placement / game / creative, audience by device and grade, and the
     * hours of the day when the campaign is seen.
     *
     * @return array<string, mixed>
     */
    public function report(AdCampaign $campaign): array
    {
        $base = fn (): Builder => AdDailyStat::query()->where('ad_campaign_id', $campaign->id);
        $events = fn (): Builder => AdEvent::query()->where('ad_campaign_id', $campaign->id);
        $sum = 'SUM(impressions) as impressions, SUM(clicks) as clicks, SUM(plays) as plays';
        $row = fn ($r, string $key, ?string $label = null): array => [
            $key => (string) ($label ?? $r->{$key}),
            'impressions' => (int) $r->impressions,
            'clicks' => (int) $r->clicks,
            'plays' => (int) $r->plays,
            'ctr' => (int) $r->impressions > 0 ? round(((int) $r->clicks / (int) $r->impressions) * 100, 2) : null,
        ];

        $impressionEvents = fn (): Builder => $events()->where('type', 'impression');
        $reach = (int) $impressionEvents()->whereNotNull('user_id')->distinct()->count('user_id');
        $loggedImpressions = (int) $impressionEvents()->whereNotNull('user_id')->count();
        $clickers = (int) $events()->where('type', 'click')->whereNotNull('user_id')->distinct()->count('user_id');
        $listeners = (int) $events()->where('type', 'play')->whereNotNull('user_id')->distinct()->count('user_id');
        $driver = DB::connection()->getDriverName();
        $hourExpr = match ($driver) {
            'sqlite' => "CAST(strftime('%H', created_at) AS INTEGER)",
            'pgsql' => 'EXTRACT(HOUR FROM created_at)',
            default => 'HOUR(created_at)',
        };
        $hours = $impressionEvents()->selectRaw("{$hourExpr} as hour, COUNT(*) as total")->groupBy('hour')->pluck('total', 'hour');
        $frequency = $impressionEvents()->whereNotNull('user_id')->groupBy('user_id')->selectRaw('COUNT(*) as views')->pluck('views')
            ->map(fn ($v): string => match (true) {
                (int) $v === 1 => '1',
                (int) $v <= 3 => '2–3',
                (int) $v <= 9 => '4–9',
                default => '10+',
            })->countBy();

        return [
            'daily' => $base()->groupBy('day')->selectRaw('day, '.$sum)->orderBy('day')->get()
                ->map(fn ($r): array => ['day' => $r->day->toDateString(), 'impressions' => (int) $r->impressions, 'clicks' => (int) $r->clicks, 'plays' => (int) $r->plays])->all(),
            'placements' => $base()->groupBy('placement')->selectRaw('placement, '.$sum)->orderByDesc('impressions')->get()->map(fn ($r) => $row($r, 'placement'))->all(),
            'games' => $base()->groupBy('game_key')->selectRaw('game_key as game, '.$sum)->orderByDesc('impressions')->get()->map(fn ($r) => $row($r, 'game'))->all(),
            'creatives' => $base()->groupBy('ad_creative_id')->selectRaw('ad_creative_id, '.$sum)->get()
                ->mapWithKeys(fn ($r): array => [(int) $r->ad_creative_id => [
                    'impressions' => (int) $r->impressions, 'clicks' => (int) $r->clicks, 'plays' => (int) $r->plays,
                    'ctr' => (int) $r->impressions > 0 ? round(((int) $r->clicks / (int) $r->impressions) * 100, 2) : null,
                ]])->all(),
            'audience' => [
                'reach' => $reach,
                'frequency' => $reach > 0 ? round($loggedImpressions / $reach, 2) : null,
                'unique_clickers' => $clickers,
                'unique_listeners' => $listeners,
                'guest_impressions' => (int) $impressionEvents()->whereNull('user_id')->count(),
            ],
            'frequency_buckets' => collect(['1', '2–3', '4–9', '10+'])->map(fn (string $b): array => ['bucket' => $b, 'users' => (int) ($frequency[$b] ?? 0)])->all(),
            'devices' => $events()->groupBy('device')->selectRaw("COALESCE(device, 'unknown') as device_key, SUM(CASE WHEN type = 'impression' THEN 1 ELSE 0 END) as impressions, SUM(CASE WHEN type = 'click' THEN 1 ELSE 0 END) as clicks, SUM(CASE WHEN type = 'play' THEN 1 ELSE 0 END) as plays")
                ->get()->map(fn ($r) => $row($r, 'device', $r->device_key))->sortByDesc('impressions')->values()->all(),
            'grades' => $events()->whereNotNull('grade')->groupBy('grade')->selectRaw("grade, SUM(CASE WHEN type = 'impression' THEN 1 ELSE 0 END) as impressions, SUM(CASE WHEN type = 'click' THEN 1 ELSE 0 END) as clicks, SUM(CASE WHEN type = 'play' THEN 1 ELSE 0 END) as plays")
                ->orderBy('grade')->get()->map(fn ($r) => $row($r, 'grade'))->all(),
            'hours' => collect(range(0, 23))->map(fn (int $h): array => ['hour' => $h, 'impressions' => (int) ($hours[$h] ?? 0)])->all(),
        ];
    }
}
