<?php

namespace App\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;

class StoreScreenTimeBeatRequest extends FormRequest
{
    public function authorize(): bool
    {
        return $this->user() !== null;
    }

    /**
     * @return array<string, list<string>>
     */
    public function rules(): array
    {
        return [
            'seconds_active' => ['required', 'integer', 'min:1', 'max:60'],
            'area' => ['required', 'string', 'regex:/^[a-z0-9:-]{1,40}$/'],
        ];
    }

    /**
     * @return array<string, string>
     */
    public function messages(): array
    {
        return [
            'seconds_active.min' => 'A beat must report at least one active second.',
            'seconds_active.max' => 'A beat may report at most 60 active seconds.',
            'area.regex' => 'The area may only contain lowercase letters, digits, colons and dashes.',
        ];
    }
}
