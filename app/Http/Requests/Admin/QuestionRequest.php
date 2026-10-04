<?php

namespace App\Http\Requests\Admin;

use App\Models\Question;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;
use Illuminate\Validation\Validator;

class QuestionRequest extends FormRequest
{
    public function authorize(): bool
    {
        return (bool) $this->user()?->is_superadmin;
    }

    protected function prepareForValidation(): void
    {
        $options = collect($this->input('options', []))
            ->map(fn ($option): array => ['id' => trim((string) ($option['id'] ?? '')), 'en' => trim((string) ($option['en'] ?? ''))])
            ->filter(fn (array $option): bool => $option['id'] !== '')
            ->values()
            ->all();

        $this->merge([
            'options' => $this->input('type') === Question::TYPE_CHOICE ? $options : null,
            'prompt_id' => trim((string) $this->input('prompt_id')),
            'is_active' => $this->boolean('is_active'),
            'points' => $this->filled('points') && (int) $this->input('points') > 0 ? (int) $this->input('points') : null,
        ]);
    }

    /** @return array<string, array<mixed>> */
    public function rules(): array
    {
        $isChoice = $this->input('type') === Question::TYPE_CHOICE;

        return [
            'type' => ['required', Rule::in(Question::TYPES)],
            'band' => ['required', 'integer', 'between:0,3'],
            'subject' => ['required', Rule::in(Question::SUBJECTS)],
            'prompt_id' => ['required', 'string', 'min:3', 'max:500'],
            'prompt_en' => ['nullable', 'string', 'max:500'],
            'options' => $isChoice ? ['required', 'array', 'min:3', 'max:6'] : ['nullable'],
            'options.*.id' => ['required', 'string', 'max:150'],
            'options.*.en' => ['nullable', 'string', 'max:150'],
            'answer' => ['required', 'integer', 'min:0', $isChoice ? 'max:'.max(0, count($this->input('options') ?? []) - 1) : 'max:1'],
            'hint_id' => ['nullable', 'string', 'max:300'],
            'hint_en' => ['nullable', 'string', 'max:300'],
            'games' => ['required', 'array', 'min:1'],
            'games.*' => ['required', Rule::in(Question::GAMES)],
            'is_active' => ['boolean'],
            'points' => ['nullable', 'integer', 'between:1,'.Question::MAX_POINTS],
        ];
    }

    public function after(): array
    {
        return [
            function (Validator $validator): void {
                if ($this->input('type') === Question::TYPE_TRUE_FALSE && array_intersect(Question::CHOICE_ONLY_GAMES, (array) $this->input('games')) !== []) {
                    $validator->errors()->add('games', __('questions.choice_only_games'));
                }

                $options = collect($this->input('options') ?? [])->pluck('id')->map(fn (string $id): string => mb_strtolower($id));
                if ($options->count() !== $options->unique()->count()) {
                    $validator->errors()->add('options', __('Answer options must be unique.'));
                }
            },
        ];
    }

    /** @return array<string, string> */
    public function messages(): array
    {
        return [
            'options.required' => __('Multiple choice questions need at least 3 options.'),
            'options.min' => __('Multiple choice questions need at least 3 options.'),
            'answer.max' => __('Choose a correct answer from the options.'),
            'games.required' => __('Distribute the question to at least one game.'),
        ];
    }
}
