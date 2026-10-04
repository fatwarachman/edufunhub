<?php

namespace App\Http\Requests\Admin;

use App\Models\CharacterItem;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

class CharacterItemRequest extends FormRequest
{
    public function authorize(): bool
    {
        return (bool) $this->user()?->is_superadmin;
    }

    protected function prepareForValidation(): void
    {
        $this->merge([
            'name_id' => trim((string) $this->input('name_id')),
            'name_en' => trim((string) $this->input('name_en')) ?: null,
            'color' => $this->filled('color') ? strtolower((string) $this->input('color')) : null,
            'is_active' => $this->boolean('is_active'),
        ]);
    }

    /** @return array<string, array<mixed>> */
    public function rules(): array
    {
        return [
            'slot' => ['required', Rule::in(CharacterItem::SLOTS)],
            'style' => ['required', 'string', Rule::in(CharacterItem::STYLES[$this->input('slot')] ?? [])],
            'color' => ['nullable', 'string', 'regex:/^#[0-9a-f]{6}$/'],
            'name_id' => ['required', 'string', 'min:2', 'max:60'],
            'name_en' => ['nullable', 'string', 'max:60'],
            'price' => ['required', 'integer', 'min:0', 'max:'.CharacterItem::MAX_PRICE],
            'sort_order' => ['nullable', 'integer', 'min:0', 'max:9999'],
            'is_active' => ['boolean'],
        ];
    }

    /** @return array<string, string> */
    public function messages(): array
    {
        return [
            'slot.in' => 'Choose a valid slot.',
            'style.in' => 'Choose a style that fits the slot.',
            'color.regex' => 'Use a hex colour like #3d6fd1.',
            'name_id.required' => 'Give the item an Indonesian name.',
            'price.min' => 'Price cannot be negative.',
            'price.max' => 'Price can be at most :max points.',
        ];
    }
}
