<?php

use App\Models\ImpersonationLog;
use App\Models\Permission;
use App\Models\Role;
use App\Models\User;
use Database\Seeders\RolePermissionSeeder;

function roleWith(string ...$permissions): Role
{
    $role = Role::query()->create(['name' => 'Ops '.uniqid(), 'slug' => 'ops-'.uniqid(), 'is_system' => false]);
    $role->permissions()->sync(Permission::query()->whereIn('slug', $permissions)->pluck('id'));

    return $role;
}

function adminWith(string ...$permissions): User
{
    $admin = User::factory()->create(['is_superadmin' => false]);
    $admin->roles()->attach(Role::query()->firstOrCreate(['slug' => 'admin'], ['name' => 'Admin', 'is_system' => true]));
    if ($permissions !== []) {
        $admin->roles()->attach(roleWith(...$permissions));
    }

    return $admin->refresh();
}

beforeEach(function () {
    $this->seed(RolePermissionSeeder::class);
});

it('registers the impersonate permission for the super admin role only', function () {
    $permission = Permission::query()->where('slug', 'user-impersonate')->sole();

    expect(Role::query()->where('slug', 'super-admin')->first()->permissions->contains($permission))->toBeTrue()
        ->and(Role::query()->where('slug', 'admin')->first()->permissions->contains($permission))->toBeFalse();
});

it('shows login as on the user list only to users with the permission', function () {
    $this->actingAs(User::factory()->superadmin()->create())->get('/admin/users')
        ->assertInertia(fn ($page) => $page->where('canImpersonate', true));

    $this->actingAs(adminWith())->get('/admin/users')
        ->assertInertia(fn ($page) => $page->where('canImpersonate', false));

    $this->actingAs(adminWith('user-impersonate'))->get('/admin/users')
        ->assertInertia(fn ($page) => $page->where('canImpersonate', true));
});

it('lets an admin with the permission log in as a player and come back', function () {
    $admin = adminWith('user-impersonate');
    $player = User::factory()->create();

    $this->actingAs($admin)->post("/admin/impersonate/{$player->id}")
        ->assertRedirect(route('dashboard'))
        ->assertSessionHas('impersonated_by', $admin->id);

    expect(auth()->id())->toBe($player->id);
    $log = ImpersonationLog::query()->sole();
    expect($log->impersonator_id)->toBe($admin->id)->and($log->ended_at)->toBeNull();

    $this->post('/admin/impersonate/leave')->assertRedirect(route('admin.users.index'))
        ->assertSessionMissing('impersonated_by');

    expect(auth()->id())->toBe($admin->id)
        ->and($log->refresh()->ended_at)->not->toBeNull();
    $this->assertDatabaseHas('activity_log', ['event' => 'impersonated', 'subject_id' => $player->id]);
});

it('forbids admins without the permission', function () {
    $player = User::factory()->create();

    $this->actingAs(adminWith())->post("/admin/impersonate/{$player->id}")->assertForbidden();
    $this->actingAs(User::factory()->create())->post("/admin/impersonate/{$player->id}")->assertForbidden();

    expect(ImpersonationLog::query()->count())->toBe(0);
});

it('blocks unsafe targets', function () {
    $admin = adminWith('user-impersonate');

    $this->actingAs($admin)->post("/admin/impersonate/{$admin->id}")->assertSessionHas('error', 'You cannot impersonate yourself.');
    $this->actingAs($admin)->post('/admin/impersonate/'.User::factory()->superadmin()->create()->id)
        ->assertSessionHas('error', 'Only a superadmin can log in as another superadmin.');
    $this->actingAs($admin)->post('/admin/impersonate/'.User::factory()->create(['disabled_at' => now()])->id)
        ->assertSessionHas('error', 'This account is not active.');
    $this->actingAs($admin)->withSession(['impersonated_by' => $admin->id])
        ->post('/admin/impersonate/'.User::factory()->create()->id)
        ->assertSessionHas('error', 'Leave the current impersonation first.');

    expect(ImpersonationLog::query()->count())->toBe(0)->and(auth()->id())->toBe($admin->id);
});

it('shares the impersonation flag so every page shows the leave bar', function () {
    $admin = User::factory()->superadmin()->create();
    $player = User::factory()->withPlayerDetails()->create();

    $this->actingAs($admin)->post("/admin/impersonate/{$player->id}");

    $this->get('/portal')->assertOk()->assertInertia(fn ($page) => $page
        ->where('auth.is_impersonating', true)
        ->where('auth.user.id', $player->id));
});
