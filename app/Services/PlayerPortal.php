<?php

namespace App\Services;

use App\Models\GameAccess;
use App\Models\GameHistory;
use App\Models\PlayerProfile;
use App\Models\PointLedger;
use App\Models\User;
use Illuminate\Support\Carbon;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\Cache;

/**
 * Read model for the player portal: game catalog, progress level and leaderboard.
 */
class PlayerPortal
{
    /** Window (days) used for the "most played" ranking on the portal. */
    public const POPULARITY_DAYS = 30;

    /** A game counts as new on /gamelist for this many days after its catalog released_at. */
    public const NEW_GAME_DAYS = 3;

    /** Ranks that get a "most played" badge; games with equal plays share a rank. */
    public const POPULAR_BADGES = 3;

    /** Cache for the public game list popularity (guests can open /gamelist). */
    public const POPULARITY_CACHE_KEY = 'gamelist.popularity';

    public const POPULARITY_CACHE_SECONDS = 300;

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
                'minPlayers' => (int) ($game['min_players'] ?? 1),
                'maxPlayers' => (int) ($game['max_players'] ?? 1),
                'awardsPoints' => (bool) ($game['awards_points'] ?? false),
                'requiresGrade' => (bool) ($game['requires_grade'] ?? false),
                'guestPlayable' => (bool) ($game['guest_playable'] ?? false),
                'sameGradeMatch' => $this->isSameGradeMatch($game),
                'recommended' => $grade !== null
                    && $grade >= ($game['min_grade'] ?? 1)
                    && $grade <= ($game['max_grade'] ?? 12),
            ])->values()->all(),
        ])->values()->all();
    }

    /**
     * Multiplayer games pit players against each other with questions sized
     * to the youngest grade in the room, so they play fairest with
     * classmates of the same grade. Mixed grades stay allowed.
     *
     * @param  array<string, mixed>  $game
     */
    private function isSameGradeMatch(array $game): bool
    {
        return (bool) ($game['multiplayer'] ?? false) && (int) ($game['max_players'] ?? 1) > 1;
    }

    /**
     * Catalog games released within the last NEW_GAME_DAYS days, newest first
     * (catalog order breaks ties). Games without a released_at never count.
     *
     * @return list<array{key: string, releasedAt: string}>
     */
    public function newGames(int $days = self::NEW_GAME_DAYS): array
    {
        $since = now()->startOfDay()->subDays($days - 1);
        $today = now()->endOfDay();

        return collect(config('game-catalog.categories'))
            ->flatMap(fn (array $category): array => $category['games'])
            ->filter(fn (array $game): bool => filled($game['released_at'] ?? null))
            ->map(fn (array $game): array => [
                'key' => $game['key'],
                'released' => Carbon::parse($game['released_at'])->startOfDay(),
            ])
            ->filter(fn (array $game): bool => $game['released']->betweenIncluded($since, $today))
            ->sortByDesc(fn (array $game): int => $game['released']->getTimestamp())
            ->map(fn (array $game): array => [
                'key' => $game['key'],
                'releasedAt' => $game['released']->toDateString(),
            ])
            ->values()
            ->all();
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
     * Play counts and "most played" ranks for every catalog game, keyed by game key.
     * Ranks match catalog(): equal counts share a rank, only the top POPULAR_BADGES get one.
     *
     * @param  array<string, int>  $plays  Play counts per game key (see popularity()).
     * @return array<string, array{plays: int, popularRank: int|null}>
     */
    public function popularityByGame(array $plays): array
    {
        return collect($this->catalog(null, $plays))
            ->flatMap(fn (array $category): array => $category['games'])
            ->mapWithKeys(fn (array $game): array => [$game['key'] => [
                'plays' => $game['plays'],
                'popularRank' => $game['popularRank'],
            ]])
            ->all();
    }

    /**
     * Public, cached popularity for the game list page (counts only, no player data).
     *
     * @return array<string, array{plays: int, popularRank: int|null}>
     */
    public function cachedPopularity(): array
    {
        return Cache::remember(
            self::POPULARITY_CACHE_KEY,
            self::POPULARITY_CACHE_SECONDS,
            fn (): array => $this->popularityByGame($this->popularity()),
        );
    }

    /**
     * Lightweight catalog for the site navigation menu and the public game list.
     *
     * @return list<array{key: string, titleKey: string, games: list<array{key: string, titleKey: string, descriptionKey: ?string, url: string, icon: string, accent: string, minGrade: int, maxGrade: int, minPlayers: int, maxPlayers: int, awardsPoints: bool, guestPlayable: bool, sameGradeMatch: bool}>}>
     */
    public function menu(): array
    {
        return collect($this->catalog())->map(fn (array $category): array => [
            ...$category,
            'games' => collect($category['games'])->map(fn (array $game): array => collect($game)->only([
                'key', 'titleKey', 'descriptionKey', 'url', 'icon', 'accent', 'minGrade', 'maxGrade', 'minPlayers', 'maxPlayers', 'awardsPoints', 'guestPlayable', 'sameGradeMatch',
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
     * The player's points: one number. Playing (correct answers) adds to it,
     * buying in the character shop takes from it. Level and ranking follow it.
     */
    public function totalPoints(User $user): int
    {
        return (int) $user->pointLedgers()->sum('points');
    }

    /** Alias of totalPoints(): there is only one kind of points. */
    public function balance(User $user): int
    {
        return $this->totalPoints($user);
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

        $ids = collect($boards)->flatMap(fn (array $board): array => array_column($board['entries'], 'userId'))->unique()->values()->all();
        $relations = app(FriendService::class)->relationsFor($viewer, $ids);

        foreach ($boards as $period => $board) {
            $boards[$period]['entries'] = array_map(fn (array $entry): array => [
                ...$entry,
                'relation' => $relations[$entry['userId']]['relation'] ?? 'none',
                'friendshipId' => $relations[$entry['userId']]['friendship_id'] ?? null,
            ], $board['entries']);
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
        $window = function ($query) use ($days): void {
            $query->when($days !== null, fn ($query) => $query->where('created_at', '>=', now()->subDays($days)));
        };

        /** @var Collection<int, User> $users */
        $users = User::query()
            ->whereNull('disabled_at')
            ->whereIn('id', PointLedger::query()
                ->select('user_id')
                ->when($days !== null, fn ($query) => $query->where('created_at', '>=', now()->subDays($days)))
                ->groupBy('user_id')
                ->havingRaw('SUM(points) > 0'))
            ->withSum(['pointLedgers as total_points' => $window], 'points')
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
            ->when($since, fn ($query) => $query->where('created_at', '>=', $since))
            ->sum('points');

        if ($points <= 0 || $viewer->disabled_at !== null) {
            return null;
        }

        $ahead = PointLedger::query()
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
        if ($points <= 0) {
            return null;
        }

        $ahead = PointLedger::query()
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
