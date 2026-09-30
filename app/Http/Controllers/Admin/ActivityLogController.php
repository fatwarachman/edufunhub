<?php

namespace App\Http\Controllers\Admin;

use App\Http\Controllers\Controller;
use Illuminate\Http\Request;
use Inertia\Inertia;
use Inertia\Response;
use Spatie\Activitylog\Models\Activity;

class ActivityLogController extends Controller
{
    /**
     * Paginated activity log with search and optional filter by log_name.
     */
    public function index(Request $request): Response
    {
        $query = Activity::query()
            ->with('causer', 'subject')
            ->when($request->search, function ($q, string $search): void {
                $q->where('description', 'like', "%{$search}%");
            })
            ->when($request->log_name, function ($q, string $logName): void {
                $q->where('log_name', $logName);
            })
            ->when($request->causer_id, function ($q, int $causerId): void {
                $q->where('causer_id', $causerId);
            })
            ->orderByDesc('created_at');

        return Inertia::render('admin/activity-log/index', [
            'activities' => $query->paginate(25)->withQueryString(),
            'filters'    => $request->only(['search', 'log_name', 'causer_id']),
        ]);
    }
}
