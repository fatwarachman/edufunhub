<?php

namespace App\Http\Requests\Admin;

use App\Models\Role;
use App\Models\User;
use Illuminate\Contracts\Validation\ValidationRule;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;
use Illuminate\Validation\Rules\Password;
use Illuminate\Validation\Validator;

class UpdateUserRequest extends FormRequest
{
    /**
     * Determine if the user is authorized to make this request.
     */
    public function authorize(): bool
    {
        return (bool) $this->user()?->isAdmin();
    }

    /**
     * Get the validation rules that apply to the request.
     *
     * @return array<string, ValidationRule|array<mixed>|string>
     */
    public function rules(): array
    {
        /** @var User $user */
        $user = $this->route('user');

        return [
            'name' => ['required', 'string', 'max:255'],
            'email' => ['required', 'string', 'email', 'max:255', Rule::unique(User::class)->ignore($user->id)],
            'password' => ['nullable', 'string', Password::min(8)->mixedCase()->numbers(), 'confirmed'],
            'password_confirmation' => ['nullable', 'string'],
            'roles' => ['nullable', 'array'],
            'roles.*' => ['integer', Rule::exists('roles', 'id')],
            'permissions' => ['nullable', 'array'],
            'permissions.*' => ['integer', Rule::exists('permissions', 'id')],
        ];
    }

    /**
     * Only a super admin may give or take the super admin role (it grants
     * full access), and nobody may remove their own super admin role.
     *
     * @return array<int, \Closure(Validator): void>
     */
    public function after(): array
    {
        return [
            function (Validator $validator): void {
                if (! $this->has('roles')) {
                    return;
                }

                $superRole = Role::query()->where('slug', Role::SUPER_ADMIN)->value('id');
                $target = $this->route('user');
                $had = $target instanceof User && (bool) $target->is_superadmin;
                $wants = $superRole !== null && in_array((int) $superRole, array_map('intval', (array) $this->input('roles', [])), true);

                if ($had !== $wants && ! $this->user()?->is_superadmin) {
                    $validator->errors()->add('roles', __('roles.super_admin_only'));
                }

                if ($had && ! $wants && $target->is($this->user())) {
                    $validator->errors()->add('roles', __('roles.keep_own_super_admin'));
                }
            },
        ];
    }
}
