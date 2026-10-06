<?php

namespace App\Services;

use App\Models\GameHistory;
use App\Models\Question;
use App\Models\QuestionAnswer;
use App\Models\User;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Support\Carbon;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\DB;

/**
 * Read model for super admin game statistics and leaderboards.
 *
 * "Success" means the player answered more than 70% correctly, matching the
 * Sky Quiz pass rule in the Go service.
 */
class GameAnalytics
{
    public const PASS_PERCENT = 70;

    /** Age groups: label => [min, max]. */
    public const AGE_GROUPS = [
        '≤6' => [0, 6],
        '7–9' => [7, 9],
        '10–12' => [10, 12],
        '13–15' => [13, 15],
        '16–18' => [16, 18],
        '19+' => [19, 200],
    ];

    /** School levels by grade: key => [min, max]. */
    public const LEVELS = [
        'sd' => [1, 6],
        'smp' => [7, 9],
        'sma' => [10, 12],
    ];

    /**
     * Catalog games with headline numbers.
     *
     * @return list<array<string, mixed>>
     */
    public function overview(): array
    {
        $stats = GameHistory::query()
            ->selectRaw('game_key, COUNT(*) as plays, COUNT(DISTINCT user_id) as players, SUM(points) as points, MAX(played_at) as last_played_at')
            ->selectRaw('SUM(correct) as correct, SUM(wrong) as wrong')
            ->selectRaw($this->passedExpression().' as passed, SUM(CASE WHEN correct IS NOT NULL THEN 1 ELSE 0 END) as scored')
            ->groupBy('game_key')
            ->get()
            ->keyBy('game_key');

        $questionCounts = $this->questionCountsByGame();

        return $this->catalogGames()->map(function (array $game) use ($stats, $questionCounts): array {
            $row = $stats->get($game['key']);

            return [
                ...$game,
                'plays' => (int) ($row->plays ?? 0),
                'players' => (int) ($row->players ?? 0),
                'points' => (int) ($row->points ?? 0),
                'accuracy' => $this->percent((int) ($row->correct ?? 0), (int) ($row->correct ?? 0) + (int) ($row->wrong ?? 0)),
                'success_rate' => $this->percent((int) ($row->passed ?? 0), (int) ($row->scored ?? 0)),
                'last_played_at' => $row?->last_played_at ? Carbon::parse($row->last_played_at)->toIso8601String() : null,
                'questions' => $questionCounts[$game['key']] ?? 0,
            ];
        })->values()->all();
    }

    /**
     * Full statistics for one game.
     *
     * @return array<string, mixed>
     */
    public function detail(string $gameKey, int $days): array
    {
        $base = fn (): Builder => GameHistory::query()
            ->where('game_key', $gameKey)
            ->when($days > 0, fn (Builder $query) => $query->where('played_at', '>=', now()->subDays($days)->startOfDay()));

        $totals = $base()
            ->selectRaw('COUNT(*) as plays, COUNT(DISTINCT user_id) as players, SUM(points) as points, AVG(points) as avg_points')
            ->selectRaw('SUM(correct) as correct, SUM(wrong) as wrong, AVG(duration_seconds) as avg_duration, SUM(duration_seconds) as total_duration')
            ->selectRaw($this->passedExpression().' as passed, SUM(CASE WHEN correct IS NOT NULL THEN 1 ELSE 0 END) as scored')
            ->first();

        $answered = (int) $totals->correct + (int) $totals->wrong;

        return [
            'summary' => [
                'plays' => (int) $totals->plays,
                'players' => (int) $totals->players,
                'points' => (int) $totals->points,
                'avg_points' => round((float) $totals->avg_points, 1),
                'avg_duration' => $totals->avg_duration !== null ? (int) round((float) $totals->avg_duration) : null,
                'total_duration' => (int) $totals->total_duration,
                'accuracy' => $this->percent((int) $totals->correct, $answered),
                'success_rate' => $this->percent((int) $totals->passed, (int) $totals->scored),
                'plays_per_player' => (int) $totals->players > 0 ? round($totals->plays / $totals->players, 1) : 0,
            ],
            'daily' => $this->daily($base(), $days > 0 ? $days : 30),
            'byAge' => $this->groupBy($base(), 'age', self::AGE_GROUPS),
            'byGrade' => $this->byGrade($base()),
            'byLevel' => $this->groupBy($base(), 'grade', self::LEVELS),
            'byMission' => $this->byMission($base()),
            'bySchool' => $this->bySchool($base()),
            'outcomes' => $this->outcomes($base()),
            'players' => $this->players($base()),
            'recent' => $this->recent($base()),
            'questions' => $this->questionStats($gameKey),
        ];
    }

