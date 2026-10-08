<?php

namespace App\Http\Requests;

use App\Models\PlayerProfile;
use App\Models\Question;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

class UpdateGradeRequest extends FormRequest
{
    public function authorize(): bool
    {
        return $this->user() !== null;
    }

    /** @return array<string, array<mixed>> */
    public function rules(): array
    {
        return [
            'grade' => ['required', 'integer', 'between:'.PlayerProfile::MIN_GRADE.','.PlayerProfile::MAX_GRADE],
            'question_level' => ['sometimes', 'integer', Rule::in(array_keys(Question::LEVELS))],
        ];
    }

    /** @return array<string, string> */
    public function messages(): array
    {
        return [
            'grade.required' => __('character.grade_invalid'),
            'grade.integer' => __('character.grade_invalid'),
            'grade.between' => __('character.grade_invalid'),
            'question_level.integer' => __('character.level_invalid'),
            'question_level.in' => __('character.level_invalid'),
        ];
    }
}
