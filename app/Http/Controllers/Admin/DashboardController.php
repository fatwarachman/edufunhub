<?php

namespace App\Http\Controllers\Admin;

use App\Http\Controllers\Controller;
use App\Models\Permission;
use App\Models\Role;
use App\Models\User;
use Inertia\Inertia;
use Inertia\Response;

class DashboardController extends Controller
{
    /**
     * Render the admin dashboard with aggregate stats.
     */
    public function index(): Response
    {
        $stats = [
            'total_users'   => User::query()->count(),
            'active_users'  => User::query()->where('last_seen_at', '>=', now()->subDays(30))->count(),
            'total_roles'   => Role::query()->count(),
            'total_permissions' => Permission::query()->count(),
        ];

        return Inertia::render('admin/dashboard', [
            'stats' => $stats,
        ]);
    }
}
