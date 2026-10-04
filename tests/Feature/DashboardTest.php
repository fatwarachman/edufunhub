<?php

use App\Models\GameHistory;
use App\Models\PointLedger;
use App\Models\User;
use Inertia\Testing\AssertableInertia as Assert;

beforeEach(function (): void {
    config(['scout.driver' => 'null']);
    $this->withoutVite();
});

test('player routes require authentication', function (string $path): void {
    $this->get($path)->assertRedirect(route('login'));
})->with(['/dashboard', '/character']);

test('unverified new player gets real empty dashboard without writes', function (): void {
    $user = User::factory()->unverified()->create();
    $this->actingAs($user)->get('/dashboard')->assertOk()->assertInertia(fn (Assert $page) => $page
        ->component('user/dashboard', false)
        ->where('points', 0)
        ->where('character', ['color' => 'amber', 'accessory' => 'none', 'nickname' => null])
        ->has('history', 0)
        ->where('grade', null)
        ->has('categories', 3)
        ->where('categories.0.titleKey', 'player.adventure')
        ->where('categories.0.games.0.url', '/games/flag-quest')
        ->where('categories.1.games.0.url', '/games/snakes-and-ladders')
        ->where('categories.2.games.0.url', '/games/sky-quiz'));
    $this->assertDatabaseCount('player_profiles', 0);
    $this->assertDatabaseCount('point_ledgers', 0);
    $this->assertDatabaseCount('game_histories', 0);
});

test('dashboard sums only own ledger and shows own newest history', function (): void {
    $user = User::factory()->create();
    PointLedger::factory()->for($user)->create(['points' => 25]);
    PointLedger::factory()->for($user)->create(['points' => -5]);
    PointLedger::factory()->create(['points' => 900]);
    GameHistory::factory()->for($user)->create(['game_name' => 'Old game', 'played_at' => now()->subDay()]);
    $latest = GameHistory::factory()->for($user)->create(['game_name' => 'Sky Quiz']);
    GameHistory::factory()->create(['game_name' => 'Private game']);
    $this->actingAs($user)->get('/dashboard')->assertOk()->assertInertia(fn (Assert $page) => $page
        ->component('user/dashboard', false)->where('points', 20)->has('history', 2)
        ->where('history.0.id', $latest->id)->where('history.0.game_name', 'Sky Quiz')
        ->where('history.1.game_name', 'Old game'));
});

test('history pagination stays user scoped', function (): void {
    $user = User::factory()->create();
    GameHistory::factory()->for($user)->count(12)->create();
    GameHistory::factory()->count(2)->create();
    $this->actingAs($user)->get('/dashboard?page=2')->assertInertia(fn (Assert $page) => $page
        ->component('user/dashboard', false)->has('history', 2)->where('historyPagination.total', 12));
});

test('disabled or deleted stale sessions cannot access player routes', function (string $status, string $path): void {
    $user = User::factory()->create();
    $this->actingAs($user);
    if ($status === 'disabled') {
        User::query()->whereKey($user->id)->update(['disabled_at' => now()]);
    } else {
        $user->delete();
    }
    $this->get($path)->assertForbidden();
    $this->patch('/character', ['color' => 'teal', 'accessory' => 'cap'])->assertForbidden();
    $this->assertDatabaseCount('player_profiles', 0);
})->with(['disabled', 'deleted'])->with(['/dashboard', '/character']);

test('browser cannot award points or record history', function (string $path): void {
    $this->actingAs(User::factory()->create())->post($path, ['points' => 100])->assertStatus(405);
    $this->assertDatabaseCount('point_ledgers', 0);
    $this->assertDatabaseCount('game_histories', 0);
})->with(['/dashboard', '/character']);

test('catalog only lists actual game routes', function (): void {
    $this->actingAs(User::factory()->withPlayerDetails()->create());
    foreach (config('game-catalog.categories') as $category) {
        foreach ($category['games'] as $game) {
            $this->get(route($game['route']))->assertOk();
        }
    }
});

test('admin disable blocks existing session without changing verification', function (): void {
    $admin = User::factory()->create(['is_superadmin' => true]);
    $user = User::factory()->create();
    $verifiedAt = $user->email_verified_at->toIso8601String();
    $this->actingAs($admin)->patch(route('admin.users.toggle-status', $user))->assertRedirect();
    expect($user->fresh()->disabled_at)->not->toBeNull();
    expect($user->fresh()->email_verified_at->toIso8601String())->toBe($verifiedAt);
    $this->actingAs($user)->get('/dashboard')->assertForbidden();
    $this->actingAs($admin)->patch(route('admin.users.toggle-status', $user))->assertRedirect();
    expect($user->fresh()->disabled_at)->toBeNull();
    $this->actingAs($user)->get('/dashboard')->assertOk();
});

test('normal password login defaults to player portal', function (): void {
    $user = User::factory()->withoutTwoFactor()->create();
    $this->post(route('login.store'), ['email' => $user->email, 'password' => 'password'])
        ->assertRedirect('/portal');
    $this->assertAuthenticatedAs($user);
});
