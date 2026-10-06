<?php

namespace App\Services\Ai;

use App\Models\GameHistory;
use App\Models\Question;
use App\Models\QuestionAnswer;
use App\Models\Subject;
use App\Models\User;
use App\Models\UserAbilityAssessment;
use App\Models\UserBadge;
use App\Services\GameAnalytics;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Support\Carbon;
use Illuminate\Support\Collection;

/**
 * Prepares a compact, anonymous picture of one player's results for the AI
 * ability analysis: no name or email, only age, grade, school and aggregated
 * play numbers. Every section comes from aggregate queries and is capped.
 */
class AbilityProfileBuilder
{
    /** Alias the model sees instead of the player's name. */
    public const ALIAS = 'Peserta';

    /** Days of the "recent" window used for trends. */
    public const WINDOW_DAYS = 30;

    /** Answers/plays needed before a subject or game is ranked. */
    public const MIN_SAMPLE = 5;

    public const MAX_GAMES = 15;

    public const MAX_SUBJECTS = 15;

    public const MAX_BADGES = 20;

    public const RECENT_RESULTS = 10;

    public const PREVIOUS_ASSESSMENTS = 3;

    /** Bank answers a question needs before its success rate rates difficulty. */
    public const MIN_RATED_ANSWERS = 5;

    /**
     * @return array{profile: array<string, mixed>, period: array<string, mixed>, totals: array<string, mixed>, games: list<array<string, mixed>>, subjects: list<array<string, mixed>>, grade_bands: list<array<string, mixed>>, difficulty: list<array<string, mixed>>, rankings: array<string, list<string>>, consistency: array<string, mixed>, badges: array<string, mixed>, recent_results: list<array<string, mixed>>, previous_assessments: list<array<string, mixed>>}
     */
    public function build(User $user, ?int $exceptAssessmentId = null): array
    {
        $user->loadMissing('playerProfile');
        $grade = $user->playerProfile?->grade;
        $games = $this->games($user, $grade);
        $subjects = $this->subjects($user, $grade);

        return [
            'profile' => $this->profile($user),
            'period' => $this->period($user),
            'totals' => $this->totals($user),
            'games' => $games,
            'subjects' => $subjects,
            'grade_bands' => $this->gradeBands($user),
            'difficulty' => $this->difficulty($user),
            'rankings' => [
                'strongest_subjects' => $this->rank($subjects, 'answered', true),
                'weakest_subjects' => $this->rank($subjects, 'answered', false),
                'strongest_games' => $this->rank($games, 'scored_plays', true),
                'weakest_games' => $this->rank($games, 'scored_plays', false),
            ],
            'consistency' => $this->consistency($user),
            'badges' => $this->badges($user),
            'recent_results' => $this->recentResults($user),
            'previous_assessments' => $this->previousAssessments($user, $exceptAssessmentId),
        ];
    }

    /** @param  array<string, mixed>  $profile */
    public function toJson(array $profile): string
    {
        return (string) json_encode($profile, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_PRESERVE_ZERO_FRACTION);
    }

    /** @return array{alias: string, age: ?int, grade: ?int, grade_label: string, school_level: string, school: ?string} */
    private function profile(User $user): array
    {
        $profile = $user->playerProfile;
        $grade = $profile?->grade;

        return [
            'alias' => self::ALIAS,
            'age' => $profile?->age,
            'grade' => $grade,
            'grade_label' => match (true) {
                $grade === null => 'tidak diketahui',
                $grade === Question::KINDERGARTEN => 'TK',
                default => "kelas {$grade}",
            },
            'school_level' => $this->schoolLevel($grade),
            'school' => $profile?->school_name,
        ];
    }

    /** @return array{first_played_at: ?string, last_played_at: ?string, span_days: int, window_days: int, generated_at: string} */
    private function period(User $user): array
    {
        $row = $this->histories($user)->selectRaw('MIN(played_at) as first_at, MAX(played_at) as last_at')->first();
        $first = $row?->first_at ? Carbon::parse($row->first_at) : null;
        $last = $row?->last_at ? Carbon::parse($row->last_at) : null;

        return [
            'first_played_at' => $first?->toDateString(),
            'last_played_at' => $last?->toDateString(),
            'span_days' => $first && $last ? (int) $first->copy()->startOfDay()->diffInDays($last->copy()->startOfDay()) + 1 : 0,
            'window_days' => self::WINDOW_DAYS,
            'generated_at' => now()->toDateString(),
        ];
    }

