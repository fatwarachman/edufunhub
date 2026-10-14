<?php

namespace App\Services;

use App\Models\Role;
use App\Models\Subject;
use App\Models\TeacherRequest;
use App\Models\User;
use App\Services\WhatsApp\WhatsAppNotifier;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Collection;
use Illuminate\Support\Str;

/**
 * Pending teacher requests for the admin panel: the count shown as a badge on
 * the "Teacher requests" menu, and the WhatsApp alert sent to every enabled
 * superadmin and admin when a player asks for teacher access.
 */
class TeacherRequestAlerts
{
    public const EVENT = 'teacher_request';

    public function __construct(private WhatsAppNotifier $whatsApp) {}

    public function pendingCount(): int
    {
        return TeacherRequest::query()->where('status', TeacherRequest::PENDING)->count();
    }

    /**
     * WhatsApp every reviewer (each in their own language). The notifier
     * checks their number, opt-in, the admin switches and the hourly cap.
     */
    public function notifyReviewers(TeacherRequest $request): int
    {
        $request->loadMissing('user.playerProfile');
        $from = $request->user?->playerProfile?->nickname ?: (string) $request->user?->name;
        $subject = $request->subject_key
            ? Subject::query()->where('key', $request->subject_key)->first()
            : null;
        $sent = 0;

        foreach ($this->reviewers()->reject(fn (User $u): bool => $u->id === $request->user_id) as $reviewer) {
            $locale = $reviewer->locale === 'en' ? 'en' : 'id';
            $message = $this->whatsApp->notify($reviewer, self::EVENT, [
                'from' => $from,
                'subject' => $subject?->displayName($locale) ?? __('teacher_requests.any_subject', [], $locale),
                'note' => $request->message ? Str::limit(trim($request->message), 300) : __('teacher_requests.no_message', [], $locale),
                'link' => url('/admin/teacher-requests'),
            ]);
            if ($message !== null) {
                $sent++;
            }
        }

        return $sent;
    }

    /** @return Collection<int, User> */
    public function reviewers(): Collection
    {
        return User::query()
            ->whereNull('disabled_at')
            ->where(fn (Builder $q) => $q
                ->where('is_superadmin', true)
                ->orWhereHas('roles', fn (Builder $r) => $r->whereIn('slug', [Role::SUPER_ADMIN, Role::ADMIN])))
            ->with('playerProfile')
            ->get();
    }
}
