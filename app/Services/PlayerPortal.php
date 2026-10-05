<?php

namespace App\Services;

use App\Models\GameAccess;
use App\Models\GameHistory;
use App\Models\PlayerProfile;
use App\Models\PointLedger;
use App\Models\User;
use Illuminate\Support\Collection;

/**
 * Read model for the player portal: game catalog, progress level and leaderboard.
 */
class PlayerPortal
{
    /** Window (days) used for the "most played" ranking on the portal. */
    public const POPULARITY_DAYS = 30;

    /** Ranks that get a "most played" badge; games with equal plays share a rank. */
    public const POPULAR_BADGES = 3;

    /**
     * @param  array<string, int>  $plays  Play counts per game key (see popularity()).
     * @return list<array{key: string, titleKey: string, games: list<array<string, mixed>>}>
     */
    public function catalog(?int $grade = null, array $plays = []): array
    {
        $played = collect($plays)->filter(fn (int $count): bool => $count > 0);
        $rankOf = function (string $key) use ($played): ?int {
            if (! $played->has($key)) {
                return null;
            }

            $rank = $played->filter(fn (int $count): bool => $count > $played[$key])->count() + 1;

            return $rank <= self::POPULAR_BADGES ? $rank : null;
        };

        return collect(config('game-catalog.categories'))->map(fn (array $category): array => [
            'key' => $category['key'],
            'titleKey' => $category['titleKey'],
            'games' => collect($category['games'])->map(fn (array $game): array => [
                'plays' => (int) ($plays[$game['key']] ?? 0),
                'popularRank' => $rankOf($game['key']),
                'key' => $game['key'],
                'titleKey' => $game['titleKey'],
                'descriptionKey' => $game['descriptionKey'] ?? null,
                'url' => route($game['route'], absolute: false),
                'icon' => $game['icon'] ?? 'gamepad',
                'accent' => $game['accent'] ?? '#f5a623',
                'minGrade' => $game['min_grade'] ?? 1,
                'maxGrade' => $game['max_grade'] ?? 12,
                'awardsPoints' => (bool) ($game['awards_points'] ?? false),
                'requiresGrade' => (bool) ($game['requires_grade'] ?? false),
                'guestPlayable' => (bool) ($game['guest_playable'] ?? false),
                'recommended' => $grade !== null
                    && $grade >= ($game['min_grade'] ?? 1)
                    && $grade <= ($game['max_grade'] ?? 12),
            ])->values()->all(),
        ])->values()->all();
    }

    /**
     * How often each game was opened in the last N days (page opens, deduplicated per session by RecordGameAccess).
     *
     * @return array<string, int>
     */
    public function popularity(int $days = self::POPULARITY_DAYS): array
    {
        return GameAccess::query()
            ->where('accessed_at', '>=', now()->subDays($days))
            ->selectRaw('game_key, COUNT(*) as plays')
            ->groupBy('game_key')
            ->pluck('plays', 'game_key')
            ->map(fn (mixed $count): int => (int) $count)
            ->all();
    }

    /**
     * Lightweight catalog for the site navigation menu and the public game list.
     *
     * @return list<array{key: string, titleKey: string, games: list<array{key: string, titleKey: string, descriptionKey: ?string, url: string, icon: string, accent: string, minGrade: int, maxGrade: int, awardsPoints: bool, guestPlayable: bool}>}>
     */
    public function menu(): array
    {
        return collect($this->catalog())->map(fn (array $category): array => [
            ...$category,
            'games' => collect($category['games'])->map(fn (array $game): array => collect($game)->only([
                'key', 'titleKey', 'descriptionKey', 'url', 'icon', 'accent', 'minGrade', 'maxGrade', 'awardsPoints', 'guestPlayable',
            ])->all())->values()->all(),
        ])->values()->all();
    }

    /**
     * @return array{points: int, level: int, levelProgress: int, pointsPerLevel: int, nextLevelAt: int}
     */
    public function progress(int $points): array
    {
        $perLevel = max(1, (int) config('game-catalog.points_per_level'));
        $safe = max(0, $points);

        return [
            'points' => $points,
            'level' => intdiv($safe, $perLevel) + 1,
            'levelProgress' => $safe % $perLevel,
            'pointsPerLevel' => $perLevel,
            'nextLevelAt' => (intdiv($safe, $perLevel) + 1) * $perLevel,
        ];
    }

    /**
     * Points earned by playing. Drives level and ranking; spending in the
     * character shop does not lower it.
     */
    public function totalPoints(User $user): int
    {
        return (int) $user->pointLedgers()->where('points', '>', 0)->sum('points');
    }

