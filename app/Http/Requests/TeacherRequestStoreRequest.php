<?php

namespace App\Http\Requests;

use App\Models\Subject;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

class TeacherRequestStoreRequest extends FormRequest
{
    public function authorize(): bool
    {
        return $this->user()?->isTeacher() !== true;
    }

    public function rules(): array
    {
        return [
            'subject_key' => ['nullable', 'string', Rule::in(Subject::activeKeys())],
            'message' => ['nullable', 'string', 'max:1000'],
        ];
    }
}
