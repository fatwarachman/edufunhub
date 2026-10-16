<?php

namespace App\Http\Requests\Admin;

use App\Models\Subject;
use App\Services\TeacherDirectory;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

class TeacherDirectoryRequest extends FormRequest
{
    public function authorize(): bool
    {
        return (bool) $this->user()?->is_superadmin;
    }

    /** @return array<string, mixed> */
    public function rules(): array
    {
        return [
            'search' => ['nullable', 'string', 'max:100'],
            'subject' => ['nullable', 'string', Rule::in(Subject::keys())],
            'sort' => ['nullable', Rule::in(TeacherDirectory::SORTS)],
            'direction' => ['nullable', Rule::in(['asc', 'desc'])],
            'page' => ['nullable', 'integer', 'min:1'],
        ];
    }

    /** @return array<string, string> */
    public function messages(): array
    {
        return [
            'search.max' => __('validation.max.string', ['attribute' => 'search', 'max' => 100]),
            'subject.in' => __('validation.in', ['attribute' => 'subject']),
            'sort.in' => __('validation.in', ['attribute' => 'sort']),
            'direction.in' => __('validation.in', ['attribute' => 'direction']),
            'page.integer' => __('validation.integer', ['attribute' => 'page']),
            'page.min' => __('validation.min.numeric', ['attribute' => 'page', 'min' => 1]),
        ];
    }

    /** @return array{search: ?string, subject: ?string, sort: string, direction: string} */
    public function filters(): array
    {
        $data = $this->validated();
        $sort = $data['sort'] ?? TeacherDirectory::DEFAULT_SORT;

        return [
            'search' => isset($data['search']) && trim($data['search']) !== '' ? trim($data['search']) : null,
            'subject' => $data['subject'] ?? null,
            'sort' => $sort,
            'direction' => $data['direction'] ?? ($sort === 'name' ? 'asc' : 'desc'),
        ];
    }
}
