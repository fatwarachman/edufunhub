<?php

use App\Models\Role;
use App\Models\User;
use Inertia\Testing\AssertableInertia as Assert;

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

test('superadmins are redirected to the player portal after login', function () {
    $user = User::factory()->withoutTwoFactor()->create(['is_superadmin' => true]);

    $response = $this->post(route('login.store'), [
        'email' => $user->email,
        'password' => 'password',
    ]);

    $this->assertAuthenticated();
    $response->assertRedirect(route('portal', absolute: false));
});

test('users with the admin role are redirected to the player portal after login', function () {
    $user = User::factory()->withoutTwoFactor()->create();
    $user->roles()->attach(Role::factory()->create(['name' => 'Admin', 'slug' => 'admin']));

    $response = $this->post(route('login.store'), [
        'email' => $user->email,
        'password' => 'password',
    ]);

    $this->assertAuthenticated();
    $response->assertRedirect(route('portal', absolute: false));
});

test('players cannot reach the admin dashboard surface', function () {
    $user = User::factory()->create();

    $this->actingAs($user)->get(route('admin.dashboard'))->assertForbidden();
});

test('teachers are redirected to the player portal after login', function () {
    $user = User::factory()->withoutTwoFactor()->create();
    $user->roles()->attach(Role::factory()->create(['name' => 'Guru', 'slug' => Role::TEACHER]));

    $this->post(route('login.store'), [
        'email' => $user->email,
        'password' => 'password',
    ])->assertRedirect(route('portal', absolute: false));
});

test('admins see the admin shortcut in the player navigation', function (bool $superadmin) {
    $user = User::factory()->create(['is_superadmin' => $superadmin]);
    if (! $superadmin) {
        $user->roles()->attach(Role::factory()->create(['name' => 'Admin', 'slug' => 'admin']));
    }

    $this->actingAs($user)->get(route('portal'))
        ->assertInertia(fn (Assert $page) => $page->where('auth.user.is_admin', true));
})->with(['superadmin' => true, 'admin role' => false]);

test('players do not get the admin shortcut', function () {
    $this->actingAs(User::factory()->create())->get(route('portal'))
        ->assertInertia(fn (Assert $page) => $page->where('auth.user.is_admin', false));
});

test('admins keep their intended destination instead of the portal', function () {
    $user = User::factory()->withoutTwoFactor()->create(['is_superadmin' => true]);

    $this->withSession(['url.intended' => route('admin.users.index')])
        ->post(route('login.store'), [
            'email' => $user->email,
            'password' => 'password',
        ])
        ->assertRedirect(route('admin.users.index', absolute: false));
});
