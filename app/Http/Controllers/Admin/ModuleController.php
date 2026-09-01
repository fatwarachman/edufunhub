<?php

namespace App\Http\Controllers\Admin;

use App\Http\Controllers\Controller;
use App\Models\Module;
use App\Models\Permission;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Str;
use Inertia\Inertia;
use Inertia\Response;

class ModuleController extends Controller
{
    /**
     * Display the modules management page.
     */
    public function index(): Response
    {
        $modules = Module::query()
            ->withCount('permissions')
            ->with('permissions:id,slug,name,module_id')
            ->orderBy('name')
            ->get();

        return Inertia::render('admin/modules', [
            'modules' => $modules,
        ]);
    }

    /**
     * Store a new module with default permissions (view/create/edit/delete).
     */
    public function store(Request $request): RedirectResponse
    {
        $validated = $request->validate([
            'name' => ['required', 'string', 'max:100', 'unique:modules,name'],
            'icon' => ['nullable', 'string', 'max:50'],
            'description' => ['nullable', 'string', 'max:255'],
        ]);

        $module = Module::create([
            'name' => $validated['name'],
            'slug' => Str::slug($validated['name']),
            'icon' => $validated['icon'] ?? null,
            'description' => $validated['description'] ?? null,
            'is_active' => true,
        ]);

        // Auto-generate default CRUD permissions for the module.
        foreach (['view', 'create', 'edit', 'delete'] as $action) {
            Permission::create([
                'name' => ucfirst($action).' '.$module->name,
                'slug' => $module->slug.'-'.$action,
                'module_id' => $module->id,
                'description' => ucfirst($action).' modul '.$module->name,
            ]);
        }

        return redirect()->back()->with('success', "Modul \"{$validated['name']}\" dibuat dengan 4 permission default.");
    }

    /**
     * Toggle module active status.
     */
    public function toggle(Request $request, Module $module): RedirectResponse
    {
        $module->update([
            'is_active' => ! $module->is_active,
        ]);

        return redirect()->back()->with('success', "Modul \"{$module->name}\" ".($module->is_active ? 'diaktifkan' : 'dinonaktifkan').'.');
    }

    /**
     * Delete a module (cascades to its permissions).
     */
    public function destroy(Module $module): RedirectResponse
    {
        $name = $module->name;
        $module->delete();

        return redirect()->back()->with('success', "Modul \"{$name}\" dihapus.");
    }
}
