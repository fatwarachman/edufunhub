<?php

namespace App\Http\Requests\Admin;

use App\Services\WhatsApp\WhatsAppTemplates;
use Closure;
use Illuminate\Foundation\Http\FormRequest;

/** Custom text of one WhatsApp message type, in Indonesian and English. */
class WhatsAppTemplateRequest extends FormRequest
{
    public function authorize(): bool
    {
        return (bool) $this->user()?->is_superadmin;
    }

    /** @return array<string, array<mixed>> */
    public function rules(): array
    {
        $event = (string) $this->route('event');
        $max = (int) config('whatsapp.template_max_length');
        $rules = ['templates' => ['required', 'array']];

        foreach (WhatsAppTemplates::LOCALES as $locale) {
            $rules["templates.{$locale}"] = [
                'required',
                'string',
                "max:{$max}",
                function (string $attribute, mixed $value, Closure $fail) use ($event): void {
                    $unknown = app(WhatsAppTemplates::class)->unknownPlaceholders($event, (string) $value);
                    if ($unknown !== []) {
                        $fail(__('whatsapp.validation.template_placeholders', [
                            'placeholders' => implode(', ', array_map(fn (string $key): string => ':'.$key, $unknown)),
                        ]));
                    }
                },
            ];
        }

        return $rules;
    }

    /** @return array<string, string> */
    public function messages(): array
    {
        return [
            'templates.required' => __('whatsapp.validation.template_required'),
            'templates.array' => __('whatsapp.validation.template_required'),
            'templates.*.required' => __('whatsapp.validation.template_required'),
            'templates.*.string' => __('whatsapp.validation.template_required'),
            'templates.*.max' => __('whatsapp.validation.template_max', ['max' => config('whatsapp.template_max_length')]),
        ];
    }
}
