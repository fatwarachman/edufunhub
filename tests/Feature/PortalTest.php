<?php

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
        ->has('leaderboard', 0)
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
        ->where('leaderboard.0.name', 'Andika')
        ->where('leaderboard.0.points', 250)
        ->where('leaderboard.0.isMe', true)
        ->where('leaderboard.1.points', 150)
        ->where('leaderboard.1.isMe', false)
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
        ->has('leaderboard', 1)
        ->where('leaderboard.0.points', 40));
});
