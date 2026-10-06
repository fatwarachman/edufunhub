<?php

namespace App\Listeners;

use App\Models\User;
use App\Services\UserActivity;
use Illuminate\Auth\Events\Logout;

class LogUserLogout
{
    public function __construct(private UserActivity $activity) {}

    public function handle(Logout $event): void
    {
        if ($event->user instanceof User && ! request()->routeIs('admin.impersonate', 'admin.impersonate.leave')) {
            $this->activity->logout($event->user, request());
        }
    }
}
