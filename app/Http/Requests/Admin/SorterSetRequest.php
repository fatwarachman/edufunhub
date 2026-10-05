<?php

namespace App\Http\Requests\Admin;

use App\Models\SorterSet;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Support\Str;
use Illuminate\Validation\Rule;
use Illuminate\Validation\Validator;

class SorterSetRequest extends FormRequest
{
    public function authorize(): bool
    {
        return (bool) $this->user()?->is_superadmin;
    }

    /**
     * Keys are derived from names when left empty (set keys never change
     * after creation); colours are lower-case hex; empty English texts fall
     * back to the Indonesian ones in the game payload.
     */
    protected function prepareForValidation(): void
    {
        $set = $this->route('sorter_set');
        $key = $set instanceof SorterSet
            ? $set->key
            : Str::of((string) ($this->input('key') ?: $this->input('title_id')))->lower()->slug()->limit(40, '')->trim('-')->value();

        $bins = collect(is_array($this->input('bins')) ? $this->input('bins') : [])
            ->map(fn (mixed $bin): array => [
                'key' => Str::of((string) (data_get($bin, 'key') ?: data_get($bin, 'name_id')))->lower()->slug()->limit(30, '')->trim('-')->value(),
                'name_id' => Str::of((string) data_get($bin, 'name_id'))->squish()->value(),
                'name_en' => Str::of((string) data_get($bin, 'name_en'))->squish()->value() ?: null,
                'color' => Str::lower(trim((string) data_get($bin, 'color'))),
            ])
            ->values()
            ->all();

        $items = collect(is_array($this->input('items')) ? $this->input('items') : [])
            ->map(fn (mixed $item): array => [
                'label' => Str::of((string) data_get($item, 'label'))->squish()->value(),
                'hint_id' => Str::of((string) data_get($item, 'hint_id'))->squish()->value() ?: null,
                'hint_en' => Str::of((string) data_get($item, 'hint_en'))->squish()->value() ?: null,
                'bin' => (string) data_get($item, 'bin'),
                'level' => (int) (data_get($item, 'level') ?: 1),
            ])
            ->values()
            ->all();

        $this->merge([
            'key' => $key,
            'title_id' => trim((string) $this->input('title_id')),
            'title_en' => trim((string) $this->input('title_en')) ?: null,
            'description_id' => trim((string) $this->input('description_id')) ?: null,
            'description_en' => trim((string) $this->input('description_en')) ?: null,
            'bins' => $bins,
            'items' => $items,
            'is_active' => $this->boolean('is_active', true),
        ]);
    }

    /** @return array<string, array<mixed>> */
    public function rules(): array
    {
        $set = $this->route('sorter_set');
        $binKeys = array_column((array) $this->input('bins'), 'key');

        return [
            'key' => ['required', 'string', 'regex:'.SorterSet::KEY_PATTERN, Rule::unique('sorter_sets', 'key')->ignore($set?->id)],
            'title_id' => ['required', 'string', 'min:3', 'max:120'],
            'title_en' => ['nullable', 'string', 'max:120'],
            'description_id' => ['nullable', 'string', 'max:200'],
            'description_en' => ['nullable', 'string', 'max:200'],
            'bins' => ['required', 'array', 'min:'.SorterSet::MIN_BINS, 'max:'.SorterSet::MAX_BINS],
            'bins.*.key' => ['required', 'string', 'regex:'.SorterSet::BIN_KEY_PATTERN, 'distinct'],
            'bins.*.name_id' => ['required', 'string', 'max:24'],
            'bins.*.name_en' => ['nullable', 'string', 'max:24'],
            'bins.*.color' => ['required', 'regex:/^#[0-9a-f]{6}$/'],
            'items' => ['required', 'array', 'min:'.max(SorterSet::MIN_BINS, count($binKeys)), 'max:'.SorterSet::MAX_ITEMS],
            'items.*.label' => ['required', 'string', 'max:'.SorterSet::MAX_LABEL, 'distinct'],
            'items.*.hint_id' => ['nullable', 'string', 'max:40'],
            'items.*.hint_en' => ['nullable', 'string', 'max:40'],
            'items.*.bin' => ['required', 'string', Rule::in($binKeys)],
            'items.*.level' => ['required', 'integer', 'between:1,'.SorterSet::LEVELS],
            'is_active' => ['boolean'],
        ];
    }

    /** Level 1 must already mix at least two bins, or the first packets have one answer. */
    public function after(): array
    {
        return [
            function (Validator $validator): void {
                if ($validator->errors()->isNotEmpty()) {
                    return;
                }
                $starter = collect((array) $this->input('items'))->where('level', 1)->pluck('bin')->unique();
                if ($starter->count() < 2) {
                    $validator->errors()->add('items', 'Level 1 needs items of at least two different bins.');
                }
            },
        ];
    }

    /** @return array<string, string> */
    public function messages(): array
    {
        return [
            'key.regex' => 'The key may use lower-case letters, digits and hyphens.',
            'key.unique' => 'A sorter set with this key already exists.',
            'bins.min' => 'A sorter needs at least :min bins.',
            'bins.max' => 'A sorter can have at most :max bins (they must fit on a phone).',
            'bins.*.key.distinct' => 'Bin names must be unique.',
            'bins.*.key.required' => 'Every bin needs a name.',
            'bins.*.name_id.required' => 'Every bin needs an Indonesian name.',
            'bins.*.color.regex' => 'Colours are hex codes like #2563eb.',
            'items.min' => 'Add at least :min items (one per bin).',
            'items.*.label.required' => 'Every item needs a label.',
            'items.*.label.max' => 'Item labels fit on a packet: at most :max characters.',
            'items.*.label.distinct' => 'Item labels must be unique.',
            'items.*.bin.in' => 'Pick one of the bins for every item.',
        ];
    }
}
