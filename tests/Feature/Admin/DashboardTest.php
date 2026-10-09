<?php

use App\Http\Controllers\Admin\DashboardController;
use App\Http\Middleware\HandleInertiaRequests;
use App\Models\GameHistory;
use App\Models\Permission;
use App\Models\Role;
use App\Models\User;
use App\Models\Workspace;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Cache;
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
            ->where('gameCatalog.total', 19)
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

function dashboardPlay(User $user, int $points, DateTimeInterface $playedAt): void
{
    GameHistory::factory()->create([
        'user_id' => $user->id,
        'game_key' => 'sky-quiz',
        'points' => $points,
        'school_name' => $user->playerProfile?->school_name,
        'played_at' => $playedAt,
    ]);
}

it('defers the dashboard leaderboard with week, month and all-time boards', function () {
    Cache::forget(DashboardController::LEADERBOARD_CACHE_KEY);
    $veteran = User::factory()->create(['name' => 'Veteran']);
    $veteran->playerProfile()->create(['grade' => 5, 'school_name' => 'SD Lama']);
    $rising = User::factory()->create(['name' => 'Rising', 'avatar_url' => 'https://example.test/rising.png']);
    $rising->playerProfile()->create(['grade' => 8, 'school_name' => 'SMP Baru']);
    $disabled = User::factory()->create(['disabled_at' => now()]);

    dashboardPlay($veteran, 500, now()->subDays(20));
    dashboardPlay($veteran, 10, now()->subDays(2));
    dashboardPlay($rising, 120, now()->subDays(3));
    dashboardPlay($rising, 30, now()->subHour());
    dashboardPlay($disabled, 9999, now()->subHour());

    $this->actingAs(User::factory()->create(['is_superadmin' => true]))
        ->get('/admin/dashboard')
        ->assertOk()
        ->assertInertia(fn (AssertableInertia $page) => $page
            ->component('admin/dashboard')
            ->missing('leaderboards')
            ->loadDeferredProps(fn (AssertableInertia $reload) => $reload
                ->has('leaderboards', 3)
                ->where('leaderboards.week.days', 7)
                ->where('leaderboards.month.days', 30)
                ->where('leaderboards.all.days', 0)
                ->has('leaderboards.week.players', 2)
                ->where('leaderboards.week.players.0.user_id', $rising->id)
                ->where('leaderboards.week.players.0.rank', 1)
                ->where('leaderboards.week.players.0.points', 150)
                ->where('leaderboards.week.players.0.plays', 2)
                ->where('leaderboards.week.players.0.grade', 8)
                ->where('leaderboards.week.players.0.school_name', 'SMP Baru')
                ->where('leaderboards.week.players.0.avatar_url', 'https://example.test/rising.png')
                ->where('leaderboards.week.players.1.user_id', $veteran->id)
                ->where('leaderboards.week.players.1.points', 10)
                ->where('leaderboards.month.players.0.user_id', $veteran->id)
                ->where('leaderboards.month.players.0.points', 510)
                ->where('leaderboards.all.players.0.user_id', $veteran->id)
                ->has('leaderboards.all.players', 2)
                ->where('leaderboards.week.schools.0.school', 'SMP Baru')
                ->where('leaderboards.all.schools.0.school', 'SD Lama')
                ->where('leaderboards.all.schools.0.points', 510)
                ->missing('leaderboards.all.players.0.email')));
});

it('caches the dashboard leaderboard for a short time', function () {
    Cache::forget(DashboardController::LEADERBOARD_CACHE_KEY);
    $player = User::factory()->withPlayerDetails()->create();
    dashboardPlay($player, 40, now()->subHour());
    $admin = User::factory()->create(['is_superadmin' => true]);
    $deferred = ['X-Inertia' => 'true', 'X-Inertia-Version' => (string) app(HandleInertiaRequests::class)->version(Request::create('/')), 'X-Inertia-Partial-Component' => 'admin/dashboard', 'X-Inertia-Partial-Data' => 'leaderboards'];

    $this->actingAs($admin)->get('/admin/dashboard', $deferred)
        ->assertJsonPath('props.leaderboards.week.players.0.points', 40);

    expect(Cache::has(DashboardController::LEADERBOARD_CACHE_KEY))->toBeTrue()
        ->and(DashboardController::LEADERBOARD_CACHE_SECONDS)->toBeBetween(60, 120);

    dashboardPlay($player, 60, now()->subMinutes(5));

    $this->actingAs($admin)->get('/admin/dashboard', $deferred)
        ->assertJsonPath('props.leaderboards.week.players.0.points', 40);

    Cache::forget(DashboardController::LEADERBOARD_CACHE_KEY);

    $this->actingAs($admin)->get('/admin/dashboard', $deferred)
        ->assertJsonPath('props.leaderboards.week.players.0.points', 100);
});

it('keeps the dashboard leaderboard behind admin access', function () {
    $this->actingAs(User::factory()->create(['is_superadmin' => false]))
        ->get('/admin/dashboard', ['X-Inertia' => 'true', 'X-Inertia-Version' => (string) app(HandleInertiaRequests::class)->version(Request::create('/')), 'X-Inertia-Partial-Component' => 'admin/dashboard', 'X-Inertia-Partial-Data' => 'leaderboards'])
        ->assertForbidden();
});
