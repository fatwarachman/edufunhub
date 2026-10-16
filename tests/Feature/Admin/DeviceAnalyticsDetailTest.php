<?php

use App\Models\GameAccess;
use App\Models\Role;
use App\Models\User;
use Inertia\Testing\AssertableInertia as Assert;

beforeEach(function (): void {
    config(['scout.driver' => 'null']);
    $this->withoutVite();
});

test('device analytics detail filters charts and paginated users by os device and role', function (): void {
    $admin = User::factory()->create(['is_superadmin' => true]);
    $teacher = Role::query()->firstOrCreate(['slug' => 'guru'], ['name' => 'Guru']);
    $matching = User::factory()->create();
    $matching->roles()->attach($teacher);
    GameAccess::factory()->for($matching)->mobile('Android')->create();
    GameAccess::factory()->for($admin)->create();

    $this->actingAs($admin)->get('/admin/device-usage?days=7&os=Android&device=mobile&role=guru')
        ->assertOk()
        ->assertInertia(fn (Assert $page) => $page
            ->component('admin/device-usage/index')
            ->where('days', 7)
            ->where('filters', ['os' => 'Android', 'device' => 'mobile', 'role' => 'guru'])
            ->where('users.total', 1)
            ->where('users.data.0.id', $matching->id)
            ->where('charts.os.0.name', 'Android')
            ->where('charts.os.0.users', 1)
            ->where('totals.accesses', 1)
            ->where('totals.users', 1)
            ->has('charts.browsers', 1)
            ->where('options.os', fn ($os): bool => collect($os)->contains('Android')));
});

test('device analytics detail is admin only and validates filters', function (): void {
    $this->get('/admin/device-usage')->assertRedirect();
    $this->actingAs(User::factory()->create())->get('/admin/device-usage')->assertForbidden();

    $admin = User::factory()->create(['is_superadmin' => true]);
    $this->actingAs($admin)->get('/admin/device-usage?device=fridge')->assertSessionHasErrors('device');
});

test('user detail includes device and os history', function (): void {
    $admin = User::factory()->create(['is_superadmin' => true]);
    $user = User::factory()->create();
    GameAccess::factory()->for($user)->mobile('Android')->create(['game_key' => 'sky-quiz']);

    $this->actingAs($admin)->get('/admin/users/'.$user->id.'?tab=games')
        ->assertOk()
        ->assertInertia(fn (Assert $page) => $page
            ->where('deviceHistory.0.os', 'Android')
            ->where('deviceHistory.0.device_type', 'mobile')
            ->where('deviceHistory.0.game_key', 'sky-quiz')
            ->where('deviceSummary.total', 1)
            ->where('deviceSummary.os.0.name', 'Android')
            ->where('deviceSummary.devices.0.name', 'mobile')
            ->where('deviceSummary.combos.0.accesses', 1));
});
