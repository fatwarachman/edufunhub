<?php

namespace App\Http\Controllers;

use App\Services\RoomPinLookup;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\RedirectResponse;

/**
 * "Join with a PIN" from anywhere: the player types only the room code and
 * lands in the right game without opening it first.
 */
class JoinByPinController extends Controller
{
    public function __construct(private RoomPinLookup $rooms) {}

    /** Rooms owning the PIN, for the join dialog. */
    public function lookup(string $pin): JsonResponse
    {
        return response()->json(['rooms' => $this->rooms->find($pin)]);
    }

    /**
     * Short link /join/{pin}: straight into the game when exactly one game
     * owns the PIN, otherwise the portal opens the join dialog with it.
     */
    public function __invoke(string $pin): RedirectResponse
    {
        $rooms = $this->rooms->find($pin);

        if (count($rooms) === 1) {
            return redirect($rooms[0]['url']);
        }

        return redirect()->route('portal', ['join' => $pin]);
    }
}