    /**
     * Leaderboard ranked by points with filters.
     *
     * @param  array{game?: ?string, level?: ?string, grade?: ?int, age?: ?string, school?: ?string, days?: int}  $filters
     * @return list<array<string, mixed>>
     */
    public function leaderboard(array $filters, int $limit = 100): array
    {
        $query = GameHistory::query()
            ->join('users', 'users.id', '=', 'game_histories.user_id')
            ->leftJoin('player_profiles', 'player_profiles.user_id', '=', 'game_histories.user_id')
            ->whereNull('users.disabled_at')
            ->whereNull('users.deleted_at')
            ->when($filters['game'] ?? null, fn (Builder $q, string $game) => $q->where('game_histories.game_key', $game))
            ->when(($filters['days'] ?? 0) > 0, fn (Builder $q) => $q->where('game_histories.played_at', '>=', now()->subDays($filters['days'])->startOfDay()))
            ->when($filters['grade'] ?? null, fn (Builder $q, int $grade) => $q->where('player_profiles.grade', $grade))
            ->when(isset(self::LEVELS[$filters['level'] ?? '']), fn (Builder $q) => $q->whereBetween('player_profiles.grade', self::LEVELS[$filters['level']]))
            ->when(isset(self::AGE_GROUPS[$filters['age'] ?? '']), function (Builder $q) use ($filters): void {
                [$min, $max] = self::AGE_GROUPS[$filters['age']];
                $q->whereBetween('player_profiles.birth_date', [now()->subYears($max + 1)->addDay()->toDateString(), now()->subYears($min)->toDateString()]);
            })
            ->when($filters['school'] ?? null, fn (Builder $q, string $school) => $q->where('player_profiles.school_name', 'like', '%'.addcslashes($school, '%_\\').'%'))
            ->groupBy('game_histories.user_id', 'users.name', 'users.email', 'player_profiles.nickname', 'player_profiles.grade', 'player_profiles.birth_date', 'player_profiles.school_name')
            ->select('game_histories.user_id', 'users.name', 'users.email', 'player_profiles.nickname', 'player_profiles.grade', 'player_profiles.birth_date', 'player_profiles.school_name')
            ->selectRaw('SUM(game_histories.points) as points, COUNT(*) as plays, SUM(game_histories.correct) as correct, SUM(game_histories.wrong) as wrong, MAX(game_histories.played_at) as last_played_at')
            ->orderByDesc('points')
            ->orderBy('game_histories.user_id')
            ->limit($limit);

        return $query->get()->values()->map(fn ($row, int $index): array => [
            'rank' => $index + 1,
            'user_id' => (int) $row->user_id,
            'name' => $row->nickname ?: $row->name,
            'account_name' => $row->name,
            'email' => $row->email,
            'grade' => $row->grade !== null ? (int) $row->grade : null,
            'age' => $row->birth_date ? Carbon::parse($row->birth_date)->age : null,
            'school_name' => $row->school_name,
            'points' => (int) $row->points,
            'plays' => (int) $row->plays,
            'accuracy' => $this->percent((int) $row->correct, (int) $row->correct + (int) $row->wrong),
            'last_played_at' => Carbon::parse($row->last_played_at)->toIso8601String(),
        ])->all();
    }

