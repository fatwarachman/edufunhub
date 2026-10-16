<?php

use App\Models\User;

it('offers a share menu on the dashboard stats and ranking sections', function (): void {
    $dashboard = file_get_contents(resource_path('js/pages/user/dashboard.tsx'));

    expect(substr_count($dashboard, '<ShareMenu'))->toBe(2)
        ->and($dashboard)->toContain('testId="dash-share-stats-button"')
        ->toContain('testId="dash-share-ranking-button"')
        ->toContain("t('playerDash.board.shareText'")
        ->toContain("t('playerDash.share.statsText'")
        ->toContain('name={displayName}');
});

it('shares to WhatsApp, Facebook, X, Telegram, copy link and the native sheet', function (): void {
    $menu = file_get_contents(resource_path('js/components/share-menu.tsx'));
    $share = file_get_contents(resource_path('js/lib/share.ts'));

    expect($menu)->toContain("'whatsapp'")->toContain("'facebook'")->toContain("'x'")->toContain("'telegram'")
        ->toContain('data-testid={`${testId}-copy`}')
        ->toContain('data-testid={`${testId}-native`}')
        ->toContain('canNativeShare()')
        ->and($share)->toContain('https://api.whatsapp.com/send?text=')
        ->toContain('https://www.facebook.com/sharer/sharer.php?u=')
        ->toContain('https://twitter.com/intent/tweet?text=')
        ->toContain('https://t.me/share/url?url=');
});

it('has Indonesian and English copy for the share menu and ranking text', function (): void {
    foreach (['id', 'en'] as $locale) {
        $catalog = json_decode(file_get_contents(resource_path("js/locales/{$locale}-player.json")), true);

        foreach (['label', 'native', 'whatsapp', 'facebook', 'x', 'telegram', 'copyLink', 'copied'] as $key) {
            expect($catalog['shareMenu'][$key] ?? '')->not->toBe('');
        }
        expect($catalog['playerDash']['board']['shareText'])->toContain('{{name}}')->toContain('{{rank}}')->toContain('{{points}}')
            ->and($catalog['playerDash']['board']['shareTextUnranked'] ?? '')->toContain('{{name}}')
            ->and($catalog['playerDash']['share']['statsText'] ?? '')->toContain('{{name}}');
    }
});

it('still renders the dashboard for players', function (): void {
    $this->withoutVite();

    $this->actingAs(User::factory()->create())->get('/dashboard')->assertOk();
});
