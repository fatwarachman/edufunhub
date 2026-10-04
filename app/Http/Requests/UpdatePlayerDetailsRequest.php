<?php

namespace App\Http\Requests;

use App\Http\Requests\Concerns\PlayerDetailsRules;
use Illuminate\Foundation\Http\FormRequest;

class UpdatePlayerDetailsRequest extends FormRequest
{
    use PlayerDetailsRules;

    public function authorize(): bool
    {
        return $this->user() !== null;
    }

    protected function prepareForValidation(): void
    {
        $this->merge(['school_name' => trim((string) $this->input('school_name'))]);
    }

    /** @return array<string, array<mixed>> */
    public function rules(): array
    {
        return $this->playerDetailsRules();
    }

    /** @return array<string, string> */
    public function messages(): array
    {
        return $this->playerDetailsMessages();
    }
}
