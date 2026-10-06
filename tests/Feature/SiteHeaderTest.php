<?php

it('orders the signed-in nav as dashboard, games, portal', function (): void {
    $source = file_get_contents(resource_path('js/components/site-nav.tsx'));

    $dashboard = strpos($source, "{ href: '/dashboard', labelKey: 'nav.dashboard'");
    $games = strpos($source, "{ href: '/gamelist', labelKey: 'nav.games'");
    $portal = strpos($source, "{ href: '/portal', labelKey: 'nav.portal'");

    expect($dashboard)->not->toBeFalse()
        ->and($games)->not->toBeFalse()
        ->and($portal)->not->toBeFalse()
        ->and($dashboard)->toBeLessThan($games)
        ->and($games)->toBeLessThan($portal);
});

it('translates the brand tagline in Indonesian and English', function (): void {
    $indonesian = json_decode(file_get_contents(resource_path('js/locales/id-player.json')), true);
    $english = json_decode(file_get_contents(resource_path('js/locales/en-player.json')), true);

    expect($indonesian['brand']['tagline'])->toBe('Bermain sambil Belajar')
        ->and($english['brand']['tagline'])->toBe('Play while learning');
});

it('renders the shared wordmark wherever the brand appears', function (string $file): void {
    $source = file_get_contents(resource_path($file));

    expect($source)->toContain('<BrandWordmark')
        ->and($source)->not->toContain('edufun<span>hub</span>.com');
})->with([
    'js/layouts/player-layout.tsx',
    'js/components/auth-shell.tsx',
    'js/pages/auth/login.tsx',
    'js/pages/auth/register.tsx',
    'js/pages/error.tsx',
]);
