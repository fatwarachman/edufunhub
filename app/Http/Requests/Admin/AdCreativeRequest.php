<?php

namespace App\Http\Requests\Admin;

use App\Models\AdCreative;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;
use Illuminate\Validation\Validator;

class AdCreativeRequest extends FormRequest
{
    public function authorize(): bool
    {
        return (bool) $this->user()?->is_superadmin;
    }

    protected function prepareForValidation(): void
    {
        $this->merge([
            'name' => trim((string) $this->input('name')),
            'placements' => array_values(array_unique(array_filter((array) $this->input('placements', [])))),
            'background_color' => $this->filled('background_color') ? strtolower((string) $this->input('background_color')) : null,
            'text_color' => $this->filled('text_color') ? strtolower((string) $this->input('text_color')) : null,
            'is_active' => $this->boolean('is_active'),
        ]);
    }

    /** @return array<string, array<mixed>> */
    public function rules(): array
    {
        $type = (string) $this->input('type');
        $creative = $this->route('creative');
        $existing = $creative instanceof AdCreative ? $creative : null;
        $placements = collect((array) config('ads.placements'))->filter(fn (array $p): bool => in_array($type, $p['types'], true))->keys()->all();

        return [
            'type' => ['required', Rule::in((array) config('ads.types'))],
            'name' => ['required', 'string', 'min:2', 'max:120'],
            'size' => [Rule::requiredIf($type === 'logo'), 'nullable', Rule::in(array_keys((array) config('ads.sizes')))],
            'placements' => ['required', 'array', 'min:1'],
            'placements.*' => ['string', Rule::in($placements)],
            'image' => [
                Rule::requiredIf($type === 'logo' && ! $existing?->image_path),
                'nullable', 'image', 'mimes:png,jpg,jpeg,webp,gif', 'max:'.config('ads.max_image_kb'),
            ],
            'audio' => [
                Rule::requiredIf($type === 'jingle' && ! $existing?->audio_path),
                'nullable', 'file', 'mimes:mp3,ogg,wav,m4a', 'max:'.config('ads.max_audio_kb'),
            ],
            'motto' => [Rule::requiredIf($type === 'motto'), 'nullable', 'string', 'max:140'],
            'click_url' => ['nullable', 'url:https', 'max:255'],
            'background_color' => ['nullable', 'regex:/^#[0-9a-f]{6}$/'],
            'text_color' => ['nullable', 'regex:/^#[0-9a-f]{6}$/'],
            'display_seconds' => ['required', 'integer', 'min:3', 'max:60'],
            'audio_seconds' => [Rule::requiredIf($type === 'jingle'), 'nullable', 'integer', 'min:1', 'max:'.config('ads.max_audio_seconds')],
            'character_item_id' => [Rule::requiredIf($type === 'item'), 'nullable', 'integer', Rule::exists('character_items', 'id')],
            'is_active' => ['boolean'],
        ];
    }

    public function after(): array
    {
        return [function (Validator $validator): void {
            $size = $this->input('size');
            if ($this->input('type') !== 'logo' || ! $size) {
                return;
            }
            foreach ((array) $this->input('placements') as $placement) {
                $sizes = (array) (config('ads.placements')[$placement]['sizes'] ?? []);
                if ($sizes !== [] && ! in_array($size, $sizes, true)) {
                    $validator->errors()->add('placements', 'Size '.$size.' does not fit placement '.$placement.'.');
                }
            }
        }];
    }

    /** @return array<string, string> */
    public function messages(): array
    {
        return [
            'click_url.url' => 'Click URL must start with https://.',
            'audio.mimes' => 'Jingle must be an MP3, OGG, WAV or M4A file.',
        ];
    }
}
