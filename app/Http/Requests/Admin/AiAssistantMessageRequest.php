<?php

namespace App\Http\Requests\Admin;

use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

class AiAssistantMessageRequest extends FormRequest
{
    public function authorize(): bool
    {
        return (bool) $this->user()?->is_superadmin;
    }

    public function rules(): array
    {
        return [
            'message' => ['required', 'string', 'max:4000'],
            'conversation_id' => ['sometimes', 'nullable', 'uuid'],
            'history' => ['sometimes', 'array', 'list', 'max:12'],
            'history.*' => ['required', 'array:role,content'],
            'history.*.role' => ['required', Rule::in(['user', 'assistant'])],
            'history.*.content' => ['required', 'string', 'max:8000'],
        ];
    }

    public function messages(): array
    {
        return [
            'message.required' => __('ai_assistant.message_required'),
            'message.string' => __('ai_assistant.message_invalid'),
            'message.max' => __('ai_assistant.message_long'),
            'conversation_id.uuid' => __('ai_assistant.conversation_invalid'),
            'history.array' => __('ai_assistant.history_invalid'),
            'history.list' => __('ai_assistant.history_invalid'),
            'history.max' => __('ai_assistant.history_long'),
            'history.*.required' => __('ai_assistant.history_invalid'),
            'history.*.array' => __('ai_assistant.history_invalid'),
            'history.*.role.required' => __('ai_assistant.role_invalid'),
            'history.*.role.in' => __('ai_assistant.role_invalid'),
            'history.*.content.required' => __('ai_assistant.content_invalid'),
            'history.*.content.string' => __('ai_assistant.content_invalid'),
            'history.*.content.max' => __('ai_assistant.content_long'),
        ];
    }
}
