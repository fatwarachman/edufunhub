<?php

namespace App\Http\Requests\Admin;

use Illuminate\Foundation\Http\FormRequest;

class RegistrationSettingsRequest extends FormRequest
{
    public function authorize(): bool
    {
        return (bool) $this->user()?->is_superadmin;
    }

    /** @return array<string, array<mixed>> */
    public function rules(): array
    {
        return [
            'email_enabled' => ['required', 'boolean'],
        ];
    }

    /** @return array<string, string> */
    public function messages(): array
    {
        return [
            'email_enabled.required' => __('registration.validation.toggle'),
            'email_enabled.boolean' => __('registration.validation.toggle'),
        ];
    }
}
