<?php

namespace App\Http\Controllers\Admin;

use App\Http\Controllers\Controller;
use App\Models\Setting;
use App\Models\User;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Hash;
use Illuminate\Validation\Rule;
use Illuminate\Validation\Rules\Password;
use Inertia\Inertia;
use Inertia\Response;

class SettingsController extends Controller
{
    /**
     * Show settings page with data for all tabs.
     */
    public function index(Request $request): Response
    {
        $tab = $request->query('tab', 'general');

        return Inertia::render('admin/settings', [
            'tab'      => $tab,
            'general'  => Setting::group('general'),
            'mail'     => Setting::group('mail'),
            'security' => Setting::group('security'),
            'profile'  => $request->user()->only('id', 'name', 'email', 'avatar_url', 'bio', 'timezone'),
        ]);
    }

    /**
     * Update general settings.
     */
    public function updateGeneral(Request $request): RedirectResponse
    {
        $data = $request->validate([
            'app_name'        => ['required', 'string', 'max:100'],
            'app_description' => ['nullable', 'string', 'max:500'],
            'app_url'         => ['nullable', 'url', 'max:255'],
            'app_logo'        => ['nullable', 'string', 'max:500'],
            'app_timezone'    => ['nullable', 'string', 'max:50'],
            'maintenance_mode' => ['nullable', 'boolean'],
        ]);

        foreach ($data as $key => $value) {
            Setting::set($key, is_bool($value) ? ($value ? '1' : '0') : (string) ($value ?? ''), 'general');
        }

        activity()
            ->causedBy($request->user())
            ->withProperties(['group' => 'general'])
            ->log('Updated general settings');

        return back()->with('success', 'General settings updated.');
    }

    /**
     * Update mail settings.
     */
    public function updateMail(Request $request): RedirectResponse
    {
        $data = $request->validate([
            'mail_mailer'       => ['required', 'string', Rule::in(['smtp', 'log', 'sendmail', 'mailgun', 'ses'])],
            'mail_host'         => ['nullable', 'string', 'max:255'],
            'mail_port'         => ['nullable', 'integer', 'min:1', 'max:65535'],
            'mail_encryption'   => ['nullable', 'string', Rule::in(['', 'tls', 'ssl'])],
            'mail_username'     => ['nullable', 'string', 'max:255'],
            'mail_password'     => ['nullable', 'string', 'max:255'],
            'mail_from_address' => ['nullable', 'email', 'max:255'],
            'mail_from_name'    => ['nullable', 'string', 'max:255'],
        ]);

        foreach ($data as $key => $value) {
            Setting::set($key, (string) ($value ?? ''), 'mail');
        }

        activity()
            ->causedBy($request->user())
            ->withProperties(['group' => 'mail'])
            ->log('Updated mail settings');

        return back()->with('success', 'Mail settings updated.');
    }

    /**
     * Update security settings.
     */
    public function updateSecurity(Request $request): RedirectResponse
    {
        $data = $request->validate([
            'password_min_length'  => ['required', 'integer', 'min:6', 'max:128'],
            'password_require_uppercase' => ['nullable', 'boolean'],
            'password_require_numbers'   => ['nullable', 'boolean'],
            'password_require_symbols'   => ['nullable', 'boolean'],
            'session_lifetime'     => ['required', 'integer', 'min:1', 'max:1440'],
            'max_login_attempts'   => ['required', 'integer', 'min:1', 'max:100'],
            'two_factor_enabled'   => ['nullable', 'boolean'],
        ]);

        foreach ($data as $key => $value) {
            Setting::set($key, is_bool($value) ? ($value ? '1' : '0') : (string) ($value ?? ''), 'security');
        }

        activity()
            ->causedBy($request->user())
            ->withProperties(['group' => 'security'])
            ->log('Updated security settings');

        return back()->with('success', 'Security settings updated.');
    }

    /**
     * Update admin profile.
     */
    public function updateProfile(Request $request): RedirectResponse
    {
        /** @var User $user */
        $user = $request->user();

        $data = $request->validate([
            'name'     => ['required', 'string', 'max:255'],
            'email'    => ['required', 'email', 'max:255', Rule::unique('users')->ignore($user->id)],
            'bio'      => ['nullable', 'string', 'max:1000'],
            'timezone' => ['nullable', 'string', 'max:50'],
        ]);

        $user->update($data);

        activity()
            ->causedBy($user)
            ->performedOn($user)
            ->log('Updated profile');

        return back()->with('success', 'Profile updated.');
    }

    /**
     * Change admin password.
     */
    public function updatePassword(Request $request): RedirectResponse
    {
        $data = $request->validate([
            'current_password' => ['required', 'current_password'],
            'password'         => ['required', 'confirmed', Password::min(8)->mixedCase()->numbers()],
        ]);

        $request->user()->update([
            'password' => Hash::make($data['password']),
        ]);

        activity()
            ->causedBy($request->user())
            ->log('Changed password');

        return back()->with('success', 'Password changed.');
    }
}
