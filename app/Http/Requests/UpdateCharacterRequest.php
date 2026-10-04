<?php

namespace App\Http\Requests;

use App\Models\CharacterItem;
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
        $slots = [];
        foreach (CharacterItem::SLOTS as $slot) {
            $slots["equipped.$slot"] = ['nullable', 'integer'];
        }

        return [
            'color' => ['required', 'string', Rule::in(PlayerProfile::COLORS)],
            'accessory' => [Rule::requiredIf(! $this->has('equipped')), 'string', Rule::in(PlayerProfile::ACCESSORIES)],
            'nickname' => ['nullable', 'string', 'max:40'],
            'gender' => ['sometimes', 'required', 'string', Rule::in(PlayerProfile::GENDERS)],
            'skin' => ['sometimes', 'required', 'string', Rule::in(PlayerProfile::SKINS)],
            'hair_color' => ['sometimes', 'required', 'string', Rule::in(PlayerProfile::HAIR_COLORS)],
            'equipped' => ['sometimes', 'array:'.implode(',', CharacterItem::SLOTS)],
            ...$slots,
            'user_id' => ['prohibited'],
            'points' => ['prohibited'],
        ];
    }

    /**
     * Equipped item id per slot (null to take the slot off).
     *
     * @return array<string, ?int>
     */
    public function equippedSlots(): array
    {
        $equipped = (array) $this->validated('equipped', []);

        return collect(CharacterItem::SLOTS)
            ->filter(fn (string $slot): bool => array_key_exists($slot, $equipped))
            ->mapWithKeys(fn (string $slot): array => [$slot => $equipped[$slot] === null ? null : (int) $equipped[$slot]])
            ->all();
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
            'gender.required' => __('character.gender_invalid'),
            'gender.string' => __('character.gender_invalid'),
            'gender.in' => __('character.gender_invalid'),
            'skin.required' => __('character.skin_invalid'),
            'skin.string' => __('character.skin_invalid'),
            'skin.in' => __('character.skin_invalid'),
            'hair_color.required' => __('character.hair_invalid'),
            'hair_color.string' => __('character.hair_invalid'),
            'hair_color.in' => __('character.hair_invalid'),
            'equipped.array' => __('shop.invalid_item'),
            'equipped.*.integer' => __('shop.invalid_item'),
            'user_id.prohibited' => __('character.field_prohibited'),
            'points.prohibited' => __('character.field_prohibited'),
        ];
    }
}
