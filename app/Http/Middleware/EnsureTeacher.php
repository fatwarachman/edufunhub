<?php

namespace App\Http\Middleware;

use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

/**
 * Teacher portal access: users with the "guru" role, or super admins.
 */
class EnsureTeacher
{
    public function handle(Request $request, Closure $next): Response
    {
        abort_unless($request->user()?->isTeacher() ?? false, 403);

        return $next($request);
    }
}
