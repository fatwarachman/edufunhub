<?php

use App\Models\Role;
use App\Models\User;

beforeEach(function (): void {
    config(['scout.driver' => 'null']);
    $this->withoutVite();
});

test('players are redirected to the player portal after login', function () {
    $user = User::factory()->withoutTwoFactor()->create();

    $response = $this->post(route('login.store'), [
        'email' => $user->email,
        'password' => 'password',
    ]);

    $this->assertAuthenticated();
    $response->assertRedirect(route('portal', absolute: false));
});

test('superadmins are redirected to the admin dashboard after login', function () {
    $user = User::factory()->withoutTwoFactor()->create(['is_superadmin' => true]);

    $response = $this->post(route('login.store'), [
        'email' => $user->email,
        'password' => 'password',
    ]);

    $this->assertAuthenticated();
    $response->assertRedirect(route('admin.dashboard', absolute: false));
});

test('users with the admin role are redirected to the admin dashboard after login', function () {
    $user = User::factory()->withoutTwoFactor()->create();
    $user->roles()->attach(Role::factory()->create(['name' => 'Admin', 'slug' => 'admin']));

    $response = $this->post(route('login.store'), [
        'email' => $user->email,
        'password' => 'password',
    ]);

    $this->assertAuthenticated();
    $response->assertRedirect(route('admin.dashboard', absolute: false));
});

test('players cannot reach the admin dashboard surface', function () {
    $user = User::factory()->create();

    $this->actingAs($user)->get(route('admin.dashboard'))->assertForbidden();
});

test('admins keep their intended destination instead of the dashboard', function () {
    $user = User::factory()->withoutTwoFactor()->create(['is_superadmin' => true]);

    $this->withSession(['url.intended' => route('admin.users.index')])
        ->post(route('login.store'), [
            'email' => $user->email,
            'password' => 'password',
        ])
        ->assertRedirect(route('admin.users.index', absolute: false));
});
