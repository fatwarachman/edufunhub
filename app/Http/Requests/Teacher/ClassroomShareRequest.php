<?php

namespace App\Http\Requests\Teacher;

use Illuminate\Foundation\Http\FormRequest;

/**
 * Sharing a classroom report: one member (`share`) or every member who
 * played (`share-all`), with an optional note from the teacher.
 */
class ClassroomShareRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true;
    }

    /** @return array<string, array<mixed>> */
    public function rules(): array
    {
        return [
            'member_id' => [$this->routeIs('teacher.classrooms.share') ? 'required' : 'prohibited', 'integer', 'min:1'],
            'note' => ['nullable', 'string', 'max:500'],
        ];
    }

    /** @return array<string, string> */
    public function messages(): array
    {
        return [
            'member_id.required' => __('classrooms.validation.member_required'),
            'note.max' => __('classrooms.validation.note_max'),
        ];
    }
}
