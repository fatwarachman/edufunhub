<?php

namespace App\Services;

use App\Models\GameHistory;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Support\Carbon;
use Illuminate\Support\Collection;

/**
 * Playing time read model for the super admin: how long each player played,
 * in which games, and how the class's play time is spread over days.
 *
 * Time comes from `game_histories.duration_seconds` (reported by the game
 * server per finished game). Plays without a duration are counted as plays
 * but not as time, and are reported separately as "untimed".
 */
class PlayingTimeAnalytics
{
    /** @var list<int> */
    public const RANGES = [1, 7, 30, 90];

    public const PLAYER_LIMIT = 100;

    public function __construct(private GameAnalytics $games) {}

    /**
     * @param  array{days: int, game: ?string, search: ?string}  $filters
     * @return array<string, mixed>
     */
    public function report(array $filters): array
    {
        $base = fn (): Builder => GameHistory::query()
            ->when($filters['days'] > 0, fn (Builder $query) => $query->where('played_at', '>=', $this->rangeStart($filters['days'])))
            ->when($filters['game'], fn (Builder $query, string $game) => $query->where('game_key', $game));

        $totals = $base()
            ->selectRaw('COUNT(*) as plays, COUNT(duration_seconds) as timed, SUM(duration_seconds) as seconds, COUNT(DISTINCT user_id) as players')
            ->first();
        $timedPlayers = $base()->whereNotNull('duration_seconds')->distinct()->count('user_id');
        $seconds = (int) $totals->seconds;
        $timed = (int) $totals->timed;

        return [
            'summary' => [
                'seconds' => $seconds,
                'plays' => (int) $totals->plays,
                'timed_plays' => $timed,
                'untimed_plays' => (int) $totals->plays - $timed,
                'players' => (int) $totals->players,
                'avg_session' => $timed > 0 ? (int) round($seconds / $timed) : null,
                'avg_per_player' => $timedPlayers > 0 ? (int) round($seconds / $timedPlayers) : null,
            ],
            'games' => $this->perGame($base()),
            'daily' => $this->daily($base(), match (true) {
                $filters['days'] === 1 => 7,
                $filters['days'] > 0 => $filters['days'],
                default => 30,
            }),
            'players' => $this->perPlayer($base(), $filters['search']),
        ];
    }

    /**
     * Playing time per game for one user (admin user detail page).
     *
     * @return array<string, array{seconds: int, timed_plays: int, avg_session: ?int}>
     */
    public function forUser(int $userId): array
    {
        return GameHistory::query()
            ->where('user_id', $userId)
            ->whereNotNull('duration_seconds')
            ->selectRaw('game_key, SUM(duration_seconds) as seconds, COUNT(*) as timed')
            ->groupBy('game_key')
            ->get()
            ->mapWithKeys(fn ($row): array => [(string) $row->game_key => [
                'seconds' => (int) $row->seconds,
                'timed_plays' => (int) $row->timed,
                'avg_session' => (int) $row->timed > 0 ? (int) round($row->seconds / $row->timed) : null,
            ]])
            ->all();
    }

    /** @return list<array<string, mixed>> */
    private function perGame(Builder $query): array
    {
        $catalog = $this->games->catalogGames()->keyBy('key');

        return $query
            ->selectRaw('game_key, COUNT(*) as plays, COUNT(duration_seconds) as timed, SUM(duration_seconds) as seconds, COUNT(DISTINCT user_id) as players, MAX(duration_seconds) as longest')
            ->groupBy('game_key')
            ->get()
            ->map(fn ($row): array => [
                'key' => (string) $row->game_key,
                'accent' => (string) ($catalog->get($row->game_key)['accent'] ?? '#94a3b8'),
                'seconds' => (int) $row->seconds,
                'plays' => (int) $row->plays,
                'timed_plays' => (int) $row->timed,
                'players' => (int) $row->players,
                'avg_session' => (int) $row->timed > 0 ? (int) round($row->seconds / $row->timed) : null,
                'longest' => $row->longest !== null ? (int) $row->longest : null,
            ])
            ->sortByDesc('seconds')
            ->values()
            ->all();
    }

