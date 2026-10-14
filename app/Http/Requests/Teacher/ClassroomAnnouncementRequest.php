<?php

namespace App\Http\Requests\Teacher;

use App\Models\ClassroomAnnouncement;
use Illuminate\Foundation\Http\FormRequest;

/**
 * A teacher announcement for the classroom: optional title, plain text body
 * and how many seconds it stays on the students' screens.
 */
class ClassroomAnnouncementRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true;
    }

    protected function prepareForValidation(): void
    {
        $this->merge([
            'title' => is_string($this->input('title')) ? trim($this->input('title')) : $this->input('title'),
            'body' => is_string($this->input('body')) ? trim($this->input('body')) : $this->input('body'),
        ]);
    }

    /** @return array<string, array<mixed>> */
    public function rules(): array
    {
        return [
            'title' => ['nullable', 'string', 'max:'.ClassroomAnnouncement::MAX_TITLE],
            'body' => ['required', 'string', 'max:'.ClassroomAnnouncement::MAX_BODY],
            'display_seconds' => ['required', 'integer', 'min:'.ClassroomAnnouncement::MIN_SECONDS, 'max:'.ClassroomAnnouncement::MAX_SECONDS],
        ];
    }

    /** @return array<string, string> */
    public function messages(): array
    {
        $range = ['min' => ClassroomAnnouncement::MIN_SECONDS, 'max' => ClassroomAnnouncement::MAX_SECONDS];

        return [
            'title.string' => __('classrooms.validation.announcement_title_max', ['max' => ClassroomAnnouncement::MAX_TITLE]),
            'title.max' => __('classrooms.validation.announcement_title_max', ['max' => ClassroomAnnouncement::MAX_TITLE]),
            'body.required' => __('classrooms.validation.announcement_body_required'),
            'body.string' => __('classrooms.validation.announcement_body_required'),
            'body.max' => __('classrooms.validation.announcement_body_max', ['max' => ClassroomAnnouncement::MAX_BODY]),
            'display_seconds.required' => __('classrooms.validation.announcement_seconds', $range),
            'display_seconds.integer' => __('classrooms.validation.announcement_seconds', $range),
            'display_seconds.min' => __('classrooms.validation.announcement_seconds', $range),
            'display_seconds.max' => __('classrooms.validation.announcement_seconds', $range),
        ];
    }
}
