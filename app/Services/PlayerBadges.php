<?php

namespace App\Services;

use App\Models\GameHistory;
use App\Models\GameMatchPlayer;
use App\Models\User;
use App\Models\UserBadge;
use Illuminate\Support\Carbon;
use Illuminate\Support\Collection;

/**
 * Player badges: earned from a mix of how often a player plays and how many
 * challenges they complete (see config/badges.php).
 */
class PlayerBadges
{
    /** Metrics a badge rule may use. */
    public const METRICS = ['plays', 'completed', 'success_rate', 'games', 'active_days', 'wins', 'streak'];

    /** Tier order, rarest last. */
    public const TIERS = ['bronze', 'silver', 'gold', 'legend'];

    public function __construct(private PlayerNotifications $notifications) {}

    /**
     * @return array<string, array{icon: string, tier: string, rules: array<string, int>}>
     */
    public function definitions(): array
    {
        return config('badges.badges');
    }

    /**
     * Play metrics of one player.
     *
     * @return array{plays: int, completed: int, success_rate: int, games: int, active_days: int, wins: int, streak: int}
     */
    public function stats(User $user): array
    {
        $histories = GameHistory::query()
            ->where('user_id', $user->id)
            ->get(['id', 'game_key', 'correct', 'wrong', 'played_at']);

        $wins = $this->wonHistoryIds($user);
        $pass = (int) config('badges.pass_percent', 70);

        $completed = $histories->filter(function (GameHistory $history) use ($pass, $wins): bool {
            if ($wins->contains($history->id)) {
                return true;
            }
            $answered = (int) $history->correct + (int) $history->wrong;

            return $history->correct !== null && $answered > 0 && $history->correct * 100 >= $pass * $answered;
        })->count();

        $timezone = (string) config('app.timezone');
        $days = $histories
            ->map(fn (GameHistory $history): string => $history->played_at->copy()->timezone($timezone)->toDateString())
            ->unique()
            ->values();

        $plays = $histories->count();

        return [
            'plays' => $plays,
            'completed' => $completed,
            'success_rate' => $plays > 0 ? (int) floor($completed / $plays * 100) : 0,
            'games' => $histories->pluck('game_key')->unique()->count(),
            'active_days' => $days->count(),
            'wins' => $wins->count(),
            'streak' => $this->streak($days, Carbon::now($timezone)),
        ];
    }

    /**
     * Award badges the player now qualifies for. Earned badges are kept even
     * when a metric later drops (e.g. success rate). Returns the new keys.
     *
     * @return list<string>
     */
    public function evaluate(User $user, bool $notify = true): array
    {
        $stats = $this->stats($user);
        $owned = UserBadge::query()->where('user_id', $user->id)->pluck('badge')->all();
        $earned = [];

        foreach ($this->definitions() as $key => $badge) {
            if (in_array($key, $owned, true) || ! $this->meets($badge['rules'], $stats)) {
                continue;
            }
            $created = UserBadge::query()->firstOrCreate(
                ['user_id' => $user->id, 'badge' => $key],
                ['earned_at' => now()],
            );
            if ($created->wasRecentlyCreated) {
                $earned[] = $key;
            }
        }

        if ($notify) {
            $locale = in_array($user->locale, ['id', 'en'], true) ? $user->locale : (string) config('app.locale');
            foreach ($earned as $key) {
                $this->notifications->notify($user, 'badge', 'player_notifications.badge', [
                    'badge' => __('badges.'.$key.'.name', [], $locale),
                ], '/dashboard#badges');
            }
        }

        return $earned;
    }

    /**
     * Every badge with the player's progress, for the dashboard.
     *
     * @return array{stats: array<string, int>, badges: list<array{key: string, icon: string, tier: string, earned: bool, earned_at: ?string, progress: int, rules: list<array{metric: string, need: int, have: int}>}>}
     */
    public function summary(User $user): array
    {
        $stats = $this->stats($user);
        $owned = UserBadge::query()->where('user_id', $user->id)->pluck('earned_at', 'badge');

        $badges = collect($this->definitions())->map(function (array $badge, string $key) use ($stats, $owned): array {
            $rules = collect($badge['rules'])->map(fn (int $need, string $metric): array => [
                'metric' => $metric,
                'need' => $need,
                'have' => min($need, $stats[$metric] ?? 0),
            ])->values();
            $earned = $owned->has($key);

            return [
                'key' => $key,
                'icon' => $badge['icon'],
                'tier' => $badge['tier'],
                'earned' => $earned,
                'earned_at' => $earned ? Carbon::parse($owned[$key])->toIso8601String() : null,
                'progress' => $earned ? 100 : (int) floor($rules->avg(fn (array $rule): float => $rule['need'] > 0 ? $rule['have'] / $rule['need'] * 100 : 100)),
                'rules' => $rules->all(),
            ];
        })->values()->all();

        return ['stats' => $stats, 'badges' => $badges];
    }

    /**
     * Earned badges of many users, rarest first, for lists.
     *
     * @param  list<int>  $userIds
     * @return array<int, list<array{key: string, icon: string, tier: string, name: string}>>
     */
    public function earnedFor(array $userIds): array
    {
        if ($userIds === []) {
            return [];
        }
        $definitions = $this->definitions();
        $order = array_flip(array_keys($definitions));

        return UserBadge::query()
            ->whereIn('user_id', $userIds)
            ->get(['user_id', 'badge'])
            ->filter(fn (UserBadge $badge): bool => isset($definitions[$badge->badge]))
            ->groupBy('user_id')
            ->map(fn (Collection $rows): array => $rows
                ->sortByDesc(fn (UserBadge $badge): int => $order[$badge->badge])
                ->map(fn (UserBadge $badge): array => [
                    'key' => $badge->badge,
                    'icon' => $definitions[$badge->badge]['icon'],
                    'tier' => $definitions[$badge->badge]['tier'],
                    'name' => __('badges.'.$badge->badge.'.name', [], 'en'),
                ])
                ->values()
                ->all())
            ->all();
    }

    /**
     * @param  array<string, int>  $rules
     * @param  array<string, int>  $stats
     */
    private function meets(array $rules, array $stats): bool
    {
        foreach ($rules as $metric => $need) {
            if (($stats[$metric] ?? 0) < $need) {
                return false;
            }
        }

        return true;
    }

    /** @return Collection<int, int> history ids of matches the player won against others */
    private function wonHistoryIds(User $user): Collection
    {
        return GameMatchPlayer::query()
            ->where('user_id', $user->id)
            ->where('rank', 1)
            ->where('left_early', false)
            ->whereNotNull('game_history_id')
            ->whereHas('match', fn ($query) => $query->where('players_count', '>', 1)->where('finished', true))
            ->pluck('game_history_id')
            ->map(fn ($id): int => (int) $id);
    }

    /**
     * Consecutive days played ending today (or yesterday, so the streak does
     * not reset before the player had a chance to play today).
     *
     * @param  Collection<int, string>  $days
     */
    private function streak(Collection $days, Carbon $today): int
    {
        $played = $days->flip();
        $day = $today->copy()->startOfDay();
        if (! $played->has($day->toDateString())) {
            $day->subDay();
        }
        $streak = 0;
        while ($played->has($day->toDateString())) {
            $streak++;
            $day->subDay();
        }

        return $streak;
    }
}
