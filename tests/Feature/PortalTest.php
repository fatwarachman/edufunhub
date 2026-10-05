<?php

use App\Models\GameAccess;
use App\Models\GameHistory;
use App\Models\PlayerProfile;
use App\Models\PointLedger;
use App\Models\User;
use Illuminate\Testing\TestResponse;
use Inertia\Testing\AssertableInertia as Assert;

const PORTAL_SECRET = 'portal-test-secret-with-at-least-32-chars';

beforeEach(function (): void {
    config(['scout.driver' => 'null', 'game-service.secret' => PORTAL_SECRET]);
    $this->withoutVite();
});

/**
 * @param  array<string, mixed>  $overrides
 */
function reportPortalResult(mixed $test, User $user, array $overrides = []): TestResponse
{
    $body = json_encode(array_replace([
        'event_id' => 'fq-'.$user->id.'-lakeside-'.random_int(1, PHP_INT_MAX),
        'user_id' => $user->id,
        'game_key' => 'flag-quest',
        'mission' => 'lakeside',
        'grade' => 5,
        'points' => 120,
        'correct' => 10,
        'wrong' => 1,
        'duration_seconds' => 200,
        'completed_at' => now()->toIso8601String(),
    ], $overrides));
    $timestamp = (string) now()->getTimestamp();

    return $test->call('POST', '/api/internal/game-results', [], [], [], [
        'CONTENT_TYPE' => 'application/json',
        'HTTP_ACCEPT' => 'application/json',
        'HTTP_X_GAME_TIMESTAMP' => $timestamp,
        'HTTP_X_GAME_SIGNATURE' => hash_hmac('sha256', $timestamp.'.'.$body, PORTAL_SECRET),
    ], $body);
}

test('portal requires login', function (): void {
    $this->get('/portal')->assertRedirect(route('login'));
});

test('disabled players cannot open the portal', function (): void {
    $user = User::factory()->create(['disabled_at' => now()]);

    $this->actingAs($user)->get('/portal')->assertForbidden();
});

test('players land on the portal after password login', function (): void {
    $user = User::factory()->withoutTwoFactor()->create();

    $this->post(route('login.store'), ['email' => $user->email, 'password' => 'password'])
        ->assertRedirect('/portal');
});

test('portal lists every catalog game with play urls and point rules', function (): void {
    $user = User::factory()->create();
    PlayerProfile::factory()->for($user)->create(['nickname' => 'Andika', 'grade' => 3, 'color' => 'teal', 'accessory' => 'cap']);

    $this->actingAs($user)->get('/portal')->assertOk()->assertInertia(fn (Assert $page) => $page
        ->component('portal/index', false)
        ->where('player.name', 'Andika')
        ->where('player.grade', 3)
        ->where('player.character.color', 'teal')
        ->where('player.character.accessory', 'cap')
        ->where('player.character.nickname', 'Andika')
        ->has('categories', 6)
        ->where('categories.0.games.0.key', 'flag-quest')
        ->where('categories.0.games.0.url', '/games/flag-quest')
        ->where('categories.0.games.0.awardsPoints', true)
        ->where('categories.0.games.0.recommended', true)
        ->where('categories.1.games.0.url', '/games/snakes-and-ladders')
        ->where('categories.1.games.0.awardsPoints', true)
        ->where('categories.2.games.0.url', '/games/sky-quiz')
        ->where('categories.2.games.0.recommended', true)
        ->where('progress.points', 0)
        ->where('progress.level', 1)
        ->where('rank', null)
        ->has('leaderboards.all.entries', 0)
        ->where('leaderboards.all.me', null)
        ->has('recent', 0));
});

test('recommendation follows the dashboard grade', function (): void {
    $user = User::factory()->create();
    PlayerProfile::factory()->for($user)->create(['grade' => 9]);

    $this->actingAs($user)->get('/portal')->assertInertia(fn (Assert $page) => $page
        ->where('categories.0.games.0.recommended', true)
        ->where('categories.2.games.0.recommended', true)
        ->where('categories.2.games.0.awardsPoints', true));
});

test('every portal game url responds for a logged in player', function (): void {
    $user = User::factory()->create();
    PlayerProfile::factory()->for($user)->create(['grade' => 4]);
    $this->actingAs($user);

    foreach (config('game-catalog.categories') as $category) {
        foreach ($category['games'] as $game) {
            $this->get(route($game['route']))->assertOk();
        }
    }
});

