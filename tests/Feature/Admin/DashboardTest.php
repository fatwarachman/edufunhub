<?php

use App\Models\Permission;
use App\Models\Role;
use App\Models\User;
use App\Models\Workspace;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Inertia\Testing\AssertableInertia;

uses(RefreshDatabase::class);

it('redirects guests to login when accessing admin dashboard', function () {
    $response = $this->get('/admin/dashboard');

    $response->assertRedirect('/login');
});

it('aborts with 403 when a standard user accesses admin dashboard', function () {
    $user = User::factory()->create([
        'is_superadmin' => false,
    ]);

    $this->actingAs($user);

    $response = $this->get('/admin/dashboard');

    $response->assertForbidden();
});

it('allows superadmins to access the dashboard and see user metrics', function () {
    // Create some dummy data to count
    User::factory()->count(3)->create();
    Workspace::factory()->count(2)->create();
    Role::factory()->count(2)->create();
    Permission::factory()->count(5)->create();

    $superadmin = User::factory()->create([
        'is_superadmin' => true,
    ]);

    $this->actingAs($superadmin);

    $response = $this->get('/admin/dashboard');

    $response->assertSuccessful();

    // In an Inertia test, you can test the Inertia page and passed props
    $response->assertInertia(
        fn (AssertableInertia $page) => $page
            ->component('admin/dashboard')
            ->has(
                'metrics',
                fn (AssertableInertia $metrics) => $metrics
                    ->where('total_users', User::count())
                    ->where('total_roles', Role::count())
                    ->where('total_permissions', Permission::count())
                    ->has('total_superadmins')
                    ->has('new_users_30d')
                    ->has('user_growth_percent')
            )
            ->has('dailySignups')
            ->has('roleDistribution')
            ->has('recent_users')
    );
});
