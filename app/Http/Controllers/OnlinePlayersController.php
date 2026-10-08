<?php

namespace App\Http\Controllers;

use App\Services\OnlinePlayers;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Inertia\Inertia;
use Inertia\Response;

/**
 * List of players online right now, opened from the dashboard counter.
 * Each card links to the public player page (with the chat button).
 */
class OnlinePlayersController extends Controller
{
    public function __invoke(Request $request, OnlinePlayers $online): Response
    {
        $page = max(1, $request->integer('page', 1));
        $players = $online->page($request->user(), $page);
        if ($page > $players->lastPage()) {
            $players = $online->page($request->user(), $players->lastPage());
        }

        return Inertia::render('players/online', [
            'players' => $players->items(),
            'pagination' => [
                'current_page' => $players->currentPage(),
                'last_page' => $players->lastPage(),
                'total' => $players->total(),
                'prev_page_url' => $players->previousPageUrl(),
                'next_page_url' => $players->nextPageUrl(),
            ],
            'source' => $online->source(),
        ]);
    }

    /** Live counter for the dashboard card, polled every few seconds. */
    public function count(OnlinePlayers $online): JsonResponse
    {
        return response()->json($online->summary())->header('Cache-Control', 'no-store, private');
    }
}
