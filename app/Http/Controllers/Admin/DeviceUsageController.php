<?php

namespace App\Http\Controllers\Admin;

use App\Http\Controllers\Controller;
use App\Http\Requests\Admin\DeviceAnalyticsRequest;
use App\Http\Requests\Admin\DeviceGamesRequest;
use App\Services\DeviceAnalytics;
use Inertia\Inertia;
use Inertia\Response;

/**
 * Full list behind the dashboard "Per game & browser" panel: every game
 * opened in the window with its device split and browser mix.
 */
class DeviceUsageController extends Controller
{
    public function index(DeviceAnalyticsRequest $request, DeviceAnalytics $devices): Response
    {
        return Inertia::render('admin/device-usage/index', $devices->detail(
            $request->days(),
            $request->string('os')->trim()->value() ?: null,
            $request->string('device')->trim()->value() ?: null,
            $request->string('role')->trim()->value() ?: null,
            (int) $request->integer('users_page', 1),
        ));
    }

    public function games(DeviceGamesRequest $request, DeviceAnalytics $devices): Response
    {
        $days = $request->days();
        $games = $devices->gameBreakdown($days);

        return Inertia::render('admin/device-usage/games', [
            'days' => $days,
            'dayOptions' => DeviceGamesRequest::DAY_OPTIONS,
            'games' => $games,
            'totals' => [
                'accesses' => array_sum(array_column($games, 'accesses')),
                'games' => count($games),
                'mobile' => array_sum(array_column($games, 'mobile')),
                'tablet' => array_sum(array_column($games, 'tablet')),
                'desktop' => array_sum(array_column($games, 'desktop')),
            ],
        ]);
    }
}
