<?php

namespace App\Http\Controllers\Auth;

use App\Http\Controllers\Controller;
use Inertia\Inertia;
use Inertia\Response;

class RegisterController extends Controller
{
    /**
     * Sign-up page: new accounts are created only with a Google account.
     */
    public function showRegisterForm(): Response
    {
        return Inertia::render('auth/register', [
            'googleEnabled' => GoogleAuthController::enabled(),
            'googleRedirectUrl' => GoogleAuthController::enabled() ? route('google.redirect') : null,
        ]);
    }
}
