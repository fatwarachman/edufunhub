<?php

use App\Models\GameHistory;
use App\Models\GameMatch;
use App\Models\User;
use App\Services\GameServiceSigner;
use Illuminate\Testing\TestResponse;
use Inertia\Testing\AssertableInertia as Assert;

beforeEach(function (): void {
    $this->withoutVite();
    config(['game-service.secret' => str_repeat('h', 40)]);
});

/**
 * @param  array<string, mixed>  $payload
 */
function postHeistResult(array $payload): TestResponse
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
function heistTokenClaims(string $token): array
{
    return json_decode(base64_decode(strtr(explode('.', $token)[0], '-_', '+/')), true);
}

/**
 * @param  list<User>  $users
 * @return array<string, mixed>
 */
function heistMatch(array $users): array
{
    return [
        'key' => 'eh-482913-1790000000000',
        'mode' => 'room',
        'pin' => '482913',
        'level' => 0,
        'grade' => 4,
        'started_at' => now()->subMinutes(5)->toIso8601String(),
        'ended_at' => now()->toIso8601String(),
        'finished' => true,
        'players' => collect($users)->map(fn (User $user, int $i): array => [
            'user_id' => $user->id,
            'name' => $user->name,
            'grade' => 4,
            'rank' => $i + 1,
            'score' => max(0, 2600 - $i * 400),
            'correct' => 12 - $i,
            'wrong' => $i,
        ])->all(),
    ];
}

/**
 * @return array<string, mixed>
 */
function heistResult(User $user, array $override = []): array
{
    return array_merge([
        'event_id' => 'eh-'.$user->id.'-room-1790000000000',
        'user_id' => $user->id,
        'game_key' => 'economy-heist',
        'mission' => 'room',
        'grade' => 4,
        'points' => 145,
        'correct' => 12,
        'wrong' => 0,
        'duration_seconds' => 300,
        'completed_at' => now()->toIso8601String(),
    ], $override);
}

it('renders the role picker, host screen and invite as a player with the portal avatar', function (): void {
    $user = User::factory()->withPlayerDetails()->create();

    $this->actingAs($user)->get('/games/economy-heist')->assertOk()->assertInertia(fn (Assert $page) => $page
        ->component('games/economy-heist')
        ->where('role', null)
        ->where('wsUrl', '/game-ws/economy-heist')
        ->where('serviceReady', true)
        ->where('player.id', $user->id)
        ->has('player.character.color')
        ->has('ads'));

    $this->actingAs($user)->get('/games/economy-heist?role=host')->assertInertia(fn (Assert $page) => $page->where('role', 'host'));
    $this->actingAs($user)->get('/games/economy-heist?role=admin')->assertInertia(fn (Assert $page) => $page->where('role', null));

    $this->actingAs($user)->get('/games/economy-heist/join/654321')->assertRedirect('/games/economy-heist?pin=654321');
    $this->actingAs($user)->get('/games/economy-heist?pin=654321')->assertInertia(fn (Assert $page) => $page->where('pin', '654321'));
    $this->actingAs($user)->get('/games/economy-heist?pin=12ab56')->assertInertia(fn (Assert $page) => $page->where('pin', null));
});

it('sends guests to sign in', function (): void {
    $this->get('/games/economy-heist')->assertRedirect('/login');
    $this->postJson('/games/economy-heist/token')->assertUnauthorized();
});

it('signs separate host and player tokens carrying the avatar look', function (): void {
    $user = User::factory()->withPlayerDetails()->create();

    $player = $this->actingAs($user)->postJson('/games/economy-heist/token')->assertOk()->json('token');
    $host = $this->actingAs($user)->postJson('/games/economy-heist/token?role=host')->assertOk()->json('token');

    expect(heistTokenClaims($player)['game'])->toBe('economy-heist')
        ->and(heistTokenClaims($host)['game'])->toBe('economy-heist-host')
        ->and(heistTokenClaims($player)['sub'])->toBe($user->id)
        ->and(heistTokenClaims($player)['character'])->toBeArray()->toHaveKey('color');
});

it('requires a configured game service for tokens', function (): void {
    config(['game-service.secret' => '']);
    $user = User::factory()->withPlayerDetails()->create();

    expect(app(GameServiceSigner::class)->isConfigured())->toBeFalse();
    $this->actingAs($user)->postJson('/games/economy-heist/token')->assertStatus(503);
});

