<?php

namespace App\Http\Requests;

use App\Models\PlayerProfile;
use Illuminate\Foundation\Http\FormRequest;

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
        ];
    }

    /** @return array<string, string> */
    public function messages(): array
    {
        return [
            'grade.required' => __('character.grade_invalid'),
            'grade.integer' => __('character.grade_invalid'),
            'grade.between' => __('character.grade_invalid'),
        ];
    }
}
