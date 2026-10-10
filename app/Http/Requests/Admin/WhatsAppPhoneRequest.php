<?php

namespace App\Http\Requests\Admin;

use App\Services\WhatsApp\PhoneNumber;
use Illuminate\Foundation\Http\FormRequest;

/** Phone number for a test message or a pairing-code login. */
class WhatsAppPhoneRequest extends FormRequest
{
    public function authorize(): bool
    {
        return (bool) $this->user()?->is_superadmin;
    }

    protected function prepareForValidation(): void
    {
        $raw = trim((string) $this->input('phone'));
        $this->merge(['phone' => PhoneNumber::normalize($raw) ?? ($raw === '' ? null : $raw)]);
    }

    /** @return array<string, array<mixed>> */
    public function rules(): array
    {
        return ['phone' => ['required', 'string', 'regex:'.PhoneNumber::PATTERN]];
    }

    /** @return array<string, string> */
    public function messages(): array
    {
        return [
            'phone.required' => __('whatsapp.validation.number'),
            'phone.string' => __('whatsapp.validation.number'),
            'phone.regex' => __('whatsapp.validation.number'),
        ];
    }
}
