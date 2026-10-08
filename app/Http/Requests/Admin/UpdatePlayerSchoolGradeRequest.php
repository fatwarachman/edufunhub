<?php

namespace App\Http\Requests\Admin;

use App\Http\Requests\Concerns\PlayerDetailsRules;
use App\Models\PlayerProfile;
use App\Models\School;
use App\Models\User;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Support\Arr;
use Illuminate\Support\Str;
use Illuminate\Validation\Validator;

/**
 * Super admin correction of a learner's grade and school. Uses the same
 * school rules as the player form (without birth date); a picked NPSN is
 * resolved to the official record by the controller.
 */
class UpdatePlayerSchoolGradeRequest extends FormRequest
{
    use PlayerDetailsRules;

    /** Admin panel copy (translated client-side via tr()). */
    public const PROFILE_MISSING = 'This account has no learner profile yet.';

    public function authorize(): bool
    {
        return (bool) $this->user()?->is_superadmin;
    }

    protected function prepareForValidation(): void
    {
        $city = Str::squish((string) $this->input('school_city'));
        $level = Str::upper(Str::squish((string) $this->input('school_level')));
        $level = School::LEVEL_ALIASES[$level] ?? $level;
        $npsn = Str::squish((string) $this->input('school_npsn'));

        $this->merge([
            'school_name' => Str::squish((string) $this->input('school_name')),
            'school_city' => $city === '' ? null : $city,
            'school_level' => $level === '' ? null : $level,
            'school_npsn' => $npsn === '' ? null : $npsn,
        ]);
    }

    /** @return array<string, array<mixed>> */
    public function rules(): array
    {
        return [
            'grade' => ['required', 'integer', 'between:'.PlayerProfile::MIN_GRADE.','.PlayerProfile::MAX_GRADE],
            ...Arr::except($this->playerDetailsRules(), ['birth_date']),
        ];
    }

    /** @return array<string, string> */
    public function messages(): array
    {
        return [
            'grade.required' => __('character.grade_invalid'),
            'grade.integer' => __('character.grade_invalid'),
            'grade.between' => __('character.grade_invalid'),
            ...Arr::except($this->playerDetailsMessages(), ['birth_date.required', 'birth_date.date_format', 'birth_date.before_or_equal', 'birth_date.after_or_equal']),
        ];
    }

    /**
     * Accounts without a learner profile are not players (admins, teachers),
     * so they are refused instead of silently getting a new profile.
     *
     * @return array<int, callable(Validator): void>
     */
    public function after(): array
    {
        return [
            function (Validator $validator): void {
                $target = $this->route('user');

                if ($target instanceof User && $target->playerProfile()->doesntExist()) {
                    $validator->errors()->add('profile', self::PROFILE_MISSING);
                }
            },
        ];
    }
}
