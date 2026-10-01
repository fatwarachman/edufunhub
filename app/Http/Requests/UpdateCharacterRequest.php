<?php

namespace App\Http\Requests;

use App\Models\PlayerProfile;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

class UpdateCharacterRequest extends FormRequest
{
    public function authorize(): bool
    {
        return $this->user() !== null;
    }

    /** @return array<string, array<mixed>> */
    public function rules(): array
    {
        return [
            'color' => ['required', 'string', Rule::in(PlayerProfile::COLORS)],
            'accessory' => ['required', 'string', Rule::in(PlayerProfile::ACCESSORIES)],
            'nickname' => ['nullable', 'string', 'max:40'],
            'user_id' => ['prohibited'],
            'points' => ['prohibited'],
        ];
    }

    /** @return array<string, string> */
    public function messages(): array
    {
        return [
            'color.required' => __('character.color_invalid'),
            'color.string' => __('character.color_invalid'),
            'color.in' => __('character.color_invalid'),
            'accessory.required' => __('character.accessory_invalid'),
            'accessory.string' => __('character.accessory_invalid'),
            'accessory.in' => __('character.accessory_invalid'),
            'nickname.string' => __('character.nickname_invalid'),
            'nickname.max' => __('character.nickname_invalid'),
            'user_id.prohibited' => __('character.field_prohibited'),
            'points.prohibited' => __('character.field_prohibited'),
        ];
    }
}
