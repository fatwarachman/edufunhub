<?php

namespace App\Http\Controllers\Admin;

use App\Http\Controllers\Controller;
use App\Models\ImpersonationLog;
use App\Models\User;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;

/**
 * "Login as": an admin with the `user-impersonate` permission signs in as
 * another user to see the app through their eyes, then returns. Every
 * session is written to impersonation_logs and the activity log.
 */
class ImpersonationController extends Controller
{
    public const PERMISSION = 'user-impersonate';

    public function impersonate(Request $request, User $user): RedirectResponse
    {
        $admin = $request->user();

        abort_unless($admin->hasPermission(self::PERMISSION), 403);

        if ($request->session()->has('impersonated_by')) {
            return back()->with('error', 'Leave the current impersonation first.');
        }
        if ($user->is($admin)) {
            return back()->with('error', 'You cannot impersonate yourself.');
        }
        if ($user->is_superadmin && ! $admin->is_superadmin) {
            return back()->with('error', 'Only a superadmin can log in as another superadmin.');
        }
        if ($user->disabled_at !== null) {
            return back()->with('error', 'This account is not active.');
        }

        $log = ImpersonationLog::query()->create([
            'impersonator_id' => $admin->id,
            'impersonated_id' => $user->id,
            'ip_address' => $request->ip(),
            'user_agent' => substr((string) $request->userAgent(), 0, 500),
            'started_at' => now(),
        ]);

        activity()
            ->causedBy($admin)
            ->performedOn($user)
            ->event('impersonated')
            ->withProperties(['ip_address' => $request->ip()])
            ->log("Admin impersonated user {$user->name}");

        Auth::login($user);
        $request->session()->regenerate();
        $request->session()->put('impersonated_by', $admin->id);
        $request->session()->put('impersonation_log_id', $log->id);

        return redirect()->route('dashboard')->with('success', "You are now logged in as {$user->name}.");
    }

    public function leave(Request $request): RedirectResponse
    {
        $originalId = $request->session()->pull('impersonated_by');
        $logId = $request->session()->pull('impersonation_log_id');

        if (! $originalId) {
            return redirect()->route('dashboard');
        }

        if ($logId) {
            ImpersonationLog::query()->whereKey($logId)->whereNull('ended_at')->update(['ended_at' => now()]);
        }

        $original = User::query()->find($originalId);
        if ($original === null) {
            Auth::logout();
            $request->session()->invalidate();

            return redirect()->route('login');
        }

        Auth::login($original);
        $request->session()->regenerate();

        return redirect()->route('admin.users.index')->with('success', 'Welcome back. Impersonation ended.');
    }
}
