<?php

use App\Models\User;
use Illuminate\Routing\Route as LaravelRoute;
use Illuminate\Support\Facades\Route;

beforeEach(function (): void {
    $this->withoutVite();
});

/**
 * Every game page, room link and token route: anything under /games, /arena
 * and /play (the public /gamelist catalog stays open).
 *
 * @return list<LaravelRoute>
 */
function gamesRequireLoginRoutes(): array
{
    return collect(Route::getRoutes()->getRoutes())
        ->filter(fn (LaravelRoute $route): bool => (bool) preg_match('#^(games|arena|play)/#', $route->uri()))
        ->values()
        ->all();
}

it('protects every game route with the auth middleware', function (): void {
    $routes = gamesRequireLoginRoutes();

    expect($routes)->not->toBeEmpty();

    foreach ($routes as $route) {
        expect(in_array('auth', $route->gatherMiddleware(), true))->toBeTrue($route->uri().' must require login');
    }
});

it('redirects guests from every game page to the login page', function (): void {
    $catalog = collect(config('game-catalog.categories'))->flatMap(fn (array $category): array => $category['games']);

    expect($catalog)->not->toBeEmpty();

    foreach ($catalog as $game) {
        $this->get(route($game['route']))->assertRedirect(route('login'));
    }

    foreach (['/arena/turbo-trivia', '/play/turbo-trivia/123456', '/arena/block-battle', '/play/block-battle/123456', '/games/sky-quiz/join/123456'] as $path) {
        $this->get($path)->assertRedirect(route('login'));
    }
});

it('refuses game tokens to guests', function (string $game): void {
    $this->postJson('/games/'.$game.'/token')->assertUnauthorized();
})->with(['sky-quiz', 'snakes-and-ladders', 'crossword', 'quiz-duel', 'flag-quest']);

it('marks no catalog game as guest playable', function (): void {
    $guestPlayable = collect(config('game-catalog.categories'))
        ->flatMap(fn (array $category): array => $category['games'])
        ->filter(fn (array $game): bool => (bool) ($game['guest_playable'] ?? false));

    expect($guestPlayable)->toBeEmpty();
});

it('keeps the public game list open and shows a login button for guests', function (): void {
    $this->get('/gamelist')->assertOk();
});

it('lets a signed-in player with complete details open the former demos', function (string $path): void {
    $user = User::factory()->withPlayerDetails()->create();

    $this->actingAs($user)->get($path)->assertOk();
})->with(['/games/sky-quiz', '/games/snakes-and-ladders']);
