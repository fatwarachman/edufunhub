<?php

namespace App\Services;

use App\Models\School;
use App\Models\User;
use App\Services\WhatsApp\WhatsAppNotifier;
use Illuminate\Database\UniqueConstraintViolationException;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;

/**
 * Mandatory first-login wizard: name, birth date, grade, last school and
 * WhatsApp number. Admin and teacher accounts skip it.
 */
class ProfileWizard
{
    public function __construct(private WhatsAppNotifier $whatsApp) {}

    public function isPending(User $user): bool
    {
        return $user->profile_completed_at === null && ! $user->isAdmin() && ! $user->isTeacher();
    }

    /**
     * Prefill for the wizard, or null when it must not be shown.
     *
     * @return array{name: string, birth_date: ?string, grade: ?int, school_name: ?string, school_city: ?string, school_level: ?string, school_npsn: ?string, whatsapp_number: ?string}|null
     */
    public function pendingFor(User $user): ?array
    {
        if (! $this->isPending($user)) {
            return null;
        }

        $profile = $user->playerProfile;

        return [
            'name' => $user->name,
            'birth_date' => $profile?->birth_date?->toDateString(),
            'grade' => $profile?->grade,
            'school_name' => $profile?->school_name,
            'school_city' => $profile?->school_city,
            'school_level' => $profile?->school_level,
            'school_npsn' => $profile?->school_npsn,
            'whatsapp_number' => $user->whatsapp_number,
        ];
    }

    /**
     * @param  array{name: string, birth_date: string, grade: int, school_name: string, school_city: ?string, school_level: ?string, school_npsn: ?string, whatsapp_number: string, whatsapp_notifications: bool}  $data
     */
    public function complete(User $user, array $data): void
    {
        try {
            DB::transaction(fn () => $this->store($user, $data));
        } catch (UniqueConstraintViolationException) {
            throw ValidationException::withMessages(['whatsapp_number' => __('whatsapp.validation.taken')]);
        }

        $this->whatsApp->welcome($user->fresh(['playerProfile']));
    }

    /**
     * @param  array{name: string, birth_date: string, grade: int, school_name: string, school_city: ?string, school_level: ?string, school_npsn: ?string, whatsapp_number: string, whatsapp_notifications: bool}  $data
     */
    private function store(User $user, array $data): void
    {
        $user->playerProfile()->updateOrCreate([], [
            ...School::officialDetails([
                'birth_date' => $data['birth_date'],
                'school_name' => $data['school_name'],
                'school_city' => $data['school_city'],
                'school_level' => $data['school_level'],
                'school_npsn' => $data['school_npsn'],
            ]),
            'grade' => $data['grade'],
        ]);

        $user->forceFill([
            'name' => $data['name'],
            'whatsapp_number' => $data['whatsapp_number'],
            'whatsapp_notifications' => $data['whatsapp_notifications'],
            'profile_completed_at' => now(),
        ])->save();
    }
}
