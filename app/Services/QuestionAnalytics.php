<?php

namespace App\Services;

use App\Models\Question;
use App\Models\QuestionAnswer;
use App\Models\User;
use Illuminate\Support\Carbon;
use Illuminate\Support\Collection;

/**
 * Statistics for a single bank question, computed from per-answer records.
 */
class QuestionAnalytics
{
    /** Fewer recorded choices than this give an "insufficient" understanding level. */
    public const MIN_RECORDED_CHOICES = 10;

    /** A single wrong option chosen by at least this share (%) signals a misconception. */
    public const MISCONCEPTION_SHARE = 30;

    /**
     * Full analysis of a question. The teacher mode strips personal data
     * (player ids, account names) and adds a comparison with AI questions.
     *
     * @return array<string, mixed>
     */
    public function detail(Question $question, bool $forTeacher = false): array
    {
        $answers = QuestionAnswer::query()
            ->where('question_answers.question_id', $question->id)
            ->join('game_histories', 'game_histories.id', '=', 'question_answers.game_history_id')
            ->get([
                'question_answers.id',
                'question_answers.game_key',
                'question_answers.correct',
                'question_answers.choice',
                'question_answers.created_at',
                'game_histories.user_id',
                'game_histories.grade',
                'game_histories.age',
                'game_histories.school_name',
                'game_histories.played_at',
            ]);

        $correct = $answers->where('correct', true)->count();
        $total = $answers->count();
        $users = $answers->groupBy('user_id');
        $firstTry = $users->map(fn (Collection $rows): bool => (bool) $rows->sortBy('id')->first()->correct);

        $detail = [
            'summary' => [
                'answered' => $total,
                'correct' => $correct,
                'wrong' => $total - $correct,
                'success_rate' => $this->percent($correct, $total),
                'players' => $users->count(),
                'first_try_rate' => $this->percent($firstTry->filter()->count(), $firstTry->count()),
                'mastered_players' => $users->filter(fn (Collection $rows): bool => (bool) $rows->sortByDesc('id')->first()->correct)->count(),
                'first_answered_at' => $answers->min('created_at')?->toIso8601String(),
                'last_answered_at' => $answers->max('created_at')?->toIso8601String(),
                'difficulty' => $this->difficulty($this->percent($correct, $total)),
            ],
            'byGame' => collect(Question::GAMES)->map(fn (string $game): array => $this->bucket($game, $answers->where('game_key', $game), in_array($game, $question->games ?? [], true)))->values()->all(),
            'byGrade' => $answers->whereNotNull('grade')->groupBy('grade')->sortKeys()
                ->map(fn (Collection $rows, int $grade): array => $this->bucket((string) $grade, $rows))->values()->all(),
            'byAge' => collect(GameAnalytics::AGE_GROUPS)
                ->map(fn (array $range, string $label): array => $this->bucket($label, $answers->filter(fn ($a): bool => $a->age !== null && $a->age >= $range[0] && $a->age <= $range[1])))
                ->filter(fn (array $bucket): bool => $bucket['answered'] > 0)->values()->all(),
            'bySchool' => $answers->whereNotNull('school_name')->groupBy('school_name')
                ->map(fn (Collection $rows, string $school): array => $this->bucket($school, $rows))
                ->sortByDesc('answered')->take(10)->values()->all(),
            'daily' => $this->daily($answers, 30),
            'players' => $this->players($users),
            'recent' => $answers->sortByDesc('id')->take(15)->values()->map(fn ($a): array => [
                'id' => $a->id,
                'user_id' => $a->user_id,
                'game_key' => $a->game_key,
                'correct' => (bool) $a->correct,
                'answered_at' => $a->created_at?->toIso8601String(),
            ])->all(),
            'siblings' => $this->siblings($question),
            ...$this->choices($question, $answers),
        ];

        return $forTeacher ? $this->forTeacher($question, $detail) : $detail;
    }

