<?php

use App\Http\Requests\StoreGameResultRequest;
use App\Models\GameHistory;
use App\Models\GameMatch;
use App\Models\Question;
use App\Models\User;
use App\Services\GameServiceSigner;
use Illuminate\Support\Facades\Route;
use Illuminate\Testing\TestResponse;
use Inertia\Testing\AssertableInertia as Assert;

beforeEach(function (): void {
    $this->withoutVite();
    config(['game-service.secret' => str_repeat('m', 40)]);
});

/**
 * @param  array<string, mixed>  $payload
 */
function postMonsterCafeResult(array $payload): TestResponse
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
 * @return array<string, mixed>
 */
function monsterCafeClaims(string $token): array
{
    return json_decode(base64_decode(strtr(explode('.', $token)[0], '-_', '+/')), true);
}

/**
 * @param  list<User>  $users
 * @return array<string, mixed>
 */
function monsterCafeMatch(array $users): array
{
    return [
        'key' => 'mc-482913-1790000000000',
        'mode' => 'room',
        'pin' => '482913',
        'level' => 5,
        'grade' => 4,
        'started_at' => now()->subMinutes(5)->toIso8601String(),
        'ended_at' => now()->toIso8601String(),
        'finished' => true,
        'players' => collect($users)->map(fn (User $user, int $i): array => [
            'user_id' => $user->id,
            'name' => $user->name,
            'grade' => 4,
            'rank' => $i + 1,
            'score' => $i === 0 ? 1450 : 820,
            'correct' => $i === 0 ? 18 : 9,
            'wrong' => $i === 0 ? 3 : 6,
            'accuracy' => $i === 0 ? 85.7 : 60.0,
        ])->all(),
    ];
}

/**
 * @param  array<string, mixed>  $override
 * @return array<string, mixed>
 */
function monsterCafeResult(User $user, array $override = []): array
{
    return array_merge([
        'event_id' => 'mc-'.$user->id.'-room-1790000000000',
        'user_id' => $user->id,
        'game_key' => 'monster-cafe',
        'mission' => 'room',
        'grade' => 4,
        'points' => 160,
        'correct' => 18,
        'wrong' => 3,
        'duration_seconds' => 300,
        'completed_at' => now()->toIso8601String(),
        'answers' => [],
    ], $override);
}

it('renders the role picker, host screen and invite with the portal avatar', function (): void {
    $user = User::factory()->withPlayerDetails()->create();

    $this->actingAs($user)->get('/games/monster-cafe')->assertOk()->assertInertia(fn (Assert $page) => $page
        ->component('games/monster-cafe')
        ->where('role', null)
        ->where('pin', null)
        ->where('wsUrl', '/game-ws/monster-cafe')
        ->where('serviceReady', true)
        ->where('player.id', $user->id)
        ->has('player.character.color')
        ->has('points')
        ->has('ads'));

    $this->actingAs($user)->get('/games/monster-cafe?role=host')->assertInertia(fn (Assert $page) => $page->where('role', 'host'));
    $this->actingAs($user)->get('/games/monster-cafe?role=solo')->assertInertia(fn (Assert $page) => $page->where('role', 'solo'));
    $this->actingAs($user)->get('/games/monster-cafe?role=admin')->assertInertia(fn (Assert $page) => $page->where('role', null));

    $this->actingAs($user)->get('/games/monster-cafe/join/654321')->assertRedirect('/games/monster-cafe?pin=654321');
    $this->actingAs($user)->get('/games/monster-cafe?pin=654321')->assertInertia(fn (Assert $page) => $page->where('pin', '654321'));
    $this->actingAs($user)->get('/games/monster-cafe?pin=12ab56')->assertInertia(fn (Assert $page) => $page->where('pin', null));
});

it('sends guests to sign in', function (): void {
    $this->get('/games/monster-cafe')->assertRedirect('/login');
    $this->postJson('/games/monster-cafe/token')->assertUnauthorized();
});

it('signs separate host and player tokens carrying the avatar look', function (): void {
    $user = User::factory()->withPlayerDetails()->create();

    $player = $this->actingAs($user)->postJson('/games/monster-cafe/token')->assertOk()->json('token');
    $host = $this->actingAs($user)->postJson('/games/monster-cafe/token', ['role' => 'host'])->assertOk()->json('token');

    expect(monsterCafeClaims($player)['game'])->toBe('monster-cafe')
        ->and(monsterCafeClaims($host)['game'])->toBe('monster-cafe-host')
        ->and(monsterCafeClaims($player)['sub'])->toBe($user->id)
        ->and(monsterCafeClaims($player)['character'])->toBeArray()->toHaveKey('color');
});

it('signs a player token for the solo kitchen', function (): void {
    $user = User::factory()->withPlayerDetails()->create();

    $solo = $this->actingAs($user)->postJson('/games/monster-cafe/token', ['role' => 'solo'])->assertOk()->json('token');

    expect(monsterCafeClaims($solo)['game'])->toBe('monster-cafe')
        ->and(monsterCafeClaims($solo)['sub'])->toBe($user->id);
});

