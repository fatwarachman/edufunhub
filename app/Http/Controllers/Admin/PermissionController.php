<?php

namespace App\Http\Controllers\Admin;

use App\Http\Controllers\Controller;
use App\Models\Module;
use Inertia\Inertia;
use Inertia\Response;

class PermissionController extends Controller
{
    /**
     * Read-only list of all permissions grouped by module.
     */
    public function index(): Response
    {
        $modules = Module::query()
            ->with('permissions:id,name,slug,module_id,description')
            ->where('is_active', true)
            ->orderBy('name')
            ->get();

        return Inertia::render('admin/permissions/index', [
            'modules' => $modules,
        ]);
    }
}