    /**
     * Top schools by total points (for the leaderboard page).
     *
     * @return list<array{school: string, players: int, points: int, plays: int}>
     */
    public function schoolLeaderboard(?string $game, int $days, int $limit = 10): array
    {
        return GameHistory::query()
            ->whereNotNull('school_name')
            ->whereIn('user_id', User::query()->select('id')->whereNull('disabled_at'))
            ->when($game, fn (Builder $q) => $q->where('game_key', $game))
            ->when($days > 0, fn (Builder $q) => $q->where('played_at', '>=', now()->subDays($days)->startOfDay()))
            ->selectRaw('school_name, COUNT(DISTINCT user_id) as players, SUM(points) as points, COUNT(*) as plays')
            ->groupBy('school_name')
            ->orderByDesc('points')
            ->limit($limit)
            ->get()
            ->map(fn ($row): array => [
                'school' => $row->school_name,
                'players' => (int) $row->players,
                'points' => (int) $row->points,
                'plays' => (int) $row->plays,
            ])->all();
    }

    /**
     * Compact leaderboards for every portal period (week, month, all time): top players
     * with avatar and top schools. Reuses leaderboard() and schoolLeaderboard().
     *
     * @return array<string, array{days: int, players: list<array{rank: int, user_id: int, name: string, avatar_url: ?string, grade: ?int, school_name: ?string, points: int, plays: int}>, schools: list<array{school: string, players: int, points: int, plays: int}>}>
     */
    public function leaderboardsByPeriod(int $limit = 10, int $schools = 5): array
    {
        $boards = [];

        foreach (PlayerPortal::LEADERBOARD_PERIODS as $period => $days) {
            $boards[$period] = [
                'days' => (int) $days,
                'players' => $this->leaderboard(['days' => (int) $days], $limit),
                'schools' => $this->schoolLeaderboard(null, (int) $days, $schools),
            ];
        }

        $avatars = User::query()
            ->whereKey(collect($boards)->flatMap(fn (array $board): array => array_column($board['players'], 'user_id'))->unique()->all())
            ->whereNotNull('avatar_url')
            ->get(['id', 'avatar_url'])
            ->mapWithKeys(fn (User $user): array => [$user->id => $user->avatar_url]);

        return collect($boards)->map(fn (array $board): array => [
            ...$board,
            'players' => collect($board['players'])->map(fn (array $entry): array => [
                'rank' => $entry['rank'],
                'user_id' => $entry['user_id'],
                'name' => $entry['name'],
                'avatar_url' => $avatars[$entry['user_id']] ?? null,
                'grade' => $entry['grade'],
                'school_name' => $entry['school_name'],
                'points' => $entry['points'],
                'plays' => $entry['plays'],
            ])->all(),
        ])->all();
    }

    /** @return Collection<int, array{key: string, titleKey: string, category: string, accent: string, awardsPoints: bool, minPlayers: int, maxPlayers: int, tracked: bool}> */
    public function catalogGames(): Collection
    {
        return collect(config('game-catalog.categories'))->flatMap(fn (array $category): array => collect($category['games'])->map(fn (array $game): array => [
            'key' => $game['key'],
            'titleKey' => $game['titleKey'],
            'category' => $category['titleKey'],
            'accent' => $game['accent'] ?? '#f5a623',
            'awardsPoints' => (bool) ($game['awards_points'] ?? false),
            'minPlayers' => (int) ($game['min_players'] ?? 1),
            'maxPlayers' => (int) ($game['max_players'] ?? 1),
            'tracked' => in_array($game['key'], Question::GAMES, true),
        ])->all())->values();
    }

    public function gameExists(string $gameKey): bool
    {
        return $this->catalogGames()->contains('key', $gameKey);
    }

    private function passedExpression(): string
    {
        $pass = self::PASS_PERCENT;

        return "SUM(CASE WHEN correct IS NOT NULL AND (correct + wrong) > 0 AND correct * 100 > {$pass} * (correct + wrong) THEN 1 ELSE 0 END)";
    }

    private function percent(int $part, int $whole): ?float
    {
        return $whole > 0 ? round($part / $whole * 100, 1) : null;
    }

    /** @return array<string, int> */
    private function questionCountsByGame(): array
    {
        $counts = array_fill_keys(Question::GAMES, 0);

        Question::query()->active()->pluck('games')->each(function (?array $games) use (&$counts): void {
            foreach ($games ?? [] as $game) {
                if (isset($counts[$game])) {
                    $counts[$game]++;
                }
            }
        });

        return $counts;
    }

