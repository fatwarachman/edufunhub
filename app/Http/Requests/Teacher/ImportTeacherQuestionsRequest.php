<?php

namespace App\Http\Requests\Teacher;

use Illuminate\Foundation\Http\FormRequest;

class ImportTeacherQuestionsRequest extends FormRequest
{
    public function authorize(): bool
    {
        return $this->user()?->isTeacher() ?? false;
    }

    /** @return array<string, array<mixed>> */
    public function rules(): array
    {
        return [
            'file' => ['required', 'file', 'max:2048', 'mimes:csv,txt'],
        ];
    }

    /** @return array<string, string> */
    public function messages(): array
    {
        return [
            'file.required' => __('questions.import.file_required'),
            'file.file' => __('questions.import.file_required'),
            'file.max' => __('questions.import.file_too_large'),
            'file.mimes' => __('questions.import.file_type'),
        ];
    }
}
