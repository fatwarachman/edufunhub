<?php

namespace App\Http\Requests\Admin;

use App\Services\PlayerNotifications;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;
use Illuminate\Validation\Validator;

class SendPlayerNotificationRequest extends FormRequest
{
    public function authorize(): bool
    {
        return (bool) $this->user()?->is_superadmin;
    }

    protected function prepareForValidation(): void
    {
        $this->merge([
            'title' => is_string($this->input('title')) ? trim($this->input('title')) : $this->input('title'),
            'body' => is_string($this->input('body')) ? trim($this->input('body')) : $this->input('body'),
            'url' => is_string($this->input('url')) && trim($this->input('url')) !== '' ? trim($this->input('url')) : null,
        ]);
    }

    /** @return array<string, array<mixed>> */
    public function rules(): array
    {
        return [
            'title' => ['required', 'string', 'max:120'],
            'body' => ['required', 'string', 'max:500'],
            'url' => ['nullable', 'string', 'max:255'],
            'audience' => ['required', Rule::in(PlayerNotifications::AUDIENCES)],
            'grade' => ['nullable', 'required_if:audience,grade', 'integer', 'between:0,12'],
        ];
    }

    /** @return array<int, callable(Validator): void> */
    public function after(): array
    {
        return [
            function (Validator $validator): void {
                $url = $this->input('url');
                if (is_string($url) && ! app(PlayerNotifications::class)->isSafeUrl($url)) {
                    $validator->errors()->add('url', __('player_notifications.admin.invalid_url'));
                }
            },
        ];
    }

    /** @return array<string, string> */
    public function messages(): array
    {
        return [
            'grade.required_if' => __('player_notifications.admin.grade_required'),
        ];
    }
}
