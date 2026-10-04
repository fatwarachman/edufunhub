<?php

namespace Database\Seeders;

use App\Models\Module;
use App\Models\Permission;
use App\Models\Role;
use App\Models\User;
use App\Services\WorkspaceService;
use Illuminate\Database\Seeder;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Str;

class DatabaseSeeder extends Seeder
{
    /**
     * Seed the application's database.
     */
    public function run(): void
    {
        // 1. System modules with their permissions.
        $modules = [
            'Dashboard' => ['view' => 'Lihat dashboard'],
            'Quiz' => [
                'view' => 'Lihat quiz',
                'create' => 'Buat quiz',
                'edit' => 'Ubah quiz',
                'delete' => 'Hapus quiz',
            ],
            'Duel' => [
                'view' => 'Lihat duel',
                'create' => 'Buat duel',
                'manage' => 'Kelola duel',
            ],
            'Leaderboard' => ['view' => 'Lihat leaderboard'],
            'User' => [
                'view' => 'Lihat pengguna',
                'create' => 'Tambah pengguna',
                'edit' => 'Ubah pengguna',
                'delete' => 'Hapus pengguna',
            ],
            'Role' => [
                'view' => 'Lihat role',
                'create' => 'Tambah role',
                'edit' => 'Ubah role',
                'delete' => 'Hapus role',
            ],
            'Module' => [
                'view' => 'Lihat modul',
                'create' => 'Tambah modul',
                'edit' => 'Ubah modul',
                'delete' => 'Hapus modul',
            ],
            'Workspace' => [
                'view' => 'Lihat workspace',
                'manage' => 'Kelola workspace',
            ],
        ];

        $permissionModelBySlug = [];

        foreach ($modules as $moduleName => $permissions) {
            $module = Module::updateOrCreate(
                ['slug' => Str::slug($moduleName)],
                ['name' => $moduleName, 'is_active' => true]
            );

            foreach ($permissions as $action => $description) {
                $permission = Permission::updateOrCreate(
                    ['slug' => Str::slug($moduleName).'-'.$action],
                    [
                        'name' => ucfirst($action).' '.$moduleName,
                        'module_id' => $module->id,
                        'description' => $description,
                    ]
                );

                $permissionModelBySlug[$permission->slug] = $permission;
            }
        }

        // 2. Default roles.
        $roles = [
            'Super Admin' => 'Akses penuh ke seluruh sistem',
            'Admin' => 'Mengelola pengguna, quiz, dan konten',
            'Guru' => 'Membuat dan mengelola quiz untuk kelas',
            'Peserta' => 'Memainkan game edukasi',
        ];

        $roleModels = [];

        foreach ($roles as $roleName => $description) {
            $role = Role::updateOrCreate(
                ['slug' => Str::slug($roleName)],
                [
                    'name' => $roleName,
                    'description' => $description,
                    'is_system' => true,
                ]
            );

            $roleModels[$role->slug] = $role;
        }

        // 3. Permission assignments per role.
        // Super Admin: everything.
        $roleModels['super-admin']->permissions()->sync(collect($permissionModelBySlug)->pluck('id'));

        // Admin: all except role/module delete.
        $adminPermissions = collect($permissionModelBySlug)->filter(function (Permission $permission) {
            return ! in_array($permission->slug, ['role-delete', 'module-delete']);
        })->pluck('id');
        $roleModels['admin']->permissions()->sync($adminPermissions);

        // Guru: quiz + leaderboard view + dashboard.
        $guruPermissions = collect($permissionModelBySlug)->filter(function (Permission $permission) {
            return in_array($permission->slug, [
                'dashboard-view',
                'quiz-view',
                'quiz-create',
                'quiz-edit',
                'leaderboard-view',
                'user-view',
            ]);
        })->pluck('id');
        $roleModels['guru']->permissions()->sync($guruPermissions);

        // Peserta: quiz + duel + leaderboard view only.
        $participantPermissions = collect($permissionModelBySlug)->filter(function (Permission $permission) {
            return in_array($permission->slug, [
                'dashboard-view',
                'quiz-view',
                'duel-view',
                'duel-create',
                'leaderboard-view',
            ]);
        })->pluck('id');
        $roleModels[Role::PARTICIPANT]->permissions()->sync($participantPermissions);

        // 4. Superadmin user only — no dummy data.
        $superadmin = User::firstOrCreate(
            ['email' => 'superadmin@example.com'],
            [
                'name' => 'Superadmin System',
                'password' => Hash::make('password'),
                'email_verified_at' => now(),
                'locale' => 'id',
                'is_superadmin' => true,
                'onboarded_at' => now(),
            ]
        );

        $superadmin->roles()->syncWithoutDetaching($roleModels['super-admin']->id);
        $superadmin->createToken('Integration Agent')->plainTextToken;

        // 5. Ensure the superadmin always has a personal workspace so the
        //    workspace middleware does not abort with 403 on first login.
        if ($superadmin->workspaces()->count() === 0) {
            app(WorkspaceService::class)->createPersonalWorkspace($superadmin);
        }
    }
}
