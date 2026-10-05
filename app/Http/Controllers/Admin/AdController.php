<?php

namespace App\Http\Controllers\Admin;

use App\Http\Controllers\Controller;
use App\Http\Requests\Admin\AdCampaignRequest;
use App\Http\Requests\Admin\AdCreativeRequest;
use App\Http\Requests\Admin\AdvertiserRequest;
use App\Models\AdCampaign;
use App\Models\AdCreative;
use App\Models\AdDailyStat;
use App\Models\AdPlacementSetting;
use App\Models\Advertiser;
use App\Models\CharacterItem;
use App\Models\Setting;
use App\Models\User;
use App\Services\Ads\AdMedia;
use App\Services\Ads\AdServer;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\DB;
use Inertia\Inertia;
use Inertia\Response;

/**
 * Superadmin ad management: advertisers, campaigns (flight, contract, caps,
 * targeting), creatives (logo, motto, jingle, sponsored item) and reports.
 */
class AdController extends Controller
{
    public function __construct(private AdServer $server) {}

    public function index(Request $request): Response
    {
        $campaigns = AdCampaign::query()->with('advertiser:id,name,brand,logo_path')->withCount('creatives')
            ->latest('starts_on')->get();
        $totals = $this->server->totals($campaigns->modelKeys());
        $advertisers = Advertiser::query()->withCount('campaigns')->orderBy('name')->get();
        $since = now()->subDays(29)->toDateString();
        $daily = AdDailyStat::query()->whereDate('day', '>=', $since)->groupBy('day')
            ->selectRaw('day, SUM(impressions) as impressions, SUM(clicks) as clicks, SUM(plays) as plays')
            ->orderBy('day')->get();
        $byPlacement = AdDailyStat::query()->whereDate('day', '>=', $since)->groupBy('placement')
            ->selectRaw('placement, SUM(impressions) as impressions, SUM(clicks) as clicks, SUM(plays) as plays')->get()->keyBy('placement');
        $liveCreatives = AdCreative::query()->where('is_active', true)
            ->whereHas('campaign', fn ($q) => $q->live())->get(['id', 'placements']);

        $campaignRows = $campaigns->map(fn (AdCampaign $c): array => [
            ...$this->campaignRow($c),
            'stats' => $totals[$c->id] ?? ['impressions' => 0, 'clicks' => 0, 'plays' => 0, 'today' => 0],
        ])->values();

        return Inertia::render('admin/ads/index', [
            'tab' => in_array($request->query('tab'), ['overview', 'campaigns', 'advertisers', 'inventory', 'settings'], true) ? $request->query('tab') : 'overview',
            'controls' => [
                'enabled' => $this->server->showsAdsTo(null),
                'placements' => AdPlacementSetting::resolved(),
                'excluded_users' => User::query()->where('ads_disabled', true)->orderBy('name')->limit(200)
                    ->get(['id', 'name', 'email'])->map(fn (User $u): array => ['id' => $u->id, 'name' => $u->name, 'email' => $u->email])->values(),
                'excluded_count' => User::query()->where('ads_disabled', true)->count(),
                'max_creatives' => AdPlacementSetting::MAX_CREATIVES,
            ],
            'campaigns' => $campaignRows,
            'advertisers' => $advertisers->map(fn (Advertiser $a): array => [
                ...$this->advertiserRow($a),
                'campaigns_count' => $a->campaigns_count,
                'live_campaigns' => $campaignRows->where('advertiser_id', $a->id)->where('display_status', 'live')->count(),
            ])->values(),
            'summary' => [
                'live_campaigns' => $campaignRows->where('display_status', 'live')->count(),
                'advertisers' => $advertisers->where('is_active', true)->count(),
                'contract_value_live' => (int) $campaignRows->where('display_status', 'live')->sum('contract_value'),
                'contract_value_year' => (int) $campaigns->filter(fn (AdCampaign $c) => $c->starts_on->year === now()->year && $c->status !== 'draft')->sum('contract_value'),
                'impressions_30d' => (int) $daily->sum('impressions'),
                'clicks_30d' => (int) $daily->sum('clicks'),
                'plays_30d' => (int) $daily->sum('plays'),
                'ending_soon' => $campaignRows->where('display_status', 'live')->filter(fn (array $c) => $c['days_left'] <= 7)->values(),
            ],
            'daily' => $this->fillDays($daily, 30),
            'inventory' => collect((array) config('ads.placements'))->map(fn (array $spec, string $key): array => [
                'key' => $key,
                'label' => $spec['label'],
                'types' => $spec['types'],
                'sizes' => $spec['sizes'] ?? [],
                'moment' => $spec['moment'] ?? null,
                'live_creatives' => $liveCreatives->filter(fn (AdCreative $c) => in_array($key, $c->placements ?? [], true))->count(),
                'impressions_30d' => (int) ($byPlacement[$key]->impressions ?? 0),
                'clicks_30d' => (int) ($byPlacement[$key]->clicks ?? 0),
                'plays_30d' => (int) ($byPlacement[$key]->plays ?? 0),
            ])->values(),
            'sizes' => config('ads.sizes'),
        ]);
    }

