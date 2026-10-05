<?php

namespace App\Http\Requests\Admin;

use Illuminate\Foundation\Http\FormRequest;

class BulkQuestionRequest extends FormRequest
{
    public const ACTIONS = ['activate', 'deactivate', 'delete'];

    /** Upper bound of one bulk request (whole AI review page). */
    public const MAX_IDS = 2000;

    public function authorize(): bool
    {
        return (bool) $this->user()?->is_superadmin;
    }

    /** @return array<string, array<mixed>> */
    public function rules(): array
    {
        return [
            'action' => ['required', 'string', 'in:'.implode(',', self::ACTIONS)],
            'ids' => ['required', 'array', 'min:1', 'max:'.self::MAX_IDS],
            'ids.*' => ['required', 'integer', 'distinct', 'exists:questions,id'],
        ];
    }

    /** @return array<string, string> */
    public function messages(): array
    {
        return [
            'action.in' => __('questions.bulk.invalid_action'),
            'ids.required' => __('questions.bulk.none_selected'),
            'ids.min' => __('questions.bulk.none_selected'),
            'ids.max' => __('questions.bulk.too_many', ['max' => self::MAX_IDS]),
            'ids.*.exists' => __('questions.bulk.missing'),
        ];
    }
}
