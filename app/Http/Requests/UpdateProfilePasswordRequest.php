<?php

namespace App\Http\Requests;

use App\Http\Controllers\ProfileController;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rules\Password;

class UpdateProfilePasswordRequest extends FormRequest
{
    public function authorize(): bool
    {
        return $this->user() !== null;
    }

    /** @return array<string, array<mixed>> */
    public function rules(): array
    {
        return [
            'current_password' => ProfileController::needsCurrentPassword($this->user())
                ? ['required', 'string', 'current_password']
                : ['nullable'],
            'password' => ['required', 'string', Password::min(8)->letters()->numbers(), 'confirmed'],
        ];
    }

    /** @return array<string, string> */
    public function messages(): array
    {
        return [
            'current_password.required' => __('profile.current_required'),
            'current_password.current_password' => __('profile.current_wrong'),
            'password.required' => __('profile.password_required'),
            'password.confirmed' => __('profile.password_mismatch'),
        ];
    }
}
