<?php

use App\Models\User;
use Inertia\Testing\AssertableInertia as Assert;

/**
 * Host-screen games can be played alone: `?role=solo` opens a private room
 * from a player token (no projector, no PIN). Go owns the solo room.
 */
it('opens the solo page of host-screen games', function (string $path, string $component): void {
    $user = User::factory()->withPlayerDetails()->create();

    $this->actingAs($user)->get("{$path}?role=solo")->assertOk()->assertInertia(fn (Assert $page) => $page
        ->component($component)
        ->where('role', 'solo')
        ->has('ads'));
})->with([
    'floor drop' => ['/games/floor-drop', 'games/floor-drop'],
    'economy heist' => ['/games/economy-heist', 'games/economy-heist'],
    'order rush' => ['/games/order-rush', 'games/order-rush'],
]);

it('opens the solo phone controller of arena games', function (string $game): void {
    $user = User::factory()->withPlayerDetails()->create();

    $this->actingAs($user)->get("/play/{$game}?role=solo")->assertOk()->assertInertia(fn (Assert $page) => $page
        ->component("games/{$game}/controller")
        ->where('solo', true)
        ->where('pin', null)
        ->where('player.id', $user->id));

    $this->actingAs($user)->get("/play/{$game}")->assertInertia(fn (Assert $page) => $page->where('solo', false));
})->with(['turbo-trivia', 'block-battle']);

it('signs a player token for solo rooms', function (string $game): void {
    $user = User::factory()->withPlayerDetails()->create();

    $token = $this->actingAs($user)->postJson("/games/{$game}/token?role=solo")->assertOk()->json('token');
    [$payload] = explode('.', $token);
    $claims = json_decode(base64_decode(strtr($payload, '-_', '+/')), true);

    expect($claims['game'])->toBe($game)->and($claims['sub'])->toBe($user->id);
})->with(['floor-drop', 'economy-heist', 'order-rush', 'turbo-trivia', 'block-battle']);

it('ignores unknown roles', function (string $path): void {
    $user = User::factory()->withPlayerDetails()->create();

    $this->actingAs($user)->get("{$path}?role=admin")->assertInertia(fn (Assert $page) => $page->where('role', null));
})->with(['/games/floor-drop', '/games/economy-heist', '/games/order-rush']);