test('verified game results flow into portal points, level, rank, history and dashboard', function (): void {
    $user = User::factory()->create(['name' => 'Andika Pratama']);
    PlayerProfile::factory()->for($user)->create(['nickname' => 'Andika', 'grade' => 5]);
    $rival = User::factory()->create();
    PointLedger::factory()->for($rival)->create(['points' => 150]);

    reportPortalResult($this, $user, ['points' => 120])->assertCreated();
    reportPortalResult($this, $user, ['points' => 130, 'mission' => 'forest'])->assertCreated();

    $this->actingAs($user)->get('/portal')->assertInertia(fn (Assert $page) => $page
        ->where('progress.points', 250)
        ->where('progress.level', 2)
        ->where('progress.levelProgress', 50)
        ->where('progress.nextLevelAt', 400)
        ->where('rank', 1)
        ->where('leaderboards.all.entries.0.name', 'Andika')
        ->where('leaderboards.all.entries.0.points', 250)
        ->where('leaderboards.all.entries.0.isMe', true)
        ->where('leaderboards.all.entries.1.points', 150)
        ->where('leaderboards.all.entries.1.isMe', false)
        ->where('leaderboards.all.entries.1.userId', $rival->id)
        ->where('leaderboards.all.entries.0.userId', $user->id)
        ->where('leaderboards.all.me', ['rank' => 1, 'points' => 250])
        ->where('leaderboards.week.entries.0.name', 'Andika')
        ->has('recent', 2)
        ->where('recent.0.game_key', 'flag-quest'));

    $this->get('/dashboard')->assertInertia(fn (Assert $page) => $page
        ->where('points', 250)
        ->where('progress.level', 2)
        ->has('history', 2));

    $this->actingAs($rival)->get('/portal')->assertInertia(fn (Assert $page) => $page->where('rank', 2));
});

test('duplicate or tampered results never change points', function (): void {
    $user = User::factory()->create();
    $eventId = 'fq-'.$user->id.'-summit-42';

    reportPortalResult($this, $user, ['event_id' => $eventId, 'points' => 90])->assertCreated();
    reportPortalResult($this, $user, ['event_id' => $eventId, 'points' => 90])->assertOk();
    reportPortalResult($this, $user, ['points' => 5000])->assertUnprocessable();

    expect((int) $user->pointLedgers()->sum('points'))->toBe(90);
    $this->assertDatabaseCount('game_histories', 1);
});

test('browser cannot post points directly to player surfaces', function (string $path): void {
    $user = User::factory()->create();

    $this->actingAs($user)->post($path, ['points' => 1000])->assertStatus(405);
    $this->assertDatabaseCount('point_ledgers', 0);
})->with(['/portal', '/games/flag-quest']);

test('leaderboard hides disabled players and players without points', function (): void {
    $viewer = User::factory()->create();
    $disabled = User::factory()->create(['disabled_at' => now()]);
    PointLedger::factory()->for($disabled)->create(['points' => 999]);
    User::factory()->create();
    $active = User::factory()->create();
    PointLedger::factory()->for($active)->create(['points' => 40]);
    GameHistory::factory()->for($active)->create();

    $this->actingAs($viewer)->get('/portal')->assertInertia(fn (Assert $page) => $page
        ->has('leaderboards.all.entries', 1)
        ->where('leaderboards.all.entries.0.points', 40));
});

test('leaderboard ranks players per week, month and all time', function (): void {
    $viewer = User::factory()->create();
    PlayerProfile::factory()->for($viewer)->create(['nickname' => 'Viewer']);
    $veteran = User::factory()->create();
    PlayerProfile::factory()->for($veteran)->create(['nickname' => 'Veteran']);
    $monthly = User::factory()->create();
    PlayerProfile::factory()->for($monthly)->create(['nickname' => 'Monthly']);

    PointLedger::factory()->for($veteran)->create(['points' => 900, 'created_at' => now()->subDays(60)]);
    PointLedger::factory()->for($monthly)->create(['points' => 300, 'created_at' => now()->subDays(20)]);
    PointLedger::factory()->for($viewer)->create(['points' => 50, 'created_at' => now()->subDays(2)]);
    PointLedger::factory()->for($viewer)->create(['points' => -30, 'created_at' => now()->subDay()]);

    $this->actingAs($viewer)->get('/portal')->assertInertia(fn (Assert $page) => $page
        ->has('leaderboards.week.entries', 1)
        ->where('leaderboards.week.entries.0.name', 'Viewer')
        ->where('leaderboards.week.entries.0.points', 50)
        ->where('leaderboards.week.me', ['rank' => 1, 'points' => 50])
        ->has('leaderboards.month.entries', 2)
        ->where('leaderboards.month.entries.0.name', 'Monthly')
        ->where('leaderboards.month.me', ['rank' => 2, 'points' => 50])
        ->has('leaderboards.all.entries', 3)
        ->where('leaderboards.all.entries.0.name', 'Veteran')
        ->where('leaderboards.all.entries.2.isMe', true)
        ->where('leaderboards.all.me', ['rank' => 3, 'points' => 50]));
});

