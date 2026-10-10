<?php

namespace App\Services;

use App\Models\GameHistory;
use Carbon\CarbonImmutable;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Support\Collection;

/**
 * "Hottest games" per local day (screen-time timezone, Asia/Jakarta by
 * default): ranking of recorded plays per game, the previous days' winners
 * and a per-day drill-down of one game.
 */
class HotGames
{
    /** Previous days listed under the selected day. */
    public const HISTORY_DAYS = 14;

    /** Furthest day an admin can open. */
    public const MAX_DAYS_BACK = 365;

    /** Games shown per day in the history list. */
    public const HISTORY_TOP = 3;

    public function timezone(): string
    {
        return (string) config('screen-time.timezone', 'UTC');
    }

    public function today(): CarbonImmutable
    {
        return CarbonImmutable::now($this->timezone())->startOfDay();
    }

    /** Local date string to the start of that day; null when it is not a valid, allowed day. */
    public function parseDate(?string $date): ?CarbonImmutable
    {
        if ($date === null || preg_match('/^\d{4}-\d{2}-\d{2}$/', $date) !== 1) {
            return null;
        }
        $day = CarbonImmutable::createFromFormat('!Y-m-d', $date, $this->timezone());
        if ($day === false || $day->format('Y-m-d') !== $date) {
            return null;
        }
        $today = $this->today();

        return $day->greaterThan($today) || $day->lessThan($today->subDays(self::MAX_DAYS_BACK)) ? null : $day;
    }

    /**
     * Games ranked by plays on one local day (players, then key break ties).
     *
     * @return list<array{rank: int, game: string, name: string, in_catalog: bool, plays: int, players: int, points: int, accuracy: ?float, avg_duration: ?int, first_at: string, last_at: string}>
     */
    public function ranking(CarbonImmutable $day): array
    {
        $rows = $this->onDay($day)
            ->toBase()
            ->select('game_key')
            ->selectRaw('COUNT(*) as plays, COUNT(DISTINCT user_id) as players, SUM(points) as points')
            ->selectRaw('SUM(correct) as correct, SUM(wrong) as wrong, AVG(duration_seconds) as avg_duration')
            ->selectRaw('MIN(played_at) as first_at, MAX(played_at) as last_at, MAX(game_name) as game_name')
            ->groupBy('game_key')
            ->orderByDesc('plays')
            ->orderByDesc('players')
            ->orderBy('game_key')
            ->get();

        $catalog = $this->catalogKeys();

        return $rows->values()->map(fn (object $row, int $index): array => [
            'rank' => $index + 1,
            'game' => (string) $row->game_key,
            'name' => (string) $row->game_name,
            'in_catalog' => in_array($row->game_key, $catalog, true),
            'plays' => (int) $row->plays,
            'players' => (int) $row->players,
            'points' => (int) $row->points,
            'accuracy' => $this->percent((int) $row->correct, (int) $row->correct + (int) $row->wrong),
            'avg_duration' => $row->avg_duration !== null ? (int) round((float) $row->avg_duration) : null,
            'first_at' => $this->iso($row->first_at),
            'last_at' => $this->iso($row->last_at),
        ])->all();
    }

    /** Distinct players across every game on one local day. */
    public function playersOn(CarbonImmutable $day): int
    {
        return (int) $this->onDay($day)->distinct()->count('user_id');
    }

    /**
     * The days before $day (newest first) with their totals and top games.
     *
     * @return list<array{date: string, plays: int, players: int, games: int, top: list<array{game: string, name: string, in_catalog: bool, plays: int, players: int}>}>
     */
    public function history(CarbonImmutable $day, int $days = self::HISTORY_DAYS): array
    {
        $from = $day->subDays($days);
        $rows = GameHistory::query()
            ->where('played_at', '>=', $from->utc())
            ->where('played_at', '<', $day->utc())
            ->toBase()
            ->get(['game_key', 'game_name', 'user_id', 'played_at'])
            ->groupBy(fn (object $row): string => $this->localDate($row->played_at));

        $catalog = $this->catalogKeys();

        return collect(range(1, $days))->map(function (int $ago) use ($day, $rows, $catalog): array {
            $date = $day->subDays($ago)->toDateString();
            /** @var Collection<int, object> $plays */
            $plays = $rows->get($date, collect());
            $top = $plays->groupBy('game_key')
                ->map(fn (Collection $game, string $key): array => [
                    'game' => $key,
                    'name' => (string) $game->first()->game_name,
                    'in_catalog' => in_array($key, $catalog, true),
                    'plays' => $game->count(),
                    'players' => $game->pluck('user_id')->unique()->count(),
                ])
                ->sortBy([['plays', 'desc'], ['players', 'desc'], ['game', 'asc']])
                ->values();

            return [
                'date' => $date,
                'plays' => $plays->count(),
                'players' => $plays->pluck('user_id')->unique()->count(),
                'games' => $top->count(),
                'top' => $top->take(self::HISTORY_TOP)->all(),
            ];
        })->all();
    }

