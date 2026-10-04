<?php

namespace App\Http\Controllers\Admin;

use App\Http\Controllers\Controller;
use App\Services\GameAnalytics;
use Illuminate\Http\Request;
use Inertia\Inertia;
use Inertia\Response;

class GameStatisticsController extends Controller
{
    public function __construct(public GameAnalytics $analytics) {}

    public function index(): Response
    {
        return Inertia::render('admin/games/index', [
            'games' => $this->analytics->overview(),
        ]);
    }

    public function show(Request $request, string $game): Response
    {
        abort_unless($this->analytics->gameExists($game), 404);

        $days = in_array((int) $request->query('days'), [7, 30, 90], true) ? (int) $request->query('days') : 0;
        $meta = $this->analytics->catalogGames()->firstWhere('key', $game);

        return Inertia::render('admin/games/show', [
            'game' => $meta,
            'days' => $days,
            'stats' => $this->analytics->detail($game, $days),
            'passPercent' => GameAnalytics::PASS_PERCENT,
        ]);
    }
}
