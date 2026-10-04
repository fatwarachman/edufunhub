<?php

use App\Models\PlayerProfile;
use App\Models\User;
use Illuminate\Testing\TestResponse;
use Inertia\Testing\AssertableInertia as Assert;

const FLAG_QUEST_SECRET = 'flag-quest-test-secret-with-32-chars!!';

beforeEach(function (): void {
    config(['scout.driver' => 'null', 'game-service.secret' => FLAG_QUEST_SECRET]);
    $this->withoutVite();
});

/**
 * @param  array<string, mixed>  $overrides
 * @return array<string, mixed>
 */
function flagQuestResult(User $user, array $overrides = []): array
{
    return array_replace([
        'event_id' => 'fq-'.$user->id.'-lakeside-1790000000000',
        'user_id' => $user->id,
        'game_key' => 'flag-quest',
        'mission' => 'lakeside',
        'grade' => 5,
        'points' => 95,
        'correct' => 11,
        'wrong' => 2,
        'duration_seconds' => 240,
        'completed_at' => now()->toIso8601String(),
    ], $overrides);
}

/**
 * @param  array<string, mixed>  $payload
 */
function postSignedResult(mixed $test, array $payload, ?string $secret = null, ?int $timestamp = null): TestResponse
{
    $body = json_encode($payload);
    $timestamp ??= now()->getTimestamp();
    $signature = hash_hmac('sha256', $timestamp.'.'.$body, $secret ?? FLAG_QUEST_SECRET);

    return $test->call('POST', '/api/internal/game-results', [], [], [], [
        'CONTENT_TYPE' => 'application/json',
        'HTTP_ACCEPT' => 'application/json',
        'HTTP_X_GAME_TIMESTAMP' => (string) $timestamp,
        'HTTP_X_GAME_SIGNATURE' => $signature,
    ], $body);
}

test('guest is redirected from flag quest', function (): void {
    $this->get('/games/flag-quest')->assertRedirect(route('login'));
    $this->post('/games/flag-quest/token')->assertRedirect(route('login'));
});

test('game page uses dashboard character name and grade', function (): void {
    $user = User::factory()->create(['name' => 'Andika Pratama']);
    PlayerProfile::factory()->for($user)->create(['nickname' => 'Andika', 'grade' => 5, 'color' => 'teal']);

    $this->actingAs($user)->get('/games/flag-quest')->assertOk()
        ->assertInertia(fn (Assert $page) => $page->component('games/flag-quest', false)
            ->where('player.name', 'Andika')
            ->where('player.grade', 5)
            ->where('player.color', 'teal')
            ->where('serviceReady', true));
});

test('name falls back to account name without nickname', function (): void {
    $user = User::factory()->withPlayerDetails()->create(['name' => 'Siti']);

    $this->actingAs($user)->get('/games/flag-quest')
        ->assertInertia(fn (Assert $page) => $page->where('player.name', 'Siti')->where('player.grade', null));
});

test('token requires grade and is verifiable by the go service format', function (): void {
    $user = User::factory()->create();
    $profile = PlayerProfile::factory()->for($user)->create(['nickname' => 'Andika']);
    $this->actingAs($user)->postJson('/games/flag-quest/token')->assertStatus(422);

    $profile->update(['grade' => 8]);
    $token = $this->actingAs($user)->postJson('/games/flag-quest/token')->assertOk()->json('token');

    [$payload, $signature] = explode('.', $token);
    $expected = rtrim(strtr(base64_encode(hash_hmac('sha256', $payload, FLAG_QUEST_SECRET, true)), '+/', '-_'), '=');
    expect($signature)->toBe($expected);

    $claims = json_decode(base64_decode(strtr($payload, '-_', '+/')), true);
    expect($claims)->toMatchArray(['sub' => $user->id, 'name' => 'Andika', 'grade' => 8, 'game' => 'flag-quest'])
        ->and($claims['exp'])->toBeGreaterThan(now()->getTimestamp());
});

