<?php

namespace App\Http\Requests\Admin;

use App\Models\Question;
use App\Models\QuestionGeneration;
use App\Models\Subject;
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
            'grades' => $this->input('scope') === 'all' ? Question::GRADES : $this->input('grades'),
            'activate' => $this->boolean('activate'),
            'subjects' => $this->input('scope') === 'all' ? Subject::activeKeys() : array_values((array) $this->input('subjects', [])),
            'topic_ids' => $this->input('scope') === 'all' ? [] : array_values((array) $this->input('topic_ids', [])),
        ]);
    }

    /** @return array<string, array<mixed>> */
    public function rules(): array
    {
        return [
            'scope' => ['required', Rule::in(['all', 'custom'])],
            'subjects' => ['present', 'array', 'required_without:topic_ids'],
            'subjects.*' => ['required', 'distinct', Rule::in(Subject::activeKeys())],
            'grades' => ['required', 'array', 'min:1'],
            'grades.*' => ['required', 'integer', 'distinct', Rule::in(Question::GRADES)],
            'per_combination' => ['required', 'integer', 'between:1,'.QuestionGeneration::MAX_PER_COMBINATION],
            'level' => ['sometimes', 'integer', Rule::in(array_keys(Question::LEVELS))],
            'games' => ['required', 'array', 'min:1'],
            'games.*' => ['required', 'distinct', Rule::in(Question::GAMES)],
            'activate' => ['boolean'],
            'topic_ids' => ['present', 'array'],
            'topic_ids.*' => ['integer', 'distinct', Rule::exists('subject_topics', 'id')->where('is_active', true)],
        ];
    }

    /** @return array<string, string> */
    public function messages(): array
    {
        return [
            'subjects.required_without' => __('ai.pick_subject'),
            'grades.required' => __('ai.pick_grade'),
            'games.required' => __('Distribute the question to at least one game.'),
            'topic_ids.*.exists' => __('ai.topic_invalid'),
            'topic_ids.*.integer' => __('ai.topic_invalid'),
        ];
    }
}
