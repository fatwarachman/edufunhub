<?php

namespace App\Http\Requests;

use App\Enums\FeedbackType;
use App\Http\Requests\Admin\AdCampaignRequest;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

class StoreFeedbackRequest extends FormRequest
{
    public function authorize(): bool
    {
        return $this->user() !== null;
    }

    /**
     * Strip markup and surrounding whitespace before the length checks run.
     */
    protected function prepareForValidation(): void
    {
        $message = $this->input('message');
        $pageUrl = $this->input('page_url');

        $this->merge([
            'message' => is_string($message) ? trim(strip_tags($message)) : $message,
            'page_url' => is_string($pageUrl) && trim($pageUrl) !== '' ? trim(strip_tags($pageUrl)) : null,
            'game' => $this->filled('game') ? $this->input('game') : null,
            'may_contact' => $this->boolean('may_contact'),
        ]);
    }

    /**
     * @return array<string, array<int, mixed>>
     */
    public function rules(): array
    {
        return [
            'type' => ['required', 'string', Rule::enum(FeedbackType::class)],
            'message' => ['required', 'string', 'min:10', 'max:2000'],
            'game' => ['nullable', 'string', Rule::in(AdCampaignRequest::gameKeys())],
            'page_url' => ['nullable', 'string', 'max:255', 'regex:#^(https?://|/)#i'],
            'may_contact' => ['boolean'],
        ];
    }

    /**
     * @return array<string, string>
     */
    public function messages(): array
    {
        return [
            'type.required' => __('feedback.validation.type'),
            'type.enum' => __('feedback.validation.type'),
            'message.required' => __('feedback.validation.message_required'),
            'message.min' => __('feedback.validation.message_min'),
            'message.max' => __('feedback.validation.message_max'),
            'game.in' => __('feedback.validation.game'),
            'page_url.regex' => __('feedback.validation.page_url'),
            'page_url.max' => __('feedback.validation.page_url'),
        ];
    }
}
