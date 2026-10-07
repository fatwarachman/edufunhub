<?php

namespace App\Http\Controllers;

use App\Services\PlayerLeaderboards;
use App\Services\PlayerPortal;
use Illuminate\Http\Request;
use Inertia\Inertia;
use Inertia\Response;

class LeaderboardController extends Controller
{
    /**
     * Leaderboard detail page: overall ranking per period, schools and per game.
     * School and game boards are heavier aggregates, so they load deferred.
     */
    public function __invoke(Request $request, PlayerPortal $portal, PlayerLeaderboards $leaderboards): Response
    {
        $user = $request->user();

        return Inertia::render('leaderboard/index', [
            'overall' => $portal->leaderboards($user, 20),
            'games' => $leaderboards->pointGames(),
            'schools' => Inertia::defer(fn (): array => $leaderboards->schools($user), 'boards'),
            'gameBoards' => Inertia::defer(fn (): array => $leaderboards->games($user), 'boards'),
        ]);
    }
}