    /** @return array<string, int|float|null> */
    private function totals(User $user): array
    {
        [$recentFrom, $previousFrom] = $this->windows();
        $row = $this->histories($user)
            ->selectRaw('COUNT(*) as plays, COALESCE(SUM(points), 0) as points, COALESCE(SUM(correct), 0) as correct, COALESCE(SUM(wrong), 0) as wrong')
            ->selectRaw('COALESCE(SUM(duration_seconds), 0) as seconds, COUNT(duration_seconds) as timed')
            ->selectRaw('SUM(CASE WHEN played_at >= ? THEN 1 ELSE 0 END) as plays_recent', [$recentFrom])
            ->selectRaw('SUM(CASE WHEN played_at >= ? AND played_at < ? THEN 1 ELSE 0 END) as plays_previous', [$previousFrom, $recentFrom])
            ->selectRaw('COUNT(DISTINCT game_key) as games')
            ->first();

        $correct = (int) $row->correct;
        $wrong = (int) $row->wrong;

        return [
            'plays' => (int) $row->plays,
            'distinct_games' => (int) $row->games,
            'points' => (int) $row->points,
            'correct' => $correct,
            'wrong' => $wrong,
            'accuracy' => $this->percent($correct, $correct + $wrong),
            'active_days' => $this->activeDays($user)->count(),
            'play_minutes' => (int) round((int) $row->seconds / 60),
            'avg_duration_seconds' => (int) $row->timed > 0 ? (int) round((int) $row->seconds / (int) $row->timed) : null,
            'plays_last_30d' => (int) $row->plays_recent,
            'plays_previous_30d' => (int) $row->plays_previous,
        ];
    }

    /** @return list<array<string, mixed>> */
    private function games(User $user, ?int $grade): array
    {
        [$recentFrom, $previousFrom] = $this->windows();
        $peers = $this->peerGames($user, $grade);

        return $this->histories($user)
            ->selectRaw('game_key, MAX(game_name) as game_name, COUNT(*) as plays, COALESCE(SUM(points), 0) as points, COALESCE(SUM(correct), 0) as correct, COALESCE(SUM(wrong), 0) as wrong')
            ->selectRaw('SUM(CASE WHEN correct IS NOT NULL AND (correct + wrong) > 0 THEN 1 ELSE 0 END) as scored_plays')
            ->selectRaw('AVG(duration_seconds) as avg_duration')
            ->selectRaw('SUM(CASE WHEN played_at >= ? THEN 1 ELSE 0 END) as plays_recent', [$recentFrom])
            ->selectRaw('SUM(CASE WHEN played_at >= ? THEN COALESCE(correct, 0) ELSE 0 END) as correct_recent', [$recentFrom])
            ->selectRaw('SUM(CASE WHEN played_at >= ? THEN COALESCE(wrong, 0) ELSE 0 END) as wrong_recent', [$recentFrom])
            ->selectRaw('SUM(CASE WHEN played_at >= ? AND played_at < ? THEN 1 ELSE 0 END) as plays_previous', [$previousFrom, $recentFrom])
            ->selectRaw('SUM(CASE WHEN played_at >= ? AND played_at < ? THEN COALESCE(correct, 0) ELSE 0 END) as correct_previous', [$previousFrom, $recentFrom])
            ->selectRaw('SUM(CASE WHEN played_at >= ? AND played_at < ? THEN COALESCE(wrong, 0) ELSE 0 END) as wrong_previous', [$previousFrom, $recentFrom])
            ->groupBy('game_key')
            ->orderByDesc('plays')
            ->limit(self::MAX_GAMES)
            ->get()
            ->map(function ($row) use ($peers): array {
                $recent = $this->percent((int) $row->correct_recent, (int) $row->correct_recent + (int) $row->wrong_recent);
                $previous = $this->percent((int) $row->correct_previous, (int) $row->correct_previous + (int) $row->wrong_previous);

                return [
                    'key' => $row->game_key,
                    'name' => $row->game_name,
                    'plays' => (int) $row->plays,
                    'scored_plays' => (int) $row->scored_plays,
                    'points' => (int) $row->points,
                    'correct' => (int) $row->correct,
                    'wrong' => (int) $row->wrong,
                    'accuracy' => $this->percent((int) $row->correct, (int) $row->correct + (int) $row->wrong),
                    'avg_duration_seconds' => $row->avg_duration !== null ? (int) round((float) $row->avg_duration) : null,
                    'peer_accuracy' => $peers[$row->game_key] ?? null,
                    'trend' => [
                        'plays_last_30d' => (int) $row->plays_recent,
                        'plays_previous_30d' => (int) $row->plays_previous,
                        'accuracy_last_30d' => $recent,
                        'accuracy_previous_30d' => $previous,
                        'direction' => $this->direction($recent, $previous),
                    ],
                ];
            })
            ->values()
            ->all();
    }

