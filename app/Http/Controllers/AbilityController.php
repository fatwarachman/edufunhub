<?php

namespace App\Http\Controllers;

use App\Services\PlayerAbility;
use Illuminate\Http\Request;
use Inertia\Inertia;
use Inertia\Response;

/**
 * Page of one finished ability analysis, opened from the short link a
 * player shares to WhatsApp (/a/{code}), or the player's own latest one
 * from the header (/ability). Signed-in users only.
 */
class AbilityController extends Controller
{
    /**
     * The signed-in player's own latest analysis (header shortcut); shows an
     * empty state until an analysis has finished.
     */
    public function mine(Request $request, PlayerAbility $abilities): Response
    {
        $user = $request->user();
        $user->loadMissing('playerProfile:id,user_id,nickname');
        $latest = $abilities->latestFor($user);
        $ability = $abilities->present($latest);

        return Inertia::render('ability/show', [
            'ability' => $ability,
            'ownerName' => $user->playerProfile?->nickname ?: $user->name,
            'progress' => $ability ? $abilities->progress($latest) : null,
            'history' => $ability ? $abilities->history($latest) : [],
        ]);
    }

    /**
     * Shared analysis page. Progress and history are only added for the
     * owner, so a shared link never exposes the player's other analyses.
     */
    public function show(Request $request, string $code, PlayerAbility $abilities): Response
    {
        $assessment = $abilities->findByCode($code);
        $ability = $abilities->present($assessment);

        abort_if($ability === null, 404);

        $owner = $assessment->user()->with('playerProfile:id,user_id,nickname')->first(['id', 'name']);

        $isOwner = $request->user()?->id === $assessment->user_id;

        return Inertia::render('ability/show', [
            'ability' => $ability,
            'ownerName' => $owner?->playerProfile?->nickname ?: ($owner?->name ?? ''),
            'progress' => $isOwner ? $abilities->progress($assessment) : null,
            'history' => $isOwner ? $abilities->history($assessment) : [],
        ]);
    }
}
