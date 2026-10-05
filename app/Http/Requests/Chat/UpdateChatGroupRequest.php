<?php

namespace App\Http\Requests\Chat;

use App\Models\ChatConversation;
use Illuminate\Database\Query\Builder;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

class UpdateChatGroupRequest extends FormRequest
{
    public function authorize(): bool
    {
        return $this->user() !== null;
    }

    protected function prepareForValidation(): void
    {
        if ($this->has('name')) {
            $this->merge(['name' => trim((string) $this->input('name'))]);
        }
    }

    /** @return array<string, array<mixed>> */
    public function rules(): array
    {
        return [
            'name' => ['sometimes', 'required', 'string', 'min:2', 'max:60'],
            'add_member_ids' => ['sometimes', 'array', 'max:'.(ChatConversation::MAX_GROUP_MEMBERS - 1)],
            'add_member_ids.*' => [
                'integer',
                'distinct',
                Rule::exists('users', 'id')->where(fn (Builder $q) => $q->whereNull('disabled_at')),
            ],
        ];
    }

    /** @return array<string, string> */
    public function messages(): array
    {
        return [
            'name.required' => __('chat.errors.group_name'),
            'name.min' => __('chat.errors.group_name'),
            'add_member_ids.*.exists' => __('chat.errors.user_missing'),
        ];
    }
}
