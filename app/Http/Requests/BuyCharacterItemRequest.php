<?php

namespace App\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;

/**
 * Buying a shop item: the price always comes from the database, never from
 * the request.
 */
class BuyCharacterItemRequest extends FormRequest
{
    public function authorize(): bool
    {
        return $this->user() !== null;
    }

    /** @return array<string, array<mixed>> */
    public function rules(): array
    {
        return [
            'price' => ['prohibited'],
            'points' => ['prohibited'],
            'user_id' => ['prohibited'],
        ];
    }

    /** @return array<string, string> */
    public function messages(): array
    {
        return [
            'price.prohibited' => __('character.field_prohibited'),
            'points.prohibited' => __('character.field_prohibited'),
            'user_id.prohibited' => __('character.field_prohibited'),
        ];
    }
}
