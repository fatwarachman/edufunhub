<?php

namespace App\Http\Requests\Admin;

use App\Models\ChatConversation;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

class ChatLogRequest extends FormRequest
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
            'user_id' => ['nullable', 'integer', 'exists:users,id'],
            'type' => ['nullable', Rule::in([ChatConversation::DIRECT, ChatConversation::GROUP])],
            'date_from' => ['nullable', 'date_format:Y-m-d'],
            'date_to' => ['nullable', 'date_format:Y-m-d', 'after_or_equal:date_from'],
            'page' => ['nullable', 'integer', 'min:1'],
        ];
    }

    /** @return array<string, string> */
    public function messages(): array
    {
        return [
            'search.max' => __('validation.max.string', ['attribute' => 'search', 'max' => 100]),
            'user_id.integer' => __('validation.integer', ['attribute' => 'user']),
            'user_id.exists' => __('validation.exists', ['attribute' => 'user']),
            'type.in' => __('validation.in', ['attribute' => 'type']),
            'date_from.date_format' => __('validation.date_format', ['attribute' => 'date from', 'format' => 'Y-m-d']),
            'date_to.date_format' => __('validation.date_format', ['attribute' => 'date to', 'format' => 'Y-m-d']),
            'date_to.after_or_equal' => __('validation.after_or_equal', ['attribute' => 'date to', 'date' => 'date from']),
        ];
    }

    /** @return array{search: ?string, user_id: ?int, type: ?string, date_from: ?string, date_to: ?string} */
    public function filters(): array
    {
        $data = $this->validated();

        return [
            'search' => isset($data['search']) && trim($data['search']) !== '' ? trim($data['search']) : null,
            'user_id' => isset($data['user_id']) ? (int) $data['user_id'] : null,
            'type' => $data['type'] ?? null,
            'date_from' => $data['date_from'] ?? null,
            'date_to' => $data['date_to'] ?? null,
        ];
    }
}