    /**
     * Everything about one game on one local day.
     *
     * @return array{summary: array<string, mixed>, hourly: list<array{hour: int, plays: int, players: int}>, players: list<array<string, mixed>>, plays: list<array<string, mixed>>, schools: list<array{school: string, plays: int, players: int}>}
     */
    public function detail(CarbonImmutable $day, string $game): array
    {
        $plays = $this->onDay($day)
            ->where('game_key', $game)
            ->with(['user:id,name,avatar_url', 'user.playerProfile:id,user_id,nickname,grade,school_name'])
            ->orderByDesc('played_at')
            ->orderByDesc('id')
            ->get();

        $correct = (int) $plays->sum('correct');
        $answered = $correct + (int) $plays->sum('wrong');
        $durations = $plays->whereNotNull('duration_seconds');
        $ranking = collect($this->ranking($day));

        $hourly = collect(range(0, 23))->map(fn (int $hour): array => ['hour' => $hour, 'plays' => 0, 'players' => []])->all();
        foreach ($plays as $play) {
            $hour = (int) $play->played_at->setTimezone($this->timezone())->format('G');
            $hourly[$hour]['plays']++;
            $hourly[$hour]['players'][$play->user_id] = true;
        }

        return [
            'summary' => [
                'rank' => $ranking->firstWhere('game', $game)['rank'] ?? null,
                'games_played' => $ranking->count(),
                'plays' => $plays->count(),
                'players' => $plays->pluck('user_id')->unique()->count(),
                'points' => (int) $plays->sum('points'),
                'accuracy' => $this->percent($correct, $answered),
                'avg_duration' => $durations->isEmpty() ? null : (int) round($durations->avg('duration_seconds')),
                'plays_per_player' => $plays->isEmpty() ? 0 : round($plays->count() / max(1, $plays->pluck('user_id')->unique()->count()), 1),
                'peak_hour' => $plays->isEmpty() ? null : collect($hourly)->sortByDesc('plays')->keys()->first(),
            ],
            'hourly' => array_map(fn (array $slot): array => ['hour' => $slot['hour'], 'plays' => $slot['plays'], 'players' => count($slot['players'])], $hourly),
            'players' => $plays->groupBy('user_id')->map(function (Collection $own): array {
                /** @var GameHistory $first */
                $first = $own->first();
                $correct = (int) $own->sum('correct');
                $profile = $first->user?->playerProfile;

                return [
                    'user_id' => (int) $first->user_id,
                    'name' => $profile?->nickname ?: $first->user?->name,
                    'avatar_url' => $first->user?->avatar_url,
                    'grade' => $profile?->grade,
                    'school_name' => $profile?->school_name ?: $first->school_name,
                    'plays' => $own->count(),
                    'points' => (int) $own->sum('points'),
                    'best' => (int) $own->max('points'),
                    'accuracy' => $this->percent($correct, $correct + (int) $own->sum('wrong')),
                    'last_played_at' => $first->played_at->toIso8601String(),
                ];
            })->sortBy([['plays', 'desc'], ['points', 'desc']])->values()->all(),
            'plays' => $plays->map(fn (GameHistory $play): array => [
                'id' => $play->id,
                'user_id' => $play->user_id,
                'name' => $play->user?->playerProfile?->nickname ?: $play->user?->name,
                'mission' => $play->mission,
                'points' => $play->points,
                'correct' => $play->correct,
                'wrong' => $play->wrong,
                'accuracy' => $play->accuracy(),
                'duration_seconds' => $play->duration_seconds,
                'played_at' => $play->played_at->toIso8601String(),
            ])->all(),
            'schools' => $plays->groupBy(fn (GameHistory $play): string => (string) ($play->user?->playerProfile?->school_name ?: $play->school_name ?: ''))
                ->reject(fn (Collection $rows, string $school): bool => $school === '')
                ->map(fn (Collection $rows, string $school): array => ['school' => $school, 'plays' => $rows->count(), 'players' => $rows->pluck('user_id')->unique()->count()])
                ->sortByDesc('plays')->values()->take(10)->all(),
        ];
    }

    /** @return list<string> */
    private function catalogKeys(): array
    {
        return collect(config('game-catalog.categories'))->flatMap(fn (array $category): array => array_column($category['games'], 'key'))->values()->all();
    }

    /** @return Builder<GameHistory> */
    private function onDay(CarbonImmutable $day): Builder
    {
        return GameHistory::query()
            ->where('played_at', '>=', $day->utc())
            ->where('played_at', '<', $day->addDay()->utc());
    }

    private function localDate(mixed $value): string
    {
        return CarbonImmutable::parse((string) $value, 'UTC')->setTimezone($this->timezone())->toDateString();
    }

    private function iso(mixed $value): string
    {
        return CarbonImmutable::parse((string) $value, 'UTC')->toIso8601String();
    }

    private function percent(int $part, int $whole): ?float
    {
        return $whole > 0 ? round($part / $whole * 100, 1) : null;
    }
}
