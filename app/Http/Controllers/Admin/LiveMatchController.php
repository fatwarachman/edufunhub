<?php

namespace App\Http\Controllers\Admin;

use App\Http\Controllers\Controller;
use App\Services\LiveMatchMonitor;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Inertia\Inertia;
use Inertia\Response;

/**
 * Admin spectator page for one live room: the page polls `state` for a
 * read-only snapshot from the game service (no WebSocket, no seat, no input).
 */
class LiveMatchController extends Controller
{
    public function show(Request $request, string $game, string $pin, LiveMatchMonitor $monitor): Response
    {
        activity()->causedBy($request->user())->withProperties(['game' => $game, 'pin' => $pin])->log('Watched live match');

        return Inertia::render('admin/matches/live', [
            'game' => $game,
            'pin' => $pin,
            'room' => $monitor->spectate($game, $pin, app()->getLocale()),
            'stateUrl' => route('admin.matches.live.state', ['game' => $game, 'pin' => $pin]),
        ]);
    }

    public function state(string $game, string $pin, LiveMatchMonitor $monitor): JsonResponse
    {
        return response()->json(['room' => $monitor->spectate($game, $pin, app()->getLocale())])
            ->header('Cache-Control', 'no-store');
    }
}
