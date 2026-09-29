<?php

use App\Models\Permission;
use App\Models\Role;
use App\Models\User;

beforeEach(function () {
    $this->admin = User::factory()->create(['is_superadmin' => true]);
    $this->admin->forceFill(['two_factor_secret' => 'secret', 'two_factor_confirmed_at' => now()])->save();
});

it('returns json with total_users, total_roles, and total_permissions', function () {
    User::factory()->count(3)->create();
    Role::factory()->count(2)->create();
    Permission::factory()->count(4)->create();

    $this->actingAs($this->admin)
        ->getJson('/admin/quick-stats')
        ->assertOk()
        ->assertJsonStructure(['total_users', 'total_roles', 'total_permissions'])
        ->assertJsonPath('total_users', User::count())
        ->assertJsonPath('total_roles', Role::count())
        ->assertJsonPath('total_permissions', Permission::count());
});

it('returns counts as integer values', function () {
    $response = $this->actingAs($this->admin)
        ->getJson('/admin/quick-stats')
        ->assertOk();

    expect($response->json('total_users'))->toBeInt();
    expect($response->json('total_roles'))->toBeInt();
    expect($response->json('total_permissions'))->toBeInt();
});

it('is forbidden for non-superadmin users', function () {
    $user = User::factory()->create(['is_superadmin' => false]);

    $this->actingAs($user)
        ->getJson('/admin/quick-stats')
        ->assertForbidden();
});

it('returns 401 for unauthenticated json requests', function () {
    $this->getJson('/admin/quick-stats')
        ->assertUnauthorized();
});
