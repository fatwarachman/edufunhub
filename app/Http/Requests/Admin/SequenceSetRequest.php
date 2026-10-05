<?php

namespace App\Http\Requests\Admin;

use App\Models\SequenceSet;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Support\Str;
use Illuminate\Validation\Rule;
use Illuminate\Validation\Validator;

class SequenceSetRequest extends FormRequest
{
    public function authorize(): bool
    {
        return (bool) $this->user()?->is_superadmin;
    }

    /**
     * The key is derived from the Indonesian title when left empty and never
     * changes after creation; colours are lower-case hex; empty English
     * labels fall back to the Indonesian ones in the game payload.
     */
    protected function prepareForValidation(): void
    {
        $set = $this->route('sequence_set');
        $key = $set instanceof SequenceSet
            ? $set->key
            : Str::of((string) ($this->input('key') ?: $this->input('title_id')))->lower()->slug()->limit(40, '')->trim('-')->value();

        $items = collect(is_array($this->input('items')) ? $this->input('items') : [])
            ->map(fn (mixed $item): array => [
                'label_id' => trim((string) data_get($item, 'label_id')),
                'label_en' => trim((string) data_get($item, 'label_en')) ?: null,
                'color' => Str::lower(trim((string) data_get($item, 'color'))) ?: null,
                'stripe' => Str::lower(trim((string) data_get($item, 'stripe'))) ?: null,
            ])
            ->values()
            ->all();

        $this->merge([
            'key' => $key,
            'category' => Str::upper(Str::of((string) $this->input('category'))->trim()->replaceMatches('/[^A-Za-z0-9]+/', '_')->trim('_')->value()),
            'title_id' => trim((string) $this->input('title_id')),
            'title_en' => trim((string) $this->input('title_en')) ?: null,
            'description_id' => trim((string) $this->input('description_id')) ?: null,
            'description_en' => trim((string) $this->input('description_en')) ?: null,
            'items' => $items,
            'is_active' => $this->boolean('is_active', true),
        ]);
    }

    /** @return array<string, array<mixed>> */
    public function rules(): array
    {
        $set = $this->route('sequence_set');
        $hex = 'regex:/^#[0-9a-f]{6}$/';

        return [
            'key' => ['required', 'string', 'regex:'.SequenceSet::KEY_PATTERN, Rule::unique('sequence_sets', 'key')->ignore($set?->id)],
            'category' => ['required', 'string', 'regex:'.SequenceSet::CATEGORY_PATTERN],
            'kind' => ['required', Rule::in(SequenceSet::KINDS)],
            'title_id' => ['required', 'string', 'min:3', 'max:120'],
            'title_en' => ['nullable', 'string', 'max:120'],
            'description_id' => ['nullable', 'string', 'max:200'],
            'description_en' => ['nullable', 'string', 'max:200'],
            'items' => ['required', 'array', 'min:'.SequenceSet::MIN_ITEMS, 'max:'.SequenceSet::MAX_ITEMS],
            'items.*.label_id' => ['required', 'string', 'max:60', 'distinct'],
            'items.*.label_en' => ['nullable', 'string', 'max:60'],
            'items.*.color' => ['nullable', $hex],
            'items.*.stripe' => ['nullable', $hex],
            'is_active' => ['boolean'],
        ];
    }

    /** A cable set needs a colour on every piece: the LAN tester shows it. */
    public function after(): array
    {
        return [
            function (Validator $validator): void {
                if ($this->input('kind') !== 'cable') {
                    return;
                }
                foreach ((array) $this->input('items') as $index => $item) {
                    if (empty($item['color'])) {
                        $validator->errors()->add("items.{$index}.color", 'Cable pieces need a colour.');
                    }
                }
            },
        ];
    }

    /** @return array<string, string> */
    public function messages(): array
    {
        return [
            'key.regex' => 'The key may use lower-case letters, digits and hyphens.',
            'key.unique' => 'A sequence set with this key already exists.',
            'category.regex' => 'Use an upper-case code such as UTP_T568B.',
            'items.min' => 'A sequence needs at least :min pieces.',
            'items.max' => 'A sequence can have at most :max pieces (the LAN tester has 12 LEDs).',
            'items.*.label_id.required' => 'Every piece needs an Indonesian label.',
            'items.*.label_id.distinct' => 'Piece labels must be unique.',
            'items.*.color.regex' => 'Colours are hex codes like #f97316.',
            'items.*.stripe.regex' => 'Colours are hex codes like #f97316.',
        ];
    }
}
