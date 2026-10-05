<?php

use App\Models\GameHistory;
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

it('shows the number of games in the catalog on the dashboard', function () {
    $games = collect(config('game-catalog.categories'))->flatMap(fn (array $category) => $category['games']);
    $player = User::factory()->withPlayerDetails()->create();
    GameHistory::factory()->create(['user_id' => $player->id, 'game_key' => 'sky-quiz', 'played_at' => now()->subDay()]);
    GameHistory::factory()->create(['user_id' => $player->id, 'game_key' => 'sky-quiz', 'played_at' => now()->subDays(2)]);
    GameHistory::factory()->create(['user_id' => $player->id, 'game_key' => 'quiz-duel', 'played_at' => now()->subDays(20)]);

    $this->actingAs(User::factory()->create(['is_superadmin' => true]))
        ->get('/admin/dashboard')
        ->assertInertia(fn (AssertableInertia $page) => $page
            ->where('gameCatalog.total', $games->count())
            ->where('gameCatalog.total', 13)
            ->where('gameCatalog.multiplayer', $games->where('multiplayer', true)->count())
            ->where('gameCatalog.awards_points', $games->where('awards_points', true)->count())
            ->where('gameCatalog.categories', count(config('game-catalog.categories')))
            ->where('gameCatalog.played_7d', 1));
});

it('lists only the five most played games on the dashboard', function () {
    $player = User::factory()->withPlayerDetails()->create();
    $plays = ['crossword' => 6, 'sky-quiz' => 5, 'flag-quest' => 4, 'quiz-duel' => 3, 'mini-lab' => 2, 'market-math' => 1];
    foreach ($plays as $game => $count) {
        GameHistory::factory()->count($count)->create(['user_id' => $player->id, 'game_key' => $game]);
    }

    $this->actingAs(User::factory()->create(['is_superadmin' => true]))
        ->get('/admin/dashboard')
        ->assertInertia(fn (AssertableInertia $page) => $page
            ->has('games', 5)
            ->where('games.0.key', 'crossword')
            ->where('games.0.plays', 6)
            ->where('games.4.key', 'mini-lab')
            ->where('games.4.plays', 2));
});