    /** Global ad switch (hide every ad space for everyone). */
    public function toggleGlobal(Request $request): RedirectResponse
    {
        $enabled = $request->validate(['enabled' => ['required', 'boolean']])['enabled'];
        Setting::set(AdServer::SETTING_ENABLED, $enabled ? '1' : '0', 'ads');
        activity()->causedBy($request->user())->withProperties(['enabled' => (bool) $enabled])->log($enabled ? 'Enabled ads for all users' : 'Disabled ads for all users');

        return back()->with('success', $enabled ? 'Ads are shown again.' : 'Ads are hidden for all users.');
    }

    /** Per-placement rules: on/off, static or rotating, interval and pool size. */
    public function updatePlacements(Request $request): RedirectResponse
    {
        $keys = array_keys((array) config('ads.placements'));
        $data = $request->validate([
            'placements' => ['required', 'array'],
            'placements.*.is_enabled' => ['required', 'boolean'],
            'placements.*.mode' => ['required', 'in:'.implode(',', AdPlacementSetting::MODES)],
            'placements.*.rotate_seconds' => ['required', 'integer', 'min:3', 'max:120'],
            'placements.*.max_creatives' => ['required', 'integer', 'min:2', 'max:'.AdPlacementSetting::MAX_CREATIVES],
        ]);

        foreach ($data['placements'] as $key => $rule) {
            if (! in_array($key, $keys, true)) {
                continue;
            }
            $static = str_starts_with($key, 'jingle.') || $key === 'shop.item';
            AdPlacementSetting::query()->updateOrCreate(['placement' => $key], [
                'is_enabled' => (bool) $rule['is_enabled'],
                'mode' => $static ? 'static' : $rule['mode'],
                'rotate_seconds' => (int) $rule['rotate_seconds'],
                'max_creatives' => (int) $rule['max_creatives'],
            ]);
        }
        activity()->causedBy($request->user())->log('Updated ad placement settings');

        return back()->with('success', 'Placement settings saved.');
    }

    /** Hide or show ads for one account. */
    public function toggleUser(Request $request, User $user): RedirectResponse
    {
        $disabled = $request->validate(['ads_disabled' => ['required', 'boolean']])['ads_disabled'];
        $user->forceFill(['ads_disabled' => (bool) $disabled])->save();
        activity()->causedBy($request->user())->performedOn($user)->withProperties(['ads_disabled' => (bool) $disabled])
            ->log($disabled ? 'Disabled ads for user' : 'Enabled ads for user');

        return back()->with('success', $disabled ? "Ads hidden for {$user->name}." : "Ads shown again for {$user->name}.");
    }

    /** Users matching a search, to add to the ad exclusion list. */
    public function searchUsers(Request $request): JsonResponse
    {
        $term = trim((string) $request->query('q', ''));
        if (mb_strlen($term) < 2) {
            return response()->json([]);
        }

        return response()->json(User::query()
            ->where(fn ($q) => $q->where('name', 'like', "%{$term}%")->orWhere('email', 'like', "%{$term}%"))
            ->orderBy('name')->limit(10)->get(['id', 'name', 'email', 'ads_disabled']));
    }

