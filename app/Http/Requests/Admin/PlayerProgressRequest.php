<?php

namespace App\Http\Requests\Admin;

use App\Services\PlayerProgressReport;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

class PlayerProgressRequest extends FormRequest
{
    public function authorize(): bool
    {
        return (bool) $this->user()?->is_superadmin;
    }

    /** @return array<string, mixed> */
    public function rules(): array
    {
        return [
            'search' => ['nullable', 'string', 'max:100'],
            'ai' => ['nullable', Rule::in(PlayerProgressReport::AI_FILTERS)],
            'activity' => ['nullable', Rule::in(PlayerProgressReport::ACTIVITY_FILTERS)],
            'sort' => ['nullable', Rule::in(PlayerProgressReport::SORTS)],
            'direction' => ['nullable', Rule::in(['asc', 'desc'])],
            'page' => ['nullable', 'integer', 'min:1'],
        ];
    }

    /** @return array<string, string> */
    public function messages(): array
    {
        return [
            'search.max' => __('validation.max.string', ['attribute' => 'search', 'max' => 100]),
            'ai.in' => __('validation.in', ['attribute' => 'ai']),
            'activity.in' => __('validation.in', ['attribute' => 'activity']),
            'sort.in' => __('validation.in', ['attribute' => 'sort']),
            'direction.in' => __('validation.in', ['attribute' => 'direction']),
        ];
    }

    /** @return array{search: ?string, ai: ?string, activity: ?string, sort: string, direction: string} */
    public function filters(): array
    {
        $data = $this->validated();

        return [
            'search' => isset($data['search']) && trim($data['search']) !== '' ? trim($data['search']) : null,
            'ai' => $data['ai'] ?? null,
            'activity' => $data['activity'] ?? null,
            'sort' => $data['sort'] ?? 'last_played',
            'direction' => $data['direction'] ?? 'desc',
        ];
    }
}
