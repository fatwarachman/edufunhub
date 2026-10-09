<?php

use App\Models\User;
use Inertia\Testing\AssertableInertia as Assert;

beforeEach(function (): void {
    $this->withoutVite();
});

/**
 * @return list<array<string, mixed>>
 */
function catalogGamesForPlayerCount(): array
{
    return collect(config('game-catalog.categories'))->flatMap(fn (array $category): array => $category['games'])->values()->all();
}

it('gives every catalog game a valid player range', function (): void {
    $games = catalogGamesForPlayerCount();

    expect($games)->not->toBeEmpty();

    foreach ($games as $game) {
        expect($game)->toHaveKeys(['min_players', 'max_players'])
            ->and($game['min_players'])->toBeInt()->toBeGreaterThanOrEqual(1)
            ->and($game['max_players'])->toBeInt()->toBeGreaterThanOrEqual($game['min_players']);
    }
});

it('mirrors the Go service player limits', function (): void {
    $ranges = collect(catalogGamesForPlayerCount())->mapWithKeys(fn (array $game): array => [
        $game['key'] => [$game['min_players'], $game['max_players']],
    ]);

    expect($ranges['snakes-and-ladders'])->toBe([1, 4])
        ->and($ranges['crossword'])->toBe([1, 4])
        ->and($ranges['market-math'])->toBe([1, 4])
        ->and($ranges['quiz-duel'])->toBe([1, 2])
        ->and($ranges['floor-drop'])->toBe([2, 100])
        ->and($ranges['turbo-trivia'])->toBe([2, 40])
        ->and($ranges['block-battle'])->toBe([1, 50])
        ->and($ranges['monster-cafe'])->toBe([1, 40])
        ->and($ranges['ping-pong'])->toBe([1, 2])
        ->and($ranges['economy-heist'])->toBe([2, 60])
        ->and($ranges['order-rush'])->toBe([2, 60])
        ->and($ranges['sky-quiz'])->toBe([1, 1])
        ->and($ranges['flag-quest'])->toBe([1, 1]);
});

it('shares player counts on the game list menu', function (): void {
    $this->get('/gamelist')->assertOk()->assertInertia(fn (Assert $page) => $page
        ->component('games/index')
        ->where('gameMenu.1.games.0.key', 'snakes-and-ladders')
        ->where('gameMenu.1.games.0.minPlayers', 1)
        ->where('gameMenu.1.games.0.maxPlayers', 4)
        ->where('gameMenu.2.games.2.key', 'floor-drop')
        ->where('gameMenu.2.games.2.minPlayers', 2)
        ->where('gameMenu.2.games.2.maxPlayers', 100)
        ->where('gameMenu.0.games.0.maxPlayers', 1));
});

it('shares player counts on the portal game cards', function (): void {
    $player = User::factory()->withPlayerDetails()->create();

    $this->actingAs($player)->get('/portal')->assertOk()->assertInertia(fn (Assert $page) => $page
        ->component('portal/index')
        ->where('categories.2.games.5.key', 'turbo-trivia')
        ->where('categories.2.games.5.minPlayers', 2)
        ->where('categories.2.games.5.maxPlayers', 40)
        ->where('categories.2.games.6.key', 'block-battle')
        ->where('categories.2.games.6.minPlayers', 1)
        ->where('categories.2.games.6.maxPlayers', 50)
        ->where('categories.2.games.8.key', 'monster-cafe')
        ->where('categories.2.games.8.minPlayers', 1)
        ->where('categories.2.games.8.maxPlayers', 40)
        ->where('categories.2.games.7.key', 'ping-pong')
        ->where('categories.2.games.7.minPlayers', 1)
        ->where('categories.2.games.7.maxPlayers', 2)
        ->where('categories.4.games.0.minPlayers', 1)
        ->where('categories.4.games.0.maxPlayers', 1));
});

it('shows the player count on the admin game detail', function (): void {
    $admin = User::factory()->create(['is_superadmin' => true]);

    $this->actingAs($admin)->get('/admin/games/economy-heist')->assertOk()->assertInertia(fn (Assert $page) => $page
        ->component('admin/games/show')
        ->where('game.minPlayers', 2)
        ->where('game.maxPlayers', 60));
});

it('translates the player count labels in both locales', function (): void {
    $keys = [];

    foreach (['id', 'en'] as $locale) {
        $catalog = json_decode(file_get_contents(resource_path("js/locales/{$locale}-player.json")), true, flags: JSON_THROW_ON_ERROR);
        $players = $catalog['games']['players'];

        expect($players)->toHaveKeys(['label', 'solo', 'exact', 'range', 'min']);

        foreach ($players as $text) {
            expect($text)->toBeString()->not->toBeEmpty();
        }

        $keys[$locale] = array_keys($players);
    }

    expect($keys['id'])->toBe($keys['en']);
});
