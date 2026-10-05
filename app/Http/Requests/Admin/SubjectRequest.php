<?php

namespace App\Http\Requests\Admin;

use App\Models\Subject;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Support\Str;
use Illuminate\Validation\Rule;

class SubjectRequest extends FormRequest
{
    public function authorize(): bool
    {
        return (bool) $this->user()?->is_superadmin;
    }

    /**
     * The key is derived from the Indonesian name when left empty, so
     * "Seni Budaya" becomes seni-budaya. It cannot change after creation.
     */
    protected function prepareForValidation(): void
    {
        $subject = $this->route('subject');
        $key = $subject instanceof Subject
            ? $subject->key
            : Str::of((string) ($this->input('key') ?: $this->input('name_id')))->lower()->slug()->limit(30, '')->trim('-')->value();

        $this->merge([
            'key' => $key,
            'name_id' => trim((string) $this->input('name_id')),
            'name_en' => trim((string) $this->input('name_en')) ?: null,
            'ai_hint' => trim((string) $this->input('ai_hint')) ?: null,
            'color' => Str::lower((string) $this->input('color')),
            'is_active' => $this->boolean('is_active', true),
        ]);
    }

    /** @return array<string, array<mixed>> */
    public function rules(): array
    {
        $subject = $this->route('subject');

        return [
            'key' => [
                'required', 'string', 'regex:'.Subject::KEY_PATTERN, Rule::notIn(Subject::RESERVED_KEYS),
                Rule::unique('subjects', 'key')->ignore($subject?->id),
            ],
            'name_id' => ['required', 'string', 'min:2', 'max:60', Rule::unique('subjects', 'name_id')->ignore($subject?->id)],
            'name_en' => ['nullable', 'string', 'max:60'],
            'icon' => ['required', Rule::in(Subject::ICONS)],
            'color' => ['required', 'regex:/^#[0-9a-f]{6}$/'],
            'ai_hint' => ['nullable', 'string', 'max:200'],
            'is_active' => ['boolean'],
        ];
    }

    /** @return array<string, string> */
    public function messages(): array
    {
        return [
            'key.required' => __('subjects.validation.key_required'),
            'key.regex' => __('subjects.validation.key_format'),
            'key.not_in' => __('subjects.validation.key_reserved'),
            'key.unique' => __('subjects.validation.key_taken'),
            'name_id.required' => __('subjects.validation.name_required'),
            'name_id.unique' => __('subjects.validation.name_taken'),
            'color.regex' => __('subjects.validation.color'),
        ];
    }
}
