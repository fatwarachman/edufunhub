<?php

namespace App\Services;

use App\Models\PlayerProfile;
use App\Models\PointLedger;
use App\Models\User;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Str;

/**
 * Read model for the leaderboard detail page: ranking by school and per game.
 *
 * Everything is based on earned points (positive point_ledgers rows) of active
 * players, the same source as the overall leaderboard. A game's points are the
 * ledger rows whose reason starts with "<game key>:" (e.g. "crossword:level-1");
 * shop spending and other reasons never count. Only nicknames, school names,
 * cities and point totals leave this class, never e-mails.
 */
class PlayerLeaderboards
{
    public const SCHOOL_LIMIT = 20;

    public const SCHOOL_PLAYERS_LIMIT = 10;

    public const GAME_LIMIT = 10;

    private const CACHE_SECONDS = 60;

    public function __construct(private CharacterShop $shop) {}

    /**
     * Schools ranked by the summed earned points of their players, the viewer's
     * school position and the ranking of players inside the viewer's school.
     *
     * @return array{entries: list<array{rank: int, key: string, name: string, city: string|null, players: int, points: int, isMine: bool}>, mine: array{rank: int, key: string, name: string, city: string|null, players: int, points: int, isMine: bool}|null, mySchool: array{name: string, city: string|null, entries: list<array<string, mixed>>, me: array{rank: int, points: int}|null}|null}
     */
    public function schools(User $viewer): array
    {
        $schools = $this->schoolTotals();
        $profile = $viewer->playerProfile()->first();
        $myKey = $profile ? $this->schoolKey($profile->school_name, $profile->school_city) : null;

        $ranked = collect($schools)->values()->map(fn (array $school, int $index): array => [
            'rank' => $index + 1,
            'key' => $school['key'],
            'name' => $school['name'],
            'city' => $school['city'],
            'players' => $school['players'],
            'points' => $school['points'],
            'isMine' => $school['key'] === $myKey,
        ]);

        $mine = $myKey === null ? null : $ranked->firstWhere('key', $myKey);
        $members = $myKey !== null ? ($schools[$myKey]['members'] ?? []) : [];

        return [
            'entries' => $ranked->take(self::SCHOOL_LIMIT)->values()->all(),
            'mine' => $mine,
            'mySchool' => $myKey === null ? null : [
                'name' => $mine['name'] ?? Str::squish((string) $profile->school_name),
                'city' => $mine['city'] ?? (Str::squish((string) $profile->school_city) ?: null),
                'entries' => $this->entries($viewer, array_slice($members, 0, self::SCHOOL_PLAYERS_LIMIT, true)),
                'me' => $this->standingIn($viewer, $members),
            ],
        ];
    }

    /**
     * Top players for every game that awards points, with the viewer's own standing.
     *
     * @return list<array{key: string, titleKey: string, icon: string, accent: string, players: int, entries: list<array<string, mixed>>, me: array{rank: int, points: int}|null}>
     */
    public function games(User $viewer): array
    {
        $totals = $this->gameTotals();

        return collect($this->pointGames())->map(function (array $game) use ($viewer, $totals): array {
            $scores = $totals[$game['key']] ?? [];

            return [
                ...$game,
                'players' => count($scores),
                'entries' => $this->entries($viewer, array_slice($scores, 0, self::GAME_LIMIT, true)),
                'me' => $this->standingIn($viewer, $scores),
            ];
        })->values()->all();
    }

    /**
     * Catalog games that award points, in catalog order.
     *
     * @return list<array{key: string, titleKey: string, icon: string, accent: string}>
     */
    public function pointGames(): array
    {
        return collect(config('game-catalog.categories'))
            ->flatMap(fn (array $category): array => $category['games'])
            ->filter(fn (array $game): bool => (bool) ($game['awards_points'] ?? false))
            ->map(fn (array $game): array => [
                'key' => $game['key'],
                'titleKey' => $game['titleKey'],
                'icon' => $game['icon'] ?? 'gamepad',
                'accent' => $game['accent'] ?? '#f5a623',
            ])
            ->unique('key')
            ->values()
            ->all();
    }

    /**
     * Earned points per active player, highest first (ties by user id).
     *
     * @param  (callable(Builder<PointLedger>): mixed)|null  $scope
     * @return array<int, int>
     */
    private function scores(?callable $scope = null): array
    {
        $rows = PointLedger::query()
            ->where('points', '>', 0)
            ->whereIn('user_id', User::query()->select('id')->whereNull('disabled_at'))
            ->when($scope, $scope)
            ->groupBy('user_id')
            ->selectRaw('user_id, SUM(points) as total_points')
            ->get()
            ->map(fn (PointLedger $row): array => [(int) $row->user_id, (int) $row->getAttribute('total_points')])
            ->all();

        usort($rows, fn (array $a, array $b): int => [$b[1], $a[0]] <=> [$a[1], $b[0]]);

        $scores = [];
        foreach ($rows as [$userId, $points]) {
            $scores[$userId] = $points;
        }

        return $scores;
    }