    /** @return list<array{key: string, name: string, answered: int, correct: int, accuracy: ?float, peer_accuracy: ?float, peer_players: int}> */
    private function subjects(User $user, ?int $grade): array
    {
        $names = collect(Subject::catalog())->pluck('name_id', 'key');
        $peers = $this->peerSubjects($user, $grade);

        return $this->answers($user)
            ->selectRaw('questions.subject as subject, COUNT(*) as answered, SUM(CASE WHEN question_answers.correct THEN 1 ELSE 0 END) as hits')
            ->groupBy('questions.subject')
            ->orderByDesc('answered')
            ->limit(self::MAX_SUBJECTS)
            ->get()
            ->map(fn ($row): array => [
                'key' => $row->subject,
                'name' => (string) ($names[$row->subject] ?? $row->subject),
                'answered' => (int) $row->answered,
                'correct' => (int) $row->hits,
                'accuracy' => $this->percent((int) $row->hits, (int) $row->answered),
                'peer_accuracy' => $peers[$row->subject]['accuracy'] ?? null,
                'peer_players' => $peers[$row->subject]['players'] ?? 0,
            ])
            ->values()
            ->all();
    }

    /** @return list<array{band: int, grades: string, answered: int, accuracy: ?float}> */
    private function gradeBands(User $user): array
    {
        return $this->answers($user)
            ->selectRaw('questions.band as band, COUNT(*) as answered, SUM(CASE WHEN question_answers.correct THEN 1 ELSE 0 END) as hits')
            ->groupBy('questions.band')
            ->orderBy('band')
            ->get()
            ->map(fn ($row): array => [
                'band' => (int) $row->band,
                'grades' => implode('-', Question::BANDS[(int) $row->band] ?? [0, 0]),
                'answered' => (int) $row->answered,
                'accuracy' => $this->percent((int) $row->hits, (int) $row->answered),
            ])
            ->values()
            ->all();
    }

    /**
     * Accuracy per difficulty tier, rated by how often all players answer each
     * question correctly (hard < 50 %, medium < 75 %, easy otherwise).
     *
     * @return list<array{tier: string, answered: int, accuracy: ?float}>
     */
    private function difficulty(User $user): array
    {
        $min = self::MIN_RATED_ANSWERS;
        $tier = "CASE WHEN questions.times_answered < {$min} THEN 'unrated'"
            .' WHEN questions.times_correct * 100 < 50 * questions.times_answered THEN \'hard\''
            .' WHEN questions.times_correct * 100 < 75 * questions.times_answered THEN \'medium\''
            ." ELSE 'easy' END";

        $rows = $this->answers($user)
            ->selectRaw("{$tier} as tier, COUNT(*) as answered, SUM(CASE WHEN question_answers.correct THEN 1 ELSE 0 END) as hits")
            ->groupByRaw($tier)
            ->get()
            ->keyBy('tier');

        return collect(['hard', 'medium', 'easy', 'unrated'])
            ->filter(fn (string $key): bool => $rows->has($key))
            ->map(fn (string $key): array => [
                'tier' => $key,
                'answered' => (int) $rows[$key]->answered,
                'accuracy' => $this->percent((int) $rows[$key]->hits, (int) $rows[$key]->answered),
            ])
            ->values()
            ->all();
    }

