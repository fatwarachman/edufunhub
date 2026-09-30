<?php

namespace App\Http\Controllers\Auth;

use App\Http\Controllers\Controller;
use Illuminate\Http\Request;
use Inertia\Inertia;
use Inertia\Response;
use Laravel\Fortify\Features;

class LoginController extends Controller
{
    /**
     * Show the login form via Inertia.
     */
    public function showLoginForm(Request $request): Response
    {
        return Inertia::render('auth/login', [
            'googleEnabled' => GoogleAuthController::enabled(),
            'googleRedirectUrl' => GoogleAuthController::enabled() ? route('google.redirect') : null,
            'canResetPassword' => Features::enabled(Features::resetPasswords()),
            'canRegister' => Features::enabled(Features::registration()),
            'status' => $request->session()->get('status'),
            'email' => $request->query('email'),
            'redirect' => $request->query('redirect'),
        ]);
    }
}
