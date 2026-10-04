<?php

namespace App\Http\Requests\Admin;

use App\Models\Question;
use App\Models\QuestionGeneration;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

class GenerateQuestionsRequest extends FormRequest
{
    public function authorize(): bool
    {
        return (bool) $this->user()?->is_superadmin;
    }

    protected function prepareForValidation(): void
    {
        $this->merge([
            'subjects' => $this->input('scope') === 'all' ? Question::SUBJECTS : $this->input('subjects'),
            'grades' => $this->input('scope') === 'all' ? Question::GRADES : $this->input('grades'),
            'activate' => $this->boolean('activate'),
        ]);
    }

    /** @return array<string, array<mixed>> */
    public function rules(): array
    {
        return [
            'scope' => ['required', Rule::in(['all', 'custom'])],
            'subjects' => ['required', 'array', 'min:1'],
            'subjects.*' => ['required', 'distinct', Rule::in(Question::SUBJECTS)],
            'grades' => ['required', 'array', 'min:1'],
            'grades.*' => ['required', 'integer', 'distinct', Rule::in(Question::GRADES)],
            'per_combination' => ['required', 'integer', 'between:1,'.QuestionGeneration::MAX_PER_COMBINATION],
            'games' => ['required', 'array', 'min:1'],
            'games.*' => ['required', 'distinct', Rule::in(Question::GAMES)],
            'activate' => ['boolean'],
        ];
    }

    /** @return array<string, string> */
    public function messages(): array
    {
        return [
            'subjects.required' => __('ai.pick_subject'),
            'grades.required' => __('ai.pick_grade'),
            'games.required' => __('Distribute the question to at least one game.'),
        ];
    }
}
