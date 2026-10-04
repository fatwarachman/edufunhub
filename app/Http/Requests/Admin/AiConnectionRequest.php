<?php

namespace App\Http\Requests\Admin;

use Illuminate\Foundation\Http\FormRequest;

class AiConnectionRequest extends FormRequest
{
    public function authorize(): bool
    {
        return (bool) $this->user()?->is_superadmin;
    }

    protected function prepareForValidation(): void
    {
        $this->merge(['base_url' => rtrim(trim((string) $this->input('base_url')), '/')]);
    }

    /** @return array<string, array<mixed>> */
    public function rules(): array
    {
        return [
            'base_url' => ['required', 'url:http,https', 'max:255'],
            'api_key' => ['nullable', 'string', 'min:8', 'max:500'],
        ];
    }

    /** @return array<string, string> */
    public function messages(): array
    {
        return ['base_url.url' => __('ai.base_url_invalid')];
    }
}