    /**
     * @return array<string, array<int, int>> Scores per game key.
     */
    private function gameTotals(): array
    {
        return Cache::remember('leaderboards:games', self::CACHE_SECONDS, function (): array {
            $totals = [];

            foreach ($this->pointGames() as $game) {
                $prefix = addcslashes($game['key'], '%_\\').':%';
                $totals[$game['key']] = $this->scores(fn (Builder $query) => $query->where('reason', 'like', $prefix));
            }

            return $totals;
        });
    }

    /**
     * Schools keyed by normalized name + city, highest total first.
     *
     * @return array<string, array{key: string, name: string, city: string|null, players: int, points: int, members: array<int, int>}>
     */
    private function schoolTotals(): array
    {
        return Cache::remember('leaderboards:schools', self::CACHE_SECONDS, function (): array {
            $scores = $this->scores();

            if ($scores === []) {
                return [];
            }

            $profiles = PlayerProfile::query()
                ->whereNotNull('school_name')
                ->where('school_name', '!=', '')
                ->whereIn('user_id', PointLedger::query()->select('user_id')->where('points', '>', 0))
                ->get(['user_id', 'school_name', 'school_city'])
                ->filter(fn (PlayerProfile $profile): bool => isset($scores[$profile->user_id]));

            $schools = $profiles
                ->groupBy(fn (PlayerProfile $profile): string => (string) $this->schoolKey($profile->school_name, $profile->school_city))
                ->filter(fn (Collection $group, string $key): bool => $key !== '')
                ->map(function (Collection $group, string $key) use ($scores): array {
                    $members = $group
                        ->mapWithKeys(fn (PlayerProfile $profile): array => [$profile->user_id => $scores[$profile->user_id]])
                        ->all();
                    uksort($members, fn (int $a, int $b): int => [$members[$b], $a] <=> [$members[$a], $b]);
                    $city = $this->mostCommon($group->map(fn (PlayerProfile $profile): string => Str::squish((string) $profile->school_city)));

                    return [
                        'key' => $key,
                        'name' => $this->mostCommon($group->map(fn (PlayerProfile $profile): string => Str::squish((string) $profile->school_name))),
                        'city' => $city !== '' ? $city : null,
                        'players' => count($members),
                        'points' => array_sum($members),
                        'members' => $members,
                    ];
                })
                ->all();

            uasort($schools, fn (array $a, array $b): int => [$b['points'], $b['players'], $a['name']] <=> [$a['points'], $a['players'], $b['name']]);

            return $schools;
        });
    }

    /** Case- and space-insensitive identity of a school (name + city), null when no school is set. */
    private function schoolKey(?string $name, ?string $city): ?string
    {
        $name = Str::lower(Str::squish((string) $name));

        if ($name === '') {
            return null;
        }

        return $name.'|'.Str::lower(Str::squish((string) $city));
    }

    /**
     * Most frequent spelling; ties go to the alphabetically first one.
     *
     * @param  Collection<int, string>  $values
     */
    private function mostCommon(Collection $values): string
    {
        $counts = $values->countBy()->all();
        uksort($counts, fn (string $a, string $b): int => [$counts[$b], $a] <=> [$counts[$a], $b]);

        return (string) array_key_first($counts);
    }

    /**
     * @param  array<int, int>  $scores  Ranked scores per user id.
     * @return array{rank: int, points: int}|null
     */
    private function standingIn(User $viewer, array $scores): ?array
    {
        if (! isset($scores[$viewer->id])) {
            return null;
        }

        $points = $scores[$viewer->id];

        return [
            'rank' => count(array_filter($scores, fn (int $score): bool => $score > $points)) + 1,
            'points' => $points,
        ];
    }

    /**
     * Leaderboard rows in the same shape as PlayerPortal::leaderboard().
     *
     * @param  array<int, int>  $scores  Ranked scores per user id (already limited).
     * @return list<array{rank: int, userId: int, name: string, points: int, isMe: bool, character: array<string, mixed>}>
     */
    private function entries(User $viewer, array $scores): array
    {
        if ($scores === []) {
            return [];
        }

        $users = User::query()->whereKey(array_keys($scores))->with('playerProfile')->get(['id', 'name'])->keyBy('id');
        $looks = $this->shop->looks($users->pluck('playerProfile')->filter());

        $entries = [];
        $rank = 0;
        foreach ($scores as $userId => $points) {
            $user = $users->get($userId);
            if ($user === null) {
                continue;
            }
            $profile = $user->playerProfile ?? new PlayerProfile;
            $entries[] = [
                'rank' => ++$rank,
                'userId' => $user->id,
                'name' => $profile->nickname ?: $user->name,
                'points' => $points,
                'isMe' => $user->id === $viewer->id,
                'character' => $looks[$user->id] ?? ['color' => $profile->color, 'accessory' => $profile->accessory],
            ];
        }

        return $entries;
    }
}
