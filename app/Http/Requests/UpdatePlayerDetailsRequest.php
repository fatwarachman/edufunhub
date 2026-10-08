<?php

namespace App\Http\Requests;

use App\Http\Requests\Concerns\PlayerDetailsRules;
use App\Models\School;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Support\Str;

class UpdatePlayerDetailsRequest extends FormRequest
{
    use PlayerDetailsRules;

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