    /** Points available to spend: everything earned minus shop purchases. */
    public function balance(User $user): int
    {
        return (int) $user->pointLedgers()->sum('points');
    }

    /** @var array<string, int|null> Leaderboard periods and their window in days (null = all time). */
    public const LEADERBOARD_PERIODS = ['week' => 7, 'month' => 30, 'all' => null];

    /**
     * Leaderboards for every period, each with the top players and the viewer's own standing.
     *
     * @return array<string, array{entries: list<array{rank: int, userId: int, name: string, points: int, isMe: bool, character: array<string, mixed>}>, me: array{rank: int, points: int}|null}>
     */
    public function leaderboards(User $viewer, int $limit = 10): array
    {
        $boards = [];

        foreach (self::LEADERBOARD_PERIODS as $period => $days) {
            $boards[$period] = [
                'entries' => $this->leaderboard($viewer, $limit, $days),
                'me' => $this->standing($viewer, $days),
            ];
        }

        return $boards;
    }

    /**
     * Top players by points earned, optionally within the last N days. Only active players with points are ranked.
     *
     * @return list<array{rank: int, userId: int, name: string, points: int, isMe: bool, character: array<string, mixed>}>
     */
    public function leaderboard(User $viewer, int $limit = 10, ?int $days = null): array
    {
        $earned = function ($query) use ($days): void {
            $query->where('points', '>', 0)
                ->when($days !== null, fn ($query) => $query->where('created_at', '>=', now()->subDays($days)));
        };

        /** @var Collection<int, User> $users */
        $users = User::query()
            ->whereNull('disabled_at')
            ->whereHas('pointLedgers', $earned)
            ->withSum(['pointLedgers as total_points' => $earned], 'points')
            ->with('playerProfile')
            ->orderByDesc('total_points')
            ->orderBy('id')
            ->limit($limit)
            ->get();

        $looks = app(CharacterShop::class)->looks($users->pluck('playerProfile')->filter());

        return $users->values()->map(function (User $user, int $index) use ($viewer, $looks): array {
            $profile = $user->playerProfile ?? new PlayerProfile;

            return [
                'rank' => $index + 1,
                'userId' => $user->id,
                'name' => $profile->nickname ?: $user->name,
                'points' => (int) $user->total_points,
                'isMe' => $user->is($viewer),
                'character' => $looks[$user->id] ?? ['color' => $profile->color, 'accessory' => $profile->accessory],
            ];
        })->all();
    }

    /**
     * The viewer's rank and earned points within the period, or null when they earned nothing in it.
     *
     * @return array{rank: int, points: int}|null
     */
    public function standing(User $viewer, ?int $days = null): ?array
    {
        $since = $days !== null ? now()->subDays($days) : null;
        $points = (int) $viewer->pointLedgers()
            ->where('points', '>', 0)
            ->when($since, fn ($query) => $query->where('created_at', '>=', $since))
            ->sum('points');

        if ($points === 0 || $viewer->disabled_at !== null) {
            return null;
        }

        $ahead = PointLedger::query()
            ->where('points', '>', 0)
            ->when($since, fn ($query) => $query->where('created_at', '>=', $since))
            ->whereIn('user_id', User::query()->select('id')->whereNull('disabled_at')->whereKeyNot($viewer->id))
            ->groupBy('user_id')
            ->havingRaw('SUM(points) > ?', [$points])
            ->select('user_id')
            ->get()
            ->count();

        return ['rank' => $ahead + 1, 'points' => $points];
    }

    /**
     * Rank of the viewer among active players (null when they have no points yet).
     */
    public function rankOf(User $viewer, int $points): ?int
    {
        if (! $viewer->pointLedgers()->where('points', '>', 0)->exists()) {
            return null;
        }

        $ahead = PointLedger::query()
            ->where('points', '>', 0)
            ->whereIn('user_id', User::query()->select('id')->whereNull('disabled_at')->whereKeyNot($viewer->id))
            ->groupBy('user_id')
            ->havingRaw('SUM(points) > ?', [$points])
            ->select('user_id')
            ->get()
            ->count();

        return $ahead + 1;
    }

    /**
     * @return list<array{id: int, game_key: string, game_name: string, points: int, played_at: string}>
     */
    public function recentResults(User $user, int $limit = 5): array
    {
        return $user->gameHistories()
            ->orderByDesc('played_at')
            ->orderByDesc('id')
            ->limit($limit)
            ->get()
            ->map(fn (GameHistory $game): array => [
                'id' => $game->id,
                'game_key' => $game->game_key,
                'game_name' => $game->game_name,
                'points' => $game->points,
                'played_at' => $game->played_at->toIso8601String(),
            ])->all();
    }
}