it('stores the final gold ranking from the signed Go webhook and adds points', function (): void {
    $users = User::factory()->count(5)->create(['locale' => 'id']);

    postHeistResult(heistResult($users[0], ['match' => heistMatch($users->all())]))->assertCreated();

    $match = GameMatch::query()->sole();
    $winner = $match->players()->where('rank', 1)->sole();
    $history = GameHistory::query()->sole();

    expect($match->game_key)->toBe('economy-heist')
        ->and($match->players_count)->toBe(5)
        ->and($winner->user_id)->toBe($users[0]->id)
        ->and($winner->score)->toBe(2600)
        ->and($history->game_name)->toBe('Peti Emas Misteri')
        ->and($history->points)->toBe(145)
        ->and((int) $users[0]->pointLedgers()->sum('points'))->toBe(145);

    postHeistResult(heistResult($users[0], ['match' => heistMatch($users->all())]))->assertOk()->assertJson(['status' => 'duplicate']);
    expect(GameHistory::query()->count())->toBe(1);
});

it('names the history in English for English players', function (): void {
    $user = User::factory()->create(['locale' => 'en']);

    postHeistResult(heistResult($user))->assertCreated();

    expect(GameHistory::query()->sole()->game_name)->toBe('Economy Heist');
});

it('rejects unsigned economy heist results', function (): void {
    $user = User::factory()->create();
    $body = (string) json_encode(heistResult($user));

    $this->call('POST', '/api/internal/game-results', [], [], [], [
        'HTTP_X_GAME_TIMESTAMP' => (string) now()->getTimestamp(),
        'HTTP_X_GAME_SIGNATURE' => 'forged',
        'CONTENT_TYPE' => 'application/json',
        'HTTP_ACCEPT' => 'application/json',
    ], $body)->assertForbidden();

    expect(GameHistory::query()->count())->toBe(0);
});

it('rejects invalid economy heist results', function (array $override): void {
    $user = User::factory()->create();

    postHeistResult(heistResult($user, $override))->assertUnprocessable();
})->with([
    'points above cap' => [['points' => 12151]],
    'negative points' => [['points' => -1]],
    'wrong event id' => [['event_id' => 'eh-1-duel-1']],
    'floor drop prefix' => [['event_id' => 'fd-1-room-1']],
    'wrong mission' => [['mission' => 'duel']],
    'more than 60 players' => [['match' => [...heistMatch([]), 'players' => array_fill(0, 61, ['name' => 'X', 'grade' => 4, 'rank' => 1, 'score' => 0, 'correct' => 0, 'wrong' => 0])]]],
    'negative gold score' => [['match' => [...heistMatch([]), 'players' => [['name' => 'X', 'grade' => 4, 'rank' => 1, 'score' => -5, 'correct' => 0, 'wrong' => 0]]]]],
]);

it('lists economy heist as a multiplayer quiz game that awards points', function (): void {
    $quiz = collect(config('game-catalog.categories'))->firstWhere('key', 'quiz');
    $game = collect($quiz['games'])->firstWhere('key', 'economy-heist');

    expect($game)->not->toBeNull()
        ->and($game['multiplayer'])->toBeTrue()
        ->and($game['awards_points'])->toBeTrue()
        ->and($game['route'])->toBe('games.economy-heist');
});

it('ships the how-to-play walkthrough in Indonesian and English', function (): void {
    $scenes = ['join', 'answer', 'chest', 'outcomes', 'heist', 'win'];

    foreach (['id', 'en'] as $locale) {
        $catalog = json_decode(file_get_contents(resource_path("js/locales/{$locale}-player.json")), true, flags: JSON_THROW_ON_ERROR);
        $howTo = $catalog['economyHeist']['howTo'];

        expect($howTo)->toHaveKeys(['title', 'step', 'prev', 'next', 'play', 'pause', 'replay', 'goTo'])
            ->and(array_keys($howTo['scenes']))->toBe($scenes);

        foreach ($howTo['scenes'] as $scene) {
            expect($scene['title'])->toBeString()->not->toBeEmpty()
                ->and($scene['body'])->toBeString()->not->toBeEmpty();
        }
    }
});
