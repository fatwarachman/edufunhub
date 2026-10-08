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

it('links the signed-in header to the ability analysis page', function (): void {
    $source = file_get_contents(resource_path('js/components/site-nav.tsx'));
    $indonesian = json_decode(file_get_contents(resource_path('js/locales/id-player.json')), true);
    $english = json_decode(file_get_contents(resource_path('js/locales/en-player.json')), true);

    expect($source)->toContain("href: '/ability'")
        ->and($source)->toContain("testId: 'nav-ability'")
        ->and($indonesian['nav']['ability'])->toBe('Analisa kemampuan')
        ->and($english['nav']['ability'])->toBe('Ability analysis');
});

it('puts sign in and sign up at the top of the guest phone menu', function (): void {
    $source = file_get_contents(resource_path('js/components/site-nav.tsx'));

    $css = file_get_contents(resource_path('css/edu-nav.css'));

    expect(strpos($source, 'data-testid="nav-more-auth"'))->toBeLessThan(strpos($source, '{entries.map('))
        ->and($css)->toMatch('/\\.edu-nav-more-auth \\{[^}]*position: sticky;/');
});

it('puts sign in and sign up at the top of the landing phone menu', function (string $file): void {
    $html = file_get_contents(public_path('new-landing/'.$file));
    $menu = substr($html, strpos($html, '<div id="mobile-nav"'));
    $menu = substr($menu, 0, strpos($menu, '</header>'));

    expect($html)->toContain('.mobile-nav-auth{position:sticky')
        ->and($menu)->toContain('class="mobile-nav-auth"')
        ->and(strpos($menu, 'href="/register"'))->toBeLessThan(strpos($menu, 'href="/gamelist"') ?: strpos($menu, 'games.html'))
        ->and(strpos($menu, 'href="/login"'))->toBeLessThan(strpos($menu, 'href="/register"'));
})->with(['index.html', 'games.html']);

it('paints "fun" in the brand wordmark amber', function (): void {
    $wordmark = file_get_contents(resource_path('js/components/brand-wordmark.tsx'));
    $css = file_get_contents(resource_path('css/auth-landing.css'));

    expect($wordmark)->toContain('edu<span className="edu-brand-fun">fun</span>')
        ->and($css)->toMatch('/\.edu-brand-fun \{\s*color: var\(--auth-amber\);\s*\}/');

    foreach (['index.html', 'games.html'] as $file) {
        $html = file_get_contents(public_path('new-landing/'.$file));

        expect($html)->toContain('<div class="logo-text">edu<span class="logo-fun">fun</span><span>hub</span>.com</div>')
            ->and($html)->toContain('.logo-text .logo-fun{color:var(--amber)}');
    }
});

it('keeps the admin sidebar pinned while long pages scroll', function (): void {
    $layout = file_get_contents(resource_path('js/layouts/admin-layout.tsx'));

    expect($layout)->toContain("'md:sticky md:top-0 md:z-auto md:h-dvh md:shrink-0 md:self-start'")
        ->and($layout)->not->toContain("'md:relative md:z-auto'");
});

it('groups the admin settings pages under one Settings sub menu', function (): void {
    $layout = file_get_contents(resource_path('js/layouts/admin-layout.tsx'));
    $group = substr($layout, strpos($layout, "title: 'Settings',"));
    $group = substr($group, 0, strpos($group, '],'));

    foreach (['/admin/settings', '/admin/sound-settings', '/admin/ai-settings', '/admin/point-rules'] as $href) {
        expect($group)->toContain("href: '{$href}'")
            ->and(substr_count($layout, "href: '{$href}'"))->toBe(1);
    }

    expect($layout)->toContain('data-testid="admin-nav-group"')
        ->and($layout)->toContain('aria-expanded={open}');
});

it('groups the admin analytics pages under one Analytics sub menu', function (): void {
    $layout = file_get_contents(resource_path('js/layouts/admin-layout.tsx'));
    $group = substr($layout, strpos($layout, "title: 'Analytics',"));
    $group = substr($group, 0, strpos($group, '],'));

    foreach (['/admin/user-statistics', '/admin/playing-time', '/admin/screen-time', '/admin/games', '/admin/leaderboard'] as $href) {
        expect($group)->toContain("href: '{$href}'")
            ->and(substr_count($layout, "href: '{$href}'"))->toBe(1);
    }
});

it('shows an Active badge on active questions in the bank list and detail page', function (): void {
    $index = file_get_contents(resource_path('js/pages/admin/questions/index.tsx'));
    $show = file_get_contents(resource_path('js/pages/admin/questions/show.tsx'));

    expect($index)->toContain('data-testid="question-active-badge"')
        ->and($index)->toMatch("/question\.is_active \? \(\s*<Badge tone=\"success\">/")
        ->and($show)->toMatch("/question\.is_active \? \(\s*<Chip className=\"gap-1 bg-emerald-100/");
});

it('folds header buttons before they slide over the brand', function (): void {
    $hook = file_get_contents(resource_path('js/hooks/use-nav-fold.ts'));

    expect($hook)->toContain('const BRAND_GAP = 12;')
        ->and($hook)->toContain('item.left < brand.right + BRAND_GAP')
        ->and($hook)->toContain('navBox.left < rowBox.left - 1');
});

it('gives a tapped folded button its label and folds the nearest labelled one instead', function (): void {
    $hook = file_get_contents(resource_path('js/hooks/use-nav-fold.ts'));
    $css = file_get_contents(resource_path('css/edu-nav.css'));

    expect($hook)->toContain("const PINNED_KEY = 'edu-nav-pinned';")
        ->and($hook)->toContain("closest<HTMLElement>('.edu-nav-btn[data-folded]')")
        ->and($hook)->toContain('order.push(...order.splice(pinnedIndex, 1));')
        ->and($hook)->toContain('function morph(')
        ->and($hook)->toContain("fill: 'forwards'")
        ->and($hook)->toContain('reducedMotion()')
        ->and($css)->toContain('.edu-nav-bar .edu-nav-btn--morph');
});

it('ignores wide page content and badges sticking out of buttons when deciding to fold the header', function (): void {
    $hook = file_get_contents(resource_path('js/hooks/use-nav-fold.ts'));

    expect($hook)->not->toContain('page.scrollWidth > page.clientWidth')
        ->and($hook)->not->toContain('nav.scrollWidth > nav.clientWidth')
        ->and($hook)->toContain('if (row.scrollWidth > row.clientWidth + 1) {');
});
