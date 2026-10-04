<?php

use App\Models\User;
use Inertia\Testing\AssertableInertia as Assert;

/**
 * Every destination used by the shared site navigation (SiteNav / BackButton)
 * must resolve, so the pages stay linked to each other.
 */
beforeEach(function (): void {
    $this->withoutVite();
});

it('serves every guest navigation destination', function (string $url, ?string $component): void {
    $response = $this->get($url)->assertOk();

    if ($component !== null) {
        $response->assertInertia(fn (Assert $page) => $page->component($component));
    }
})->with([
    'home' => ['/', null],
    'game list' => ['/gamelist', 'games/index'],
    'snakes and ladders' => ['/games/snakes-and-ladders', 'games/snakes-and-ladders'],
    'sky quiz' => ['/games/sky-quiz', 'games/sky-quiz'],
    'login' => ['/login', 'auth/login'],
    'register' => ['/register', 'auth/register'],
]);

it('serves every player navigation destination', function (string $url, string $component): void {
    $player = User::factory()->withPlayerDetails()->create();

    $this->actingAs($player)
        ->get($url)
        ->assertOk()
        ->assertInertia(fn (Assert $page) => $page->component($component));
})->with([
    'portal' => ['/portal', 'portal/index'],
    'game list' => ['/gamelist', 'games/index'],
    'dashboard' => ['/dashboard', 'user/dashboard'],
    'character' => ['/character', 'user/character'],
    'flag quest' => ['/games/flag-quest', 'games/flag-quest'],
    'snakes and ladders' => ['/games/snakes-and-ladders', 'games/snakes-and-ladders'],
    'sky quiz' => ['/games/sky-quiz', 'games/sky-quiz'],
]);

it('sends guests to login from player-only destinations', function (string $url): void {
    $this->get($url)->assertRedirect('/login');
})->with(['/portal', '/dashboard', '/character', '/games/flag-quest']);

it('links the landing page game list to the app game list', function (): void {
    $landing = file_get_contents(public_path('new-landing/index.html'));

    expect($landing)
        ->toContain('href="/gamelist"')
        ->not->toContain('href="games.html"');
});
