<?php

namespace App\Http\Controllers\Admin;

use App\Http\Controllers\Controller;
use App\Services\ServerMonitor;
use Inertia\Inertia;
use Inertia\Response;

class ServerMonitorController extends Controller
{
    /**
     * Live host and container resource usage. The page polls a partial reload
     * of `monitor`, so each poll returns a fresh (briefly cached) snapshot.
     */
    public function index(ServerMonitor $monitor): Response
    {
        return Inertia::render('admin/server-monitor', [
            'monitor' => fn (): array => $monitor->snapshot(),
            'refreshSeconds' => max(5, (int) config('monitoring.cache_seconds')),
        ]);
    }
}
