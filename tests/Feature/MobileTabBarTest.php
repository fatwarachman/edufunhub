<?php

use App\Models\User;

/**
 * The phone bottom tab bar (components/mobile-tab-bar.tsx) shows on every
 * page outside a game and links to pages that resolve.
 */
beforeEach(function (): void {
    $this->withoutVite();
});

it('links the signed-in tab bar to working pages', function (string $url): void {
    $player = User::factory()->withPlayerDetails()->create();

    $this->actingAs($player)->get($url)->assertOk();
})->with(['/dashboard', '/gamelist', '/portal', '/chat', '/profile']);

it('links the guest tab bar to working pages', function (string $url): void {
    $this->get($url)->assertOk();
})->with(['/gamelist', '/login', '/register']);

it('renders the tab bar on pages outside a game', function (string $file): void {
    expect(file_get_contents(resource_path($file)))
        ->toContain('<MobileTabBar />')
        ->toContain('edu-has-tabbar');
})->with([
    'player layout' => ['js/layouts/player-layout.tsx'],
    'game list' => ['js/pages/games/index.tsx'],
    'legal document' => ['js/components/legal-document.tsx'],
]);

it('keeps the tab bar out of game screens and the 3D classroom', function (): void {
    $games = collect(glob(resource_path('js/pages/games/*.tsx')))
        ->merge(glob(resource_path('js/pages/games/*/*.tsx')))
        ->reject(fn (string $file): bool => str_ends_with($file, 'games/index.tsx'));

    expect($games)->not->toBeEmpty();
    $games->each(fn (string $file) => expect(file_get_contents($file))->not->toContain('MobileTabBar'));

    expect(file_get_contents(resource_path('js/pages/teacher/classrooms/world.tsx')))->toContain('tabBar={false}')
        ->and(file_get_contents(resource_path('js/pages/portal/classroom.tsx')))->toContain('tabBar={false}');
});

it('translates the tab bar label in Indonesian and English', function (string $locale): void {
    $catalog = json_decode(file_get_contents(resource_path("js/locales/{$locale}-player.json")), true);

    expect($catalog['nav']['tabBar'] ?? null)->toBeString()->not->toBeEmpty();
})->with(['id', 'en']);
