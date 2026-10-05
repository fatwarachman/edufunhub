<?php

namespace App\Http\Requests\Admin;

use App\Services\GameSounds;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

class GameSoundsRequest extends FormRequest
{
    public function authorize(): bool
    {
        return (bool) $this->user()?->is_superadmin;
    }

    /** @return array<string, array<mixed>> */
    public function rules(): array
    {
        return [
            'enabled' => ['required', 'boolean'],
            'volume' => ['required', 'integer', 'between:0,100'],
            'correct' => ['required', 'string', Rule::in(GameSounds::CORRECT)],
            'wrong' => ['required', 'string', Rule::in(GameSounds::WRONG)],
        ];
    }

    /** @return array<string, string> */
    public function messages(): array
    {
        return [
            'correct.in' => 'Choose one of the listed correct-answer sounds.',
            'wrong.in' => 'Choose one of the listed wrong-answer sounds.',
            'volume.between' => 'Volume must be between 0 and 100.',
        ];
    }
}