    /**
     * Start of a range filter: "today" (1) starts at midnight, longer ranges
     * keep counting back the full number of days.
     */
    private function rangeStart(int $days): Carbon
    {
        return now()->subDays($days === 1 ? 0 : $days)->startOfDay();
    }

    /** @return list<array{date: string, seconds: int, players: int}> */
    private function daily(Builder $query, int $days): array
    {
        $days = min($days, 90);
        $rows = $query->where('played_at', '>=', now()->subDays($days - 1)->startOfDay())
            ->get(['played_at', 'user_id', 'duration_seconds'])
            ->groupBy(fn (GameHistory $history): string => $history->played_at->toDateString());

        return collect(range($days - 1, 0))->map(function (int $ago) use ($rows): array {
            $date = now()->subDays($ago)->toDateString();
            /** @var Collection<int, GameHistory> $day */
            $day = $rows->get($date, collect());

            return [
                'date' => $date,
                'seconds' => (int) $day->sum('duration_seconds'),
                'players' => $day->pluck('user_id')->unique()->count(),
            ];
        })->all();
    }

    /**
     * Players ranked by total playing time, with a per-game breakdown.
     *
     * @return list<array<string, mixed>>
     */
    private function perPlayer(Builder $query, ?string $search): array
    {
        $rows = $query
            ->join('users', 'users.id', '=', 'game_histories.user_id')
            ->leftJoin('player_profiles', 'player_profiles.user_id', '=', 'game_histories.user_id')
            ->when($search, function (Builder $query, string $search): void {
                $like = '%'.addcslashes($search, '%_\\').'%';
                $query->where(fn (Builder $query) => $query
                    ->where('users.name', 'like', $like)
                    ->orWhere('users.email', 'like', $like)
                    ->orWhere('player_profiles.nickname', 'like', $like));
            })
            ->groupBy('game_histories.user_id', 'game_histories.game_key', 'users.name', 'users.email', 'player_profiles.nickname', 'player_profiles.grade', 'player_profiles.school_name')
            ->select('game_histories.user_id', 'game_histories.game_key', 'users.name', 'users.email', 'player_profiles.nickname', 'player_profiles.grade', 'player_profiles.school_name')
            ->selectRaw('COUNT(*) as plays, COUNT(game_histories.duration_seconds) as timed, SUM(game_histories.duration_seconds) as seconds, MAX(game_histories.played_at) as last_played_at')
            ->get();

        return $rows->groupBy('user_id')
            ->map(function (Collection $games): array {
                $first = $games->first();
                $seconds = (int) $games->sum('seconds');
                $timed = (int) $games->sum('timed');
                $breakdown = $games->map(fn ($row): array => [
                    'key' => (string) $row->game_key,
                    'seconds' => (int) $row->seconds,
                    'plays' => (int) $row->plays,
                    'share' => $seconds > 0 ? round(((int) $row->seconds) / $seconds * 100, 1) : 0.0,
                ])->sortByDesc('seconds')->values();

                return [
                    'user_id' => (int) $first->user_id,
                    'name' => $first->nickname ?: $first->name,
                    'account_name' => $first->name,
                    'email' => $first->email,
                    'grade' => $first->grade !== null ? (int) $first->grade : null,
                    'school_name' => $first->school_name,
                    'seconds' => $seconds,
                    'plays' => (int) $games->sum('plays'),
                    'timed_plays' => $timed,
                    'avg_session' => $timed > 0 ? (int) round($seconds / $timed) : null,
                    'top_game' => $seconds > 0 ? $breakdown->first()['key'] : null,
                    'games' => $breakdown->all(),
                    'last_played_at' => Carbon::parse($games->max('last_played_at'))->toIso8601String(),
                ];
            })
            ->sortBy([['seconds', 'desc'], ['plays', 'desc']])
            ->take(self::PLAYER_LIMIT)
            ->values()
            ->all();
    }
}
