<?php

namespace Database\Seeders;

use App\Models\Module;
use App\Models\Permission;
use App\Models\Role;
use App\Models\User;
use Illuminate\Database\Seeder;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Str;

class RolePermissionSeeder extends Seeder
{
    /**
     * Seed roles, modules, permissions, and default admin user.
     */
    public function run(): void
    {
        // ── 1. Modules ──────────────────────────────────────────────
        $moduleDefinitions = [
            'User Management'     => ['icon' => 'users',       'description' => 'Manage system users'],
            'Role Management'     => ['icon' => 'shield',      'description' => 'Manage roles and permissions'],
            'Game Management'     => ['icon' => 'gamepad-2',   'description' => 'Manage educational games'],
            'Content Management'  => ['icon' => 'file-text',   'description' => 'Manage content and quizzes'],
            'System Settings'     => ['icon' => 'settings',    'description' => 'Configure system settings'],
            'Activity Log'        => ['icon' => 'activity',    'description' => 'View system activity logs'],
        ];

        $actions = ['view', 'create', 'edit', 'delete'];

        $permissionModelBySlug = [];

        foreach ($moduleDefinitions as $moduleName => $meta) {
            $module = Module::updateOrCreate(
                ['slug' => Str::slug($moduleName)],
                [
                    'name'        => $moduleName,
                    'icon'        => $meta['icon'],
                    'description' => $meta['description'],
                    'is_active'   => true,
                ]
            );

            foreach ($actions as $action) {
                $slug = Str::slug($moduleName) . '-' . $action;
                $permission = Permission::updateOrCreate(
                    ['slug' => $slug],
                    [
                        'name'        => ucfirst($action) . ' ' . $moduleName,
                        'module_id'   => $module->id,
                        'description' => ucfirst($action) . ' ' . strtolower($moduleName),
                    ]
                );

                $permissionModelBySlug[$slug] = $permission;
            }
        }

        // ── 2. Roles ────────────────────────────────────────────────
        $allPermissionIds = collect($permissionModelBySlug)->pluck('id');

        // Super Admin — all permissions
        $superAdminRole = Role::updateOrCreate(
            ['slug' => 'super-admin'],
            ['name' => 'Super Admin', 'description' => 'Full system access', 'is_system' => true]
        );
        $superAdminRole->permissions()->sync($allPermissionIds);

        // Admin — everything except system-settings-delete and activity-log-delete
        $adminRole = Role::updateOrCreate(
            ['slug' => 'admin'],
            ['name' => 'Admin', 'description' => 'Administrative access', 'is_system' => true]
        );
        $adminPermissions = collect($permissionModelBySlug)
            ->reject(fn (Permission $p) => in_array($p->slug, ['system-settings-delete', 'activity-log-delete'], true))
            ->pluck('id');
        $adminRole->permissions()->sync($adminPermissions);

        // Editor — content + game management
        $editorRole = Role::updateOrCreate(
            ['slug' => 'editor'],
            ['name' => 'Editor', 'description' => 'Content management access', 'is_system' => false]
        );
        $editorPermissions = collect($permissionModelBySlug)
            ->filter(fn (Permission $p) => str_starts_with($p->slug, 'content-management-') || str_starts_with($p->slug, 'game-management-'))
            ->pluck('id');
        $editorRole->permissions()->sync($editorPermissions);

        // Moderator — view everything + limited edit
        $moderatorRole = Role::updateOrCreate(
            ['slug' => 'moderator'],
            ['name' => 'Moderator', 'description' => 'View and moderate content', 'is_system' => false]
        );
        $moderatorPermissions = collect($permissionModelBySlug)
            ->filter(fn (Permission $p) => str_contains($p->slug, '-view') || in_array($p->slug, [
                'content-management-edit',
                'game-management-edit',
                'user-management-edit',
            ], true))
            ->pluck('id');
        $moderatorRole->permissions()->sync($moderatorPermissions);

        // ── 3. Default admin user ───────────────────────────────────
        $admin = User::firstOrCreate(
            ['email' => 'admin@edufunhub.com'],
            [
                'name'              => 'Admin',
                'password'          => Hash::make('Admin@123456'),
                'email_verified_at' => now(),
                'is_superadmin'     => true,
                'onboarded_at'      => now(),
            ]
        );

        $admin->roles()->syncWithoutDetaching([$superAdminRole->id]);
    }
}
