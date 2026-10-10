<?php

namespace App\Http\Requests\Admin;

use App\Models\DatabaseBackup;
use App\Services\Backup\BackupSettings;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;
use Illuminate\Validation\Validator;

class BackupSettingsRequest extends FormRequest
{
    public function authorize(): bool
    {
        return (bool) $this->user()?->is_superadmin;
    }

    protected function prepareForValidation(): void
    {
        $this->merge([
            'ftp_host' => trim((string) $this->input('ftp_host')),
            'ftp_directory' => trim((string) $this->input('ftp_directory'), "/ \t"),
        ]);
    }

    /** @return array<string, array<mixed>> */
    public function rules(): array
    {
        $needsFtp = in_array($this->input('destination'), ['ftp', 'both'], true);

        return [
            'enabled' => ['required', 'boolean'],
            'frequency' => ['required', Rule::in(BackupSettings::FREQUENCIES)],
            'time' => ['required', 'date_format:H:i'],
            'weekday' => ['required', 'integer', 'between:0,6'],
            'destination' => ['required', Rule::in(DatabaseBackup::DESTINATIONS)],
            'keep' => ['required', 'integer', 'between:1,100'],
            'ftp_host' => [Rule::requiredIf($needsFtp), 'nullable', 'string', 'max:255', 'regex:/^[A-Za-z0-9.\-]+$/'],
            'ftp_port' => [Rule::requiredIf($needsFtp), 'nullable', 'integer', 'between:1,65535'],
            'ftp_username' => [Rule::requiredIf($needsFtp), 'nullable', 'string', 'max:255'],
            'ftp_password' => ['nullable', 'string', 'max:255'],
            'ftp_directory' => ['nullable', 'string', 'max:255', 'regex:/^[A-Za-z0-9._\-\/]*$/', 'not_regex:/(^|\/)\.\.(\/|$)/'],
            'ftp_tls' => ['required', 'boolean'],
            'ftp_passive' => ['required', 'boolean'],
        ];
    }

    public function after(): array
    {
        return [
            function (Validator $validator): void {
                $needsFtp = in_array($this->input('destination'), ['ftp', 'both'], true);
                if ($needsFtp && (string) $this->input('ftp_password') === '' && ! app(BackupSettings::class)->hasFtpPassword()) {
                    $validator->errors()->add('ftp_password', __('backups.validation.ftp_password'));
                }
            },
        ];
    }

    /** @return array<string, string> */
    public function messages(): array
    {
        return [
            'frequency.in' => __('backups.validation.frequency'),
            'time.required' => __('backups.validation.time'),
            'time.date_format' => __('backups.validation.time'),
            'weekday.*' => __('backups.validation.weekday'),
            'destination.*' => __('backups.validation.destination'),
            'keep.*' => __('backups.validation.keep'),
            'ftp_host.required' => __('backups.validation.ftp_host'),
            'ftp_host.regex' => __('backups.validation.ftp_host'),
            'ftp_port.*' => __('backups.validation.ftp_port'),
            'ftp_username.required' => __('backups.validation.ftp_username'),
            'ftp_directory.*' => __('backups.validation.ftp_directory'),
        ];
    }
}