    public function showCampaign(AdCampaign $campaign): Response
    {
        $campaign->load(['advertiser', 'creatives.characterItem:id,key,name_id,name_en,slot,style,color']);
        $report = $this->server->report($campaign);
        $totals = $this->server->totals([$campaign->id])[$campaign->id];
        $days = max(1, min(90, $campaign->starts_on->diffInDays(min($campaign->ends_on, now())) + 1));

        return Inertia::render('admin/ads/campaign', [
            'campaign' => [
                ...$this->campaignRow($campaign),
                'contract_number' => $campaign->contract_number,
                'notes' => $campaign->notes,
                'stats' => $totals,
                'advertiser' => $this->advertiserRow($campaign->advertiser),
            ],
            'creatives' => $campaign->creatives->map(fn (AdCreative $c): array => [
                ...$this->creativeRow($c),
                'stats' => $report['creatives'][$c->id] ?? ['impressions' => 0, 'clicks' => 0, 'plays' => 0, 'ctr' => null],
            ])->values(),
            'report' => [
                'daily' => $this->fillDays(collect($report['daily'])->map(fn (array $r) => (object) $r), $days, min($campaign->ends_on, now())->toDateString()),
                'placements' => $report['placements'],
                'games' => $report['games'],
                'audience' => $report['audience'],
                'frequency_buckets' => $report['frequency_buckets'],
                'devices' => $report['devices'],
                'grades' => $report['grades'],
                'hours' => $report['hours'],
            ],
            ...$this->creativeOptions(),
        ]);
    }

    public function createAdvertiser(): Response
    {
        return Inertia::render('admin/ads/advertiser-form', ['advertiser' => null]);
    }

    public function storeAdvertiser(AdvertiserRequest $request): RedirectResponse
    {
        $data = $request->safe()->except(['logo', 'remove_logo']);
        if ($request->hasFile('logo')) {
            $data['logo_path'] = AdMedia::store($request->file('logo'), 'logos');
        }
        $advertiser = Advertiser::query()->create($data);
        activity()->causedBy($request->user())->performedOn($advertiser)->log('Created advertiser');

        return to_route('admin.ads.index', ['tab' => 'advertisers'])->with('success', 'Advertiser created.');
    }

    public function editAdvertiser(Advertiser $advertiser): Response
    {
        return Inertia::render('admin/ads/advertiser-form', ['advertiser' => [...$this->advertiserRow($advertiser), 'notes' => $advertiser->notes, 'address' => $advertiser->address, 'tax_id' => $advertiser->tax_id]]);
    }

    public function updateAdvertiser(AdvertiserRequest $request, Advertiser $advertiser): RedirectResponse
    {
        $data = $request->safe()->except(['logo', 'remove_logo']);
        if ($request->hasFile('logo') || $request->boolean('remove_logo')) {
            AdMedia::delete($advertiser->logo_path);
            $data['logo_path'] = $request->hasFile('logo') ? AdMedia::store($request->file('logo'), 'logos') : null;
        }
        $advertiser->update($data);
        activity()->causedBy($request->user())->performedOn($advertiser)->log('Updated advertiser');

        return to_route('admin.ads.index', ['tab' => 'advertisers'])->with('success', 'Advertiser saved.');
    }

    public function destroyAdvertiser(Request $request, Advertiser $advertiser): RedirectResponse
    {
        if ($advertiser->campaigns()->whereIn('status', ['active', 'paused'])->exists()) {
            return back()->with('error', 'End or delete this advertiser\'s active campaigns first.');
        }
        $advertiser->delete();
        activity()->causedBy($request->user())->performedOn($advertiser)->log('Deleted advertiser');

        return to_route('admin.ads.index', ['tab' => 'advertisers'])->with('success', 'Advertiser deleted.');
    }

    public function createCampaign(Request $request): Response
    {
        return Inertia::render('admin/ads/campaign-form', [
            'campaign' => null,
            'advertiserId' => $request->integer('advertiser') ?: null,
            ...$this->campaignOptions(),
        ]);
    }

    public function storeCampaign(AdCampaignRequest $request): RedirectResponse
    {
        $campaign = AdCampaign::query()->create([...$request->validated(), 'created_by' => $request->user()->id]);
        activity()->causedBy($request->user())->performedOn($campaign)->log('Created ad campaign');

        return to_route('admin.ads.campaigns.show', $campaign)->with('success', 'Campaign created. Add creatives next.');
    }

    public function editCampaign(AdCampaign $campaign): Response
    {
        return Inertia::render('admin/ads/campaign-form', [
            'campaign' => [...$this->campaignRow($campaign), 'contract_number' => $campaign->contract_number, 'notes' => $campaign->notes],
            'advertiserId' => $campaign->advertiser_id,
            ...$this->campaignOptions(),
        ]);
    }

    public function updateCampaign(AdCampaignRequest $request, AdCampaign $campaign): RedirectResponse
    {
        $campaign->update($request->validated());
        activity()->causedBy($request->user())->performedOn($campaign)->log('Updated ad campaign');

        return to_route('admin.ads.campaigns.show', $campaign)->with('success', 'Campaign saved.');
    }

