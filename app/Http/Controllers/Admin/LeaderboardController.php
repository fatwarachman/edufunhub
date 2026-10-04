<?php

namespace App\Http\Controllers\Admin;

use App\Http\Controllers\Controller;
use App\Services\GameAnalytics;
use Illuminate\Http\Request;
use Inertia\Inertia;
use Inertia\Response;

class LeaderboardController extends Controller
{
    public function __construct(public GameAnalytics $analytics) {}

    public function index(Request $request): Response
    {
        $games = $this->analytics->catalogGames();
        $filters = [
            'game' => $games->contains('key', $request->query('game')) ? (string) $request->query('game') : null,
            'level' => array_key_exists((string) $request->query('level'), GameAnalytics::LEVELS) ? (string) $request->query('level') : null,
            'grade' => ($grade = (int) $request->query('grade')) >= 1 && $grade <= 12 ? $grade : null,
            'age' => array_key_exists((string) $request->query('age'), GameAnalytics::AGE_GROUPS) ? (string) $request->query('age') : null,
            'school' => mb_substr(trim((string) $request->query('school')), 0, 120) ?: null,
            'days' => in_array((int) $request->query('days'), [7, 30, 90], true) ? (int) $request->query('days') : 0,
        ];

        return Inertia::render('admin/leaderboard/index', [
            'filters' => $filters,
            'games' => $games->values(),
            'ageGroups' => array_keys(GameAnalytics::AGE_GROUPS),
            'levels' => array_keys(GameAnalytics::LEVELS),
            'entries' => $this->analytics->leaderboard($filters),
            'schools' => $this->analytics->schoolLeaderboard($filters['game'], $filters['days']),
        ]);
    }
}
