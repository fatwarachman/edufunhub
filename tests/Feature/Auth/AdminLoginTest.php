<?php

use App\Models\User;
use Inertia\Testing\AssertableInertia as Assert;

beforeEach(function (): void {
    config(['scout.driver' => 'null']);
    $this->withoutVite();
});

test('admin login has a dedicated page', function (): void {
    $this->get('/admin/login')->assertOk()->assertInertia(fn (Assert $page) => $page->component('auth/login')->where('adminLogin', true));
});

test('admin credentials are required at the admin entry point', function (bool $admin): void {
    $user = User::factory()->withoutTwoFactor()->create(['is_superadmin' => $admin]);
    $response = $this->from('/admin/login')->post('/admin/login', ['email' => $user->email, 'password' => 'password']);
    if ($admin) {
        $response->assertRedirect(route('admin.dashboard'));
        $this->assertAuthenticatedAs($user);
    } else {
        $response->assertSessionHasErrors('email');
        $this->assertGuest();
    }
})->with([true, false]);
