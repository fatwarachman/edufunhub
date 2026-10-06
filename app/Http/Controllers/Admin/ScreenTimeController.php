<?php

namespace App\Http\Controllers\Admin;

use App\Http\Controllers\Controller;
use App\Services\ScreenTimeAnalytics;
use Illuminate\Http\Request;
use Inertia\Inertia;
use Inertia\Response;

/**
 * Super admin analytics of active app screen time per user and day.
 */
class ScreenTimeController extends Controller
{
    public function index(Request $request, ScreenTimeAnalytics $analytics): Response
    {
        $days = (int) $request->query('days', 7);
        $sort = (string) $request->query('sort', 'avg');
        $filters = [
            'days' => in_array($days, ScreenTimeAnalytics::RANGES, true) ? $days : 7,
            'search' => mb_substr(trim((string) $request->query('search', '')), 0, 100) ?: null,
            'sort' => in_array($sort, ScreenTimeAnalytics::SORTS, true) ? $sort : 'avg',
            'direction' => $request->query('direction') === 'asc' ? 'asc' : 'desc',
            'page' => max(1, (int) $request->query('page', 1)),
            'user' => $request->filled('user') ? max(0, (int) $request->query('user')) ?: null : null,
        ];

        return Inertia::render('admin/screen-time/index', [
            'filters' => $filters,
            'limitMinutes' => intdiv($analytics->limitSeconds(), 60),
            'timezone' => $analytics->timezone(),
            'overview' => Inertia::defer(fn (): array => $analytics->overview($filters['days']), 'overview'),
            'users' => Inertia::defer(fn (): array => $analytics->users($filters), 'users'),
            'drilldown' => Inertia::defer(fn (): ?array => $filters['user'] ? $analytics->forUser($filters['user'], $filters['days']) : null, 'users'),
        ]);
    }
}
