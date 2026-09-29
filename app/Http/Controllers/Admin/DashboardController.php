<?php

namespace App\Http\Controllers\Admin;

use App\Http\Controllers\Controller;
use App\Models\Permission;
use App\Models\Role;
use App\Models\User;
use Illuminate\Http\JsonResponse;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;
use Inertia\Inertia;
use Inertia\Response;

class DashboardController extends Controller
{
    /**
     * Display the admin dashboard with user management metrics.
     */
    public function index(): Response
    {
        $now = Carbon::now();
        $thirtyDaysAgo = $now->copy()->subDays(30);
        $sixtyDaysAgo = $now->copy()->subDays(60);

        // Core counts
        $totalUsers = User::count();
        $totalRoles = Role::count();
        $totalPermissions = Permission::count();
        $totalSuperadmins = User::where('is_superadmin', true)->count();

        // Growth: users registered in last 30d vs prior 30d
        $newUsersThisPeriod = User::where('created_at', '>=', $thirtyDaysAgo)->count();
        $newUsersPriorPeriod = User::whereBetween('created_at', [$sixtyDaysAgo, $thirtyDaysAgo])->count();
        $userGrowthPercent = $newUsersPriorPeriod > 0
            ? round((($newUsersThisPeriod - $newUsersPriorPeriod) / $newUsersPriorPeriod) * 100, 1)
            : ($newUsersThisPeriod > 0 ? 100 : 0);

        // Daily signups for the last 14 days (1 query instead of 14)
        $fourteenDaysAgo = $now->copy()->subDays(13)->startOfDay();
        $signupCounts = User::where('created_at', '>=', $fourteenDaysAgo)
            ->select(DB::raw('DATE(created_at) as date'), DB::raw('COUNT(*) as count'))
            ->groupBy('date')
            ->pluck('count', 'date');

        $dailySignups = collect(range(13, 0))->map(function ($daysAgo) use ($now, $signupCounts) {
            $date = $now->copy()->subDays($daysAgo)->toDateString();

            return [
                'date' => Carbon::parse($date)->format('M d'),
                'count' => $signupCounts->get($date, 0),
            ];
        })->values();

        // Users per role distribution
        $roleDistribution = Role::query()
            ->withCount('users')
            ->orderByDesc('users_count')
            ->get()
            ->map(fn (Role $role) => [
                'role' => $role->name,
                'count' => $role->users_count,
            ])
            ->toArray();

        // 7-day sparkline data for metric cards (1 query instead of 7)
        $sevenDaysAgo = $now->copy()->subDays(6)->startOfDay();

        $sparkUserCounts = User::where('created_at', '>=', $sevenDaysAgo)
            ->select(DB::raw('DATE(created_at) as date'), DB::raw('COUNT(*) as count'))
            ->groupBy('date')
            ->pluck('count', 'date');

        $sparklines = [
            'new_users' => collect(range(6, 0))->map(fn ($d) => $sparkUserCounts->get($now->copy()->subDays($d)->toDateString(), 0))->values()->toArray(),
        ];

        return Inertia::render('admin/dashboard', [
            'metrics' => [
                'total_users' => $totalUsers,
                'total_roles' => $totalRoles,
                'total_permissions' => $totalPermissions,
                'total_superadmins' => $totalSuperadmins,
                'new_users_30d' => $newUsersThisPeriod,
                'user_growth_percent' => $userGrowthPercent,
            ],
            'sparklines' => $sparklines,
            'dailySignups' => $dailySignups,
            'roleDistribution' => $roleDistribution,
            'recent_users' => User::latest()->limit(5)->get(['id', 'name', 'email', 'created_at']),
        ]);
    }

    /**
     * Return compact quick stats for the admin sidebar widget.
     */
    public function quickStats(): JsonResponse
    {
        return response()->json([
            'total_users' => User::count(),
            'total_roles' => Role::count(),
            'total_permissions' => Permission::count(),
        ]);
    }
}