    /** @return list<array{date: string, plays: int, players: int}> */
    private function daily(Builder $query, int $days): array
    {
        $days = min($days, 90);
        $rows = $query->where('played_at', '>=', now()->subDays($days - 1)->startOfDay())
            ->get(['played_at', 'user_id'])
            ->groupBy(fn (GameHistory $history): string => $history->played_at->toDateString());

        return collect(range($days - 1, 0))->map(function (int $ago) use ($rows): array {
            $date = now()->subDays($ago)->toDateString();
            $day = $rows->get($date, collect());

            return ['date' => $date, 'plays' => $day->count(), 'players' => $day->pluck('user_id')->unique()->count()];
        })->all();
    }

    /**
     * @param  array<string, array{0: int, 1: int}>  $groups
     * @return list<array<string, mixed>>
     */
    private function groupBy(Builder $query, string $column, array $groups): array
    {
        $rows = $query->get([$column, 'user_id', 'points', 'correct', 'wrong']);
        $result = [];

        foreach ($groups as $label => [$min, $max]) {
            $result[] = $this->bucket($label, $rows->filter(fn (GameHistory $h): bool => $h->{$column} !== null && $h->{$column} >= $min && $h->{$column} <= $max));
        }
        $result[] = $this->bucket('unknown', $rows->filter(fn (GameHistory $h): bool => $h->{$column} === null));

        return $result;
    }

    /** @return list<array<string, mixed>> */
    private function byGrade(Builder $query): array
    {
        $rows = $query->get(['grade', 'user_id', 'points', 'correct', 'wrong']);

        return collect(range(1, 12))
            ->map(fn (int $grade): array => $this->bucket((string) $grade, $rows->where('grade', $grade)))
            ->filter(fn (array $bucket): bool => $bucket['plays'] > 0)
            ->values()->all();
    }

    /** @return list<array<string, mixed>> */
    private function byMission(Builder $query): array
    {
        return $query->get(['mission', 'user_id', 'points', 'correct', 'wrong'])
            ->groupBy(fn (GameHistory $h): string => $h->mission ?? 'unknown')
            ->map(fn (Collection $rows, string $mission): array => $this->bucket($mission, $rows))
            ->sortByDesc('plays')->values()->all();
    }

    /** @return list<array<string, mixed>> */
    private function bySchool(Builder $query): array
    {
        return $query->whereNotNull('school_name')
            ->get(['school_name', 'user_id', 'points', 'correct', 'wrong'])
            ->groupBy('school_name')
            ->map(fn (Collection $rows, string $school): array => $this->bucket($school, $rows))
            ->sortByDesc('plays')->take(10)->values()->all();
    }

    /**
     * @param  Collection<int, GameHistory>  $rows
     * @return array<string, mixed>
     */
    private function bucket(string $label, Collection $rows): array
    {
        $correct = (int) $rows->sum('correct');
        $wrong = (int) $rows->sum('wrong');
        $scored = $rows->filter(fn (GameHistory $h): bool => $h->correct !== null && ($h->correct + $h->wrong) > 0);

        return [
            'label' => $label,
            'plays' => $rows->count(),
            'players' => $rows->pluck('user_id')->unique()->count(),
            'avg_points' => $rows->isEmpty() ? 0 : round((float) $rows->avg('points'), 1),
            'accuracy' => $this->percent($correct, $correct + $wrong),
            'success_rate' => $this->percent(
                $scored->filter(fn (GameHistory $h): bool => $h->correct * 100 > self::PASS_PERCENT * ($h->correct + $h->wrong))->count(),
                $scored->count(),
            ),
        ];
    }

    /** @return list<array{label: string, count: int}> */
    private function outcomes(Builder $query): array
    {
        $buckets = ['0–40%' => 0, '41–70%' => 0, '71–90%' => 0, '91–100%' => 0];

        $query->whereNotNull('correct')->get(['correct', 'wrong'])->each(function (GameHistory $h) use (&$buckets): void {
            $accuracy = $h->accuracy();
            if ($accuracy === null) {
                return;
            }
            $key = match (true) {
                $accuracy <= 40 => '0–40%',
                $accuracy <= 70 => '41–70%',
                $accuracy <= 90 => '71–90%',
                default => '91–100%',
            };
            $buckets[$key]++;
        });

        return collect($buckets)->map(fn (int $count, string $label): array => ['label' => $label, 'count' => $count])->values()->all();
    }

