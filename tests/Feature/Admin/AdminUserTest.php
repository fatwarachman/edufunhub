<?php

use App\Models\User;
use Inertia\Testing\AssertableInertia as Assert;

it('blocks non-superadmin users from accessing user management', function () {
    $user = User::factory()->create(['is_superadmin' => false]);

    $response = $this->actingAs($user)->get('/admin/users');

    $response->assertForbidden();
});

it('allows superadmins to view the user list', function () {
    $admin = User::factory()->create(['is_superadmin' => true]);
    User::factory()->count(3)->create();

    $response = $this->actingAs($admin)->get('/admin/users');

    $response->assertOk();
});

it('supports searching users by name', function () {
    $admin = User::factory()->create(['is_superadmin' => true]);
    User::factory()->create(['name' => 'Alice Wonderland']);
    User::factory()->create(['name' => 'Bob Builder']);

    $response = $this->actingAs($admin)->get('/admin/users?search=Alice');

    $response->assertOk();
});

it('supports searching users by email', function () {
    $admin = User::factory()->create(['is_superadmin' => true]);
    User::factory()->create(['email' => 'findme@example.com']);

    $response = $this->actingAs($admin)->get('/admin/users?search=findme');

    $response->assertOk();
});

it('persists exact current page for authenticated users', function () {
    $user = User::factory()->create();

    $this->actingAs($user)
        ->postJson('/current-page', [
            'path' => '/admin/users?activity=online',
            'label' => 'Online users',
        ])
        ->assertOk()
        ->assertJson(['ok' => true]);

    expect($user->refresh()->current_page_path)->toBe('/admin/users?activity=online')
        ->and($user->current_page_label)->toBe('Online users')
        ->and($user->last_seen_at)->not->toBeNull();
});

it('rejects guest current page updates', function () {
    $this->postJson('/current-page', [
        'path' => '/dashboard',
        'label' => 'Dashboard',
    ])->assertUnauthorized();
});

it('shows page name instead of the full URL in user list activity', function () {
    $source = file_get_contents(resource_path('js/pages/admin/users/index.tsx'));

    expect($source)->toContain('user.current_page_label')
        ->and($source)->not->toContain('user.current_page_path');
});

it('shows exact current page in online user list and detail', function () {
    $admin = User::factory()->create([
        'is_superadmin' => true,
        'last_seen_at' => now()->subMinutes(User::ONLINE_MINUTES + 1),
    ]);
    $user = User::factory()->create([
        'name' => 'Tracked Online User',
        'last_seen_at' => now(),
        'current_page_path' => '/admin/users?activity=online',
        'current_page_label' => 'Online users',
    ]);

    $this->actingAs($admin)->get('/admin/users?activity=online&search=Tracked%20Online')
        ->assertInertia(fn (Assert $page) => $page
            ->has('users.data', 1)
            ->where('users.data.0.current_page_path', '/admin/users?activity=online')
            ->where('users.data.0.current_page_label', 'Online users'));

    $this->actingAs($admin)->get("/admin/users/{$user->id}")
        ->assertInertia(fn (Assert $page) => $page
            ->where('user.current_page_path', '/admin/users?activity=online')
            ->where('user.current_page_label', 'Online users'));
});

it('can promote a user to superadmin', function () {
    $admin = User::factory()->create(['is_superadmin' => true]);
    $user = User::factory()->create(['is_superadmin' => false]);

    $response = $this->actingAs($admin)->put("/admin/users/{$user->id}", [
        'is_superadmin' => true,
    ]);

    $response->assertRedirect();
    expect($user->refresh()->is_superadmin)->toBeTrue();
});

it('can demote a user from superadmin', function () {
    $admin = User::factory()->create(['is_superadmin' => true]);
    $user = User::factory()->create(['is_superadmin' => true]);

    $response = $this->actingAs($admin)->put("/admin/users/{$user->id}", [
        'is_superadmin' => false,
    ]);

    $response->assertRedirect();
    expect($user->refresh()->is_superadmin)->toBeFalse();
});

it('prevents self-demotion', function () {
    $admin = User::factory()->create(['is_superadmin' => true]);

    $response = $this->actingAs($admin)->put("/admin/users/{$admin->id}", [
        'is_superadmin' => false,
    ]);

    $response->assertSessionHasErrors('user');
    expect($admin->refresh()->is_superadmin)->toBeTrue();
});

it('can delete a user', function () {
    $admin = User::factory()->create(['is_superadmin' => true]);
    $user = User::factory()->create();

    $response = $this->actingAs($admin)->delete("/admin/users/{$user->id}");

    $response->assertRedirect();
    expect(User::find($user->id))->toBeNull();
});

it('prevents self-deletion', function () {
    $admin = User::factory()->create(['is_superadmin' => true]);

    $response = $this->actingAs($admin)->delete("/admin/users/{$admin->id}");

    $response->assertSessionHasErrors('user');
    expect(User::find($admin->id))->not->toBeNull();
});
