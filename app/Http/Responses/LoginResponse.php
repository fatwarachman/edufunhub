<?php

namespace App\Http\Responses;

use Illuminate\Http\JsonResponse;
use Laravel\Fortify\Contracts\LoginResponse as LoginResponseContract;
use Laravel\Fortify\Fortify;
use Symfony\Component\HttpFoundation\Response;

class LoginResponse implements LoginResponseContract
{
    /**
     * Redirect admins to the admin dashboard and players to the player dashboard.
     *
     * @param  \Illuminate\Http\Request  $request
     */
    public function toResponse($request): Response
    {
        if ($request->wantsJson()) {
            return new JsonResponse(['two_factor' => false]);
        }

        $user = $request->user();

        if ($user !== null && ($user->is_superadmin || $user->hasRole('admin'))) {
            return redirect()->intended(route('admin.dashboard'));
        }

        return redirect()->intended(Fortify::redirects('login'));
    }
}