    /**
     * PII-safe variant for the question author: players become numbered
     * nicknames (no user ids, account names or emails) and a comparison with
     * AI questions of the same subject, grade band and topic is added.
     *
     * @param  array<string, mixed>  $detail
     * @return array<string, mixed>
     */
    private function forTeacher(Question $question, array $detail): array
    {
        $numbers = collect($detail['players'])->pluck('user_id')->values()->flip()->map(fn (int $index): int => $index + 1);

        $detail['players'] = collect($detail['players'])->map(fn (array $player): array => [
            'number' => $numbers->get($player['user_id']),
            'nickname' => $player['name'],
            'grade' => $player['grade'],
            'school_name' => $player['school_name'],
            'attempts' => $player['attempts'],
            'correct' => $player['correct'],
            'wrong' => $player['wrong'],
            'first_correct' => $player['first_correct'],
            'last_correct' => $player['last_correct'],
            'last_answered_at' => $player['last_answered_at'],
        ])->all();

        $detail['recent'] = collect($detail['recent'])->map(fn (array $answer): array => [
            'id' => $answer['id'],
            'player' => $numbers->get($answer['user_id']),
            'game_key' => $answer['game_key'],
            'correct' => $answer['correct'],
            'answered_at' => $answer['answered_at'],
        ])->all();

        $detail['comparison'] = $this->comparison($question, $detail['summary']['success_rate']);

        return $detail;
    }

    /**
     * This question against AI-written questions of the same subject and grade
     * band (and topic when set), aggregated in SQL with the same difficulty
     * thresholds used for every question.
     *
     * @return array{scope: array{subject: string, band: int, topic_id: ?int}, question: array{success_rate: ?float, difficulty: ?string, level: int}, ai: array{questions: int, rated_questions: int, answered: int, correct: int, success_rate: ?float, difficulty: array{easy: int, medium: int, hard: int}, same_level: array{questions: int, answered: int, success_rate: ?float}}, delta: ?float}
     */
    private function comparison(Question $question, ?float $rate): array
    {
        $level = Question::normalizeLevel($question->level);
        $tier = 'CASE WHEN times_answered = 0 THEN NULL'
            ." WHEN times_correct * 100 < 40 * times_answered THEN 'hard'"
            ." WHEN times_correct * 100 < 70 * times_answered THEN 'medium'"
            ." ELSE 'easy' END";

        $row = Question::query()
            ->where('source', Question::SOURCE_AI)
            ->where('subject', $question->subject)
            ->where('band', $question->band)
            ->when($question->topic_id !== null, fn ($query) => $query->where('topic_id', $question->topic_id))
            ->selectRaw('COUNT(*) as questions')
            ->selectRaw('SUM(CASE WHEN times_answered > 0 THEN 1 ELSE 0 END) as rated')
            ->selectRaw('COALESCE(SUM(times_answered), 0) as answered')
            ->selectRaw('COALESCE(SUM(times_correct), 0) as correct')
            ->selectRaw("SUM(CASE WHEN ({$tier}) = 'easy' THEN 1 ELSE 0 END) as easy")
            ->selectRaw("SUM(CASE WHEN ({$tier}) = 'medium' THEN 1 ELSE 0 END) as medium")
            ->selectRaw("SUM(CASE WHEN ({$tier}) = 'hard' THEN 1 ELSE 0 END) as hard")
            ->selectRaw('SUM(CASE WHEN level = ? THEN 1 ELSE 0 END) as level_questions', [$level])
            ->selectRaw('COALESCE(SUM(CASE WHEN level = ? THEN times_answered ELSE 0 END), 0) as level_answered', [$level])
            ->selectRaw('COALESCE(SUM(CASE WHEN level = ? THEN times_correct ELSE 0 END), 0) as level_correct', [$level])
            ->toBase()
            ->first();

        $aiRate = $this->percent((int) $row->correct, (int) $row->answered);

        return [
            'scope' => ['subject' => $question->subject, 'band' => (int) $question->band, 'topic_id' => $question->topic_id],
            'question' => ['success_rate' => $rate, 'difficulty' => $this->difficulty($rate), 'level' => $level],
            'ai' => [
                'questions' => (int) $row->questions,
                'rated_questions' => (int) $row->rated,
                'answered' => (int) $row->answered,
                'correct' => (int) $row->correct,
                'success_rate' => $aiRate,
                'difficulty' => ['easy' => (int) $row->easy, 'medium' => (int) $row->medium, 'hard' => (int) $row->hard],
                'same_level' => [
                    'questions' => (int) $row->level_questions,
                    'answered' => (int) $row->level_answered,
                    'success_rate' => $this->percent((int) $row->level_correct, (int) $row->level_answered),
                ],
            ],
            'delta' => $rate !== null && $aiRate !== null ? round($rate - $aiRate, 1) : null,
        ];
    }