    public function statusCampaign(Request $request, AdCampaign $campaign): RedirectResponse
    {
        $status = $request->validate(['status' => ['required', 'in:'.implode(',', AdCampaign::STATUSES)]])['status'];
        if ($status === 'active' && ! $campaign->creatives()->where('is_active', true)->exists()) {
            return back()->with('error', 'Add at least one active creative before activating.');
        }
        $campaign->update(['status' => $status]);
        activity()->causedBy($request->user())->performedOn($campaign)->withProperties(['status' => $status])->log('Changed ad campaign status');

        return back()->with('success', 'Campaign is now '.$status.'.');
    }

    public function destroyCampaign(Request $request, AdCampaign $campaign): RedirectResponse
    {
        $campaign->delete();
        activity()->causedBy($request->user())->performedOn($campaign)->log('Deleted ad campaign');

        return to_route('admin.ads.index', ['tab' => 'campaigns'])->with('success', 'Campaign deleted.');
    }

    public function storeCreative(AdCreativeRequest $request, AdCampaign $campaign): RedirectResponse
    {
        $creative = new AdCreative(['ad_campaign_id' => $campaign->id]);
        $this->fillCreative($creative, $request);
        activity()->causedBy($request->user())->performedOn($campaign)->withProperties(['creative' => $creative->name])->log('Added ad creative');

        return back()->with('success', 'Creative added.');
    }

    public function updateCreative(AdCreativeRequest $request, AdCampaign $campaign, AdCreative $creative): RedirectResponse
    {
        abort_unless($creative->ad_campaign_id === $campaign->id, 404);
        $this->fillCreative($creative, $request);
        activity()->causedBy($request->user())->performedOn($campaign)->withProperties(['creative' => $creative->name])->log('Updated ad creative');

        return back()->with('success', 'Creative saved.');
    }

    public function destroyCreative(Request $request, AdCampaign $campaign, AdCreative $creative): RedirectResponse
    {
        abort_unless($creative->ad_campaign_id === $campaign->id, 404);
        DB::transaction(function () use ($creative): void {
            if ($creative->character_item_id) {
                CharacterItem::query()->whereKey($creative->character_item_id)->update(['advertiser_id' => null]);
            }
            $creative->delete();
        });
        AdMedia::delete($creative->image_path);
        AdMedia::delete($creative->audio_path);
        activity()->causedBy($request->user())->performedOn($campaign)->withProperties(['creative' => $creative->name])->log('Deleted ad creative');

        return back()->with('success', 'Creative deleted.');
    }

    private function fillCreative(AdCreative $creative, AdCreativeRequest $request): void
    {
        $data = $request->safe()->except(['image', 'audio']);
        $type = $data['type'];
        if ($request->hasFile('image')) {
            AdMedia::delete($creative->image_path);
            $data['image_path'] = AdMedia::store($request->file('image'), 'images');
        }
        if ($type === 'jingle' && $request->hasFile('audio')) {
            AdMedia::delete($creative->audio_path);
            $data['audio_path'] = AdMedia::store($request->file('audio'), 'audio');
        }
        if ($type !== 'jingle') {
            AdMedia::delete($creative->audio_path);
            $data['audio_path'] = null;
            $data['audio_seconds'] = null;
        }
        if ($type !== 'logo') {
            $data['size'] = null;
        }
        if ($type !== 'item') {
            $data['character_item_id'] = null;
        }

        DB::transaction(function () use ($creative, $data, $type): void {
            $previousItem = $creative->character_item_id;
            $creative->fill($data)->save();
            if ($previousItem && $previousItem !== $creative->character_item_id) {
                CharacterItem::query()->whereKey($previousItem)->update(['advertiser_id' => null]);
            }
            if ($type === 'item' && $creative->character_item_id) {
                CharacterItem::query()->whereKey($creative->character_item_id)
                    ->update(['advertiser_id' => AdCampaign::query()->whereKey($creative->ad_campaign_id)->value('advertiser_id')]);
            }
        });
    }

    /** @return array<string, mixed> */
    private function campaignRow(AdCampaign $c): array
    {
        $today = now()->startOfDay();

        return [
            'id' => $c->id,
            'name' => $c->name,
            'advertiser_id' => $c->advertiser_id,
            'advertiser_name' => $c->advertiser?->brand ?: $c->advertiser?->name,
            'advertiser_logo' => $c->advertiser?->logo_url,
            'status' => $c->status,
            'display_status' => $c->displayStatus(),
            'starts_on' => $c->starts_on->toDateString(),
            'ends_on' => $c->ends_on->toDateString(),
            'duration_days' => (int) $c->starts_on->diffInDays($c->ends_on) + 1,
            'days_left' => (int) max(0, $today->diffInDays($c->ends_on, false) + 1),
            'pricing_model' => $c->pricing_model,
            'contract_value' => $c->contract_value,
            'max_impressions' => $c->max_impressions,
            'daily_max_impressions' => $c->daily_max_impressions,
            'weight' => $c->weight,
            'target_games' => $c->target_games ?? [],
            'grade_min' => $c->grade_min,
            'grade_max' => $c->grade_max,
            'creatives_count' => $c->creatives_count ?? $c->creatives()->count(),
        ];
    }

