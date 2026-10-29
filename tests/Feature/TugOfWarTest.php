<?php

use App\Http\Requests\StoreGameResultRequest;
use App\Models\GameAccess;
use App\Models\GameHistory;
use App\Models\GameMatch;
use App\Models\PlayerProfile;
use App\Models\User;
use Illuminate\Testing\TestResponse;
use Inertia\Testing\AssertableInertia as Assert;

beforeEach(function (): void {
    $this->withoutVite();
    config(['game-service.secret' => str_repeat('t', 40)]);
});

/** @param array<string, mixed> $payload */
function postTugOfWarResult(array $payload): TestResponse
{
    $body = (string) json_encode($payload);
    $timestamp = (string) now()->getTimestamp();

    return test()->call('POST', '/api/internal/game-results', [], [], [], [
        'HTTP_X_GAME_TIMESTAMP' => $timestamp,
        'HTTP_X_GAME_SIGNATURE' => hash_hmac('sha256', $timestamp.'.'.$body, config('game-service.secret')),
        'CONTENT_TYPE' => 'application/json',
        'HTTP_ACCEPT' => 'application/json',
    ], $body);
}

/**
 * Result of a 2 vs 2 match (red won) as the Go referee reports it.
 *
 * @return array<string, mixed>
 */
function tugOfWarResult(User $user, int $points = 95): array
{
    return [
        'event_id' => 'tw-'.$user->id.'-room-1790000000000',
        'user_id' => $user->id,
        'game_key' => 'tug-of-war',
        'mission' => 'room',
        'grade' => 5,
        'points' => $points,
        'correct' => 3,
        'wrong' => 1,
        'duration_seconds' => 180,
        'completed_at' => now()->toIso8601String(),
        'answers' => [],
        'match' => [
            'key' => 'tw-482913-1790000000000',
            'mode' => 'room',
            'pin' => '482913',
            'level' => 1,
            'grade' => 5,
            'started_at' => now()->subMinutes(3)->toIso8601String(),
            'ended_at' => now()->toIso8601String(),
            'finished' => true,
            'players' => [
                ['user_id' => $user->id, 'name' => $user->name, 'grade' => 5, 'rank' => 1, 'score' => 3, 'correct' => 3, 'wrong' => 1],
                ['user_id' => null, 'name' => 'Teman', 'grade' => 5, 'rank' => 2, 'score' => 2, 'correct' => 2, 'wrong' => 0],
                ['user_id' => null, 'name' => 'Lawan A', 'grade' => 5, 'rank' => 3, 'score' => 0, 'correct' => 0, 'wrong' => 2],
                ['user_id' => null, 'name' => 'Lawan B', 'grade' => 5, 'rank' => 3, 'score' => 0, 'correct' => 0, 'wrong' => 1],
            ],
        ],
    ];
}

it('requires sign in for the page invite and token', function (): void {
    $this->get('/games/tug-of-war')->assertRedirect('/login');
    $this->get('/games/tug-of-war/join/482913')->assertRedirect('/login');
    $this->postJson('/games/tug-of-war/token')->assertUnauthorized();
});

it('renders player identity pin service and ads while recording access', function (): void {
    $user = User::factory()->withPlayerDetails()->create();

    $this->actingAs($user)->get('/games/tug-of-war?pin=482913')->assertOk()->assertInertia(fn (Assert $page) => $page
        ->component('games/tug-of-war', false)
        ->where('player.id', $user->id)
        ->where('pin', '482913')
        ->where('wsUrl', '/game-ws/tug-of-war')
        ->where('serviceReady', true)
        ->has('ads'));

    expect(GameAccess::query()->where('user_id', $user->id)->where('game_key', 'tug-of-war')->exists())->toBeTrue();
});

it('ignores malformed pins', function (): void {
    $user = User::factory()->withPlayerDetails()->create();

    $this->actingAs($user)->get('/games/tug-of-war?pin=12ab')->assertOk()
        ->assertInertia(fn (Assert $page) => $page->where('pin', null));
});

it('issues a signed token for the game with a default grade', function (): void {
    $user = User::factory()->withPlayerDetails()->create();
    PlayerProfile::query()->where('user_id', $user->id)->update(['grade' => null]);

    $token = $this->actingAs($user)->postJson('/games/tug-of-war/token')->assertOk()->json('token');
    [$payload] = explode('.', (string) $token);
    $claims = json_decode((string) base64_decode(strtr($payload, '-_', '+/')), true);

    expect($claims['game'])->toBe('tug-of-war')
        ->and($claims['sub'])->toBe($user->id)
        ->and($claims['grade'])->toBe(PlayerProfile::MIN_GRADE);
});

it('refuses tokens while the game service is not configured', function (): void {
    config(['game-service.secret' => '']);

    $this->actingAs(User::factory()->withPlayerDetails()->create())->postJson('/games/tug-of-war/token')->assertServiceUnavailable();
});

it('records the team result, points and match once', function (): void {
    $user = User::factory()->create(['locale' => 'id']);

    postTugOfWarResult(tugOfWarResult($user))->assertCreated();
    postTugOfWarResult(tugOfWarResult($user))->assertSuccessful();

    expect(GameHistory::query()->sole()->game_name)->toBe('Tarik Tambang')
        ->and((int) $user->pointLedgers()->sum('points'))->toBe(95)
        ->and(GameMatch::query()->sole()->players()->count())->toBe(4);
});

it('rejects results above the cap or with a foreign event id or mission', function (array $override): void {
    $user = User::factory()->create();

    postTugOfWarResult(array_replace(tugOfWarResult($user), $override))->assertUnprocessable();
})->with([
    'points above cap' => [['points' => StoreGameResultRequest::GAMES['tug-of-war']['max_points'] + 1]],
    'ping pong event id' => [['event_id' => 'pp-1-room-1790000000000']],
    'unknown mission' => [['mission' => 'level-1']],
]);

it('caps tug of war like the go referee', function (): void {
    expect(StoreGameResultRequest::GAMES['tug-of-war']['max_points'])->toBe(9170)
        ->and(StoreGameResultRequest::GAMES['tug-of-war']['max_players'])->toBe(21);
});