    /**
     * Answer distribution per original option and the understanding level
     * derived from it (rule based, computed here).
     *
     * @param  Collection<int, QuestionAnswer>  $answers
     * @return array{choices: list<array{index: int, text: ?string, text_en: ?string, is_correct: bool, count: int, percent: ?float}>, choice_totals: array{recorded: int, unrecorded: int}, understanding: array<string, mixed>}
     */
    private function choices(Question $question, Collection $answers): array
    {
        $options = $question->type === Question::TYPE_TRUE_FALSE
            ? [['id' => null, 'en' => null], ['id' => null, 'en' => null]]
            : array_values($question->options ?? []);
        $recorded = $answers->filter(fn ($a): bool => $a->choice !== null && $a->choice < count($options));
        $counts = $recorded->countBy(fn ($a): int => (int) $a->choice);
        $total = $recorded->count();

        $choices = collect($options)->map(fn (array $option, int $index): array => [
            'index' => $index,
            'text' => $option['id'] ?? null,
            'text_en' => $option['en'] ?? null,
            'is_correct' => $index === (int) $question->answer,
            'count' => (int) $counts->get($index, 0),
            'percent' => $this->percent((int) $counts->get($index, 0), $total),
        ])->values()->all();

        return [
            'choices' => $choices,
            'choice_totals' => ['recorded' => $total, 'unrecorded' => $answers->count() - $total],
            'understanding' => $this->understanding($choices, $total),
        ];
    }

    /**
     * Understanding level: understood (>= 75% correct), misconception (one
     * wrong option >= 30% or more popular than the correct one), partial
     * (50-74%), not_understood (< 50%), insufficient (< 10 recorded).
     *
     * @param  list<array{index: int, is_correct: bool, count: int, percent: ?float}>  $choices
     * @return array{level: string, reason: string, recorded: int, correct_rate: ?float, top_wrong: ?array{index: int, count: int, percent: ?float}, min_recorded: int}
     */
    private function understanding(array $choices, int $recorded): array
    {
        $correct = collect($choices)->firstWhere('is_correct', true);
        $correctCount = $correct['count'] ?? 0;
        $rate = $this->percent($correctCount, $recorded);
        $wrong = collect($choices)->where('is_correct', false)->where('count', '>', 0)->sortByDesc('count')->first();
        $topWrong = $wrong ? ['index' => $wrong['index'], 'count' => $wrong['count'], 'percent' => $wrong['percent']] : null;

        [$level, $reason] = match (true) {
            $recorded < self::MIN_RECORDED_CHOICES => ['insufficient', 'too_few_answers'],
            $rate >= 75 => ['understood', 'mostly_correct'],
            $topWrong !== null && $topWrong['count'] > $correctCount => ['misconception', 'wrong_beats_correct'],
            $topWrong !== null && $topWrong['percent'] >= self::MISCONCEPTION_SHARE => ['misconception', 'dominant_wrong_option'],
            $rate >= 50 => ['partial', 'mixed_results'],
            default => ['not_understood', 'mostly_wrong'],
        };

        return [
            'level' => $level,
            'reason' => $reason,
            'recorded' => $recorded,
            'correct_rate' => $rate,
            'top_wrong' => $level === 'insufficient' ? null : $topWrong,
            'min_recorded' => self::MIN_RECORDED_CHOICES,
        ];
    }

