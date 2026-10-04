<?php

namespace App\Services;

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
    /**
     * @return list<array{key: string, titleKey: string, games: list<array<string, mixed>>}>
     */
    public function catalog(?int $grade = null): array
    {
        return collect(config('game-catalog.categories'))->map(fn (array $category): array => [
            'key' => $category['key'],
            'titleKey' => $category['titleKey'],
            'games' => collect($category['games'])->map(fn (array $game): array => [
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

    /**
     * Top players by total points. Only active players with points are ranked.
     *
     * @return list<array{rank: int, name: string, points: int, isMe: bool, character: array<string, mixed>}>
     */
    public function leaderboard(User $viewer, int $limit = 10): array
    {
        /** @var Collection<int, User> $users */
        $users = User::query()
            ->whereNull('disabled_at')
            ->whereHas('pointLedgers', fn ($query) => $query->where('points', '>', 0))
            ->withSum(['pointLedgers as total_points' => fn ($query) => $query->where('points', '>', 0)], 'points')
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
                'name' => $profile->nickname ?: $user->name,
                'points' => (int) $user->total_points,
                'isMe' => $user->is($viewer),
                'character' => $looks[$user->id] ?? ['color' => $profile->color, 'accessory' => $profile->accessory],
            ];
        })->all();
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
