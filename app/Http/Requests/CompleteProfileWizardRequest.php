<?php

namespace App\Http\Requests;

use App\Http\Requests\Concerns\PlayerDetailsRules;
use App\Http\Requests\Concerns\WhatsAppNumberRules;
use App\Models\PlayerProfile;
use App\Models\School;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Support\Str;

class CompleteProfileWizardRequest extends FormRequest
{
    use PlayerDetailsRules, WhatsAppNumberRules;

    public function authorize(): bool
    {
        return $this->user() !== null;
    }

    protected function prepareForValidation(): void
    {
        $city = Str::squish((string) $this->input('school_city'));
        $level = Str::upper(Str::squish((string) $this->input('school_level')));
        $level = School::LEVEL_ALIASES[$level] ?? $level;
        $npsn = Str::squish((string) $this->input('school_npsn'));

        $this->merge([
            'name' => Str::squish((string) $this->input('name')),
            'school_name' => Str::squish((string) $this->input('school_name')),
            'school_city' => $city === '' ? null : $city,
            'school_level' => $level === '' ? null : $level,
            'school_npsn' => $npsn === '' ? null : $npsn,
            'whatsapp_number' => $this->normalizedWhatsAppNumber(),
            'whatsapp_notifications' => $this->boolean('whatsapp_notifications', true),
        ]);
    }

    /** @return array<string, array<mixed>> */
    public function rules(): array
    {
        return [
            'name' => ['required', 'string', 'min:2', 'max:80'],
            ...$this->playerDetailsRules(),
            'grade' => ['required', 'integer', 'between:'.PlayerProfile::MIN_GRADE.','.PlayerProfile::MAX_GRADE],
            'whatsapp_number' => $this->whatsAppNumberRules(required: true),
            'whatsapp_notifications' => ['boolean'],
        ];
    }

    /** @return array<string, string> */
    public function messages(): array
    {
        return [
            'name.required' => __('profile.name_required'),
            'name.min' => __('profile.name_invalid'),
            'name.max' => __('profile.name_invalid'),
            ...$this->playerDetailsMessages(),
            'grade.required' => __('character.grade_invalid'),
            'grade.integer' => __('character.grade_invalid'),
            'grade.between' => __('character.grade_invalid'),
            ...$this->whatsAppNumberMessages(),
        ];
    }
}