    /**
     * Per-player outcome for this question.
     *
     * @param  Collection<int, Collection<int, QuestionAnswer>>  $users
     * @return list<array<string, mixed>>
     */
    private function players(Collection $users): array
    {
        if ($users->isEmpty()) {
            return [];
        }

        $people = User::query()
            ->withTrashed()
            ->with('playerProfile:id,user_id,nickname,grade,school_name')
            ->whereIn('id', $users->keys())
            ->get(['id', 'name', 'email'])
            ->keyBy('id');

        return $users->map(function (Collection $rows, int $userId) use ($people): array {
            $person = $people->get($userId);
            $ordered = $rows->sortBy('id');
            $correct = $rows->where('correct', true)->count();

            return [
                'user_id' => $userId,
                'name' => $person?->playerProfile?->nickname ?: ($person?->name ?? 'Deleted user'),
                'account_name' => $person?->name,
                'grade' => $person?->playerProfile?->grade,
                'school_name' => $person?->playerProfile?->school_name,
                'attempts' => $rows->count(),
                'correct' => $correct,
                'wrong' => $rows->count() - $correct,
                'first_correct' => (bool) $ordered->first()->correct,
                'last_correct' => (bool) $ordered->last()->correct,
                'last_answered_at' => $ordered->last()->created_at?->toIso8601String(),
            ];
        })->sortByDesc('last_answered_at')->values()->all();
    }

    /**
     * @param  Collection<int, QuestionAnswer>  $rows
     * @return array<string, mixed>
     */
    private function bucket(string $label, Collection $rows, ?bool $assigned = null): array
    {
        $correct = $rows->where('correct', true)->count();

        return array_filter([
            'label' => $label,
            'answered' => $rows->count(),
            'correct' => $correct,
            'wrong' => $rows->count() - $correct,
            'players' => $rows->pluck('user_id')->unique()->count(),
            'success_rate' => $this->percent($correct, $rows->count()),
            'assigned' => $assigned,
        ], fn ($value, string $key): bool => $key !== 'assigned' || $value !== null, ARRAY_FILTER_USE_BOTH);
    }

    /**
     * @param  Collection<int, QuestionAnswer>  $answers
     * @return list<array{date: string, correct: int, wrong: int}>
     */
    private function daily(Collection $answers, int $days): array
    {
        $byDay = $answers->groupBy(fn ($a): string => Carbon::parse($a->created_at)->toDateString());

        return collect(range($days - 1, 0))->map(function (int $ago) use ($byDay): array {
            $date = now()->subDays($ago)->toDateString();
            $rows = $byDay->get($date, collect());

            return ['date' => $date, 'correct' => $rows->where('correct', true)->count(), 'wrong' => $rows->where('correct', false)->count()];
        })->all();
    }

    /**
     * Success rate of this question compared with others in the same subject and grade band.
     *
     * @return array{subject_rate: ?float, band_rate: ?float, rank: ?int, of: int}
     */
    private function siblings(Question $question): array
    {
        $peers = Question::query()
            ->where('subject', $question->subject)
            ->where('band', $question->band)
            ->where('times_answered', '>', 0)
            ->get(['id', 'times_answered', 'times_correct']);

        $sorted = $peers->sortBy(fn (Question $q): float => $q->times_correct / $q->times_answered)->values();
        $index = $sorted->search(fn (Question $q): bool => $q->id === $question->id);

        $subject = Question::query()->where('subject', $question->subject)
            ->selectRaw('SUM(times_correct) as correct, SUM(times_answered) as answered')->first();

        return [
            'subject_rate' => $this->percent((int) $subject->correct, (int) $subject->answered),
            'band_rate' => $this->percent((int) $peers->sum('times_correct'), (int) $peers->sum('times_answered')),
            'rank' => $index === false ? null : $index + 1,
            'of' => $sorted->count(),
        ];
    }

    private function difficulty(?float $rate): ?string
    {
        return match (true) {
            $rate === null => null,
            $rate < 40 => 'hard',
            $rate < 70 => 'medium',
            default => 'easy',
        };
    }

    private function percent(int $part, int $whole): ?float
    {
        return $whole > 0 ? round($part / $whole * 100, 1) : null;
    }
}
