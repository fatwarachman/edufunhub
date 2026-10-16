<?php

namespace App\Http\Requests\Admin;

use App\Models\Classroom;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

class ClassroomAdminRequest extends FormRequest
{
    public function authorize(): bool
    {
        return (bool) $this->user()?->is_superadmin;
    }

    /** @return array<string, mixed> */
    public function rules(): array
    {
        return [
            'status' => ['nullable', Rule::in([Classroom::STATUS_SCHEDULED, Classroom::STATUS_ACTIVE, Classroom::STATUS_ENDED])],
            'search' => ['nullable', 'string', 'max:100'],
            'teacher_id' => ['nullable', 'integer', 'exists:users,id'],
            'page' => ['nullable', 'integer', 'min:1'],
        ];
    }

    /** @return array<string, string> */
    public function messages(): array
    {
        return [
            'status.in' => __('validation.in', ['attribute' => 'status']),
            'search.string' => __('validation.string', ['attribute' => 'search']),
            'search.max' => __('validation.max.string', ['attribute' => 'search', 'max' => 100]),
            'teacher_id.integer' => __('validation.integer', ['attribute' => 'teacher']),
            'teacher_id.exists' => __('validation.exists', ['attribute' => 'teacher']),
            'page.integer' => __('validation.integer', ['attribute' => 'page']),
            'page.min' => __('validation.min.numeric', ['attribute' => 'page', 'min' => 1]),
        ];
    }

    /** @return array{status: ?string, search: ?string, teacher_id: ?int} */
    public function filters(): array
    {
        $data = $this->validated();

        return [
            'status' => $data['status'] ?? null,
            'search' => isset($data['search']) && trim($data['search']) !== '' ? trim($data['search']) : null,
            'teacher_id' => isset($data['teacher_id']) ? (int) $data['teacher_id'] : null,
        ];
    }
}
