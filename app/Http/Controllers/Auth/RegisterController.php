<?php

namespace App\Http\Controllers\Auth;

use App\Http\Controllers\Controller;
use App\Http\Requests\StoreEmailRegistrationRequest;
use App\Models\User;
use App\Services\GameReturnUrl;
use App\Services\RegistrationSettings;
use Illuminate\Auth\Events\Registered;
use Illuminate\Http\RedirectResponse;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\DB;
use Inertia\Inertia;
use Inertia\Response;
use Throwable;

class RegisterController extends Controller
{
    public function __construct(private RegistrationSettings $settings) {}

    /**
     * Sign-up page: Google always; email + password only when the super
     * admin has turned it on.
     */
    public function showRegisterForm(): Response
    {
        return Inertia::render('auth/register', [
            'googleEnabled' => GoogleAuthController::enabled(),
            'googleRedirectUrl' => GoogleAuthController::enabled() ? route('google.redirect') : null,
            'emailRegistrationEnabled' => $this->settings->emailEnabled(),
        ]);
    }

    /**
     * Create a player account from name, email and password, sign it in and
     * leave birth date, school and grade to the first-login profile wizard.
     */
    public function store(StoreEmailRegistrationRequest $request, GameReturnUrl $returnUrl): RedirectResponse
    {
        $data = $request->validated();

        $user = DB::transaction(function () use ($data): User {
            $user = new User;
            $user->forceFill([
                'name' => $data['name'],
                'email' => $data['email'],
                'password' => $data['password'],
                'locale' => app()->getLocale(),
                'is_superadmin' => false,
                'profile_completed_at' => null,
            ])->save();
            $user->assignParticipantRole();

            return $user;
        });

        try {
            event(new Registered($user));
        } catch (Throwable $exception) {
            report($exception);
        }

        $intended = $request->session()->pull('url.intended');
        Auth::guard('web')->login($user);
        $request->session()->regenerate();

        $gamePath = $returnUrl->pull($request, is_string($intended) ? $intended : null);

        return $gamePath !== null ? redirect($gamePath) : redirect()->route('portal');
    }
}
