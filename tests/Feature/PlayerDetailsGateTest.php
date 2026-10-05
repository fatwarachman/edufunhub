<?php

use App\Models\PlayerProfile;
use App\Models\User;
use Inertia\Testing\AssertableInertia as Assert;

beforeEach(function (): void {
    config(['scout.driver' => 'null', 'game-service.secret' => 'gate-test-secret-with-at-least-32-chars']);
    $this->withoutVite();
});

dataset('game pages', ['/games/flag-quest', '/games/sky-quiz', '/games/snakes-and-ladders', '/games/quiz-duel', '/games/knowledge-train', '/games/market-math', '/games/number-garden', '/games/explore-indonesia', '/games/mini-lab']);
dataset('game tokens', ['/games/flag-quest/token', '/games/sky-quiz/token', '/games/quiz-duel/token', '/games/knowledge-train/token', '/games/market-math/token', '/games/mini-lab/token']);

test('players without details are sent to the portal notice instead of a game', function (string $path, ?array $profile): void {
    $user = User::factory()->create();
    if ($profile !== null) {
        PlayerProfile::factory()->for($user)->create(['grade' => 5, ...$profile]);
    }

    $this->actingAs($user)->get($path)
        ->assertRedirect(route('portal'))
        ->assertSessionHas('player_details_required');
})->with('game pages')->with([
    'no profile' => [null],
    'no birth date' => [['birth_date' => null]],
    'no school' => [['school_name' => null]],
    'blank school' => [['school_name' => '']],
]);

test('portal always shows the notice to players without details', function (): void {
    $this->actingAs(User::factory()->create())->get(route('portal'))->assertInertia(fn (Assert $page) => $page
        ->where('player.detailsComplete', false)
        ->where('detailsRequiredNotice', false));
});

test('redirected players see the emphasized portal notice', function (): void {
    $user = User::factory()->create();

    $this->actingAs($user)->followingRedirects()->get('/games/sky-quiz')
        ->assertInertia(fn (Assert $page) => $page
            ->component('portal/index')
            ->where('player.detailsComplete', false)
            ->where('detailsRequiredNotice', true));
});

test('game tokens are refused until details are complete', function (string $path): void {
    $user = User::factory()->create();
    PlayerProfile::factory()->incomplete()->for($user)->create(['grade' => 5]);

    $this->actingAs($user)->postJson($path)
        ->assertForbidden()
        ->assertJsonPath('code', 'player_details_required');
})->with('game tokens');

test('players with complete details can open every game and get tokens', function (string $path): void {
    $user = User::factory()->create();
    PlayerProfile::factory()->for($user)->create(['grade' => 5]);

    $this->actingAs($user)->get($path)->assertOk();
})->with('game pages');

test('completing details unlocks games', function (): void {
    $user = User::factory()->create();
    PlayerProfile::factory()->incomplete()->for($user)->create(['grade' => 5]);
    $this->actingAs($user)->get('/games/flag-quest')->assertRedirect(route('portal'));

    $this->actingAs($user)->patch(route('player-details.update'), [
        'birth_date' => now()->subYears(10)->toDateString(),
        'school_name' => 'SDN 1 Bogor',
    ])->assertSessionHasNoErrors();

    $this->actingAs($user)->get('/games/flag-quest')->assertOk();
    $this->actingAs($user)->postJson('/games/flag-quest/token')->assertOk();
    $this->actingAs($user)->get(route('portal'))->assertInertia(fn (Assert $page) => $page->where('player.detailsComplete', true));
});

test('guests can still try the public demos', function (string $path): void {
    $this->get($path)->assertOk();
})->with(['/games/sky-quiz', '/games/snakes-and-ladders']);

test('players without details can still reach portal dashboard and character pages', function (string $path): void {
    $this->actingAs(User::factory()->create())->get($path)->assertOk();
})->with(['/portal', '/dashboard', '/character', '/gamelist']);
