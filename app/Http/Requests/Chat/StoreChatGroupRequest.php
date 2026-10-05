<?php

namespace App\Http\Requests\Chat;

use App\Models\ChatConversation;
use Illuminate\Database\Query\Builder;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

class StoreChatGroupRequest extends FormRequest
{
    public function authorize(): bool
    {
        return $this->user() !== null;
    }

    protected function prepareForValidation(): void
    {
        $this->merge(['name' => trim((string) $this->input('name'))]);
    }

    /** @return array<string, array<mixed>> */
    public function rules(): array
    {
        return [
            'name' => ['required', 'string', 'min:2', 'max:60'],
            'member_ids' => ['required', 'array', 'min:1', 'max:'.(ChatConversation::MAX_GROUP_MEMBERS - 1)],
            'member_ids.*' => [
                'required',
                'integer',
                'distinct',
                Rule::notIn([$this->user()?->id]),
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
            'member_ids.required' => __('chat.errors.group_members'),
            'member_ids.min' => __('chat.errors.group_members'),
            'member_ids.max' => __('chat.errors.group_full', ['max' => ChatConversation::MAX_GROUP_MEMBERS]),
            'member_ids.*.exists' => __('chat.errors.user_missing'),
            'member_ids.*.not_in' => __('chat.errors.self'),
        ];
    }
}
