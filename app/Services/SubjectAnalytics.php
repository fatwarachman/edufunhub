<?php

namespace App\Services;

use App\Models\QuestionAnswer;
use App\Models\Subject;
use Illuminate\Database\Query\Builder;

class SubjectAnalytics
{
    public const MIN_ANSWERS = 10;

    /** @return array{subjects: list<array<string, mixed>>, totalsBySubject: list<array{label: string, answered: int, correct: int, players: int}>} */
    public function index(): array
    {
        $answered = $this->aggregate($this->answers());
        $bySubject = (clone $answered)->addSelect('questions.subject')->groupBy('questions.subject')->get()->keyBy('subject');
        $totals = (clone $answered)->first();

        $subjects = Subject::query()->ordered()->withCount('questions')->get()
            ->map(fn (Subject $subject): array => [
                ...$this->metadata($subject),
                'questions' => (int) $subject->questions_count,
                ...$this->metrics($bySubject->get($subject->key)),
            ])->all();

        $totalsBySubject = $bySubject->map(fn (object $row, string $label): array => [
            'label' => $label,
            'answered' => (int) $row->answered,
            'correct' => (int) $row->correct,
            'players' => (int) $row->players,
        ])->values()->all();

        return compact('subjects', 'totalsBySubject');
    }

    /** @return array{id: int, key: string, name_id: string, name_en: ?string, detail_url: string} */
    public function metadata(Subject $subject): array
    {
        return [
            'id' => $subject->id,
            'key' => $subject->key,
            'name_id' => $subject->name_id,
            'name_en' => $subject->name_en,
            'detail_url' => route('admin.subject-analysis.show', $subject),
        ];
    }

    /** @return array<string, mixed> */
    public function detail(Subject $subject): array
    {
        $answers = $this->answers()->where('questions.subject', $subject->key);
        $byGrade = $this->buckets(clone $answers, 'game_histories.grade');
        $eligible = array_values(array_filter($byGrade, fn (array $bucket): bool => $bucket['label'] !== null && $bucket['answered'] >= self::MIN_ANSWERS));
        $best = null;
        foreach ($eligible as $bucket) {
            if ($best === null || $bucket['correct'] * $best['answered'] > $best['correct'] * $bucket['answered']) {
                $best = $bucket;
            }
        }

        $weakest = $this->aggregate(clone $answers)
            ->addSelect('questions.id', 'questions.prompt_id', 'questions.prompt_en')
            ->groupBy('questions.id', 'questions.prompt_id', 'questions.prompt_en')
            ->orderByRaw('1.0 * SUM(CASE WHEN question_answers.correct = ? THEN 1 ELSE 0 END) / COUNT(*) ASC', [true])
            ->orderByDesc('answered')->orderBy('questions.id')->limit(10)->get()
            ->map(fn (object $row): array => [
                'id' => (int) $row->id,
                'prompt' => $row->prompt_id,
                'prompt_en' => $row->prompt_en,
                'answered' => (int) $row->answered,
                'correct' => (int) $row->correct,
                'success_rate' => $this->metrics($row)['success_rate'],
            ])->all();

        $subject2 = Subject::query()->where('key', $subject->key)->first();

        return [
            'summary' => [
                'questions' => $subject->questions()->count(),
                ...$this->metrics($this->aggregate(clone $answers)->first()),
            ],
            'byGrade' => $byGrade,
            'byLevel' => $this->buckets(clone $answers, 'questions.level'),
            'byGame' => $this->buckets(clone $answers, 'question_answers.game_key'),
            'weakestQuestions' => $weakest,
            'topGrades' => array_values(array_filter($eligible, fn (array $bucket): bool => $best !== null && $bucket['correct'] * $best['answered'] === $best['correct'] * $bucket['answered'])),
            'minAnswers' => self::MIN_ANSWERS,
            'byLevelCounts' => $subject2
                ?->questions()
                ->selectRaw('level as label, COUNT(*) as questions')
                ->groupBy('level')->orderBy('level')->get()
                ->map(fn ($row): array => ['label' => (string) $row->label, 'questions' => (int) $row->questions])
                ->all() ?? [],
            'conclusion' => $this->conclusion(clone $answers, $byGrade, $weakest),
        ];
    }

    private function conclusion(Builder $answers, array $byGrade, array $weakest): array
    {
        $total = $answers->get();
        $totalAnswered = $total->count();
        $totalCorrect = $total->where('correct', true)->count();
        $rate = $totalAnswered > 0 ? round($totalCorrect / $totalAnswered * 100, 1) : null;
        $grades = array_values(array_filter($byGrade, fn (array $g): bool => $g['label'] !== null && $g['answered'] >= self::MIN_ANSWERS));
        $warnings = [];
        if ($rate !== null && $rate < 50) $warnings[] = 'low_mastery';
        if (count($weakest) >= 3) $warnings[] = 'weak_questions';
        if (count($grades) <= 1) $warnings[] = 'narrow_grade';
        $best = null;
        foreach ($grades as $g) {
            if ($best === null || $g['success_rate'] > $best['success_rate']) $best = $g;
        }

        return [
            'total_answered' => $totalAnswered,
            'success_rate' => $rate,
            'top_grade' => $best ? $best['label'] : null,
            'top_grade_rate' => $best ? $best['success_rate'] : null,
            'grade_count' => count($grades),
            'warnings' => $warnings,
        ];
    }

    private function answers(): Builder
    {
        return QuestionAnswer::query()
            ->join('questions', 'questions.id', '=', 'question_answers.question_id')
            ->leftJoin('game_histories', 'game_histories.id', '=', 'question_answers.game_history_id')
            ->toBase();
    }

    private function aggregate(Builder $query): Builder
    {
        return $query->selectRaw('COUNT(*) as answered')
            ->selectRaw('COALESCE(SUM(CASE WHEN question_answers.correct = ? THEN 1 ELSE 0 END), 0) as correct', [true])
            ->selectRaw('COUNT(DISTINCT game_histories.user_id) as players');
    }

    /** @return list<array<string, mixed>> */
    private function buckets(Builder $query, string $column): array
    {
        return $this->aggregate($query)->addSelect($column.' as label')
            ->groupBy($column)->orderBy($column)->get()
            ->map(fn (object $row): array => [
                'label' => $row->label === null ? null : (string) $row->label,
                ...$this->metrics($row),
            ])->all();
    }

    /** @return array{answered: int, correct: int, wrong: int, players: int, success_rate: ?float} */
    private function metrics(?object $row): array
    {
        $answered = (int) ($row->answered ?? 0);
        $correct = (int) ($row->correct ?? 0);

        return [
            'answered' => $answered,
            'correct' => $correct,
            'wrong' => $answered - $correct,
            'players' => (int) ($row->players ?? 0),
            'success_rate' => $answered > 0 ? round($correct / $answered * 100, 1) : null,
        ];
    }
}
