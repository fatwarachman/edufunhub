<?php

namespace App\Http\Controllers;

use Illuminate\Http\RedirectResponse;

/**
 * Standard invite link for every multiplayer game: /games/{game}/join/{pin}.
 * Guests are sent to sign in first (auth middleware keeps the intended URL)
 * and land on the game page with the room PIN, which joins the room.
 */
class GameInviteController extends Controller
{
    public function __invoke(string $game, string $pin): RedirectResponse
    {
        $entry = collect(config('game-catalog.categories'))
            ->flatMap(fn (array $category): array => $category['games'])
            ->first(fn (array $candidate): bool => $candidate['key'] === $game && ($candidate['multiplayer'] ?? false));

        abort_if($entry === null, 404);

        return redirect()->route($entry['route'], ['pin' => $pin]);
    }
}
