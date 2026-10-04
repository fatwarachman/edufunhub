<?php

use App\Http\Requests\StoreGameResultRequest;
use App\Models\GameHistory;
use App\Models\PlayerProfile;
use App\Models\User;
use Inertia\Testing\AssertableInertia as Assert;

beforeEach(function (): void {
    $this->withoutVite();
    config(['game-service.secret' => str_repeat('s', 40)]);
});

function signSkyResult(array $payload): array
{
    $body = json_encode($payload);
    $timestamp = (string) now()->getTimestamp();

    return [$body, [
        'X-Game-Timestamp' => $timestamp,
        'X-Game-Signature' => hash_hmac('sha256', $timestamp.'.'.$body, config('game-service.secret')),
        'Content-Type' => 'application/json',
        'Accept' => 'application/json',
    ]];
}

function skyResult(User $user, array $overrides = []): array
{
    return array_merge([
        'event_id' => 'sq-'.$user->id.'-sky-1790000000000',
        'user_id' => $user->id,
        'game_key' => 'sky-quiz',
        'mission' => 'sky',
        'grade' => 5,
        'points' => 90,
        'correct' => 7,
        'wrong' => 3,
        'duration_seconds' => 140,
        'completed_at' => now()->toIso8601String(),
    ], $overrides);
}

it('shows the guest demo without player data', function (): void {
    $this->get('/games/sky-quiz')->assertOk()->assertInertia(fn (Assert $page) => $page
        ->component('games/sky-quiz', false)
        ->where('player', null)
        ->where('serviceReady', false));
});

it('gives signed in players their profile grade, name and points', function (): void {
    $user = User::factory()->create(['name' => 'Budi']);
    PlayerProfile::factory()->for($user)->create(['color' => 'teal', 'accessory' => 'cap', 'nickname' => 'Andika', 'grade' => 7]);
    $user->pointLedgers()->create(['points' => 40, 'reason' => 'seed', 'event_id' => 'seed-1']);

    $this->actingAs($user)->get('/games/sky-quiz')->assertOk()->assertInertia(fn (Assert $page) => $page
        ->component('games/sky-quiz', false)
        ->where('player.name', 'Andika')
        ->where('player.grade', 7)
        ->where('points', 40)
        ->where('serviceReady', true)
        ->where('wsUrl', '/game-ws/sky'));
});

it('issues a sky-quiz token carrying the profile grade', function (): void {
    $user = User::factory()->create();
    PlayerProfile::factory()->for($user)->create(['grade' => 9]);

    $token = $this->actingAs($user)->postJson('/games/sky-quiz/token')->assertOk()->json('token');
    [$payload] = explode('.', $token);
    $claims = json_decode(base64_decode(strtr($payload, '-_', '+/')), true);

    expect($claims['game'])->toBe('sky-quiz')
        ->and($claims['grade'])->toBe(9)
        ->and($claims['sub'])->toBe($user->id);
});

it('requires a grade before issuing a token', function (): void {
    $user = User::factory()->withPlayerDetails()->create();

    $this->actingAs($user)->postJson('/games/sky-quiz/token')->assertStatus(422);
});

it('refuses tokens to guests', function (): void {
    $this->postJson('/games/sky-quiz/token')->assertUnauthorized();
});

it('records a verified sky result once and adds points', function (): void {
    $user = User::factory()->create(['locale' => 'id']);
    [$body, $headers] = signSkyResult(skyResult($user));

    $this->call('POST', '/api/internal/game-results', [], [], [], transformHeaders($headers), $body)->assertCreated();
    $this->call('POST', '/api/internal/game-results', [], [], [], transformHeaders($headers), $body)->assertOk()->assertJson(['status' => 'duplicate']);

    expect((int) $user->pointLedgers()->sum('points'))->toBe(90)
        ->and($user->pointLedgers()->first()->reason)->toBe('sky-quiz:sky')
        ->and(GameHistory::query()->where('user_id', $user->id)->sole()->game_name)->toBe('Sukhoi Sky Quiz');
});

it('reflects the stored award on a partial points reload', function (): void {
    $user = User::factory()->create();
    PlayerProfile::factory()->for($user)->create(['grade' => 5]);
    $user->pointLedgers()->create(['points' => 100, 'reason' => 'seed', 'event_id' => 'seed-2']);

    $this->actingAs($user)->get('/games/sky-quiz')->assertInertia(fn (Assert $page) => $page->where('points', 100));

    [$body, $headers] = signSkyResult(skyResult($user, ['points' => 110]));
    $this->call('POST', '/api/internal/game-results', [], [], [], transformHeaders($headers), $body)->assertCreated();

    $this->actingAs($user)->get('/games/sky-quiz')->assertInertia(fn (Assert $page) => $page
        ->where('points', 210)
        ->reload(fn (Assert $reloaded) => $reloaded->where('points', 210), only: ['points']));
});

it('keeps account points unchanged for a zero point flight', function (): void {
    $user = User::factory()->create();
    $user->pointLedgers()->create(['points' => 50, 'reason' => 'seed', 'event_id' => 'seed-3']);
    [$body, $headers] = signSkyResult(skyResult($user, ['points' => 0, 'correct' => 0, 'wrong' => 5]));

    $this->call('POST', '/api/internal/game-results', [], [], [], transformHeaders($headers), $body)->assertCreated();

    expect((int) $user->pointLedgers()->sum('points'))->toBe(50)
        ->and(GameHistory::query()->where('user_id', $user->id)->count())->toBe(1);
});

it('rejects invalid sky results', function (string $field, mixed $value): void {
    $user = User::factory()->create();
    [$body, $headers] = signSkyResult(skyResult($user, [$field => $value]));

    $this->call('POST', '/api/internal/game-results', [], [], [], transformHeaders($headers), $body)->assertUnprocessable();
    expect($user->pointLedgers()->count())->toBe(0);
})->with([
    'points above sky cap' => ['points', StoreGameResultRequest::GAMES['sky-quiz']['max_points'] + 1],
    'flag quest mission' => ['mission', 'lakeside'],
    'flag quest event id' => ['event_id', 'fq-1-lakeside-1'],
]);

it('rejects unsigned sky results', function (): void {
    $user = User::factory()->create();
    $this->postJson('/api/internal/game-results', skyResult($user))->assertForbidden();
});

it('marks sky quiz as a points game for all grades in the catalog', function (): void {
    $sky = collect(config('game-catalog.categories'))->flatMap(fn (array $c) => $c['games'])->firstWhere('key', 'sky-quiz');

    expect($sky['awards_points'])->toBeTrue()
        ->and($sky['requires_grade'])->toBeTrue()
        ->and($sky['max_grade'])->toBe(12);
});

function transformHeaders(array $headers): array
{
    $server = [];
    foreach ($headers as $name => $value) {
        $key = strtoupper(str_replace('-', '_', $name));
        $server[in_array($key, ['CONTENT_TYPE', 'CONTENT_LENGTH'], true) ? $key : 'HTTP_'.$key] = $value;
    }

    return $server;
}
