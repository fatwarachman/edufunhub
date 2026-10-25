<?php

namespace App\Http\Requests\Admin;

use App\Models\QuestionBlueprint;
use App\Models\Subject;
use App\Services\Ai\BlueprintTextExtractor;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

/**
 * Upload (POST, with `file`) or edit (PUT, with `content`) of a question
 * blueprint (kisi-kisi soal) that guides the AI question writer.
 */
class QuestionBlueprintRequest extends FormRequest
{
    public function authorize(): bool
    {
        return (bool) $this->user()?->is_superadmin;
    }

    protected function prepareForValidation(): void
    {
        $this->merge([
            'subject_key' => $this->filled('subject_key') ? $this->input('subject_key') : null,
            'is_active' => $this->boolean('is_active', true),
        ]);
    }

    /** @return array<string, array<mixed>> */
    public function rules(): array
    {
        $creating = $this->isMethod('post');

        return [
            'title' => ['required', 'string', 'min:3', 'max:150'],
            'subject_key' => ['nullable', 'string', Rule::in(Subject::keys())],
            'is_active' => ['boolean'],
            'file' => $creating
                ? ['required', 'file', 'max:'.QuestionBlueprint::MAX_KB, 'mimes:'.implode(',', BlueprintTextExtractor::EXTENSIONS)]
                : ['prohibited'],
            'content' => $creating
                ? ['prohibited']
                : ['required', 'string', 'min:20', 'max:'.QuestionBlueprint::MAX_CONTENT],
        ];
    }

    /** @return array<string, string> */
    public function messages(): array
    {
        return [
            'file.required' => __('blueprint.pick_file'),
            'file.mimes' => __('blueprint.unsupported'),
            'file.max' => __('blueprint.too_big', ['max' => QuestionBlueprint::MAX_KB / 1024]),
            'content.min' => __('blueprint.no_text'),
        ];
    }
}