    /** @return array<string, mixed> */
    private function advertiserRow(Advertiser $a): array
    {
        return [
            'id' => $a->id,
            'name' => $a->name,
            'brand' => $a->brand,
            'industry' => $a->industry,
            'contact_name' => $a->contact_name,
            'email' => $a->email,
            'phone' => $a->phone,
            'website' => $a->website,
            'logo_url' => $a->logo_url,
            'is_active' => $a->is_active,
        ];
    }

    /** @return array<string, mixed> */
    private function creativeRow(AdCreative $c): array
    {
        return [
            'id' => $c->id,
            'type' => $c->type,
            'name' => $c->name,
            'size' => $c->size,
            'placements' => $c->placements ?? [],
            'image_url' => $c->image_url,
            'audio_url' => $c->audio_url,
            'motto' => $c->motto,
            'click_url' => $c->click_url,
            'background_color' => $c->background_color,
            'text_color' => $c->text_color,
            'display_seconds' => $c->display_seconds,
            'audio_seconds' => $c->audio_seconds,
            'character_item_id' => $c->character_item_id,
            'character_item' => $c->characterItem ? [
                'id' => $c->characterItem->id,
                'name' => $c->characterItem->name_en ?: $c->characterItem->name_id,
                'slot' => $c->characterItem->slot,
                'style' => $c->characterItem->style,
                'color' => $c->characterItem->color,
            ] : null,
            'is_active' => $c->is_active,
        ];
    }

    /** @return array<string, mixed> */
    private function campaignOptions(): array
    {
        return [
            'advertisers' => Advertiser::query()->orderBy('name')->get(['id', 'name', 'brand', 'is_active'])
                ->map(fn (Advertiser $a): array => ['id' => $a->id, 'name' => $a->brand ? "{$a->brand} ({$a->name})" : $a->name, 'is_active' => $a->is_active]),
            'games' => AdCampaignRequest::gameKeys(),
            'statuses' => AdCampaign::STATUSES,
            'pricingModels' => AdCampaign::PRICING,
        ];
    }

    /** @return array<string, mixed> */
    private function creativeOptions(): array
    {
        return [
            'placementsCatalog' => collect((array) config('ads.placements'))->map(fn (array $p, string $k): array => ['key' => $k, ...$p])->values(),
            'sizes' => config('ads.sizes'),
            'types' => config('ads.types'),
            'maxAudioSeconds' => (int) config('ads.max_audio_seconds'),
            'maxImageKb' => (int) config('ads.max_image_kb'),
            'maxAudioKb' => (int) config('ads.max_audio_kb'),
            'characterItems' => CharacterItem::query()->orderBy('slot')->orderBy('sort_order')->get(['id', 'name_id', 'name_en', 'slot', 'advertiser_id'])
                ->map(fn (CharacterItem $i): array => ['id' => $i->id, 'name' => $i->name_en ?: $i->name_id, 'slot' => $i->slot, 'advertiser_id' => $i->advertiser_id]),
        ];
    }

    /**
     * Continuous day series ending today (or $end), zero-filled.
     *
     * @param  Collection<int, object>  $rows
     * @return list<array{day: string, impressions: int, clicks: int, plays: int}>
     */
    private function fillDays($rows, int $days, ?string $end = null): array
    {
        $byDay = collect($rows)->keyBy(fn ($r) => is_string($r->day) ? substr($r->day, 0, 10) : $r->day->toDateString());
        $endDay = $end ? now()->parse($end) : now();
        $series = [];
        for ($i = $days - 1; $i >= 0; $i--) {
            $day = $endDay->copy()->subDays($i)->toDateString();
            $row = $byDay[$day] ?? null;
            $series[] = ['day' => $day, 'impressions' => (int) ($row->impressions ?? 0), 'clicks' => (int) ($row->clicks ?? 0), 'plays' => (int) ($row->plays ?? 0)];
        }

        return $series;
    }
}
