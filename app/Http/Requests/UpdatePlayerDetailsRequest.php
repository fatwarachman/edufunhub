<?php

namespace App\Http\Requests;

use App\Http\Requests\Concerns\PlayerDetailsRules;
use App\Http\Requests\Concerns\WhatsAppNumberRules;
use App\Models\School;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Support\Str;

class UpdatePlayerDetailsRequest extends FormRequest
{
    use PlayerDetailsRules, WhatsAppNumberRules;

    public function authorize(): bool
    {
        return $this->user() !== null;
    }

    protected function prepareForValidation(): void
    {
        $city = Str::squish((string) $this->input('school_city'));
        $level = Str::upper(Str::squish((string) $this->input('school_level')));
        $level = School::LEVEL_ALIASES[$level] ?? $level;
        $npsn = Str::squish((string) $this->input('school_npsn'));

        $this->merge([
            'school_name' => Str::squish((string) $this->input('school_name')),
            'school_city' => $city === '' ? null : $city,
            'school_level' => $level === '' ? null : $level,
            'school_npsn' => $npsn === '' ? null : $npsn,
        ]);

        if ($this->has('whatsapp_number')) {
            $this->merge([
                'whatsapp_number' => $this->normalizedWhatsAppNumber(),
                'whatsapp_notifications' => $this->boolean('whatsapp_notifications', true),
            ]);
        }
    }

    /** @return array<string, array<mixed>> */
    public function rules(): array
    {
        return [
            ...$this->playerDetailsRules(),
            'whatsapp_number' => $this->whatsAppNumberRules(required: false),
            'whatsapp_notifications' => ['sometimes', 'boolean'],
        ];
    }

    /** @return array<string, string> */
    public function messages(): array
    {
        return [
            ...$this->playerDetailsMessages(),
            ...$this->whatsAppNumberMessages(),
        ];
    }
}
