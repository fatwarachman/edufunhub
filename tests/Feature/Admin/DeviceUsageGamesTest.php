<?php

use App\Models\GameAccess;
use App\Models\User;
use App\Services\DeviceAnalytics;
use Illuminate\Support\Facades\DB;
use Inertia\Testing\AssertableInertia as Assert;

beforeEach(function (): void {
    config(['scout.driver' => 'null']);
    $this->withoutVite();
});

test('device games page lists every game with device split and browser mix', function (): void {
    $admin = User::factory()->create(['is_superadmin' => true]);
    GameAccess::factory()->mobile('Android')->count(3)->create(['game_key' => 'sky-quiz']);
    GameAccess::factory()->mobile('iOS')->create(['game_key' => 'sky-quiz']);
    GameAccess::factory()->create(['game_key' => 'sky-quiz', 'user_id' => null, 'device_type' => 'tablet', 'browser' => 'Firefox']);
    GameAccess::factory()->create(['game_key' => 'flag-quest']);
    GameAccess::factory()->create(['game_key' => 'flag-quest', 'browser' => 'Edge']);
    GameAccess::factory()->create(['game_key' => 'crossword', 'accessed_at' => now()->subDays(45)]);

    $this->actingAs($admin)->get('/admin/device-usage/games')
        ->assertOk()
        ->assertInertia(fn (Assert $page) => $page
            ->component('admin/device-usage/games')
            ->where('days', 30)
            ->where('dayOptions', [7, 30, 90])
            ->has('games', 2)
            ->where('games.0', [
                'game' => 'sky-quiz', 'accesses' => 5, 'users' => 4,
                'mobile' => 4, 'tablet' => 1, 'desktop' => 0,
                'browsers' => [['name' => 'Chrome', 'accesses' => 3], ['name' => 'Firefox', 'accesses' => 1], ['name' => 'Safari', 'accesses' => 1]],
            ])
            ->where('games.1', [
                'game' => 'flag-quest', 'accesses' => 2, 'users' => 2,
                'mobile' => 0, 'tablet' => 0, 'desktop' => 2,
                'browsers' => [['name' => 'Chrome', 'accesses' => 1], ['name' => 'Edge', 'accesses' => 1]],
            ])
            ->where('totals', ['accesses' => 7, 'games' => 2, 'mobile' => 4, 'tablet' => 1, 'desktop' => 2])
        );
});

test('device games page honours the day window and ignores invalid values', function (): void {
    $admin = User::factory()->create(['is_superadmin' => true]);
    GameAccess::factory()->create(['game_key' => 'sky-quiz', 'accessed_at' => now()->subDays(3)]);
    GameAccess::factory()->create(['game_key' => 'crossword', 'accessed_at' => now()->subDays(60)]);

    $this->actingAs($admin)->get('/admin/device-usage/games?days=7')
        ->assertOk()
        ->assertInertia(fn (Assert $page) => $page->where('days', 7)->has('games', 1)->where('games.0.game', 'sky-quiz'));

    $this->actingAs($admin)->get('/admin/device-usage/games?days=90')
        ->assertInertia(fn (Assert $page) => $page->where('days', 90)->has('games', 2));

    $this->actingAs($admin)->get('/admin/device-usage/games?days=365')
        ->assertOk()
        ->assertInertia(fn (Assert $page) => $page->where('days', 30)->has('games', 1));
});

test('device games page shows an empty list without data', function (): void {
    $this->actingAs(User::factory()->create(['is_superadmin' => true]))
        ->get('/admin/device-usage/games')
        ->assertOk()
        ->assertInertia(fn (Assert $page) => $page
            ->has('games', 0)
            ->where('totals', ['accesses' => 0, 'games' => 0, 'mobile' => 0, 'tablet' => 0, 'desktop' => 0]));
});

test('device games page is closed to players and guests', function (): void {
    $this->get('/admin/device-usage/games')->assertRedirect();

    $this->actingAs(User::factory()->create())
        ->get('/admin/device-usage/games')
        ->assertForbidden();
});

test('device games breakdown runs a fixed number of queries', function (): void {
    foreach (['sky-quiz', 'flag-quest', 'crossword', 'market-math', 'mini-lab', 'floor-drop'] as $game) {
        GameAccess::factory()->count(2)->create(['game_key' => $game]);
    }

    DB::enableQueryLog();
    $games = app(DeviceAnalytics::class)->gameBreakdown();
    $queries = count(DB::getQueryLog());

    expect($games)->toHaveCount(6)->and($queries)->toBe(2);
});

test('dashboard still sends every game so the panel can rank and slice the top five', function (): void {
    foreach (['sky-quiz', 'flag-quest', 'crossword', 'market-math', 'mini-lab', 'floor-drop'] as $index => $game) {
        GameAccess::factory()->count($index + 1)->create(['game_key' => $game]);
    }

    $this->actingAs(User::factory()->create(['is_superadmin' => true]))
        ->get('/admin/dashboard')
        ->assertOk()
        ->assertInertia(fn (Assert $page) => $page
            ->has('devices.games', 6)
            ->where('devices.games.0.game', 'floor-drop'));
});
