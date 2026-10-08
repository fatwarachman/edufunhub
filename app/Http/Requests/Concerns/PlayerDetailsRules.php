<?php

namespace App\Http\Requests\Concerns;

use App\Models\PlayerProfile;
use App\Models\School;
use Illuminate\Validation\Rule;

trait PlayerDetailsRules
{
    /** @return array<string, array<mixed>> */
    protected function playerDetailsRules(): array
    {
        return [
            'birth_date' => [
                'required',
                'date_format:Y-m-d',
                'before_or_equal:'.now()->subYears(PlayerProfile::MIN_AGE)->toDateString(),
                'after_or_equal:'.now()->subYears(PlayerProfile::MAX_AGE)->toDateString(),
            ],
            'school_name' => ['required', 'string', 'min:3', 'max:'.PlayerProfile::SCHOOL_NAME_MAX],
            'school_city' => ['nullable', 'string', 'min:3', 'max:'.PlayerProfile::SCHOOL_CITY_MAX],
            'school_level' => ['nullable', 'string', Rule::in(School::LEVELS)],
            'school_npsn' => ['nullable', 'string', 'max:10', Rule::exists('schools', 'npsn')],
        ];
    }

    /** @return array<string, string> */
    protected function playerDetailsMessages(): array
    {
        return [
            'birth_date.required' => __('character.birth_date_required'),
            'birth_date.date_format' => __('character.birth_date_invalid'),
            'birth_date.before_or_equal' => __('character.birth_date_range', ['min' => PlayerProfile::MIN_AGE, 'max' => PlayerProfile::MAX_AGE]),
            'birth_date.after_or_equal' => __('character.birth_date_range', ['min' => PlayerProfile::MIN_AGE, 'max' => PlayerProfile::MAX_AGE]),
            'school_name.required' => __('character.school_name_required'),
            'school_name.string' => __('character.school_name_invalid'),
            'school_name.min' => __('character.school_name_invalid'),
            'school_name.max' => __('character.school_name_invalid'),
            'school_city.string' => __('character.school_city_invalid'),
            'school_city.min' => __('character.school_city_invalid'),
            'school_city.max' => __('character.school_city_invalid'),
            'school_level.string' => __('character.school_level_invalid'),
            'school_level.in' => __('character.school_level_invalid'),
            'school_npsn.string' => __('character.school_npsn_invalid'),
            'school_npsn.max' => __('character.school_npsn_invalid'),
            'school_npsn.exists' => __('character.school_npsn_invalid'),
        ];
    }
}
