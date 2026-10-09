<?php

namespace App\Http\Requests\Admin;

use Illuminate\Foundation\Http\FormRequest;

class AiAssistantConversationRequest extends FormRequest
{
    public function authorize(): bool
    {
        return (bool) $this->user()?->is_superadmin;
    }

    /** @return array<string, list<string>> */
    public function rules(): array
    {
        return ['title' => ['required', 'string', 'max:100']];
    }

    /** @return array<string, string> */
    public function messages(): array
    {
        return [
            'title.required' => __('ai_assistant.title_required'),
            'title.string' => __('ai_assistant.title_required'),
            'title.max' => __('ai_assistant.title_long'),
        ];
    }
}
