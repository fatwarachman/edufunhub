<?php

namespace App\Http\Requests\Chat;

use Illuminate\Database\Query\Builder;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

class StartDirectChatRequest extends FormRequest
{
    public function authorize(): bool
    {
        return $this->user() !== null;
    }

    /** @return array<string, array<mixed>> */
    public function rules(): array
    {
        return [
            'user_id' => [
                'required',
                'integer',
                Rule::notIn([$this->user()?->id]),
                Rule::exists('users', 'id')->where(fn (Builder $q) => $q->whereNull('disabled_at')),
            ],
        ];
    }

    /** @return array<string, string> */
    public function messages(): array
    {
        return [
            'user_id.not_in' => __('chat.errors.self'),
            'user_id.exists' => __('chat.errors.user_missing'),
        ];
    }
}