test('token endpoint reports unavailable service without secret', function (): void {
    config(['game-service.secret' => null]);
    $user = User::factory()->create();
    PlayerProfile::factory()->for($user)->create(['grade' => 3]);

    $this->actingAs($user)->postJson('/games/flag-quest/token')->assertStatus(503);
});

test('player can set grade from dashboard', function (): void {
    $user = User::factory()->create();

    $this->actingAs($user)->from('/dashboard')->patch('/grade', ['grade' => 7])->assertRedirect('/dashboard');
    $this->assertDatabaseHas('player_profiles', ['user_id' => $user->id, 'grade' => 7]);

    $this->get('/dashboard')->assertInertia(fn (Assert $page) => $page->where('grade', 7));
});

test('grade validation rejects invalid values', function (mixed $grade): void {
    $user = User::factory()->create();

    $this->actingAs($user)->patch('/grade', ['grade' => $grade])->assertSessionHasErrors('grade');
    $this->assertDatabaseCount('player_profiles', 0);
})->with([-1, 13, 'tujuh', null, [[5]]]);

test('character update keeps existing grade', function (): void {
    $user = User::factory()->create();
    PlayerProfile::factory()->for($user)->create(['grade' => 9]);

    $this->actingAs($user)->patch('/character', ['color' => 'violet', 'accessory' => 'cap', 'nickname' => 'Ari']);
    $this->assertDatabaseHas('player_profiles', ['user_id' => $user->id, 'grade' => 9, 'nickname' => 'Ari']);
});

test('signed result is recorded once as points and history', function (): void {
    $user = User::factory()->create();
    $payload = flagQuestResult($user);

    postSignedResult($this, $payload)->assertCreated()->assertJson(['status' => 'recorded']);
    postSignedResult($this, $payload)->assertOk()->assertJson(['status' => 'duplicate']);

    $this->assertDatabaseCount('game_histories', 1);
    $this->assertDatabaseCount('point_ledgers', 1);
    expect((int) $user->pointLedgers()->sum('points'))->toBe(95)
        ->and($user->gameHistories()->first()->game_key)->toBe('flag-quest');
});

test('result endpoint rejects bad signatures and stale timestamps', function (): void {
    $user = User::factory()->create();

    postSignedResult($this, flagQuestResult($user), 'wrong-secret-wrong-secret-wrong-secret')->assertForbidden();
    postSignedResult($this, flagQuestResult($user), null, now()->subHour()->getTimestamp())->assertForbidden();

    $this->postJson('/api/internal/game-results', flagQuestResult($user))->assertForbidden();
    $this->assertDatabaseCount('point_ledgers', 0);
});

test('result endpoint validates payload', function (string $field, mixed $value): void {
    $user = User::factory()->create();

    postSignedResult($this, flagQuestResult($user, [$field => $value]))->assertUnprocessable()->assertJsonValidationErrors($field);
    $this->assertDatabaseCount('point_ledgers', 0);
})->with([
    ['points', 99999], ['points', -5], ['mission', 'moon'], ['game_key', 'chess'],
    ['user_id', 999999], ['event_id', 'drop table'], ['grade', 13],
]);

test('dashboard lists flag quest in the catalog', function (): void {
    $user = User::factory()->create();

    $this->actingAs($user)->get('/dashboard')->assertInertia(fn (Assert $page) => $page
        ->where('categories.0.games.0.key', 'flag-quest')
        ->where('categories.0.games.0.url', '/games/flag-quest'));
});

test('history name uses the player locale', function (string $locale, string $expected): void {
    $user = User::factory()->create(['locale' => $locale]);

    postSignedResult($this, flagQuestResult($user))->assertCreated();

    expect($user->gameHistories()->first()->game_name)->toBe($expected);
})->with([
    ['id', 'Misi Bendera — Perkemahan Danau'],
    ['en', 'Flag Quest — Lakeside Camp'],
]);
