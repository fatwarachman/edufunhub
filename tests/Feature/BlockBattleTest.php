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
    config(['game-service.secret' => str_repeat('b', 40)]);
});

/**
 * @param  array<string, mixed>  $payload
 */
function postBlockBattleResult(array $payload): TestResponse
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
function blockBattleClaims(string $token): array
{
    return json_decode(base64_decode(strtr(explode('.', $token)[0], '-_', '+/')), true);
}

/**
 * @param  list<User>  $users
 * @return array<string, mixed>
 */
function blockBattleMatch(array $users): array
{
    return [
        'key' => 'bb-482913-1790000000000',
        'mode' => 'room',
        'pin' => '482913',
        'level' => 5,
        'grade' => 5,
        'started_at' => now()->subMinutes(5)->toIso8601String(),
        'ended_at' => now()->toIso8601String(),
        'finished' => true,
        'players' => collect($users)->map(fn (User $user, int $i): array => [
            'user_id' => $user->id,
            'name' => $user->name,
            'grade' => 5,
            'rank' => $i + 1,
            'score' => $i === 0 ? 1200 : 640,
            'correct' => $i === 0 ? 14 : 7,
            'wrong' => $i === 0 ? 2 : 5,
            'survival_ms' => 300000 - $i * 30000,
            'accuracy' => $i === 0 ? 87.5 : 58.3,
        ])->all(),
    ];
}

it('renders the role picker, projector arena and phone controller', function (): void {
    $user = User::factory()->withPlayerDetails()->create();

    $this->actingAs($user)->get('/games/block-battle')->assertOk()->assertInertia(fn (Assert $page) => $page
        ->component('games/block-battle/index')
        ->where('pin', null)
        ->where('wsUrl', '/game-ws/block-battle')
        ->where('serviceReady', true)
        ->has('ads'));

    $this->actingAs($user)->get('/arena/block-battle')->assertOk()->assertInertia(fn (Assert $page) => $page
        ->component('games/block-battle/arena')
        ->where('pin', null)
        ->has('ads'));

    $this->actingAs($user)->get('/arena/block-battle/482913')->assertInertia(fn (Assert $page) => $page
        ->component('games/block-battle/arena')
        ->where('pin', '482913'));

    $this->actingAs($user)->get('/play/block-battle/482913')->assertOk()->assertInertia(fn (Assert $page) => $page
        ->component('games/block-battle/controller')
        ->where('pin', '482913')
        ->where('player.id', $user->id)
        ->has('ads'));
});

it('opens invite links and ?pin= as the phone controller', function (): void {
    $user = User::factory()->withPlayerDetails()->create();

    $this->actingAs($user)->get('/games/block-battle/join/654321')->assertRedirect('/games/block-battle?pin=654321');
    $this->actingAs($user)->get('/games/block-battle?pin=654321')->assertInertia(fn (Assert $page) => $page
        ->component('games/block-battle/controller')
        ->where('pin', '654321'));
});

it('rejects malformed pins on the arena and controller routes', function (string $path): void {
    $user = User::factory()->withPlayerDetails()->create();

    $this->actingAs($user)->get($path)->assertNotFound();
})->with(['/play/block-battle/12345', '/play/block-battle/abcdef', '/arena/block-battle/1234567', '/games/block-battle/qr/12ab56']);

it('sends guests to sign in before the block battle pages', function (string $path): void {
    $this->get($path)->assertRedirect('/login');
})->with(['/games/block-battle', '/arena/block-battle', '/play/block-battle/482913']);

it('signs separate projector and phone tokens', function (): void {
    $user = User::factory()->withPlayerDetails()->create();

    $player = $this->actingAs($user)->postJson('/games/block-battle/token')->assertOk()->json('token');
    $host = $this->actingAs($user)->postJson('/games/block-battle/token?role=host')->assertOk()->json('token');

    expect(blockBattleClaims($player)['game'])->toBe('block-battle')
        ->and(blockBattleClaims($host)['game'])->toBe('block-battle-host')
        ->and(blockBattleClaims($player)['sub'])->toBe($user->id)
        ->and(blockBattleClaims($player))->toHaveKey('character');
});

it('requires a configured game service for block battle tokens', function (): void {
    config(['game-service.secret' => '']);
    $user = User::factory()->withPlayerDetails()->create();

    expect(app(GameServiceSigner::class)->isConfigured())->toBeFalse();
    $this->actingAs($user)->postJson('/games/block-battle/token')->assertStatus(503);
});

it('draws the join QR code as an SVG that points at the controller', function (): void {
    $user = User::factory()->withPlayerDetails()->create();

    $response = $this->actingAs($user)->get('/games/block-battle/qr/482913')->assertOk();

    expect($response->headers->get('Content-Type'))->toBe('image/svg+xml')
        ->and($response->headers->get('X-Content-Type-Options'))->toBe('nosniff')
        ->and($response->getContent())->toContain('<svg');
});

