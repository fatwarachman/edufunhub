<?php

namespace App\Http\Controllers\Admin;

use App\Http\Controllers\Controller;
use App\Services\GameAnalytics;
use App\Services\UserAnalytics;
use Illuminate\Http\Request;
use Inertia\Inertia;
use Inertia\Response;

class UserStatisticsController extends Controller
{
    /**
     * Player demographics by school, age and grade.
     */
    public function index(Request $request, UserAnalytics $analytics): Response
    {
        $filters = [
            'level' => array_key_exists((string) $request->query('level'), GameAnalytics::LEVELS) ? $request->query('level') : null,
            'school' => mb_substr(trim((string) $request->query('school', '')), 0, 100) ?: null,
        ];

        return Inertia::render('admin/user-statistics/index', [
            'filters' => (object) array_filter($filters),
            'stats' => $analytics->demographics($filters),
            'ageGroups' => array_keys(GameAnalytics::AGE_GROUPS),
        ]);
    }
}
