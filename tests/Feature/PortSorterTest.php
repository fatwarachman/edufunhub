<?php

use App\Http\Requests\StoreGameResultRequest;
use App\Models\GameHistory;
use App\Models\PlayerProfile;
use App\Models\User;
use Illuminate\Support\Arr;
use Inertia\Testing\AssertableInertia as Assert;

beforeEach(function (): void {
    $this->withoutVite();
    config(['game-service.secret' => str_repeat('k', 40)]);
});

/**
 * @param  array<string, mixed>  $payload
 * @return array{0: string, 1: array<string, string>}
 */
function signPortSorterResult(array $payload): array
{
    $body = json_encode($payload);
    $timestamp = (string) now()->getTimestamp();

    return [$body, [
        'HTTP_X_GAME_TIMESTAMP' => $timestamp,
        'HTTP_X_GAME_SIGNATURE' => hash_hmac('sha256', $timestamp.'.'.$body, config('game-service.secret')),
        'CONTENT_TYPE' => 'application/json',
        'HTTP_ACCEPT' => 'application/json',
    ]];
}

/**
 * @param  array<string, mixed>  $overrides
 * @return array<string, mixed>
 */
function portSorterResult(User $user, array $overrides = []): array
{
    return array_merge([
        'event_id' => 'ps-'.$user->id.'-sort-1790000000000',
        'user_id' => $user->id,
        'game_key' => 'port-sorter',
        'mission' => 'sort',
        'grade' => 10,
        'points' => 345,
        'correct' => 30,
        'wrong' => 0,
        'duration_seconds' => 180,
        'completed_at' => now()->toIso8601String(),
    ], $overrides);
}

it('requires sign in for the port sorter', function (): void {
    $this->get('/games/port-sorter')->assertRedirect('/login');
    $this->postJson('/games/port-sorter/token')->assertUnauthorized();
});

it('shows the port sorter with points, websocket url and the game ads', function (): void {
    $user = User::factory()->create(['name' => 'Budi']);
    PlayerProfile::factory()->for($user)->create(['nickname' => 'Dimas', 'grade' => 11]);
    $user->pointLedgers()->create(['points' => 40, 'reason' => 'seed', 'event_id' => 'seed-port']);

    $this->actingAs($user)->get('/games/port-sorter')->assertOk()->assertInertia(fn (Assert $page) => $page
        ->component('games/port-sorter', false)
        ->where('player.name', 'Dimas')
        ->where('player.grade', 11)
        ->where('points', 40)
        ->where('serviceReady', true)
        ->where('wsUrl', '/game-ws/port-sorter')
        ->where('adGame', 'port-sorter')
        ->has('ads'));
});

it('issues a port sorter token, even for players without a grade', function (): void {
    $user = User::factory()->withPlayerDetails()->create();
    PlayerProfile::query()->where('user_id', $user->id)->update(['grade' => null]);

    $token = $this->actingAs($user)->postJson('/games/port-sorter/token')->assertOk()->json('token');
    [$payload] = explode('.', $token);
    $claims = json_decode(base64_decode(strtr($payload, '-_', '+/')), true);

    expect($claims['game'])->toBe('port-sorter')
        ->and($claims['grade'])->toBe(PlayerProfile::MIN_GRADE)
        ->and($claims['sub'])->toBe($user->id);
});

it('requires complete player details and a configured service for a token', function (): void {
    $incomplete = User::factory()->create();
    PlayerProfile::factory()->for($incomplete)->incomplete()->create(['grade' => 10]);
    $this->actingAs($incomplete)->postJson('/games/port-sorter/token')->assertForbidden();

    config(['game-service.secret' => null]);
    $this->actingAs(User::factory()->withPlayerDetails()->create())->postJson('/games/port-sorter/token')->assertServiceUnavailable();
});

it('records a signed port sorter result with points and a localized history name', function (string $locale, string $name): void {
    $user = User::factory()->create(['locale' => $locale]);
    [$body, $server] = signPortSorterResult(portSorterResult($user));

    $this->call('POST', '/api/internal/game-results', [], [], [], $server, $body)->assertCreated();

    $history = GameHistory::query()->sole();
    expect($history->game_key)->toBe('port-sorter')
        ->and($history->mission)->toBe('sort')
        ->and($history->game_name)->toBe($name)
        ->and($history->points)->toBe(345)
        ->and($user->pointLedgers()->sum('points'))->toBe(345);
})->with([
    'indonesian' => ['id', 'Pilah Port & Protokol'],
    'english' => ['en', 'Port Sorter'],
]);

it('rejects port sorter results above the cap or with a foreign event id', function (array $overrides): void {
    $user = User::factory()->create();
    [$body, $server] = signPortSorterResult(portSorterResult($user, $overrides));

    $this->call('POST', '/api/internal/game-results', [], [], [], $server, $body)->assertUnprocessable();

    expect(GameHistory::query()->count())->toBe(0);
})->with([
    'too many points' => [['points' => StoreGameResultRequest::GAMES['port-sorter']['max_points'] + 1]],
    'train event id' => [['event_id' => 'kt-1-train-1']],
    'wrong mission' => [['mission' => 'train']],
]);

it('lists the port sorter in the arcade for networking (SMK) grades', function (): void {
    $user = User::factory()->withPlayerDetails()->create();
    PlayerProfile::query()->where('user_id', $user->id)->update(['grade' => 10]);

    $this->actingAs($user)->get('/portal')->assertOk()->assertInertia(fn (Assert $page) => $page
        ->where('categories.4.key', 'arcade')
        ->where('categories.4.games.1.key', 'port-sorter')
        ->where('categories.4.games.1.url', '/games/port-sorter')
        ->where('categories.4.games.1.awardsPoints', true)
        ->where('categories.4.games.1.recommended', true));
});

it('ships the port sorter copy in both locales', function (): void {
    $keys = null;

    foreach (['id', 'en'] as $locale) {
        $catalog = json_decode(file_get_contents(resource_path("js/locales/{$locale}-player.json")), true, flags: JSON_THROW_ON_ERROR);

        expect($catalog['player']['portSorter'])->toBeString()->not->toBeEmpty()
            ->and($catalog['portal']['games']['portSorter'])->toBeString()->not->toBeEmpty()
            ->and($catalog['portSorter'])->not->toHaveKey('bins')
            ->and($catalog['portSorter']['overlay']['pickTopic'])->not->toBeEmpty()
            ->and($catalog['gameList']['upcoming']['games'])->not->toHaveKey('portSorter');

        $flat = array_keys(Arr::dot($catalog['portSorter']));
        $keys ??= $flat;
        expect($flat)->toBe($keys);
    }
});
