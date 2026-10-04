<?php

namespace App\Services;

use App\Models\GameMatch;
use App\Models\GameMatchPlayer;
use App\Models\User;
use Illuminate\Contracts\Pagination\LengthAwarePaginator;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;

/**
 * Read model for recorded room and duel matches: who a player met, at which
 * level, how they ranked and how that changes over time.
 */
class MatchHistory
{
    /**
     * Summary and progression for one player.
     *
     * @return array{summary: array<string, mixed>, opponents: list<array<string, mixed>>, monthly: list<array<string, mixed>>, byGame: list<array<string, mixed>>}
     */
    public function forUser(User $user): array
    {
        $seats = GameMatchPlayer::query()->where('user_id', $user->id);

        $totals = (clone $seats)
            ->selectRaw('COUNT(*) as matches, SUM(CASE WHEN '.$this->col('rank').' = 1 THEN 1 ELSE 0 END) as wins, SUM(correct) as correct, SUM(wrong) as wrong, SUM(CASE WHEN left_early THEN 1 ELSE 0 END) as left_early')
            ->first();

        $multi = (clone $seats)->whereHas('match', fn ($q) => $q->where('players_count', '>', 1))
            ->selectRaw('COUNT(*) as matches, SUM(CASE WHEN '.$this->col('rank').' = 1 THEN 1 ELSE 0 END) as wins')
            ->first();

        return [
            'summary' => [
                'matches' => (int) $totals->matches,
                'wins' => (int) $totals->wins,
                'multiplayer_matches' => (int) $multi->matches,
                'multiplayer_wins' => (int) $multi->wins,
                'win_rate' => $this->percent((int) $multi->wins, (int) $multi->matches),
                'accuracy' => $this->percent((int) $totals->correct, (int) $totals->correct + (int) $totals->wrong),
                'left_early' => (int) $totals->left_early,
                'opponents' => $this->opponentQuery($user)->distinct()->count('user_id'),
            ],
            'opponents' => $this->opponents($user),
            'monthly' => $this->monthly($user),
            'byGame' => $this->byGame($user),
        ];
    }

    /**
     * Paginated match log for one player with every seat of each match.
     */
    public function matchesFor(User $user, int $perPage = 10, string $pageName = 'matches_page'): LengthAwarePaginator
    {
        return GameMatch::query()
            ->whereHas('players', fn ($q) => $q->where('user_id', $user->id))
            ->with(['players' => fn ($q) => $q->with('user:id,name')])
            ->latest('ended_at')
            ->latest('id')
            ->paginate($perPage, ['*'], $pageName)
            ->withQueryString()
            ->through(fn (GameMatch $match): array => $this->present($match, $user));
    }

    /** @return array<string, mixed> */
    public function present(GameMatch $match, ?User $viewer = null): array
    {
        $me = $viewer ? $match->players->firstWhere('user_id', $viewer->id) : null;

        return [
            'id' => $match->id,
            'game_key' => $match->game_key,
            'mode' => $match->mode,
            'pin' => $match->pin,
            'level' => $match->level,
            'grade' => $match->grade,
            'players_count' => $match->players_count,
            'finished' => $match->finished,
            'started_at' => $match->started_at->toIso8601String(),
            'ended_at' => $match->ended_at->toIso8601String(),
            'duration_seconds' => (int) $match->started_at->diffInSeconds($match->ended_at),
            'my_rank' => $me?->rank,
            'players' => $match->players->map(fn (GameMatchPlayer $p): array => [
                'seat' => $p->seat,
                'user_id' => $p->user_id,
                'name' => $p->name,
                'grade' => $p->grade,
                'is_local' => $p->is_local,
                'is_bot' => $p->is_bot,
                'left_early' => $p->left_early,
                'rank' => $p->rank,
                'score' => $p->score,
                'correct' => $p->correct,
                'wrong' => $p->wrong,
                'is_viewer' => $viewer !== null && $p->user_id === $viewer->id,
            ])->values()->all(),
        ];
    }

    /** Seats of other account holders in the player's matches. */
    /** @return Builder<GameMatchPlayer> */
    private function opponentQuery(User $user): Builder
    {
        return GameMatchPlayer::query()
            ->whereIn('game_match_id', GameMatchPlayer::query()->select('game_match_id')->where('user_id', $user->id))
            ->whereNotNull('user_id')
            ->where('user_id', '!=', $user->id);
    }

