<?php

namespace App\Http\Controllers\Admin;

use App\Http\Controllers\Controller;
use App\Models\Permission;
use App\Models\Role;
use Inertia\Inertia;
use Inertia\Response;

class PermissionController extends Controller
{
    /**
     * Read-only list of all permissions with module name + roles for badges.
     */
    public function index(): Response
    {
        $permissions = Permission::query()
            ->join('modules', 'permissions.module_id', '=', 'modules.id')
            ->select('permissions.*', 'modules.name as module')
            ->orderBy('modules.name')
            ->orderBy('permissions.name')
            ->get();

        $roles = Role::query()
            ->with('permissions:id')
            ->select('id', 'name', 'slug')
            ->get();

        return Inertia::render('admin/permissions/index', [
            'permissions' => $permissions,
            'roles'       => $roles,
        ]);
    }
}