it('lists block battle in the catalog as a multiplayer point game', function (): void {
    $game = collect(config('game-catalog.categories'))->flatMap(fn (array $c): array => $c['games'])->firstWhere('key', 'block-battle');

    expect($game)->not->toBeNull()
        ->and($game['multiplayer'])->toBeTrue()
        ->and($game['awards_points'])->toBeTrue()
        ->and($game['route'])->toBe('games.block-battle')
        ->and($game['icon'])->toBe('blocks')
        ->and([$game['min_players'], $game['max_players']])->toBe([1, 50])
        ->and(Question::GAMES)->toContain('block-battle')
        ->and(Question::CHOICE_ONLY_GAMES)->toContain('block-battle');
});

it('stores the block battle result, ranks and points', function (): void {
    $users = User::factory()->count(3)->create(['locale' => 'id']);

    postBlockBattleResult([
        'event_id' => 'bb-'.$users[0]->id.'-room-1790000000000',
        'user_id' => $users[0]->id,
        'game_key' => 'block-battle',
        'mission' => 'room',
        'grade' => 5,
        'points' => 135,
        'correct' => 14,
        'wrong' => 2,
        'duration_seconds' => 300,
        'completed_at' => now()->toIso8601String(),
        'answers' => [],
        'match' => blockBattleMatch($users->all()),
    ])->assertCreated();

    $history = GameHistory::query()->sole();
    $match = GameMatch::query()->sole();

    expect($history->game_name)->toBe('Tetris Kuis')
        ->and((int) $users[0]->pointLedgers()->sum('points'))->toBe(135)
        ->and($match->players()->count())->toBe(3)
        ->and($match->players()->where('rank', 1)->sole()->user_id)->toBe($users[0]->id);
});

it('rejects block battle results above the point cap, foreign prefixes or too many players', function (Closure $override): void {
    $user = User::factory()->create();

    postBlockBattleResult(array_merge([
        'event_id' => 'bb-'.$user->id.'-room-1790000000000',
        'user_id' => $user->id,
        'game_key' => 'block-battle',
        'mission' => 'room',
        'grade' => 5,
        'points' => 50,
        'correct' => 4,
        'wrong' => 1,
        'duration_seconds' => 120,
        'completed_at' => now()->toIso8601String(),
    ], $override()))->assertUnprocessable();
})->with([
    'points above cap' => [fn (): array => ['points' => StoreGameResultRequest::GAMES['block-battle']['max_points'] + 1]],
    'foreign prefix' => [fn (): array => ['event_id' => 'tt-1-room-1790000000000']],
    'unknown mission' => [fn (): array => ['mission' => 'solo']],
    '51 players' => [fn (): array => ['match' => blockBattleMatch(User::factory()->count(51)->create()->all())]],
]);

it('caps block battle points at the Go service maximum', function (): void {
    expect(StoreGameResultRequest::GAMES['block-battle'])->toMatchArray([
        'max_points' => 12150,
        'max_players' => 50,
        'max_level' => 10,
        'missions' => ['room'],
    ]);
});

it('ships matching Indonesian and English block battle texts', function (): void {
    foreach (['id', 'en'] as $locale) {
        $catalog = json_decode((string) file_get_contents(resource_path("js/locales/{$locale}-player.json")), true);

        expect($catalog['player']['blockBattle'])->not->toBeEmpty()
            ->and($catalog['portal']['games']['blockBattle'])->not->toBeEmpty()
            ->and($catalog['room']['errors'])->toHaveKeys(['invalid_input', 'invalid_reward', 'no_reward', 'knocked_out'])
            ->and($catalog['gameList']['upcoming']['games'])->not->toHaveKey('tetrisQuiz');
    }

    $id = json_decode((string) file_get_contents(resource_path('js/locales/id-player.json')), true)['blockBattle'];
    $en = json_decode((string) file_get_contents(resource_path('js/locales/en-player.json')), true)['blockBattle'];
    expect(array_keys(Arr::dot($id)))->toEqualCanonicalizing(array_keys(Arr::dot($en)));
});

it('ships the block battle how-to-play video and slides', function (string $file, string $signature): void {
    $path = public_path('tutorials/'.$file);

    expect($path)->toBeFile()
        ->and(file_get_contents($path, length: 12))->toContain($signature);
})->with([
    'video' => ['cara-bermain-block-battle.mp4', 'ftyp'],
    'slides' => ['cara-bermain-block-battle.pdf', '%PDF'],
]);

it('explains every block battle how-to-play scene in both languages', function (): void {
    foreach (['id', 'en'] as $locale) {
        $howTo = json_decode((string) file_get_contents(resource_path("js/locales/{$locale}-player.json")), true)['blockBattle']['howTo'];

        expect($howTo['scenes'])->toHaveKeys(['join', 'answer', 'battle', 'words', 'fortress', 'win']);
        foreach ($howTo['scenes'] as $scene) {
            expect($scene['title'])->not->toBeEmpty()->and($scene['body'])->not->toBeEmpty();
        }
    }
});
