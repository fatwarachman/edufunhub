<?php

namespace App\Http\Requests\Admin;

use App\Services\DeviceAnalytics;
use Illuminate\Contracts\Validation\Validator;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;
use Illuminate\Validation\Validator as ValidationValidator;

/** Filters of the per-game device list. Invalid values fall back to the defaults. */
class DeviceGamesRequest extends FormRequest
{
    /** Day windows offered by the page. */
    public const DAY_OPTIONS = [7, 30, 90];

    public function authorize(): bool
    {
        return (bool) $this->user()?->isAdmin();
    }

    /** @return array<string, array<mixed>> */
    public function rules(): array
    {
        return [
            'days' => ['nullable', 'integer', Rule::in(self::DAY_OPTIONS)],
        ];
    }

    /** @return array<string, string> */
    public function messages(): array
    {
        return [
            'days.integer' => 'The day window must be one of: '.implode(', ', self::DAY_OPTIONS).'.',
            'days.in' => 'The day window must be one of: '.implode(', ', self::DAY_OPTIONS).'.',
        ];
    }

    /** A hand-edited query string just loses that filter instead of redirecting. */
    protected function failedValidation(Validator $validator): void {}

    public function days(): int
    {
        $days = $this->valid()['days'] ?? null;

        return $days !== null && $days !== '' ? (int) $days : DeviceAnalytics::DAYS;
    }

    /** @return array<string, mixed> */
    private function valid(): array
    {
        $validator = $this->getValidatorInstance();

        return $validator instanceof ValidationValidator ? $validator->valid() : [];
    }
}
