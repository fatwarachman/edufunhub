<?php

namespace App\Mcp;

use App\Models\User;
use Closure;
use Illuminate\Auth\Access\AuthorizationException;
use Illuminate\Contracts\Auth\Authenticatable;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

class AdminAccess
{
    public static function authorize(?Authenticatable $actor): User
    {
        $user = $actor instanceof User ? User::query()->find($actor->getAuthIdentifier()) : null;
        if (! $user || ! $user->is_superadmin || $user->disabled_at !== null || ! $user->hasVerifiedEmail()) {
            throw new AuthorizationException;
        }

        return $user;
    }

    public function handle(Request $request, Closure $next): Response
    {
        self::authorize($request->user());

        return $next($request);
    }
}
