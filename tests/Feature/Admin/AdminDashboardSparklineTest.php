<?php

use App\Models\User;

beforeEach(function () {
    $this->admin = User::factory()->create(['is_superadmin' => true]);
});

it('admin dashboard includes sparklines prop', function () {
    $this->actingAs($this->admin)
        ->get('/admin/dashboard')
        ->assertOk()
        ->assertInertia(fn ($page) => $page
            ->has('sparklines')
            ->has('sparklines.new_users')
        );
});

it('sparklines contain 7 data points', function () {
    $this->actingAs($this->admin)
        ->get('/admin/dashboard')
        ->assertOk()
        ->assertInertia(fn ($page) => $page
            ->has('sparklines.new_users', 7)
        );
});

it('sparkline counts users created today', function () {
    User::factory()->count(2)->create();

    $this->actingAs($this->admin)
        ->get('/admin/dashboard')
        ->assertOk()
        ->assertInertia(fn ($page) => $page
            ->where('sparklines.new_users.6', User::whereDate('created_at', today())->count())
        );
});

it('admin dashboard sparklines contain non-negative integers', function () {
    $this->actingAs($this->admin)
        ->get('/admin/dashboard')
        ->assertOk()
        ->assertInertia(fn ($page) => $page
            ->where('sparklines.new_users.0', fn ($value) => is_int($value) && $value >= 0)
            ->where('sparklines.new_users.6', fn ($value) => is_int($value) && $value >= 0)
        );
});
