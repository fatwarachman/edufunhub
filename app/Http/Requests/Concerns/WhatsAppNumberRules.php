<?php

namespace App\Http\Requests\Concerns;

use App\Services\WhatsApp\PhoneNumber;
use Illuminate\Validation\Rule;

/**
 * Player WhatsApp number: written as 0…, 62… or +62…, stored as 62…, and
 * owned by at most one account.
 */
trait WhatsAppNumberRules
{
    protected function normalizedWhatsAppNumber(): ?string
    {
        return PhoneNumber::normalizeIndonesian((string) $this->input('whatsapp_number'));
    }

    /** @return array<int, mixed> */
    protected function whatsAppNumberRules(bool $required): array
    {
        return [
            $required ? 'required' : 'nullable',
            'string',
            'regex:'.PhoneNumber::INDONESIAN_PATTERN,
            Rule::unique('users', 'whatsapp_number')->ignore($this->user()?->getKey()),
        ];
    }

    /** @return array<string, string> */
    protected function whatsAppNumberMessages(): array
    {
        return [
            'whatsapp_number.required' => __('profile.whatsapp_required'),
            'whatsapp_number.string' => __('whatsapp.validation.player_number'),
            'whatsapp_number.regex' => __('whatsapp.validation.player_number'),
            'whatsapp_number.unique' => __('whatsapp.validation.taken'),
        ];
    }
}
