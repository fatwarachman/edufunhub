<?php

namespace App\Http\Requests;

use App\Http\Requests\Api\StoreClassroomChatRequest;
use Illuminate\Foundation\Http\FormRequest;

/**
 * Reply typed in the 3D classroom world's "waiting chats" list. Same text
 * rules as proximity chat: control characters removed, trimmed, max 120.
 * The partner must belong to the classroom (checked in the controller).
 */
class ClassroomWorldReplyRequest extends FormRequest
{
    public function authorize(): bool
    {
        return $this->user() !== null;
    }

    protected function prepareForValidation(): void
    {
        $text = $this->input('text');
        if (is_string($text)) {
            $this->merge(['text' => StoreClassroomChatRequest::clean($text)]);
        }
    }

    /** @return array<string, array<mixed>> */
    public function rules(): array
    {
        return [
            'user_id' => ['required', 'integer', 'min:1'],
            'text' => ['required', 'string', 'max:'.StoreClassroomChatRequest::MAX_TEXT],
        ];
    }

    /** @return array<string, string> */
    public function messages(): array
    {
        return [
            'text.required' => __('chat.errors.empty'),
            'text.max' => __('chat.errors.too_long', ['max' => StoreClassroomChatRequest::MAX_TEXT]),
        ];
    }
}
