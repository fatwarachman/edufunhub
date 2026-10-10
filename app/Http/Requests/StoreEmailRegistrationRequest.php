<?php

namespace App\Http\Requests;

use App\Actions\Fortify\PasswordValidationRules;
use App\Models\User;
use App\Services\RegistrationSettings;
use Closure;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Support\Str;
use Illuminate\Validation\Rule;

/**
 * Sign-up with email + password, available only while the super admin has
 * turned it on. Birth date, school and grade are collected later by the
 * first-login profile wizard.
 */
class StoreEmailRegistrationRequest extends FormRequest
{
    use PasswordValidationRules;

    public function authorize(): bool
    {
        return app(RegistrationSettings::class)->emailEnabled();
    }

    protected function failedAuthorization(): never
    {
        abort(404);
    }

    protected function prepareForValidation(): void
    {
        $this->merge([
            'name' => Str::squish((string) $this->input('name', '')),
            'email' => Str::lower(trim((string) $this->input('email', ''))),
        ]);
    }

    /** @return array<string, array<mixed>> */
    public function rules(): array
    {
        return [
            'name' => ['required', 'string', 'min:2', 'max:255'],
            'email' => [
                'required',
                'string',
                'email',
                'max:255',
                Rule::unique(User::class, 'email'),
                function (string $attribute, mixed $value, Closure $fail): void {
                    if (is_string($value) && User::withTrashed()->whereRaw('LOWER(email) = ?', [$value])->exists()) {
                        $fail(__('registration.validation.email_taken'));
                    }
                },
            ],
            'password' => $this->passwordRules(),
            'website' => ['prohibited'],
        ];
    }

    /** @return array<string, string> */
    public function messages(): array
    {
        return [
            'name.required' => __('registration.validation.name_required'),
            'name.min' => __('registration.validation.name_min'),
            'name.max' => __('registration.validation.name_max'),
            'email.required' => __('registration.validation.email_required'),
            'email.email' => __('registration.validation.email_invalid'),
            'email.max' => __('registration.validation.email_invalid'),
            'email.unique' => __('registration.validation.email_taken'),
            'password.required' => __('registration.validation.password_required'),
            'password.min' => __('registration.validation.password_min'),
            'password.confirmed' => __('registration.validation.password_mismatch'),
            'website.prohibited' => __('registration.validation.rejected'),
        ];
    }
}
