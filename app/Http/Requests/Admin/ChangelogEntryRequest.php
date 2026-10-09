<?php

namespace App\Http\Requests\Admin;

use App\Models\ChangelogEntry;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

class ChangelogEntryRequest extends FormRequest
{
    public function authorize(): bool
    {
        return (bool) $this->user()?->is_superadmin;
    }

    protected function prepareForValidation(): void
    {
        $this->merge([
            'version' => ltrim(trim((string) $this->input('version')), 'vV'),
            'title' => trim((string) $this->input('title')),
            'title_en' => trim((string) $this->input('title_en')) ?: null,
            'body' => trim((string) $this->input('body')),
            'body_en' => trim((string) $this->input('body_en')) ?: null,
            'is_published' => $this->boolean('is_published'),
        ]);
    }

    /** @return array<string, array<mixed>> */
    public function rules(): array
    {
        return [
            'version' => ['required', 'string', 'max:40', 'regex:'.ChangelogEntry::VERSION_PATTERN],
            'title' => ['required', 'string', 'max:255'],
            'title_en' => ['nullable', 'string', 'max:255'],
            'body' => ['required', 'string', 'max:5000'],
            'body_en' => ['nullable', 'string', 'max:5000'],
            'type' => ['required', 'string', Rule::in(ChangelogEntry::TYPES)],
            'is_published' => ['boolean'],
        ];
    }

    /** @return array<string, string> */
    public function messages(): array
    {
        return [
            'version.required' => __('changelog.validation.version_required'),
            'version.regex' => __('changelog.validation.version_format'),
            'title.required' => __('changelog.validation.title_required'),
            'body.required' => __('changelog.validation.body_required'),
            'type.in' => __('changelog.validation.type'),
            'type.required' => __('changelog.validation.type'),
        ];
    }
}
