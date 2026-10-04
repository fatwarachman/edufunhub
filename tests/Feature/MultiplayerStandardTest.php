<?php

use App\Http\Requests\StoreGameResultRequest;
use App\Models\GameHistory;
use App\Models\PlayerProfile;
use App\Models\User;
use Illuminate\Testing\TestResponse;
use Inertia\Testing\AssertableInertia as Assert;

beforeEach(function (): void {
    $this->withoutVite();
    config(['game-service.secret' => str_repeat('m', 40)]);
});

/**
 * @param  array<string, mixed>  $payload
 */
function postRoomResult(array $payload): TestResponse
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

dataset('multiplayer games', [
    'snakes' => ['snakes-and-ladders', '/games/snakes-and-ladders'],
    'duel' => ['quiz-duel', '/games/quiz-duel'],
    'crossword' => ['crossword', '/games/crossword'],
]);

it('marks every multiplayer game in the catalog', function (string $key): void {
    $game = collect(config('game-catalog.categories'))->flatMap(fn (array $c): array => $c['games'])->firstWhere('key', $key);

    expect($game['multiplayer'] ?? false)->toBeTrue()
        ->and($game['awards_points'])->toBeTrue();
})->with('multiplayer games');

it('follows the standard invite link to the room', function (string $key, string $url): void {
    $user = User::factory()->withPlayerDetails()->create();

    $this->actingAs($user)->get("/games/{$key}/join/482913")->assertRedirect("{$url}?pin=482913");
})->with('multiplayer games');

it('passes the invite pin to the game page', function (string $key, string $url): void {
    $user = User::factory()->withPlayerDetails()->create();
    PlayerProfile::query()->where('user_id', $user->id)->update(['grade' => 4]);

    $this->actingAs($user)->get("{$url}?pin=482913")->assertOk()
        ->assertInertia(fn (Assert $page) => $page->where('pin', '482913'));
})->with('multiplayer games');

it('sends guests to sign in before following an invite link', function (): void {
    $this->get('/games/crossword/join/482913')->assertRedirect('/login');
});

it('rejects invite links for unknown or single player games and bad pins', function (string $path): void {
    $user = User::factory()->withPlayerDetails()->create();

    $this->actingAs($user)->get($path)->assertNotFound();
})->with([
    'single player game' => '/games/sky-quiz/join/482913',
    'unknown game' => '/games/chess/join/482913',
    'short pin' => '/games/crossword/join/48291',
    'letters' => '/games/crossword/join/abcdef',
]);

it('records results for room games and adds them to the point total', function (string $game, string $event, string $mission, int $points, string $name): void {
    $user = User::factory()->create(['locale' => 'id']);
    $user->pointLedgers()->create(['points' => 40, 'reason' => 'earlier', 'event_id' => 'seed-'.$game]);

    postRoomResult([
        'event_id' => sprintf($event, $user->id),
        'user_id' => $user->id,
        'game_key' => $game,
        'mission' => $mission,
        'grade' => 0,
        'points' => $points,
        'correct' => 0,
        'wrong' => 3,
        'duration_seconds' => 120,
        'completed_at' => now()->toIso8601String(),
        'answers' => [],
    ])->assertCreated();

    expect(GameHistory::query()->sole()->game_name)->toBe($name)
        ->and((int) $user->pointLedgers()->sum('points'))->toBe(40 + $points);
})->with([
    'snakes, lost with no correct answers' => ['snakes-and-ladders', 'sl-%d-room-1790000000000', 'room', 5, 'Ular Tangga Edukasi'],
    'crossword level 3' => ['crossword', 'cw-%d-level-1790000000000', 'level-3', 50, 'Teka-Teki Silang — Level 3'],
]);

it('caps room game points and missions', function (array $override): void {
    $user = User::factory()->create();

    postRoomResult(array_merge([
        'event_id' => 'cw-'.$user->id.'-level-1790000000000',
        'user_id' => $user->id,
        'game_key' => 'crossword',
        'mission' => 'level-1',
        'grade' => 3,
        'points' => 10,
        'correct' => 1,
        'wrong' => 0,
        'duration_seconds' => 60,
        'completed_at' => now()->toIso8601String(),
    ], $override))->assertUnprocessable();
})->with([
    'crossword points above cap' => [['points' => StoreGameResultRequest::GAMES['crossword']['max_points'] + 1]],
    'unknown level' => [['mission' => 'level-9']],
    'snakes points above cap' => [['game_key' => 'snakes-and-ladders', 'mission' => 'room', 'event_id' => 'sl-1-room-1', 'points' => StoreGameResultRequest::GAMES['snakes-and-ladders']['max_points'] + 1]],
]);

it('opens the crossword for every grade, including players without a grade', function (): void {
    $user = User::factory()->withPlayerDetails()->create();
    PlayerProfile::query()->where('user_id', $user->id)->update(['grade' => null, 'nickname' => 'Sari']);

    $this->actingAs($user)->get('/games/crossword')->assertOk()->assertInertia(fn (Assert $page) => $page
        ->component('games/crossword')
        ->where('player.name', 'Sari')
        ->where('wsUrl', '/game-ws/crossword')
        ->where('serviceReady', true));

    $token = $this->actingAs($user)->postJson('/games/crossword/token')->assertOk()->json('token');
    $claims = json_decode(base64_decode(strtr(explode('.', $token)[0], '-_', '+/')), true);

    expect($claims['game'])->toBe('crossword')->and($claims['grade'])->toBe(0);
});

it('requires sign in for the crossword', function (): void {
    $this->get('/games/crossword')->assertRedirect('/login');
    $this->postJson('/games/crossword/token')->assertUnauthorized();
});
