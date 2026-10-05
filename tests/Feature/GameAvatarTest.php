<?php

use App\Models\CharacterItem;
use App\Models\PlayerProfile;
use App\Models\User;
use Inertia\Testing\AssertableInertia as Assert;

beforeEach(function (): void {
    $this->withoutVite();
    config(['game-service.secret' => str_repeat('s', 40)]);
});

/**
 * @return array<string, mixed>
 */
function decodeGameToken(string $token): array
{
    return json_decode(base64_decode(strtr(explode('.', $token)[0], '-_', '+/')), true);
}

function dressedPlayer(): User
{
    $user = User::factory()->withPlayerDetails()->create();
    $crown = CharacterItem::query()->where('key', 'royal-crown')->firstOrFail();
    $user->characterItems()->attach($crown->id, ['price_paid' => 0]);
    PlayerProfile::query()->where('user_id', $user->id)->update([
        'grade' => 4,
        'color' => 'violet',
        'gender' => 'girl',
        'skin' => 'tan',
        'hair_color' => 'pink',
        'equipped' => json_encode(['hat' => $crown->id]),
    ]);

    return $user;
}

it('sends the player avatar look to every game page', function (string $url): void {
    $user = dressedPlayer();

    $this->actingAs($user)->get($url)->assertOk()->assertInertia(fn (Assert $page) => $page
        ->where('player.character.color', 'violet')
        ->where('player.character.gender', 'girl')
        ->where('player.character.skin', 'tan')
        ->where('player.character.hair', 'pink')
        ->where('player.character.items.hat.style', CharacterItem::query()->where('key', 'royal-crown')->value('style'))
        ->missing('player.character.nickname'));
})->with([
    '/games/snakes-and-ladders',
    '/games/quiz-duel',
    '/games/sky-quiz',
    '/games/knowledge-train',
    '/games/crossword',
    '/games/flag-quest',
    '/games/market-math',
]);

it('signs the avatar look into game tokens so Go can show it to room players', function (string $url): void {
    $user = dressedPlayer();

    $claims = decodeGameToken($this->actingAs($user)->postJson($url)->assertOk()->json('token'));

    expect($claims['character']['color'])->toBe('violet')
        ->and($claims['character']['gender'])->toBe('girl')
        ->and($claims['character']['items']['hat']['style'])->toBe(CharacterItem::query()->where('key', 'royal-crown')->value('style'))
        ->and(strlen((string) json_encode($claims['character'])))->toBeLessThan(2048);
})->with([
    '/games/snakes-and-ladders/token',
    '/games/quiz-duel/token',
    '/games/crossword/token',
    '/games/mini-lab/token',
]);

it('shares the superadmin flag that shows the admin button only to superadmins', function (): void {
    $this->actingAs(User::factory()->superadmin()->withPlayerDetails()->create())->get('/portal')
        ->assertInertia(fn (Assert $page) => $page->where('auth.user.is_superadmin', true));

    $this->actingAs(User::factory()->withPlayerDetails()->create())->get('/portal')
        ->assertInertia(fn (Assert $page) => $page->where('auth.user.is_superadmin', false));
});