    /** @return array<string, int|float|null> */
    private function consistency(User $user): array
    {
        $days = $this->activeDays($user);
        $today = now()->startOfDay();
        $played = $days->flip();

        $day = $today->copy();
        if (! $played->has($day->toDateString())) {
            $day->subDay();
        }
        $current = 0;
        while ($played->has($day->toDateString())) {
            $current++;
            $day->subDay();
        }

        $longest = 0;
        $run = 0;
        $previous = null;
        foreach ($days->sort()->values() as $date) {
            $run = $previous !== null && Carbon::parse($previous)->addDay()->toDateString() === $date ? $run + 1 : 1;
            $longest = max($longest, $run);
            $previous = $date;
        }

        $accuracies = $this->histories($user)
            ->whereNotNull('correct')
            ->whereRaw('(correct + wrong) > 0')
            ->latest('played_at')
            ->limit(20)
            ->get(['correct', 'wrong'])
            ->map(fn (GameHistory $history): float => (float) $history->accuracy());
        $spread = null;
        if ($accuracies->count() >= 3) {
            $mean = $accuracies->avg();
            $spread = round(sqrt($accuracies->map(fn (float $value): float => ($value - $mean) ** 2)->avg()), 1);
        }

        $plays = $this->histories($user)->count();
        $last = $days->max();
        $recentFrom = $today->copy()->subDays(self::WINDOW_DAYS - 1)->toDateString();

        return [
            'active_days' => $days->count(),
            'active_days_last_30d' => $days->filter(fn (string $date): bool => $date >= $recentFrom)->count(),
            'current_streak_days' => $current,
            'longest_streak_days' => $longest,
            'avg_plays_per_active_day' => $days->isNotEmpty() ? round($plays / $days->count(), 1) : null,
            'days_since_last_play' => $last !== null ? (int) Carbon::parse($last)->diffInDays($today) : null,
            'accuracy_spread_last_20' => $spread,
        ];
    }

    /** @return array{count: int, earned: list<array{key: string, name: string, earned_at: ?string}>} */
    private function badges(User $user): array
    {
        $rows = UserBadge::query()->where('user_id', $user->id)->latest('earned_at')->limit(self::MAX_BADGES)->get(['badge', 'earned_at']);

        return [
            'count' => UserBadge::query()->where('user_id', $user->id)->count(),
            'earned' => $rows->map(fn (UserBadge $badge): array => [
                'key' => $badge->badge,
                'name' => __('badges.'.$badge->badge.'.name', [], 'id'),
                'earned_at' => $badge->earned_at?->toDateString(),
            ])->values()->all(),
        ];
    }

    /** @return list<array<string, mixed>> */
    private function recentResults(User $user): array
    {
        return $this->histories($user)
            ->latest('played_at')
            ->latest('id')
            ->limit(self::RECENT_RESULTS)
            ->get(['id', 'game_key', 'points', 'correct', 'wrong', 'duration_seconds', 'played_at'])
            ->map(fn (GameHistory $history): array => [
                'date' => $history->played_at->toDateString(),
                'game' => $history->game_key,
                'points' => (int) $history->points,
                'correct' => $history->correct,
                'wrong' => $history->wrong,
                'accuracy' => $history->accuracy(),
                'duration_seconds' => $history->duration_seconds,
            ])
            ->values()
            ->all();
    }

    /** @return list<array{date: ?string, summary: string, subject_scores: array<string, int>, confidence: ?string}> */
    private function previousAssessments(User $user, ?int $exceptId): array
    {
        return UserAbilityAssessment::query()
            ->where('user_id', $user->id)
            ->where('status', UserAbilityAssessment::DONE)
            ->when($exceptId !== null, fn (Builder $query) => $query->whereKeyNot($exceptId))
            ->latest('created_at')
            ->latest('id')
            ->limit(self::PREVIOUS_ASSESSMENTS)
            ->get(['id', 'result', 'created_at'])
            ->map(fn (UserAbilityAssessment $assessment): array => [
                'date' => $assessment->created_at?->toDateString(),
                'summary' => (string) ($assessment->result['summary'] ?? ''),
                'subject_scores' => (array) ($assessment->result['subject_scores'] ?? []),
                'confidence' => isset($assessment->result['confidence']) ? (string) $assessment->result['confidence'] : null,
            ])
            ->values()
            ->all();
    }

    /** @return array<string, float> */
    private function peerGames(User $user, ?int $grade): array
    {
        if ($grade === null) {
            return [];
        }

        return GameHistory::query()
            ->join('player_profiles', 'player_profiles.user_id', '=', 'game_histories.user_id')
            ->where('player_profiles.grade', $grade)
            ->where('game_histories.user_id', '!=', $user->id)
            ->whereNotNull('game_histories.correct')
            ->selectRaw('game_histories.game_key as game_key, SUM(game_histories.correct) as correct, SUM(game_histories.wrong) as wrong')
            ->groupBy('game_histories.game_key')
            ->get()
            ->mapWithKeys(fn ($row): array => [$row->game_key => $this->percent((int) $row->correct, (int) $row->correct + (int) $row->wrong)])
            ->filter(fn (?float $accuracy): bool => $accuracy !== null)
            ->all();
    }

