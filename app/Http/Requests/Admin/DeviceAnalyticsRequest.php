<?php

namespace App\Http\Requests\Admin;

use App\Services\DeviceAnalytics;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

class DeviceAnalyticsRequest extends FormRequest
{
    public function authorize(): bool
    {
        return (bool) $this->user()?->isAdmin();
    }

    /** @return array<string, array<int, mixed>> */
    public function rules(): array
    {
        return [
            'days' => ['nullable', 'integer', Rule::in(DeviceGamesRequest::DAY_OPTIONS)],
            'os' => ['nullable', 'string', 'max:40'],
            'device' => ['nullable', 'string', Rule::in(['mobile', 'tablet', 'desktop'])],
            'role' => ['nullable', 'string', 'max:80'],
        ];
    }

    public function days(): int
    {
        $days = (int) $this->input('days', DeviceAnalytics::DAYS);

        return in_array($days, DeviceGamesRequest::DAY_OPTIONS, true) ? $days : DeviceAnalytics::DAYS;
    }
}