    /** @return list<array<string, mixed>> */
    private function players(Builder $query): array
    {
        return $query->join('users', 'users.id', '=', 'game_histories.user_id')
            ->leftJoin('player_profiles', 'player_profiles.user_id', '=', 'game_histories.user_id')
            ->groupBy('game_histories.user_id', 'users.name', 'player_profiles.nickname', 'player_profiles.grade', 'player_profiles.birth_date', 'player_profiles.school_name')
            ->select('game_histories.user_id', 'users.name', 'player_profiles.nickname', 'player_profiles.grade', 'player_profiles.birth_date', 'player_profiles.school_name')
            ->selectRaw('COUNT(*) as plays, SUM(game_histories.points) as points, MAX(game_histories.points) as best, SUM(game_histories.correct) as correct, SUM(game_histories.wrong) as wrong, MAX(game_histories.played_at) as last_played_at')
            ->orderByDesc('plays')
            ->orderByDesc('points')
            ->limit(50)
            ->get()
            ->map(fn ($row): array => [
                'user_id' => (int) $row->user_id,
                'name' => $row->nickname ?: $row->name,
                'grade' => $row->grade !== null ? (int) $row->grade : null,
                'age' => $row->birth_date ? Carbon::parse($row->birth_date)->age : null,
                'school_name' => $row->school_name,
                'plays' => (int) $row->plays,
                'points' => (int) $row->points,
                'best' => (int) $row->best,
                'accuracy' => $this->percent((int) $row->correct, (int) $row->correct + (int) $row->wrong),
                'last_played_at' => Carbon::parse($row->last_played_at)->toIso8601String(),
            ])->all();
    }

    /** @return list<array<string, mixed>> */
    private function recent(Builder $query): array
    {
        return $query->with('user:id,name')
            ->orderByDesc('played_at')
            ->orderByDesc('id')
            ->limit(15)
            ->get()
            ->map(fn (GameHistory $h): array => [
                'id' => $h->id,
                'user_id' => $h->user_id,
                'name' => $h->user?->name,
                'mission' => $h->mission,
                'grade' => $h->grade,
                'age' => $h->age,
                'points' => $h->points,
                'correct' => $h->correct,
                'wrong' => $h->wrong,
                'accuracy' => $h->accuracy(),
                'duration_seconds' => $h->duration_seconds,
                'played_at' => $h->played_at->toIso8601String(),
            ])->all();
    }

    /**
     * Hardest and easiest bank questions for a game.
     *
     * @return array{hardest: list<array<string, mixed>>, total_answers: int}
     */
    private function questionStats(string $gameKey): array
    {
        $rows = QuestionAnswer::query()
            ->where('game_key', $gameKey)
            ->select('question_id', DB::raw('COUNT(*) as answered'), DB::raw('SUM(CASE WHEN correct THEN 1 ELSE 0 END) as correct'))
            ->groupBy('question_id')
            ->having('answered', '>=', 1)
            ->get();

        $questions = Question::query()->whereIn('id', $rows->pluck('question_id'))->get(['id', 'key', 'subject', 'band', 'prompt_id'])->keyBy('id');

        $mapped = $rows->map(fn ($row): array => [
            'id' => (int) $row->question_id,
            'key' => $questions[$row->question_id]->key ?? '',
            'subject' => $questions[$row->question_id]->subject ?? '',
            'band' => $questions[$row->question_id]->band ?? null,
            'prompt' => $questions[$row->question_id]->prompt_id ?? '',
            'answered' => (int) $row->answered,
            'success_rate' => $this->percent((int) $row->correct, (int) $row->answered),
        ]);

        return [
            'hardest' => $mapped->sortBy('success_rate')->take(8)->values()->all(),
            'total_answers' => (int) $rows->sum('answered'),
        ];
    }
}
