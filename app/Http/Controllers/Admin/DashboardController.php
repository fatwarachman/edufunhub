<?php

namespace App\Http\Controllers\Admin;

use App\Http\Controllers\Controller;
use App\Models\Permission;
use App\Models\Role;
use App\Models\User;
use App\Services\DeviceAnalytics;
use App\Services\UserAnalytics;
use Inertia\Inertia;
use Inertia\Response;
use Spatie\Activitylog\Models\Activity;

class DashboardController extends Controller
{
    /**
     * Render the admin dashboard: platform KPIs, game activity, player demographics and recent activity.
     */
    public function index(UserAnalytics $analytics, DeviceAnalytics $devices): Response
    {
        $newUsers30d = User::query()->where('created_at', '>=', now()->subDays(30))->count();
        $previous30d = User::query()->whereBetween('created_at', [now()->subDays(60), now()->subDays(30)])->count();

        return Inertia::render('admin/dashboard', [
            ...$analytics->dashboard(),
            'devices' => $devices->summary(),
            'metrics' => [
                'total_users' => User::query()->count(),
                'total_superadmins' => User::query()->where('is_superadmin', true)->count(),
                'total_roles' => Role::query()->count(),
                'total_permissions' => Permission::query()->count(),
                'new_users_30d' => $newUsers30d,
                'user_growth_percent' => $previous30d > 0 ? round(($newUsers30d - $previous30d) / $previous30d * 100, 1) : null,
            ],
            'sparklines' => [
                'new_users' => collect(range(6, 0))->map(fn (int $ago): int => User::query()->whereDate('created_at', now()->subDays($ago)->toDateString())->count())->all(),
            ],
            'dailySignups' => collect(range(29, 0))->map(fn (int $ago): array => [
                'date' => now()->subDays($ago)->toDateString(),
                'count' => User::query()->whereDate('created_at', now()->subDays($ago)->toDateString())->count(),
            ])->all(),
            'roleDistribution' => Role::query()->withCount('users')->orderByDesc('users_count')->get(['id', 'name', 'slug'])
                ->map(fn (Role $role): array => ['name' => $role->name, 'slug' => $role->slug, 'count' => $role->users_count])->all(),
            'recent_users' => User::query()->latest('id')->limit(5)->get(['id', 'name', 'email', 'created_at']),
            'recentActivity' => Activity::query()->with('causer')->latest('id')->limit(8)->get()
                ->map(fn (Activity $activity): array => [
                    'id' => $activity->id,
                    'description' => $activity->description,
                    'log_name' => $activity->log_name,
                    'subject_type' => $activity->subject_type ? class_basename($activity->subject_type) : null,
                    'causer_name' => $activity->causer?->name,
                    'created_at' => $activity->created_at?->toIso8601String(),
                ])->all(),
        ]);
    }
}
