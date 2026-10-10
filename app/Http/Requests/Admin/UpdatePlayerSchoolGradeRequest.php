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
 * Super admin edit of a learner's grade, school and birth date. Uses the same
 * rules as the player form; the birth date is optional here (left empty keeps
 * the stored one) and a picked NPSN is resolved to the official record by the
 * controller. Works before the learner finished the first-login wizard, even
 * when no learner profile row exists yet.
 */
class UpdatePlayerSchoolGradeRequest extends FormRequest
{
    use PlayerDetailsRules;

    /** Admin panel copy (translated client-side via tr()). */
    public const NOT_A_LEARNER = 'Admin and teacher accounts have no learner profile.';

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
        $birthDate = trim((string) $this->input('birth_date'));

        $this->merge([
            'school_name' => Str::squish((string) $this->input('school_name')),
            'school_city' => $city === '' ? null : $city,
            'school_level' => $level === '' ? null : $level,
            'school_npsn' => $npsn === '' ? null : $npsn,
            'birth_date' => $birthDate === '' ? null : $birthDate,
        ]);
    }

    /** @return array<string, array<mixed>> */
    public function rules(): array
    {
        $rules = $this->playerDetailsRules();

        return [
            'grade' => ['required', 'integer', 'between:'.PlayerProfile::MIN_GRADE.','.PlayerProfile::MAX_GRADE],
            ...$rules,
            'birth_date' => ['nullable', ...Arr::where($rules['birth_date'], fn (mixed $rule): bool => $rule !== 'required')],
        ];
    }

    /** @return array<string, string> */
    public function messages(): array
    {
        return [
            'grade.required' => __('character.grade_invalid'),
            'grade.integer' => __('character.grade_invalid'),
            'grade.between' => __('character.grade_invalid'),
            ...Arr::except($this->playerDetailsMessages(), ['birth_date.required']),
        ];
    }

    /**
     * Admin and teacher accounts are not learners, so they are refused
     * instead of silently getting a learner profile.
     *
     * @return array<int, callable(Validator): void>
     */
    public function after(): array
    {
        return [
            function (Validator $validator): void {
                $target = $this->route('user');

                if ($target instanceof User && ($target->isAdmin() || $target->isTeacher())) {
                    $validator->errors()->add('profile', self::NOT_A_LEARNER);
                }
            },
        ];
    }
}
