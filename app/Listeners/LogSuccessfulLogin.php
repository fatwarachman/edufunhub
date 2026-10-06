<?php

namespace App\Listeners;

use App\Models\LoginActivity;
use App\Models\User;
use App\Services\UserActivity;
use Illuminate\Auth\Events\Login;

class LogSuccessfulLogin
{
    public function __construct(private UserActivity $activity) {}

    /**
     * Handle the event.
     */
    public function handle(Login $event): void
    {
        LoginActivity::create([
            'user_id' => $event->user->getAuthIdentifier(),
            'email' => $event->user->email,
            'ip_address' => request()->ip(),
            'user_agent' => request()->userAgent(),
            'login_at' => now(),
            'is_successful' => true,
        ]);

        if ($event->user instanceof User && ! request()->routeIs('admin.impersonate', 'admin.impersonate.leave')) {
            $this->activity->login($event->user, request());
        }
    }
}