    /**
     * Account holders the player met most, with head-to-head record.
     *
     * @return list<array{user_id: int, name: string, account: ?string, grade: int, matches: int, wins: int, losses: int, draws: int, last_played_at: string}>
     */
    private function opponents(User $user, int $limit = 10): array
    {
        $mine = GameMatchPlayer::query()->where('user_id', $user->id)->pluck('rank', 'game_match_id');
        if ($mine->isEmpty()) {
            return [];
        }

        return $this->opponentQuery($user)
            ->with(['user:id,name', 'match:id,ended_at'])
            ->get()
            ->groupBy('user_id')
            ->map(function ($seats, $userId) use ($mine): array {
                $wins = $losses = $draws = 0;
                foreach ($seats as $seat) {
                    $myRank = $mine[$seat->game_match_id];
                    match (true) {
                        $myRank < $seat->rank => $wins++,
                        $myRank > $seat->rank => $losses++,
                        default => $draws++,
                    };
                }
                $last = $seats->sortByDesc(fn ($s) => $s->match->ended_at)->first();

                return [
                    'user_id' => (int) $userId,
                    'name' => $last->name,
                    'account' => $last->user?->name,
                    'grade' => $last->grade,
                    'matches' => $seats->count(),
                    'wins' => $wins,
                    'losses' => $losses,
                    'draws' => $draws,
                    'last_played_at' => $last->match->ended_at->toIso8601String(),
                ];
            })
            ->sortByDesc('matches')
            ->take($limit)
            ->values()
            ->all();
    }

    /**
     * Last 6 months: matches, win rate and accuracy, to see progress.
     *
     * @return list<array{month: string, matches: int, wins: int, win_rate: ?float, accuracy: ?float, avg_level: ?float}>
     */
    private function monthly(User $user): array
    {
        $from = Carbon::now()->startOfMonth()->subMonths(5);
        $seats = GameMatchPlayer::query()
            ->where('user_id', $user->id)
            ->whereHas('match', fn ($q) => $q->where('ended_at', '>=', $from))
            ->with('match:id,ended_at,level,players_count')
            ->get()
            ->groupBy(fn (GameMatchPlayer $seat): string => $seat->match->ended_at->format('Y-m'));

        $months = [];
        for ($i = 0; $i < 6; $i++) {
            $key = $from->copy()->addMonths($i)->format('Y-m');
            $group = $seats->get($key, collect());
            $multi = $group->filter(fn ($s) => $s->match->players_count > 1);
            $levels = $group->map(fn ($s) => $s->match->level)->filter();
            $correct = (int) $group->sum('correct');
            $answered = $correct + (int) $group->sum('wrong');

            $months[] = [
                'month' => $key,
                'matches' => $group->count(),
                'wins' => $multi->where('rank', 1)->count(),
                'win_rate' => $this->percent($multi->where('rank', 1)->count(), $multi->count()),
                'accuracy' => $this->percent($correct, $answered),
                'avg_level' => $levels->isEmpty() ? null : round($levels->avg(), 1),
            ];
        }

        return $months;
    }

    /** @return list<array{game_key: string, matches: int, wins: int, best_level: ?int, avg_rank: float}> */
    private function byGame(User $user): array
    {
        return GameMatchPlayer::query()
            ->where('game_match_players.user_id', $user->id)
            ->join('game_matches', 'game_matches.id', '=', 'game_match_players.game_match_id')
            ->selectRaw('game_matches.game_key, COUNT(*) as matches, SUM(CASE WHEN '.$this->col('game_match_players.rank').' = 1 AND game_matches.players_count > 1 THEN 1 ELSE 0 END) as wins, MAX(game_matches.level) as best_level, AVG('.$this->col('game_match_players.rank').') as avg_rank')
            ->groupBy('game_matches.game_key')
            ->orderByDesc('matches')
            ->get()
            ->map(fn ($row): array => [
                'game_key' => $row->game_key,
                'matches' => (int) $row->matches,
                'wins' => (int) $row->wins,
                'best_level' => $row->best_level !== null ? (int) $row->best_level : null,
                'avg_rank' => round((float) $row->avg_rank, 2),
            ])->all();
    }

    /** Quotes a column for the active driver (`rank` is reserved in MySQL 8). */
    private function col(string $column): string
    {
        return DB::connection()->getQueryGrammar()->wrap($column);
    }

    private function percent(int $part, int $whole): ?float
    {
        return $whole > 0 ? round($part / $whole * 100, 1) : null;
    }
}
