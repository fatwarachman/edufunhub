<?php

namespace App\Http\Requests\Admin;

use Illuminate\Foundation\Http\FormRequest;

class WhatsAppSettingsRequest extends FormRequest
{
    public function authorize(): bool
    {
        return (bool) $this->user()?->is_superadmin;
    }

    /** @return array<string, array<mixed>> */
    public function rules(): array
    {
        $rules = [
            'enabled' => ['required', 'boolean'],
            'events' => ['required', 'array'],
        ];

        foreach (array_keys((array) config('whatsapp.events')) as $event) {
            $rules["events.{$event}"] = ['required', 'boolean'];
        }

        return $rules;
    }

    /** @return array<string, string> */
    public function messages(): array
    {
        return [
            'enabled.required' => __('whatsapp.validation.events'),
            'enabled.boolean' => __('whatsapp.validation.events'),
            'events.required' => __('whatsapp.validation.events'),
            'events.array' => __('whatsapp.validation.events'),
            'events.*.required' => __('whatsapp.validation.events'),
            'events.*.boolean' => __('whatsapp.validation.events'),
        ];
    }
}
