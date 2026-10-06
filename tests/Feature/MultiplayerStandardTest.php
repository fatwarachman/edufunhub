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
    'market math' => ['market-math', '/games/market-math'],
    'number garden' => ['number-garden', '/games/number-garden'],
    'explore indonesia' => ['explore-indonesia', '/games/explore-indonesia'],
    'mini lab' => ['mini-lab', '/games/mini-lab'],
    'floor drop' => ['floor-drop', '/games/floor-drop'],
    'economy heist' => ['economy-heist', '/games/economy-heist'],
    'order rush' => ['order-rush', '/games/order-rush'],
    'turbo trivia' => ['turbo-trivia', '/games/turbo-trivia'],
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
    'market math' => ['market-math', 'mm-%d-room-1790000000000', 'room', 45, 'Pasar Matematika'],
    'number garden' => ['number-garden', 'ng-%d-room-1790000000000', 'room', 45, 'Taman Angka & Huruf'],
    'explore indonesia' => ['explore-indonesia', 'ei-%d-room-1790000000000', 'room', 45, 'Jelajah Indonesia'],
    'mini lab' => ['mini-lab', 'ml-%d-room-1790000000000', 'room', 45, 'Lab Mini'],
    'floor drop' => ['floor-drop', 'fd-%d-room-1790000000000', 'room', 45, 'Lantai Runtuh'],
    'economy heist' => ['economy-heist', 'eh-%d-room-1790000000000', 'room', 45, 'Peti Emas Misteri'],
    'order rush' => ['order-rush', 'or-%d-room-1790000000000', 'room', 45, 'Order Rush TKJ'],
    'turbo trivia' => ['turbo-trivia', 'tt-%d-room-1790000000000', 'room', 45, 'Turbo Trivia'],
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

it('caps room quiz game points and event ids', function (string $game, array $override): void {
    $user = User::factory()->create();
    $prefix = ['market-math' => 'mm', 'number-garden' => 'ng', 'explore-indonesia' => 'ei', 'mini-lab' => 'ml'][$game];

    postRoomResult(array_merge([
        'event_id' => $prefix.'-'.$user->id.'-room-1790000000000',
        'user_id' => $user->id,
        'game_key' => $game,
        'mission' => 'room',
        'grade' => 3,
        'points' => 10,
        'correct' => 1,
        'wrong' => 0,
        'duration_seconds' => 60,
        'completed_at' => now()->toIso8601String(),
    ], $override))->assertUnprocessable();
})->with(['market-math', 'number-garden', 'explore-indonesia', 'mini-lab'])->with([
    'points above cap' => [['points' => 951]],
    'foreign event id' => [['event_id' => 'cw-1-level-1']],
    'unknown mission' => [['mission' => 'level-1']],
]);

it('serves room quiz games with a signed token for every grade', function (string $game): void {
    $user = User::factory()->withPlayerDetails()->create();

    $this->actingAs($user)->get("/games/{$game}")->assertOk()->assertInertia(fn (Assert $page) => $page
        ->component('games/mini-game')
        ->where('game', $game)
        ->where('wsUrl', "/game-ws/{$game}")
        ->where('pin', null));

    $token = $this->actingAs($user)->postJson("/games/{$game}/token")->assertOk()->json('token');
    $claims = json_decode(base64_decode(strtr(explode('.', $token)[0], '-_', '+/')), true);

    expect($claims['game'])->toBe($game)->and($claims['sub'])->toBe($user->id);
})->with(['market-math', 'number-garden', 'explore-indonesia', 'mini-lab']);

it('requires sign in for room quiz games', function (string $game): void {
    $this->get("/games/{$game}")->assertRedirect('/login');
    $this->postJson("/games/{$game}/token")->assertUnauthorized();
})->with(['market-math', 'number-garden', 'explore-indonesia', 'mini-lab']);
