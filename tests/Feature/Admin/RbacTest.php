<?php

use App\Models\Module;
use App\Models\Permission;
use App\Models\Role;
use App\Models\User;
use Illuminate\Support\Facades\Hash;

beforeEach(function () {
    $this->superadmin = User::firstOrCreate(
        ['email' => 'test-superadmin@example.com'],
        [
            'name' => 'Test Superadmin',
            'password' => Hash::make('password'),
            'is_superadmin' => true,
            'email_verified_at' => now(),
            'onboarded_at' => now(),
        ]
    );

    $this->module = Module::create([
        'name' => 'Quiz',
        'slug' => 'quiz',
        'is_active' => true,
    ]);

    $this->permission = Permission::create([
        'name' => 'View Quiz',
        'slug' => 'quiz-view',
        'module_id' => $this->module->id,
    ]);

    $this->role = Role::create([
        'name' => 'Guru',
        'slug' => 'guru',
        'is_system' => true,
    ]);

    $this->role->permissions()->attach($this->permission);
});

it('shows roles index with permissions grouped by module', function () {
    $response = $this->actingAs($this->superadmin)->get('/admin/roles');

    $response->assertOk();
    $response->assertInertia(fn ($page) => $page
        ->component('admin/roles')
        ->has('roles', 1)
        ->has('modules', 1));
});

it('creates a role with selected permissions', function () {
    $response = $this->actingAs($this->superadmin)->post('/admin/roles', [
        'name' => 'Kurator',
        'description' => 'Kurator konten',
        'permissions' => [$this->permission->id],
    ]);

    $response->assertRedirect();

    $role = Role::where('slug', 'kurator')->first();
    expect($role)->not->toBeNull()
        ->and($role->permissions->contains($this->permission))->toBeTrue();
});

it('prevents deleting system roles', function () {
    $this->actingAs($this->superadmin)->delete("/admin/roles/{$this->role->id}");

    expect(Role::where('id', $this->role->id)->exists())->toBeTrue();
});

it('updates role permissions', function () {
    $newPermission = Permission::create([
        'name' => 'Create Quiz',
        'slug' => 'quiz-create',
        'module_id' => $this->module->id,
    ]);

    $this->actingAs($this->superadmin)->put("/admin/roles/{$this->role->id}", [
        'name' => 'Guru',
        'description' => 'Guru pembuat quiz',
        'permissions' => [$newPermission->id],
    ]);

    $this->role->refresh();

    expect($this->role->permissions)->toHaveCount(1)
        ->and($this->role->permissions->first()->slug)->toBe('quiz-create');
});

it('shows modules with permission counts', function () {
    $response = $this->actingAs($this->superadmin)->get('/admin/modules');

    $response->assertOk();
    $response->assertInertia(fn ($page) => $page
        ->component('admin/modules')
        ->has('modules', 1)
        ->where('modules.0.permissions_count', 1));
});

it('creates a module with default crud permissions', function () {
    $this->actingAs($this->superadmin)->post('/admin/modules', [
        'name' => 'Duel',
        'icon' => '⚔️',
        'description' => 'Duel 1v1',
    ]);

    $module = Module::where('slug', 'duel')->first();
    expect($module)->not->toBeNull()
        ->and($module->permissions->pluck('slug'))
        ->toContain('duel-view', 'duel-create', 'duel-edit', 'duel-delete');
});

it('toggles module active status', function () {
    $this->actingAs($this->superadmin)->patch("/admin/modules/{$this->module->id}/toggle");

    $this->module->refresh();

    expect($this->module->is_active)->toBeFalse();
});

it('deletes a module cascading its permissions', function () {
    $permissionId = $this->permission->id;

    $this->actingAs($this->superadmin)->delete("/admin/modules/{$this->module->id}");

    expect(Module::find($this->module->id))->toBeNull()
        ->and(Permission::find($permissionId))->toBeNull();
});

it('checks user has permission through roles', function () {
    $user = User::firstOrCreate(
        ['email' => 'test-user@example.com'],
        [
            'name' => 'Test User',
            'password' => Hash::make('password'),
            'email_verified_at' => now(),
        ]
    );
    $user->roles()->attach($this->role);

    expect($user->hasPermission('quiz-view'))->toBeTrue()
        ->and($user->hasPermission('quiz-create'))->toBeFalse();
});

it('superadmin bypasses permission checks', function () {
    expect($this->superadmin->hasPermission('any-permission'))->toBeTrue();
});
