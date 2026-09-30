<?php

use App\Models\User;

beforeEach(function (): void {
    config(['scout.driver' => 'null']);
    $this->withoutVite();
});

test('guest auth pages render', function (string $path): void {
    $this->get($path)->assertOk();
})->with(['/login', '/register', '/forgot-password']);

test('password reset page renders with a token', function (): void {
    $this->get('/reset-password/fake-token?email=player@edufunhub.test')->assertOk();
});

test('guest hitting the two factor challenge renders', function (): void {
    $this->withSession(['login.id' => User::factory()->create()->id, 'login.remember' => false])
        ->get('/two-factor-challenge')
        ->assertOk();
});

test('unverified player can still use the player dashboard', function (): void {
    $user = User::factory()->unverified()->create();

    $this->actingAs($user)->get('/dashboard')->assertOk();
    $this->actingAs($user)->get('/email/verify')->assertOk();
});

test('unverified admin cannot reach the admin panel', function (): void {
    $user = User::factory()->unverified()->create(['is_superadmin' => true]);

    $this->actingAs($user)->get('/admin/dashboard')->assertRedirect('/email/verify');
});

test('verified player can reach the dashboard', function (): void {
    $user = User::factory()->create();

    $this->actingAs($user)->get('/dashboard')->assertOk();
});
