<?php

use App\Http\Requests\StoreGameResultRequest;
use App\Models\GameHistory;
use App\Models\GameMatch;
use App\Models\Question;
use App\Models\User;
use App\Services\GameServiceSigner;
use Illuminate\Support\Arr;
use Illuminate\Testing\TestResponse;
use Inertia\Testing\AssertableInertia as Assert;

beforeEach(function (): void {
    $this->withoutVite();
    config(['game-service.secret' => str_repeat('t', 40)]);
});

/**
 * @param  array<string, mixed>  $payload
 */
function postTurboResult(array $payload): TestResponse
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
function turboClaims(string $token): array
{
    return json_decode(base64_decode(strtr(explode('.', $token)[0], '-_', '+/')), true);
}

/**
 * @param  list<User>  $users
 * @return array<string, mixed>
 */
function turboMatch(array $users): array
{
    return [
        'key' => 'tt-482913-1790000000000',
        'mode' => 'room',
        'pin' => '482913',
        'level' => 12,
        'grade' => 5,
        'started_at' => now()->subMinutes(6)->toIso8601String(),
        'ended_at' => now()->toIso8601String(),
        'finished' => true,
        'players' => collect($users)->map(fn (User $user, int $i): array => [
            'user_id' => $user->id,
            'name' => $user->name,
            'grade' => 5,
            'rank' => $i + 1,
            'score' => $i === 0 ? 100 : 80,
            'correct' => $i === 0 ? 11 : 6,
            'wrong' => $i === 0 ? 1 : 6,
            'survival_ms' => 300000 + $i * 10000,
            'accuracy' => $i === 0 ? 91.7 : 50.0,
        ])->all(),
    ];
}

it('renders the role picker, projector arena and phone controller', function (): void {
    $user = User::factory()->withPlayerDetails()->create();

    $this->actingAs($user)->get('/games/turbo-trivia')->assertOk()->assertInertia(fn (Assert $page) => $page
        ->component('games/turbo-trivia/index')
        ->where('pin', null)
        ->where('wsUrl', '/game-ws/turbo-trivia')
        ->where('serviceReady', true)
        ->has('ads'));

    $this->actingAs($user)->get('/arena/turbo-trivia')->assertOk()->assertInertia(fn (Assert $page) => $page
        ->component('games/turbo-trivia/arena')
        ->where('pin', null)
        ->has('ads'));

    $this->actingAs($user)->get('/arena/turbo-trivia/482913')->assertInertia(fn (Assert $page) => $page
        ->component('games/turbo-trivia/arena')
        ->where('pin', '482913'));

    $this->actingAs($user)->get('/play/turbo-trivia/482913')->assertOk()->assertInertia(fn (Assert $page) => $page
        ->component('games/turbo-trivia/controller')
        ->where('pin', '482913')
        ->where('player.id', $user->id)
        ->has('ads'));
});

it('opens invite links and ?pin= as the phone controller', function (): void {
    $user = User::factory()->withPlayerDetails()->create();

    $this->actingAs($user)->get('/games/turbo-trivia/join/654321')->assertRedirect('/games/turbo-trivia?pin=654321');
    $this->actingAs($user)->get('/games/turbo-trivia?pin=654321')->assertInertia(fn (Assert $page) => $page
        ->component('games/turbo-trivia/controller')
        ->where('pin', '654321'));
});

it('rejects malformed pins on the arena and controller routes', function (string $path): void {
    $user = User::factory()->withPlayerDetails()->create();

    $this->actingAs($user)->get($path)->assertNotFound();
})->with(['/play/turbo-trivia/12345', '/play/turbo-trivia/abcdef', '/arena/turbo-trivia/1234567', '/games/turbo-trivia/qr/12ab56']);

it('sends guests to sign in before the race pages', function (string $path): void {
    $this->get($path)->assertRedirect('/login');
})->with(['/games/turbo-trivia', '/arena/turbo-trivia', '/play/turbo-trivia/482913']);

it('signs separate projector and phone tokens', function (): void {
    $user = User::factory()->withPlayerDetails()->create();

    $player = $this->actingAs($user)->postJson('/games/turbo-trivia/token')->assertOk()->json('token');
    $host = $this->actingAs($user)->postJson('/games/turbo-trivia/token?role=host')->assertOk()->json('token');

    expect(turboClaims($player)['game'])->toBe('turbo-trivia')
        ->and(turboClaims($host)['game'])->toBe('turbo-trivia-host')
        ->and(turboClaims($player)['sub'])->toBe($user->id)
        ->and(turboClaims($player))->toHaveKey('character');
});

it('requires a configured game service for tokens', function (): void {
    config(['game-service.secret' => '']);
    $user = User::factory()->withPlayerDetails()->create();

    expect(app(GameServiceSigner::class)->isConfigured())->toBeFalse();
    $this->actingAs($user)->postJson('/games/turbo-trivia/token')->assertStatus(503);
});

