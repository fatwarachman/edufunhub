<?php

namespace App\Http\Requests\Teacher;

use App\Models\Question;
use App\Models\Subject;
use App\Models\SubjectTopic;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

class ClassroomQuestionOptionsRequest extends FormRequest
{
    /** @return array<string, array<mixed>> */
    public function rules(): array
    {
        return [
            'search' => ['nullable', 'string', 'max:100'],
            'subject' => ['required', 'string', Rule::in(Subject::activeKeys())],
            'topic' => ['nullable', 'integer', Rule::exists(SubjectTopic::class, 'id')->where('is_active', true)],
            'level' => ['nullable', 'integer', 'in:1,2,3'],
            'grade' => ['nullable', 'integer', Rule::in(Question::GRADES)],
            'game' => ['nullable', 'string', Rule::in(Question::GAMES)],
            'mine' => ['nullable', 'boolean'],
            'page' => ['nullable', 'integer', 'min:1'],
        ];
    }

    public function perPage(): int
    {
        return 20;
    }
}
