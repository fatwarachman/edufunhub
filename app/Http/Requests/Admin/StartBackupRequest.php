<?php

namespace App\Http\Requests\Admin;

use App\Models\DatabaseBackup;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

class StartBackupRequest extends FormRequest
{
    public function authorize(): bool
    {
        return (bool) $this->user()?->is_superadmin;
    }

    /** @return array<string, array<mixed>> */
    public function rules(): array
    {
        return ['destination' => ['required', Rule::in(DatabaseBackup::DESTINATIONS)]];
    }

    /** @return array<string, string> */
    public function messages(): array
    {
        return ['destination.*' => __('backups.validation.destination')];
    }
}
