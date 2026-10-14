<?php

namespace App\Http\Requests\Admin;

use Illuminate\Foundation\Http\FormRequest;

/** Live search query of the admin question bank. */
class QuestionSearchRequest extends FormRequest
{
    public function authorize(): bool
    {
        return (bool) $this->user()?->is_superadmin;
    }

    /** @return array<string, array<mixed>> */
    public function rules(): array
    {
        return [
            'q' => ['required', 'string', 'min:2', 'max:100'],
        ];
    }

    /** @return array<string, string> */
    public function messages(): array
    {
        return [
            'q.required' => __('questions.search_min'),
            'q.min' => __('questions.search_min'),
            'q.max' => __('questions.search_max'),
        ];
    }

    public function term(): string
    {
        return trim((string) $this->validated('q'));
    }
}
