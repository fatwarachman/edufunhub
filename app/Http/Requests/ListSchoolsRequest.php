<?php

namespace App\Http\Requests;

use App\Models\PlayerProfile;
use App\Models\School;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

class ListSchoolsRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true;
    }

    protected function prepareForValidation(): void
    {
        $level = strtoupper((string) $this->query('level'));

        if (isset(School::LEVEL_ALIASES[$level])) {
            $this->merge(['level' => School::LEVEL_ALIASES[$level]]);
        }
    }

    /** @return array<string, array<mixed>> */
    public function rules(): array
    {
        return [
            'regency' => ['required', 'string', 'max:'.PlayerProfile::SCHOOL_CITY_MAX],
            'level' => ['required', 'string', Rule::in(School::LEVELS)],
            'q' => ['nullable', 'string', 'max:'.PlayerProfile::SCHOOL_NAME_MAX],
        ];
    }

    /** @return array<string, string> */
    public function messages(): array
    {
        return [
            'regency.required' => __('character.school_city_invalid'),
            'regency.string' => __('character.school_city_invalid'),
            'regency.max' => __('character.school_city_invalid'),
            'level.required' => __('character.school_level_invalid'),
            'level.string' => __('character.school_level_invalid'),
            'level.in' => __('character.school_level_invalid'),
            'q.string' => __('character.school_name_invalid'),
            'q.max' => __('character.school_name_invalid'),
        ];
    }
}
