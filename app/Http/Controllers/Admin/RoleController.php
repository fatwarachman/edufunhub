<?php

namespace App\Http\Controllers\Admin;

use App\Http\Controllers\Controller;
use App\Http\Requests\Admin\StoreRoleRequest;
use App\Http\Requests\Admin\UpdateRoleRequest;
use App\Models\Module;
use App\Models\Role;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Inertia\Inertia;
use Inertia\Response;

class RoleController extends Controller
{
    /**
     * All roles with permission count and user count.
     */
    public function index(): Response
    {
        $roles = Role::query()
            ->withCount(['permissions', 'users'])
            ->orderBy('name')
            ->paginate(20);

        return Inertia::render('admin/roles/index', [
            'roles' => $roles,
        ]);
    }

    /**
     * Show form to create a new role with available permissions grouped by module.
     */
    public function create(): Response
    {
        return Inertia::render('admin/roles/create', [
            'modules' => Module::query()->with('permissions:id,name,slug,module_id')->where('is_active', true)->get(),
        ]);
    }

    /**
     * Persist a new role and attach selected permissions.
     */
    public function store(StoreRoleRequest $request): RedirectResponse
    {
        $role = Role::create([
            'name'        => $request->name,
            'slug'        => $request->slug,
            'description' => $request->description,
        ]);

        if ($request->filled('permissions')) {
            $role->permissions()->sync($request->permissions);
        }

        activity()
            ->causedBy($request->user())
            ->performedOn($role)
            ->log('Created role');

        return redirect()->route('admin.roles.index')
            ->with('success', 'Role created successfully.');
    }

    /**
     * Show form to edit an existing role.
     */
    public function edit(Role $role): Response
    {
        if ($role->is_system) {
            abort(403, 'System roles cannot be edited.');
        }

        $role->load('permissions:id');

        return Inertia::render('admin/roles/edit', [
            'role'    => $role,
            'modules' => Module::query()->with('permissions:id,name,slug,module_id')->where('is_active', true)->get(),
        ]);
    }

    /**
     * Validate and update a role, syncing permissions.
     */
    public function update(UpdateRoleRequest $request, Role $role): RedirectResponse
    {
        if ($role->is_system) {
            abort(403, 'System roles cannot be edited.');
        }

        $role->update([
            'name'        => $request->name,
            'slug'        => $request->slug,
            'description' => $request->description,
        ]);

        if ($request->has('permissions')) {
            $role->permissions()->sync($request->permissions ?? []);
        }

        activity()
            ->causedBy($request->user())
            ->performedOn($role)
            ->log('Updated role');

        return redirect()->route('admin.roles.index')
            ->with('success', 'Role updated successfully.');
    }

    /**
     * Delete a role. System roles and roles with assigned users cannot be deleted.
     */
    public function destroy(Request $request, Role $role): RedirectResponse
    {
        if ($role->is_system) {
            abort(403, 'System roles cannot be deleted.');
        }

        if ($role->users()->count() > 0) {
            abort(403, 'Cannot delete a role that has users assigned.');
        }

        $role->permissions()->detach();
        $role->delete();

        activity()
            ->causedBy($request->user())
            ->performedOn($role)
            ->log('Deleted role');

        return redirect()->route('admin.roles.index')
            ->with('success', 'Role deleted successfully.');
    }
}
