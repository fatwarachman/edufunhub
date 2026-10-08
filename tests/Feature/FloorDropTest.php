<?php

use App\Models\GameHistory;
use App\Models\GameMatch;
use App\Models\User;
use App\Services\GameServiceSigner;
use Illuminate\Testing\TestResponse;
use Inertia\Testing\AssertableInertia as Assert;

beforeEach(function (): void {
    $this->withoutVite();
    config(['game-service.secret' => str_repeat('f', 40)]);
});

/**
 * @param  array<string, mixed>  $payload
 */
function postFloorResult(array $payload): TestResponse
{
    $body = json_encode($payload);
    $timestamp = (string) now()->getTimestamp();

    return test()->call('POST', '/api/internal/game-results', [], [], [], [
        'HTTP_X_GAME_TIMESTAMP' => $timestamp,
        'HTTP_X_GAME_SIGNATURE' => hash_hmac('sha256', $timestamp.'.'.$body, config('game-service.secret')),
        'CONTENT_TYPE' => 'application/json',
        'HTTP_ACCEPT' => 'application/json',
    ], $body);
}

/**
 * @return array<string, mixed>
 */
function floorTokenClaims(string $token): array
{
    return json_decode(base64_decode(strtr(explode('.', $token)[0], '-_', '+/')), true);
}

/**
 * @param  list<User>  $users
 * @return array<string, mixed>
 */
function floorMatch(array $users, int $winner = 0): array
{
    return [
        'key' => 'fd-123456-1790000000000',
        'mode' => 'room',
        'pin' => '123456',
        'level' => 7,
        'grade' => 4,
        'started_at' => now()->subMinutes(3)->toIso8601String(),
        'ended_at' => now()->toIso8601String(),
        'finished' => true,
        'players' => collect($users)->map(fn (User $user, int $i): array => [
            'user_id' => $user->id,
            'name' => $user->name,
            'grade' => 4,
            'rank' => $i === $winner ? 1 : $i + 1,
            'score' => $i === $winner ? 7 : 3,
            'correct' => $i === $winner ? 7 : 2,
            'wrong' => $i === $winner ? 0 : 1,
            'survival_ms' => $i === $winner ? 95000 : 41000,
            'accuracy' => $i === $winner ? 100.0 : 66.7,
        ])->all(),
    ];
}

it('renders the role picker, host screen and invite as a player', function (): void {
    $user = User::factory()->withPlayerDetails()->create();

    $this->actingAs($user)->get('/games/floor-drop')->assertOk()->assertInertia(fn (Assert $page) => $page
        ->component('games/floor-drop')
        ->where('role', null)
        ->where('wsUrl', '/game-ws/floor-drop')
        ->where('serviceReady', true)
        ->has('ads'));

    $this->actingAs($user)->get('/games/floor-drop?role=host')->assertInertia(fn (Assert $page) => $page->where('role', 'host'));

    $this->actingAs($user)->get('/games/floor-drop/join/654321')->assertRedirect('/games/floor-drop?pin=654321');
    $this->actingAs($user)->get('/games/floor-drop?pin=654321')->assertInertia(fn (Assert $page) => $page->where('pin', '654321'));
});

it('signs separate host and player tokens', function (): void {
    $user = User::factory()->withPlayerDetails()->create();

    $player = $this->actingAs($user)->postJson('/games/floor-drop/token')->assertOk()->json('token');
    $host = $this->actingAs($user)->postJson('/games/floor-drop/token?role=host')->assertOk()->json('token');

    expect(floorTokenClaims($player)['game'])->toBe('floor-drop')
        ->and(floorTokenClaims($host)['game'])->toBe('floor-drop-host')
        ->and(floorTokenClaims($player)['sub'])->toBe($user->id);
});

it('requires a configured game service for tokens', function (): void {
    config(['game-service.secret' => '']);
    $user = User::factory()->withPlayerDetails()->create();

    expect(app(GameServiceSigner::class)->isConfigured())->toBeFalse();
    $this->actingAs($user)->postJson('/games/floor-drop/token')->assertStatus(503);
});

it('stores final ranks, survival and accuracy for up to 100 players', function (): void {
    $users = User::factory()->count(12)->create(['locale' => 'id']);

    postFloorResult([
        'event_id' => 'fd-'.$users[0]->id.'-room-1790000000000',
        'user_id' => $users[0]->id,
        'game_key' => 'floor-drop',
        'mission' => 'room',
        'grade' => 4,
        'points' => 95,
        'correct' => 7,
        'wrong' => 0,
        'duration_seconds' => 180,
        'completed_at' => now()->toIso8601String(),
        'match' => floorMatch($users->all()),
    ])->assertCreated();

    $match = GameMatch::query()->sole();
    $winner = $match->players()->where('rank', 1)->sole();

    expect($match->players_count)->toBe(12)
        ->and($match->level)->toBe(7)
        ->and($winner->user_id)->toBe($users[0]->id)
        ->and($winner->survival_ms)->toBe(95000)
        ->and($winner->accuracy)->toBe(100.0)
        ->and($winner->game_history_id)->toBe(GameHistory::query()->sole()->id)
        ->and(GameHistory::query()->sole()->game_name)->toBe('Lantai Runtuh');
});

it('rejects invalid floor drop results', function (array $override): void {
    $user = User::factory()->create();

    postFloorResult(array_merge([
        'event_id' => 'fd-'.$user->id.'-room-1790000000000',
        'user_id' => $user->id,
        'game_key' => 'floor-drop',
        'mission' => 'room',
        'grade' => 4,
        'points' => 50,
        'correct' => 3,
        'wrong' => 1,
        'duration_seconds' => 60,
        'completed_at' => now()->toIso8601String(),
    ], $override))->assertUnprocessable();
})->with([
    'points above cap' => [['points' => 18151]],
    'wrong event id' => [['event_id' => 'fd-1-duel-1']],
    'wrong mission' => [['mission' => 'duel']],
    'more than 100 players' => [['match' => [...floorMatch([]), 'players' => array_fill(0, 101, ['name' => 'X', 'grade' => 4, 'rank' => 1, 'score' => 0, 'correct' => 0, 'wrong' => 0])]]],
    'accuracy above 100' => [['match' => [...floorMatch([]), 'players' => [['name' => 'X', 'grade' => 4, 'rank' => 1, 'score' => 0, 'correct' => 0, 'wrong' => 0, 'accuracy' => 120]]]]],
]);

it('lists floor drop in the quiz category', function (): void {
    $quiz = collect(config('game-catalog.categories'))->firstWhere('key', 'quiz');

    expect(collect($quiz['games'])->pluck('key')->all())->toContain('floor-drop');
});
