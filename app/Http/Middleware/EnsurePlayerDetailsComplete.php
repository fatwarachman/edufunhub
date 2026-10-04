<?php

namespace App\Http\Middleware;

use App\Models\User;
use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

/**
 * Signed-in participants must provide their date of birth and last school
 * before they can open or start any game. Guests keep the public demos.
 */
class EnsurePlayerDetailsComplete
{
    public function handle(Request $request, Closure $next): Response
    {
        $user = $request->user();

        if (! $user instanceof User || $user->hasCompletePlayerDetails()) {
            return $next($request);
        }

        $message = __('character.player_details_required');

        if ($request->expectsJson()) {
            return response()->json(['message' => $message, 'code' => 'player_details_required'], 403);
        }

        return redirect()->route('portal')->with('player_details_required', $message);
    }
}
