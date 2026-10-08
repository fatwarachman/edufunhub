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
    'quiz duel' => ['/games/quiz-duel', 'games/quiz-duel'],
    'knowledge train' => ['/games/knowledge-train', 'games/knowledge-train'],
]);

it('sends guests to login from player-only destinations', function (string $url): void {
    $this->get($url)->assertRedirect('/login');
})->with(['/portal', '/dashboard', '/character', '/games/flag-quest', '/games/quiz-duel', '/games/knowledge-train', '/games/snakes-and-ladders', '/games/sky-quiz']);

it('links the landing page game list to the app game list', function (): void {
    $landing = file_get_contents(public_path('new-landing/index.html'));

    expect($landing)
        ->toContain('href="/gamelist"')
        ->not->toContain('href="games.html"');
});

it('keeps every header sticky at the top with an opaque background', function (string $file, string $needle): void {
    $source = file_get_contents(resource_path($file));
    $header = substr($source, strpos($source, '<header'), 400);

    expect($header)->toContain($needle)
        ->and($header)->not->toContain('backdrop-blur')
        ->and($header)->not->toMatch('/bg-\[#[0-9a-fA-F]{6}\]\/\d+/')
        ->and($header)->not->toContain('f2`');
})->with([
    'player layout' => ['js/layouts/player-layout.tsx', 'className="auth-header"'],
    'legal document' => ['js/components/legal-document.tsx', 'sticky top-0'],
    'game list' => ['js/pages/games/index.tsx', 'sticky top-0'],
    'crossword' => ['js/pages/games/crossword.tsx', 'sticky top-0'],
    'economy heist' => ['js/pages/games/economy-heist.tsx', 'sticky top-0'],
    'floor drop' => ['js/pages/games/floor-drop.tsx', 'sticky top-0'],
    'knowledge train' => ['js/pages/games/knowledge-train.tsx', 'sticky top-0'],
    'mini game' => ['js/pages/games/mini-game.tsx', 'sticky top-0'],
    'order rush' => ['js/pages/games/order-rush.tsx', 'sticky top-0'],
    'port sorter' => ['js/pages/games/port-sorter.tsx', 'sticky top-0'],
    'quiz duel' => ['js/pages/games/quiz-duel.tsx', 'sticky top-0'],
    'sky quiz' => ['js/pages/games/sky-quiz.tsx', 'sticky top-0'],
    'snakes and ladders' => ['js/pages/games/snakes-and-ladders.tsx', 'sticky top-0'],
    'block battle' => ['js/components/block-battle/shared.tsx', 'sticky top-0'],
    'turbo trivia' => ['js/components/turbo-trivia/shared.tsx', 'sticky top-0'],
]);

it('makes the shared auth header sticky and opaque on every width', function (): void {
    $css = file_get_contents(resource_path('css/auth-landing.css'));
    $rule = substr($css, strpos($css, '.auth-header {'), 400);

    expect($rule)->toContain('position: sticky;')
        ->and($rule)->toContain('top: 0;')
        ->and($rule)->toContain('z-index: 50;')
        ->and($rule)->toContain('background: var(--auth-cream);');
});
