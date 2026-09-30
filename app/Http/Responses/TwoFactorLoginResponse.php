<?php

namespace App\Http\Responses;

use Illuminate\Http\JsonResponse;
use Laravel\Fortify\Contracts\TwoFactorLoginResponse as TwoFactorLoginResponseContract;
use Laravel\Fortify\Fortify;
use Symfony\Component\HttpFoundation\Response;

class TwoFactorLoginResponse implements TwoFactorLoginResponseContract
{
    /**
     * Keep the admin/player destination after the two-factor challenge.
     *
     * @param  \Illuminate\Http\Request  $request
     */
    public function toResponse($request): Response
    {
        if ($request->wantsJson()) {
            return new JsonResponse('', 204);
        }

        $user = $request->user();

        if ($user !== null && ($user->is_superadmin || $user->hasRole('admin'))) {
            return redirect()->intended(route('admin.dashboard'));
        }

        return redirect()->intended(Fortify::redirects('login'));
    }
}
