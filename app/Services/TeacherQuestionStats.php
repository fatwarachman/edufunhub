<?php

namespace App\Services;

use App\Models\Question;
use App\Models\QuestionAnswer;
use App\Models\User;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Support\Collection;

/**
 * Usage, outcome and compensation statistics for the questions a teacher authored.
 * All aggregation runs in SQL so large answer logs stay cheap.
 */
class TeacherQuestionStats
{
    /**
     * School levels shown to teachers (grade 0 is kindergarten).
     *
     * @var array<string, array{0: int, 1: int}>
     */
    public const LEVELS = [
        'tk' => [0, 0],
        'sd' => [1, 6],
        'smp' => [7, 9],
        'sma' => [10, 12],
    ];

    private const AGGREGATE = 'COUNT(*) as answered, SUM(CASE WHEN question_answers.correct THEN 1 ELSE 0 END) as correct_count, SUM(question_answers.compensation) as compensation, COUNT(DISTINCT game_histories.user_id) as players';

    /**
     * @return array<string, mixed>
     */
    public function overview(User $teacher): array
    {
        $summary = $this->answers($teacher)->selectRaw(self::AGGREGATE.', COUNT(DISTINCT question_answers.question_id) as used_questions')->first();
        $byGame = $this->answers($teacher)->selectRaw('question_answers.game_key as label, '.self::AGGREGATE)->groupBy('question_answers.game_key')->get()->keyBy('label');
        $byGrade = $this->answers($teacher)->selectRaw('game_histories.grade as grade, '.self::AGGREGATE)->whereNotNull('game_histories.grade')->groupBy('game_histories.grade')->get()->keyBy('grade');

        return [
            'summary' => [
                ...$this->bucket($summary),
                'questions' => Question::query()->authoredByTeacher($teacher)->count(),
                'active_questions' => Question::query()->authoredByTeacher($teacher)->active()->count(),
                'used_questions' => (int) ($summary->used_questions ?? 0),
            ],
            'byGame' => collect(Question::GAMES)
                ->map(fn (string $game): array => ['label' => $game, ...$this->bucket($byGame->get($game))])
                ->values()->all(),
            'byGrade' => collect(Question::GRADES)
                ->filter(fn (int $grade): bool => $byGrade->has($grade))
                ->map(fn (int $grade): array => ['grade' => $grade, ...$this->bucket($byGrade->get($grade))])
                ->values()->all(),
            'byLevel' => collect(self::LEVELS)
                ->map(fn (array $range, string $level): array => [
                    'label' => $level,
                    ...$this->bucket($this->answers($teacher)->selectRaw(self::AGGREGATE)->whereBetween('game_histories.grade', $range)->first()),
                ])
                ->values()->all(),
        ];
    }

    /**
     * Per-question stats for the teacher's list, keyed by question id.
     *
     * @param  list<int>  $questionIds
     * @return Collection<int, array<string, mixed>>
     */
    public function perQuestion(User $teacher, array $questionIds): Collection
    {
        if ($questionIds === []) {
            return collect();
        }

        $scoped = fn (): Builder => $this->answers($teacher)->whereIn('question_answers.question_id', $questionIds);

        $totals = $scoped()->selectRaw('question_answers.question_id, '.self::AGGREGATE)->groupBy('question_answers.question_id')->get()->keyBy('question_id');
        $games = $scoped()->distinct()->get(['question_answers.question_id', 'question_answers.game_key'])->groupBy('question_id');
        $grades = $scoped()->whereNotNull('game_histories.grade')->distinct()->get(['question_answers.question_id', 'game_histories.grade'])->groupBy('question_id');

        return $totals->map(fn ($row, int $questionId): array => [
            ...$this->bucket($row),
            'games' => $games->get($questionId, collect())->pluck('game_key')->sort()->values()->all(),
            'grades' => $grades->get($questionId, collect())->pluck('grade')->map(fn ($grade): int => (int) $grade)->sort()->values()->all(),
        ]);
    }

    /**
     * Answers to the teacher's questions joined with the play that produced them.
     *
     * @return Builder<QuestionAnswer>
     */
    private function answers(User $teacher): Builder
    {
        return QuestionAnswer::query()
            ->join('questions', 'questions.id', '=', 'question_answers.question_id')
            ->join('game_histories', 'game_histories.id', '=', 'question_answers.game_history_id')
            ->where('questions.created_by', $teacher->id)
            ->whereIn('questions.source', Question::TEACHER_SOURCES);
    }

    /**
     * @return array{answered: int, correct: int, wrong: int, success_rate: ?float, players: int, compensation: int}
     */
    private function bucket(?object $row): array
    {
        $answered = (int) ($row->answered ?? 0);
        $correct = (int) ($row->correct_count ?? 0);

        return [
            'answered' => $answered,
            'correct' => $correct,
            'wrong' => $answered - $correct,
            'success_rate' => $answered > 0 ? round($correct / $answered * 100, 1) : null,
            'players' => (int) ($row->players ?? 0),
            'compensation' => (int) ($row->compensation ?? 0),
        ];
    }
}
