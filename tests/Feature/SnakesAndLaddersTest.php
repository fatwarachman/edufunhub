<?php

use App\Models\PlayerProfile;
use App\Models\Question;
use App\Models\User;
use Inertia\Testing\AssertableInertia as Assert;

beforeEach(function (): void {
    $this->withoutVite();
    config(['game-service.secret' => str_repeat('s', 40)]);
});

it('lets guests practise on one device without rooms', function (): void {
    $this->get('/games/snakes-and-ladders')->assertOk()->assertInertia(fn (Assert $page) => $page
        ->component('games/snakes-and-ladders')
        ->where('player', null)
        ->where('online', false)
        ->where('wsUrl', null)
        ->where('pin', null));
});

it('enables online rooms for signed in players', function (): void {
    $user = User::factory()->withPlayerDetails()->create();
    PlayerProfile::query()->where('user_id', $user->id)->update(['grade' => 4, 'nickname' => 'Rani']);

    $this->actingAs($user)->get('/games/snakes-and-ladders?pin=123456')->assertOk()->assertInertia(fn (Assert $page) => $page
        ->where('player.name', 'Rani')
        ->where('player.grade', 4)
        ->where('online', true)
        ->where('wsUrl', '/game-ws/snakes')
        ->where('pin', '123456'));
});

it('ignores malformed pins', function (string $pin): void {
    $user = User::factory()->withPlayerDetails()->create();

    $this->actingAs($user)->get('/games/snakes-and-ladders?pin='.$pin)->assertOk()
        ->assertInertia(fn (Assert $page) => $page->where('pin', null));
})->with(['12345', '1234567', 'abcdef', '12 456']);

it('issues a signed snakes token with the player grade', function (): void {
    $user = User::factory()->withPlayerDetails()->create();
    PlayerProfile::query()->where('user_id', $user->id)->update(['grade' => 6, 'nickname' => 'Bima']);

    $token = $this->actingAs($user)->postJson('/games/snakes-and-ladders/token')->assertOk()->json('token');
    [$payload] = explode('.', $token);
    $claims = json_decode(base64_decode(strtr($payload, '-_', '+/')), true);

    expect($claims['game'])->toBe('snakes-and-ladders')
        ->and($claims['sub'])->toBe($user->id)
        ->and($claims['grade'])->toBe(6)
        ->and($claims['name'])->toBe('Bima');
});

it('requires sign in and a grade before a snakes token', function (): void {
    $this->postJson('/games/snakes-and-ladders/token')->assertUnauthorized();

    $user = User::factory()->withPlayerDetails()->create();
    PlayerProfile::query()->where('user_id', $user->id)->update(['grade' => null]);

    $this->actingAs($user)->postJson('/games/snakes-and-ladders/token')->assertUnprocessable();
});

it('distributes bank questions to snakes rooms and keeps it multiple choice only', function (): void {
    expect(Question::GAMES)->toContain('snakes-and-ladders')
        ->and(Question::CHOICE_ONLY_GAMES)->toContain('snakes-and-ladders');
});