it('requires a configured game service for monster cafe tokens', function (): void {
    config(['game-service.secret' => '']);
    $user = User::factory()->withPlayerDetails()->create();

    expect(app(GameServiceSigner::class)->isConfigured())->toBeFalse();
    $this->actingAs($user)->postJson('/games/monster-cafe/token')->assertStatus(503);
});

it('throttles the token route under its own limiter name', function (): void {
    $route = Route::getRoutes()->getByName('games.monster-cafe.token');

    expect($route)->not->toBeNull()
        ->and($route->gatherMiddleware())->toContain('throttle:30,1,games.monster-cafe.token', 'auth')
        ->and(Route::getRoutes()->getByName('games.monster-cafe')->gatherMiddleware())
        ->toContain('App\Http\Middleware\RecordGameAccess:monster-cafe');
});

it('lists monster cafe last in the quiz category as a multiplayer point game', function (): void {
    $quiz = collect(config('game-catalog.categories'))->firstWhere('key', 'quiz');
    $game = collect($quiz['games'])->last();

    expect($game['key'])->toBe('monster-cafe')
        ->and($game)->toMatchArray([
            'titleKey' => 'player.monsterCafe',
            'descriptionKey' => 'portal.games.monsterCafe',
            'route' => 'games.monster-cafe',
            'icon' => 'chef',
            'accent' => '#ea580c',
            'min_grade' => 0,
            'max_grade' => 12,
            'min_players' => 1,
            'max_players' => 40,
            'awards_points' => true,
            'guest_playable' => false,
            'multiplayer' => true,
        ])
        ->and(Question::GAMES)->toContain('monster-cafe')
        ->and(Question::CHOICE_ONLY_GAMES)->toContain('monster-cafe')
        ->and(config('game-service.public_monster_cafe_ws_url'))->toBe('/game-ws/monster-cafe');
});

it('stores the monster cafe coin ranking from the signed Go webhook and adds points', function (): void {
    $users = User::factory()->count(2)->create(['locale' => 'id']);

    postMonsterCafeResult(monsterCafeResult($users[0], ['match' => monsterCafeMatch($users->all())]))->assertCreated();
    postMonsterCafeResult(monsterCafeResult($users[0], ['match' => monsterCafeMatch($users->all())]))->assertOk()->assertJson(['status' => 'duplicate']);

    $history = GameHistory::query()->sole();
    $match = GameMatch::query()->sole();

    expect($history->game_key)->toBe('monster-cafe')
        ->and($history->game_name)->toBe('Monster Café')
        ->and((int) $users[0]->pointLedgers()->sum('points'))->toBe(160)
        ->and($match->match_key)->toBe('mc-482913-1790000000000')
        ->and($match->players()->count())->toBe(2)
        ->and($match->players()->where('rank', 1)->sole()->user_id)->toBe($users[0]->id);
});

it('rejects monster cafe results above the cap, with foreign prefixes or too many players', function (Closure $override): void {
    $user = User::factory()->create();

    postMonsterCafeResult(monsterCafeResult($user, $override()))->assertUnprocessable();
    expect(GameHistory::query()->count())->toBe(0);
})->with([
    'points above cap' => [fn (): array => ['points' => 12151]],
    'foreign prefix' => [fn (): array => ['event_id' => 'eh-1-room-1790000000000']],
    'unknown mission' => [fn (): array => ['mission' => 'solo']],
    'level above minutes' => [fn (): array => ['match' => [...monsterCafeMatch([User::factory()->create()]), 'level' => 8]]],
    '41 players' => [fn (): array => ['match' => monsterCafeMatch(User::factory()->count(41)->create()->all())]],
]);

it('caps monster cafe points at the Go service maximum', function (): void {
    expect(StoreGameResultRequest::GAMES['monster-cafe'])->toMatchArray([
        'max_points' => 12150,
        'max_players' => 40,
        'max_level' => 7,
        'missions' => ['room'],
    ]);
});

it('ships matching Indonesian and English monster cafe catalog texts', function (): void {
    foreach (['id', 'en'] as $locale) {
        $catalog = json_decode((string) file_get_contents(resource_path("js/locales/{$locale}-player.json")), true);

        expect($catalog['player']['monsterCafe'])->not->toBeEmpty()
            ->and($catalog['portal']['games']['monsterCafe'])->not->toBeEmpty()
            ->and($catalog['gameList']['upcoming']['games'])->not->toHaveKey('monsterCafe')
            ->and(__('monster_cafe.history_name', [], $locale))->toBe('Monster Café');
    }
});

it('ships the monster cafe how-to-play video and slides', function (string $file, string $signature): void {
    $path = public_path('tutorials/'.$file);

    expect($path)->toBeFile()
        ->and(file_get_contents($path, length: 12))->toContain($signature);
})->with([
    'video' => ['cara-bermain-monster-cafe.mp4', 'ftyp'],
    'slides' => ['cara-bermain-monster-cafe.pdf', '%PDF'],
]);
