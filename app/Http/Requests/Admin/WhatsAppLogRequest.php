<?php

namespace App\Http\Requests\Admin;

use App\Models\WhatsAppMessage;
use Illuminate\Contracts\Validation\Validator;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;
use Illuminate\Validation\Validator as ValidationValidator;

/** Filters of the WhatsApp message log. Invalid values are dropped, not reported. */
class WhatsAppLogRequest extends FormRequest
{
    public function authorize(): bool
    {
        return (bool) $this->user()?->is_superadmin;
    }

    /** @return array<string, array<mixed>> */
    public function rules(): array
    {
        return [
            'search' => ['nullable', 'string', 'max:100'],
            'status' => ['nullable', Rule::in(WhatsAppMessage::STATUSES)],
            'event' => ['nullable', 'string', 'max:50', 'regex:/^[a-z0-9_]+$/'],
            'date_from' => ['nullable', 'date_format:Y-m-d'],
            'date_to' => ['nullable', 'date_format:Y-m-d'],
        ];
    }

    /** @return array<string, string> */
    public function messages(): array
    {
        return [
            'search.max' => __('whatsapp.validation.filter'),
            'status.in' => __('whatsapp.validation.filter'),
            'event.regex' => __('whatsapp.validation.filter'),
            'date_from.date_format' => __('whatsapp.validation.filter'),
            'date_to.date_format' => __('whatsapp.validation.filter'),
        ];
    }

    /** A bad query string (hand-edited URL) just loses that filter instead of redirecting. */
    protected function failedValidation(Validator $validator): void {}

    /**
     * Validated filters without empty values.
     *
     * @return array{search?: string, status?: string, event?: string, date_from?: string, date_to?: string}
     */
    public function filters(): array
    {
        $validator = $this->getValidatorInstance();
        $valid = $validator instanceof ValidationValidator ? $validator->valid() : [];
        $valid = array_intersect_key($valid, $this->rules());

        return array_filter($valid, fn (mixed $value): bool => $value !== null && $value !== '');
    }
}