    /** @return array<string, array{accuracy: ?float, players: int}> */
    private function peerSubjects(User $user, ?int $grade): array
    {
        if ($grade === null) {
            return [];
        }

        return QuestionAnswer::query()
            ->join('questions', 'questions.id', '=', 'question_answers.question_id')
            ->join('game_histories', 'game_histories.id', '=', 'question_answers.game_history_id')
            ->join('player_profiles', 'player_profiles.user_id', '=', 'game_histories.user_id')
            ->where('player_profiles.grade', $grade)
            ->where('game_histories.user_id', '!=', $user->id)
            ->selectRaw('questions.subject as subject, COUNT(*) as answered, SUM(CASE WHEN question_answers.correct THEN 1 ELSE 0 END) as hits, COUNT(DISTINCT game_histories.user_id) as players')
            ->groupBy('questions.subject')
            ->get()
            ->mapWithKeys(fn ($row): array => [$row->subject => [
                'accuracy' => $this->percent((int) $row->hits, (int) $row->answered),
                'players' => (int) $row->players,
            ]])
            ->all();
    }

    /**
     * Names of the best (or worst) items with enough data.
     *
     * @param  list<array<string, mixed>>  $items
     * @return list<string>
     */
    private function rank(array $items, string $sampleKey, bool $strongest): array
    {
        $ranked = collect($items)
            ->filter(fn (array $item): bool => $item['accuracy'] !== null && $item[$sampleKey] >= ($sampleKey === 'answered' ? self::MIN_SAMPLE : 2))
            ->sortBy([['accuracy', 'desc'], [$sampleKey, 'desc']])
            ->values();
        $pick = $strongest
            ? $ranked->take(min(3, (int) ceil($ranked->count() / 2)))
            : $ranked->reverse()->take(min(3, intdiv($ranked->count(), 2)));

        return $pick->map(fn (array $item): string => (string) ($item['name'] ?: $item['key']).' ('.$item['accuracy'].'%)')->values()->all();
    }

    /** @return Collection<int, string> distinct play dates (Y-m-d) */
    private function activeDays(User $user): Collection
    {
        return $this->histories($user)
            ->selectRaw('DATE(played_at) as day')
            ->groupByRaw('DATE(played_at)')
            ->orderByRaw('DATE(played_at) desc')
            ->limit(1000)
            ->pluck('day')
            ->map(fn ($day): string => Carbon::parse((string) $day)->toDateString())
            ->values();
    }

    /** @return Builder<GameHistory> */
    private function histories(User $user): Builder
    {
        return GameHistory::query()->where('user_id', $user->id);
    }

    /** @return Builder<QuestionAnswer> */
    private function answers(User $user): Builder
    {
        return QuestionAnswer::query()
            ->join('questions', 'questions.id', '=', 'question_answers.question_id')
            ->whereIn('question_answers.game_history_id', GameHistory::query()->select('id')->where('user_id', $user->id));
    }

    /** @return array{0: Carbon, 1: Carbon} start of the recent and the previous window */
    private function windows(): array
    {
        $recent = now()->subDays(self::WINDOW_DAYS);

        return [$recent, $recent->copy()->subDays(self::WINDOW_DAYS)];
    }

    private function direction(?float $recent, ?float $previous): ?string
    {
        if ($recent === null || $previous === null) {
            return null;
        }

        return match (true) {
            $recent - $previous >= 5 => 'naik',
            $previous - $recent >= 5 => 'turun',
            default => 'stabil',
        };
    }

    private function schoolLevel(?int $grade): string
    {
        if ($grade === Question::KINDERGARTEN) {
            return 'tk';
        }
        foreach (GameAnalytics::LEVELS as $level => [$min, $max]) {
            if ($grade !== null && $grade >= $min && $grade <= $max) {
                return $level;
            }
        }

        return 'unknown';
    }

    private function percent(int $part, int $whole): ?float
    {
        return $whole > 0 ? round($part / $whole * 100, 1) : null;
    }
}
