<?php

namespace App\Http\Controllers\Auth;

use App\Http\Controllers\Controller;
use Illuminate\Http\Request;
use Inertia\Inertia;
use Inertia\Response;

class RegisterController extends Controller
{
    /**
     * Show the registration form via Inertia.
     */
    public function showRegisterForm(Request $request): Response
    {
        return Inertia::render('auth/register', [
            'email'    => $request->query('email'),
            'redirect' => $request->query('redirect'),
        ]);
    }
}
