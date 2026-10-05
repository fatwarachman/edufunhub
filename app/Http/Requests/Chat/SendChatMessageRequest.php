<?php

namespace App\Http\Requests\Chat;

use App\Models\ChatMessage;
use Illuminate\Foundation\Http\FormRequest;

class SendChatMessageRequest extends FormRequest
{
    public function authorize(): bool
    {
        return $this->user() !== null;
    }

    protected function prepareForValidation(): void
    {
        $this->merge(['body' => trim((string) $this->input('body'))]);
    }

    /** @return array<string, array<mixed>> */
    public function rules(): array
    {
        return [
            'body' => ['required', 'string', 'max:'.ChatMessage::MAX_LENGTH],
        ];
    }

    /** @return array<string, string> */
    public function messages(): array
    {
        return [
            'body.required' => __('chat.errors.empty'),
            'body.max' => __('chat.errors.too_long', ['max' => ChatMessage::MAX_LENGTH]),
        ];
    }
}
