<?php

namespace App\Http\Requests\Admin;

use App\Models\Question;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

class UpdateCompensationRatesRequest extends FormRequest
{
    public function authorize(): bool
    {
        return (bool) $this->user()?->is_superadmin;
    }

    /** @return array<string, array<mixed>> */
    public function rules(): array
    {
        return [
            'rates' => ['required', 'array', 'min:1', 'max:'.count(Question::GRADES)],
            'rates.*.grade' => ['required', 'integer', 'distinct', Rule::in(Question::GRADES)],
            'rates.*.amount' => ['required', 'integer', 'min:0', 'max:1000000'],
        ];
    }

    /** @return array<string, string> */
    public function messages(): array
    {
        return [
            'rates.*.amount.required' => __('Enter an amount for every grade.'),
            'rates.*.amount.integer' => __('Amounts must be whole numbers.'),
            'rates.*.amount.min' => __('Amounts cannot be negative.'),
            'rates.*.amount.max' => __('Amounts cannot exceed 1,000,000.'),
            'rates.*.grade.in' => __('Unknown grade.'),
        ];
    }
}