test('leaderboard shows the viewer standing outside the top ten', function (): void {
    $viewer = User::factory()->create();
    PointLedger::factory()->for($viewer)->create(['points' => 5]);

    foreach (range(1, 10) as $index) {
        PointLedger::factory()->for(User::factory()->create())->create(['points' => 100 + $index]);
    }

    $this->actingAs($viewer)->get('/portal')->assertInertia(fn (Assert $page) => $page
        ->has('leaderboards.all.entries', 10)
        ->where('leaderboards.all.entries.9.isMe', false)
        ->where('leaderboards.all.me', ['rank' => 11, 'points' => 5])
        ->where('rank', 11));
});

test('players without points in a period are not ranked in it', function (): void {
    $viewer = User::factory()->create();
    PointLedger::factory()->for($viewer)->create(['points' => 70, 'created_at' => now()->subDays(45)]);

    $this->actingAs($viewer)->get('/portal')->assertInertia(fn (Assert $page) => $page
        ->has('leaderboards.week.entries', 0)
        ->where('leaderboards.week.me', null)
        ->where('leaderboards.month.me', null)
        ->where('leaderboards.all.me', ['rank' => 1, 'points' => 70]));
});

test('portal game cards show play counts and badge the three most played games', function (): void {
    $user = User::factory()->create();
    PlayerProfile::factory()->for($user)->create(['grade' => 4]);

    GameAccess::factory()->count(5)->create(['game_key' => 'crossword', 'accessed_at' => now()->subDays(2)]);
    GameAccess::factory()->count(3)->create(['game_key' => 'sky-quiz', 'accessed_at' => now()->subDays(10)]);
    GameAccess::factory()->count(2)->create(['game_key' => 'flag-quest', 'accessed_at' => now()->subDay()]);
    GameAccess::factory()->create(['game_key' => 'mini-lab', 'accessed_at' => now()]);
    GameAccess::factory()->count(9)->create(['game_key' => 'market-math', 'accessed_at' => now()->subDays(45)]);

    $this->actingAs($user)->get('/portal')->assertInertia(function (Assert $page): void {
        $page->where('popularityDays', 30);
        $games = collect($page->toArray()['props']['categories'])->flatMap(fn (array $category): array => $category['games'])->keyBy('key');

        expect($games['crossword']['plays'])->toBe(5)
            ->and($games['crossword']['popularRank'])->toBe(1)
            ->and($games['sky-quiz']['popularRank'])->toBe(2)
            ->and($games['flag-quest']['popularRank'])->toBe(3)
            ->and($games['mini-lab']['plays'])->toBe(1)
            ->and($games['mini-lab']['popularRank'])->toBeNull()
            ->and($games['market-math']['plays'])->toBe(0)
            ->and($games['market-math']['popularRank'])->toBeNull();
    });
});

test('no game is badged most played when nothing was played recently', function (): void {
    $user = User::factory()->create();

    $this->actingAs($user)->get('/portal')->assertInertia(function (Assert $page): void {
        $games = collect($page->toArray()['props']['categories'])->flatMap(fn (array $category): array => $category['games']);

        expect($games->pluck('popularRank')->filter()->all())->toBe([])
            ->and($games->sum('plays'))->toBe(0);
    });
});

test('games with the same play count share a most played rank', function (): void {
    $user = User::factory()->create();
    GameAccess::factory()->count(4)->create(['game_key' => 'sky-quiz']);
    GameAccess::factory()->count(4)->create(['game_key' => 'snakes-and-ladders']);
    GameAccess::factory()->count(2)->create(['game_key' => 'crossword']);
    GameAccess::factory()->count(2)->create(['game_key' => 'mini-lab']);
    GameAccess::factory()->create(['game_key' => 'flag-quest']);

    $this->actingAs($user)->get('/portal')->assertInertia(function (Assert $page): void {
        $games = collect($page->toArray()['props']['categories'])->flatMap(fn (array $category): array => $category['games'])->keyBy('key');

        expect($games['sky-quiz']['popularRank'])->toBe(1)
            ->and($games['snakes-and-ladders']['popularRank'])->toBe(1)
            ->and($games['crossword']['popularRank'])->toBe(3)
            ->and($games['mini-lab']['popularRank'])->toBe(3)
            ->and($games['flag-quest']['popularRank'])->toBeNull();
    });
});
