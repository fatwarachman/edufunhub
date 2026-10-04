<?php

namespace App\Http\Controllers\Auth;

use App\Http\Controllers\Controller;
use App\Models\ConnectedAccount;
use App\Models\User;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Str;
use Laravel\Socialite\Facades\Socialite;
use Throwable;

class GoogleAuthController extends Controller
{
    public static function enabled(): bool
    {
        foreach (['client_id', 'client_secret', 'redirect'] as $key) {
            $value = config("services.google.{$key}");

            if (! is_string($value) || trim($value) === '') {
                return false;
            }
        }

        return true;
    }

    public function redirect(): RedirectResponse
    {
        if (! self::enabled()) {
            return $this->failure('Google sign-in is not available. Please use email and password.');
        }

        try {
            return Socialite::driver('google')->redirect();
        } catch (Throwable) {
            return $this->failure('Google sign-in is unavailable. Please try again later.');
        }
    }

    public function callback(Request $request): RedirectResponse
    {
        if (! self::enabled()) {
            return $this->failure('Google sign-in is not available. Please use email and password.');
        }

        $state = $request->query('state');
        $expectedState = $request->session()->get('state');

        if ($request->has('error') || ! is_string($state) || $state === ''
            || ! is_string($expectedState) || ! hash_equals($expectedState, $state)
            || ! is_string($request->query('code')) || $request->query('code') === '') {
            $request->session()->forget('state');

            return $this->failure('Google sign-in could not be completed. Please try again.');
        }

        try {
            $identity = Socialite::driver('google')->user();
            $id = $identity->getId();
            $email = $identity->getEmail();
            $verified = $identity->user['email_verified'] ?? $identity->user['verified_email'] ?? false;

            if (! is_string($id) || trim($id) === '' || strlen($id) > 255
                || ! is_string($email) || strlen($email) > 255 || ! filter_var($email, FILTER_VALIDATE_EMAIL)
                || $verified !== true) {
                return $this->failure('Google must provide a verified email address to sign in.');
            }

            $email = Str::lower($email);
            $user = (new User)->getConnection()->transaction(function () use ($id, $email, $identity): ?User {
                $account = ConnectedAccount::query()
                    ->where('provider', 'google')->where('provider_id', $id)->first();

                if ($account !== null) {
                    return $account->user;
                }

                if (User::withTrashed()->whereRaw('LOWER(email) = ?', [$email])->exists()) {
                    return null;
                }

                $user = new User;
                $user->forceFill([
                    'name' => Str::limit($identity->getName() ?: 'Google user', 255, ''),
                    'email' => $email,
                    'email_verified_at' => now(),
                    'password' => Str::random(64),
                    'is_superadmin' => false,
                ])->save();
                $user->assignParticipantRole();
                $user->connectedAccounts()->create([
                    'provider' => 'google',
                    'provider_id' => $id,
                    'email' => $email,
                ]);

                return $user;
            });
        } catch (Throwable) {
            return $this->failure('Google sign-in could not be completed. Please use email and password or try again.');
        } finally {
            $request->session()->forget('state');
        }

        if ($user === null || $user->trashed() || $user->disabled_at !== null || ! $user->hasVerifiedEmail()) {
            return $this->failure('This account cannot use Google sign-in. Please sign in with email and password or contact support.');
        }

        if ($user->is_superadmin || $user->hasRole('admin')) {
            return $this->failure(__('Admin accounts must sign in with email and password.'));
        }

        if ($user->two_factor_secret !== null || $user->two_factor_confirmed_at !== null) {
            return $this->failure('Two-factor authentication is enabled. Please sign in with email and password.');
        }

        Auth::guard('web')->login($user);
        $request->session()->regenerate();
        $request->session()->forget('url.intended');

        return redirect()->route('portal');
    }

    private function failure(string $message): RedirectResponse
    {
        return redirect()->route('login')->withErrors(['google' => $message]);
    }
}
