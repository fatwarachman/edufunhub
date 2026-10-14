<?php

use App\Models\Module;
use App\Models\Permission;
use App\Models\Role;
use App\Models\User;
use Inertia\Testing\AssertableInertia as Assert;

beforeEach(function (): void {
    config(['scout.driver' => 'null']);
    $this->withoutVite();
    $this->admin = User::factory()->create(['is_superadmin' => true]);
});

it('lists roles with their permissions and modules for the accordion', function (): void {
    $quiz = Module::factory()->create(['name' => 'Quiz Bank']);
    $users = Module::factory()->create(['name' => 'Account Area']);
    $viewQuiz = Permission::factory()->create(['name' => 'View Quiz', 'module_id' => $quiz->id]);
    $editUser = Permission::factory()->create(['name' => 'Edit User', 'module_id' => $users->id]);
    Permission::factory()->create(['module_id' => $users->id]);

    $role = Role::factory()->create(['name' => 'Curator', 'slug' => 'curator']);
    $role->permissions()->attach([$viewQuiz->id, $editUser->id]);
    $totalPermissions = Permission::query()->count();

    $this->actingAs($this->admin)
        ->get('/admin/roles')
        ->assertOk()
        ->assertInertia(fn (Assert $page) => $page
            ->component('admin/roles/index')
            ->where('totalPermissions', $totalPermissions)
            ->where('roles.data', function ($roles): bool {
                $curator = collect($roles)->firstWhere('slug', 'curator');

                return $curator !== null
                    && $curator['permissions_count'] === 2
                    && collect($curator['permissions'])->pluck('module.name')->sort()->values()->all() === ['Account Area', 'Quiz Bank'];
            }));
});

it('returns an empty permission list for roles without permissions', function (): void {
    Role::factory()->create(['name' => 'Empty', 'slug' => 'empty-role']);

    $this->actingAs($this->admin)
        ->get('/admin/roles')
        ->assertOk()
        ->assertInertia(fn (Assert $page) => $page
            ->where('roles.data', function ($roles): bool {
                $empty = collect($roles)->firstWhere('slug', 'empty-role');

                return $empty !== null && $empty['permissions'] === [] && $empty['permissions_count'] === 0;
            }));
});

it('forbids non admins from viewing roles', function (): void {
    $this->actingAs(User::factory()->create(['is_superadmin' => false]))
        ->get('/admin/roles')
        ->assertForbidden();
});