it('draws the join QR code as an SVG that points at the controller', function (): void {
    $user = User::factory()->withPlayerDetails()->create();

    $response = $this->actingAs($user)->get('/games/turbo-trivia/qr/482913')->assertOk();

    expect($response->headers->get('Content-Type'))->toBe('image/svg+xml')
        ->and($response->headers->get('X-Content-Type-Options'))->toBe('nosniff')
        ->and($response->getContent())->toContain('<svg');
});

it('lists the race in the catalog as a multiplayer point game', function (): void {
    $game = collect(config('game-catalog.categories'))->flatMap(fn (array $c): array => $c['games'])->firstWhere('key', 'turbo-trivia');

    expect($game)->not->toBeNull()
        ->and($game['multiplayer'])->toBeTrue()
        ->and($game['awards_points'])->toBeTrue()
        ->and($game['route'])->toBe('games.turbo-trivia')
        ->and(Question::GAMES)->toContain('turbo-trivia')
        ->and(Question::CHOICE_ONLY_GAMES)->toContain('turbo-trivia');
});

it('stores the race result, ranks and points for up to 40 karts', function (): void {
    $users = User::factory()->count(3)->create(['locale' => 'id']);

    postTurboResult([
        'event_id' => 'tt-'.$users[0]->id.'-room-1790000000000',
        'user_id' => $users[0]->id,
        'game_key' => 'turbo-trivia',
        'mission' => 'room',
        'grade' => 5,
        'points' => 135,
        'correct' => 11,
        'wrong' => 1,
        'duration_seconds' => 360,
        'completed_at' => now()->toIso8601String(),
        'answers' => [],
        'match' => turboMatch($users->all()),
    ])->assertCreated();

    $history = GameHistory::query()->sole();
    $match = GameMatch::query()->sole();

    expect($history->game_name)->toBe('Turbo Trivia')
        ->and((int) $users[0]->pointLedgers()->sum('points'))->toBe(135)
        ->and($match->players()->count())->toBe(3)
        ->and($match->players()->where('rank', 1)->sole()->user_id)->toBe($users[0]->id);
});

it('rejects race results above the point cap, foreign prefixes or too many karts', function (Closure $override): void {
    $user = User::factory()->create();

    postTurboResult(array_merge([
        'event_id' => 'tt-'.$user->id.'-room-1790000000000',
        'user_id' => $user->id,
        'game_key' => 'turbo-trivia',
        'mission' => 'room',
        'grade' => 5,
        'points' => 50,
        'correct' => 4,
        'wrong' => 1,
        'duration_seconds' => 120,
        'completed_at' => now()->toIso8601String(),
    ], $override()))->assertUnprocessable();
})->with([
    'points above cap' => [fn (): array => ['points' => StoreGameResultRequest::GAMES['turbo-trivia']['max_points'] + 1]],
    'foreign prefix' => [fn (): array => ['event_id' => 'fd-1-room-1790000000000']],
    'unknown mission' => [fn (): array => ['mission' => 'solo']],
    '41 karts' => [fn (): array => ['match' => turboMatch(User::factory()->count(41)->create()->all())]],
]);

it('ships matching Indonesian and English race texts', function (): void {
    foreach (['id', 'en'] as $locale) {
        $catalog = json_decode((string) file_get_contents(resource_path("js/locales/{$locale}-player.json")), true);

        expect($catalog['turboTrivia']['items'])->toHaveKeys(['BANANA', 'MISSILE', 'LIGHTNING', 'SHIELD'])
            ->and($catalog['turboTrivia']['controller']['hit'])->toHaveKeys(['BANANA', 'MISSILE', 'LIGHTNING'])
            ->and($catalog['player']['turboTrivia'])->not->toBeEmpty()
            ->and($catalog['portal']['games']['turboTrivia'])->not->toBeEmpty()
            ->and($catalog['room']['errors'])->toHaveKeys(['invalid_item', 'no_item', 'no_target', 'kart_finished']);
    }

    $id = json_decode((string) file_get_contents(resource_path('js/locales/id-player.json')), true)['turboTrivia'];
    $en = json_decode((string) file_get_contents(resource_path('js/locales/en-player.json')), true)['turboTrivia'];
    expect(array_keys(Arr::dot($id)))->toEqualCanonicalizing(array_keys(Arr::dot($en)));
});

it('ships the how-to-play video and slides', function (string $file, string $signature): void {
    $path = public_path('tutorials/'.$file);

    expect($path)->toBeFile()
        ->and(file_get_contents($path, length: 12))->toContain($signature);
})->with([
    'video' => ['cara-bermain-turbo-trivia.mp4', 'ftyp'],
    'slides' => ['cara-bermain-turbo-trivia.pdf', '%PDF'],
]);

it('explains every how-to-play scene in both languages', function (): void {
    foreach (['id', 'en'] as $locale) {
        $howTo = json_decode((string) file_get_contents(resource_path("js/locales/{$locale}-player.json")), true)['turboTrivia']['howTo'];

        expect($howTo['scenes'])->toHaveKeys(['join', 'answer', 'speed', 'items', 'attack', 'win']);
        foreach ($howTo['scenes'] as $scene) {
            expect($scene['title'])->not->toBeEmpty()->and($scene['body'])->not->toBeEmpty();
        }
    }
});
