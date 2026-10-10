<?php

namespace App\Http\Requests\Admin;

use App\Services\HotGames;
use Carbon\CarbonImmutable;
use Illuminate\Contracts\Validation\Validator;
use Illuminate\Foundation\Http\FormRequest;

/** Day filter of the hottest games pages. Invalid or future days fall back to today. */
class HotGamesRequest extends FormRequest
{
    public function authorize(): bool
    {
        return (bool) $this->user()?->is_superadmin;
    }

    /** @return array<string, array<mixed>> */
    public function rules(): array
    {
        return [
            'date' => ['nullable', 'string', 'date_format:Y-m-d'],
        ];
    }

    /** @return array<string, string> */
    public function messages(): array
    {
        return [
            'date.date_format' => 'The day must be a date like 2026-10-10.',
        ];
    }

    /** A hand-edited query string just shows today instead of redirecting. */
    protected function failedValidation(Validator $validator): void {}

    /** Selected local day (start of day in the report timezone). */
    public function day(HotGames $hot): CarbonImmutable
    {
        return $hot->parseDate(is_string($this->query('date')) ? $this->query('date') : null) ?? $hot->today();
    }
}
