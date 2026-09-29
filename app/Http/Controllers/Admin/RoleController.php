<?php

namespace App\Http\Controllers\Admin;

use App\Http\Controllers\Controller;
use App\Models\Module;
use App\Models\Role;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Str;
use Illuminate\Validation\Rule;
use Inertia\Inertia;
use Inertia\Response;

class RoleController extends Controller
{
    /**
     * Display the roles management page.
     */
    public function index(): Response
    {
        $roles = Role::query()
            ->withCount('users')
            ->with('permissions:id,slug,name,module_id')
            ->orderBy('is_system', 'desc')
            ->orderBy('name')
            ->get();

        $modules = Module::query()
            ->with('permissions:id,slug,name,module_id')
            ->orderBy('name')
            ->get();

        return Inertia::render('admin/roles', [
            'roles' => $roles,
            'modules' => $modules,
        ]);
    }

    /**
     * Store a new role.
     */
    public function store(Request $request): RedirectResponse
    {
        $validated = $request->validate([
            'name' => ['required', 'string', 'max:100', 'unique:roles,name'],
            'description' => ['nullable', 'string', 'max:255'],
            'permissions' => ['nullable', 'array'],
            'permissions.*' => ['integer', 'exists:permissions,id'],
        ]);

        $role = Role::create([
            'name' => $validated['name'],
            'slug' => Str::slug($validated['name']),
            'description' => $validated['description'] ?? null,
            'is_system' => false,
        ]);

        $role->permissions()->sync($validated['permissions'] ?? []);

        return redirect()->back()->with('success', "Role \"{$validated['name']}\" dibuat.");
    }

    /**
     * Update an existing role.
     */
    public function update(Request $request, Role $role): RedirectResponse
    {
        $validated = $request->validate([
            'name' => ['required', 'string', 'max:100', Rule::unique('roles', 'name')->ignore($role->id)],
            'description' => ['nullable', 'string', 'max:255'],
            'permissions' => ['nullable', 'array'],
            'permissions.*' => ['integer', 'exists:permissions,id'],
        ]);

        $role->update([
            'name' => $validated['name'],
            'slug' => Str::slug($validated['name']),
            'description' => $validated['description'] ?? null,
        ]);

        if (! $role->is_system || $request->input('permissions') !== null) {
            $role->permissions()->sync($validated['permissions'] ?? []);
        }

        return redirect()->back()->with('success', "Role \"{$validated['name']}\" diperbarui.");
    }

    /**
     * Delete a role.
     */
    public function destroy(Role $role): RedirectResponse
    {
        if ($role->is_system) {
            return redirect()->back()->with('error', 'Role sistem tidak dapat dihapus.');
        }

        $name = $role->name;
        $role->delete();

        return redirect()->back()->with('success', "Role \"{$name}\" dihapus.");
    }
}
