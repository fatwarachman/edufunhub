<?php

namespace App\Http\Requests\Concerns;

use App\Models\Question;
use App\Models\Subject;
use Illuminate\Validation\Rule;
use Illuminate\Validation\Validator;

/**
 * Shared question validation for the admin bank, the teacher portal and CSV imports.
 */
trait QuestionRules
{
    /**
     * Trim options and drop empty ones; true/false questions carry no options.
     *
     * @param  array<int, mixed>|null  $options
     * @return list<array{id: string, en: string}>|null
     */
    protected function normalizeOptions(?array $options, ?string $type): ?array
    {
        if ($type !== Question::TYPE_CHOICE) {
            return null;
        }

        return collect($options ?? [])
            ->map(fn ($option): array => ['id' => trim((string) ($option['id'] ?? '')), 'en' => trim((string) ($option['en'] ?? ''))])
            ->filter(fn (array $option): bool => $option['id'] !== '')
            ->values()
            ->all();
    }

    /**
     * Rules for the question body (everything except grade placement).
     *
     * @param  array<string, mixed>  $input
     * @return array<string, array<mixed>>
     */
    protected function questionContentRules(array $input): array
    {
        $isChoice = ($input['type'] ?? null) === Question::TYPE_CHOICE;

        return [
            'type' => ['required', Rule::in(Question::TYPES)],
            'subject' => ['required', Rule::in(Subject::activeKeys())],
            'prompt_id' => ['required', 'string', 'min:3', 'max:500'],
            'prompt_en' => ['nullable', 'string', 'max:500'],
            'options' => $isChoice ? ['required', 'array', 'min:3', 'max:6'] : ['nullable'],
            'options.*.id' => ['required', 'string', 'max:150'],
            'options.*.en' => ['nullable', 'string', 'max:150'],
            'answer' => ['required', 'integer', 'min:0', $isChoice ? 'max:'.max(0, count($input['options'] ?? []) - 1) : 'max:1'],
            'hint_id' => ['nullable', 'string', 'max:300'],
            'hint_en' => ['nullable', 'string', 'max:300'],
            'games' => ['required', 'array', 'min:1'],
            'games.*' => ['required', 'distinct', Rule::in(Question::GAMES)],
            'is_active' => ['boolean'],
        ];
    }

    /**
     * Level (1 easy, 2 intermediate, 3 hard) and optional sub subject of the
     * chosen subject. The topic must be active and belong to that subject.
     *
     * @param  array<string, mixed>  $input
     * @return array<string, array<mixed>>
     */
    protected function levelAndTopicRules(array $input): array
    {
        return [
            'level' => ['required', 'integer', Rule::in(array_keys(Question::LEVELS))],
            'topic_id' => ['nullable', 'integer', Rule::exists('subject_topics', 'id')
                ->where('is_active', true)
                ->where('subject_key', is_string($input['subject'] ?? null) ? $input['subject'] : '')],
        ];
    }

    /**
     * Reads a level from a form or CSV value: 1-3 or a level name.
     */
    protected function parseLevel(mixed $value): int|string|null
    {
        $value = mb_strtolower(trim((string) $value));

        return match ($value) {
            '' => null,
            '1', 'mudah', 'easy' => Question::LEVEL_EASY,
            '2', 'menengah', 'sedang', 'intermediate', 'medium' => Question::LEVEL_MEDIUM,
            '3', 'sulit', 'sukar', 'hard', 'expert' => Question::LEVEL_EXPERT,
            default => $value,
        };
    }

    /** @return array<string, array<mixed>> */
    protected function gradeRules(): array
    {
        return [
            'grades' => ['required', 'array', 'min:1', 'max:'.count(Question::GRADES)],
            'grades.*' => ['required', 'integer', 'distinct', Rule::in(Question::GRADES)],
        ];
    }

    /**
     * Cross-field checks shared by every entry point.
     *
     * @param  array<string, mixed>  $input
     */
    protected function validateQuestionConsistency(Validator $validator, array $input): void
    {
        if (($input['type'] ?? null) === Question::TYPE_TRUE_FALSE && array_intersect(Question::CHOICE_ONLY_GAMES, (array) ($input['games'] ?? [])) !== []) {
            $validator->errors()->add('games', __('questions.choice_only_games'));
        }

        $options = collect($input['options'] ?? [])->pluck('id')->map(fn (string $id): string => mb_strtolower($id));
        if ($options->count() !== $options->unique()->count()) {
            $validator->errors()->add('options', __('questions.options_unique'));
        }
    }

    /** @return array<string, string> */
    protected function questionMessages(): array
    {
        return [
            'options.required' => __('questions.options_min'),
            'options.min' => __('questions.options_min'),
            'options.max' => __('questions.options_max'),
            'answer.max' => __('questions.answer_invalid'),
            'answer.required' => __('questions.answer_invalid'),
            'games.required' => __('questions.games_required'),
            'games.min' => __('questions.games_required'),
            'grades.required' => __('questions.grades_required'),
            'grades.min' => __('questions.grades_required'),
            'grades.*.in' => __('questions.grades_invalid'),
            'prompt_id.required' => __('questions.prompt_required'),
            'prompt_id.min' => __('questions.prompt_required'),
            'level.required' => __('questions.level_invalid'),
            'level.integer' => __('questions.level_invalid'),
            'level.in' => __('questions.level_invalid'),
            'topic_id.integer' => __('questions.topic_invalid'),
            'topic_id.exists' => __('questions.topic_invalid'),
        ];
    }
}
