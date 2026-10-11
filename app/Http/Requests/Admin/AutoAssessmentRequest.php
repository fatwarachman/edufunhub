<?php

namespace App\Http\Requests\Admin;

use App\Services\Ai\AutoAbilityAssessment;
use Illuminate\Foundation\Http\FormRequest;

class AutoAssessmentRequest extends FormRequest
{
    public function authorize(): bool
    {
        return (bool) $this->user()?->is_superadmin;
    }

    /** @return array<string, array<mixed>> */
    public function rules(): array
    {
        [$min, $max] = AutoAbilityAssessment::BOUNDS;

        return [
            'enabled' => ['required', 'boolean'],
            'first' => ['required', 'integer', "between:{$min},{$max}"],
            'next' => ['required', 'integer', "between:{$min},{$max}"],
        ];
    }

    /** @return array<string, string> */
    public function messages(): array
    {
        [$min, $max] = AutoAbilityAssessment::BOUNDS;

        return [
            'first.between' => __('ai.auto_bounds', ['min' => $min, 'max' => $max]),
            'next.between' => __('ai.auto_bounds', ['min' => $min, 'max' => $max]),
        ];
    }
}
