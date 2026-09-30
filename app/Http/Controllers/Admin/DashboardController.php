<?php

namespace App\Http\Controllers\Admin;

use App\Http\Controllers\Controller;
use App\Models\Permission;
use App\Models\Role;
use App\Models\User;
use Illuminate\Support\Facades\DB;
use Inertia\Inertia;
use Inertia\Response;

class DashboardController extends Controller
{
    /**
     * Render the admin dashboard with aggregate stats and recent activity.
     */
    public function index(): Response
    {
        $stats = [
            'total_users'       => User::query()->count(),
            'active_users'      => User::query()->where('last_seen_at', '>=', now()->subDays(30))->count(),
            'total_roles'       => Role::query()->count(),
            'total_permissions' => Permission::query()->count(),
        ];

        // Pull recent activity from the activity_log table (Spatie Activitylog).
        // Falls back to empty array when table is empty or model unavailable.
        $recentActivity = [];

        try {
            $recentActivity = DB::table('activity_log')
                ->orderByDesc('created_at')
                ->limit(10)
                ->get()
                ->map(fn ($row) => [
                    'id'           => $row->id,
                    'log_name'     => $row->log_name ?? 'default',
                    'description'  => $row->description,
                    'subject_type' => $row->subject_type,
                    'subject_id'   => $row->subject_id,
                    'causer_type'  => $row->causer_type,
                    'causer_id'    => $row->causer_id,
                    'causer_name'  => null,
                    'properties'   => json_decode($row->properties ?? '{}', true),
                    'created_at'   => $row->created_at,
                ])
                ->toArray();

            // Enrich with causer names in one query
            $causerIds = collect($recentActivity)
                ->where('causer_type', '=', User::class)
                ->pluck('causer_id')
                ->unique()
                ->filter()
                ->values();

            if ($causerIds->isNotEmpty()) {
                $names = User::query()
                    ->whereIn('id', $causerIds)
                    ->pluck('name', 'id');

                $recentActivity = array_map(function ($row) use ($names) {
                    if ($row['causer_type'] === User::class && $row['causer_id']) {
                        $row['causer_name'] = $names[$row['causer_id']] ?? null;
                    }

                    return $row;
                }, $recentActivity);
            }
        } catch (\Throwable) {
            // activity_log table may not exist yet — keep empty array
        }

        return Inertia::render('admin/dashboard', [
            'stats'          => $stats,
            'recentActivity' => $recentActivity,
        ]);
    }
}
