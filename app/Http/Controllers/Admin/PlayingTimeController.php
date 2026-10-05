<?php

namespace App\Http\Controllers\Admin;

use App\Http\Controllers\Controller;
use App\Services\GameAnalytics;
use App\Services\PlayingTimeAnalytics;
use Illuminate\Http\Request;
use Inertia\Inertia;
use Inertia\Response;

/**
 * Playing time per player and per game.
 */
class PlayingTimeController extends Controller
{
    public function index(Request $request, PlayingTimeAnalytics $analytics, GameAnalytics $games): Response
    {
        $catalog = $games->catalogGames();
        $filters = [
            'days' => in_array((int) $request->query('days'), PlayingTimeAnalytics::RANGES, true) ? (int) $request->query('days') : 0,
            'game' => $catalog->contains('key', $request->query('game')) ? (string) $request->query('game') : null,
            'search' => mb_substr(trim((string) $request->query('search', '')), 0, 100) ?: null,
        ];

        return Inertia::render('admin/playing-time/index', [
            'filters' => $filters,
            'games' => $catalog->map(fn (array $game): array => ['key' => $game['key'], 'accent' => $game['accent']])->values(),
            'report' => $analytics->report($filters),
            'playerLimit' => PlayingTimeAnalytics::PLAYER_LIMIT,
        ]);
    }
}
