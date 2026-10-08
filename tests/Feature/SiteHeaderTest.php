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

    expect($source)->toMatch('/<BrandWordmark|<BrandLink/')
        ->and($source)->not->toContain('edufun<span>hub</span>.com');
})->with([
    'js/layouts/player-layout.tsx',
    'js/components/brand-link.tsx',
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

it('always folds the phone header nav into the menu button', function (): void {
    $hook = file_get_contents(resource_path('js/hooks/use-nav-fold.ts'));
    $css = file_get_contents(resource_path('css/edu-nav.css'));
    $nav = file_get_contents(resource_path('js/components/site-nav.tsx'));

    expect($hook)->toContain("const PHONE_QUERY = '(max-width: 767px)';")
        ->and($hook)->toMatch("/if \\(isPhone\\(\\)\\) \\{[^}]*if \\(collapsible\\) \\{\\s*nav\\.setAttribute\\('data-collapsed', ''\\);/")
        ->and($css)->toMatch('/@media \\(max-width: 767px\\) \\{\\s*\\.edu-nav-bar--compact \\.edu-nav-links \\{\\s*display: none;\\s*\\}\\s*\\.edu-nav-bar--compact \\.edu-nav-more \\{\\s*display: block;/')
        ->and(strpos($nav, '<JoinByPinButton className="edu-game-menu-item">'))->toBeLessThan(strpos($nav, '{entries.map('));
});

it('passes compact to every header nav so phones get the menu button', function (string $file): void {
    $source = file_get_contents(resource_path($file));

    expect($source)->toContain('<SiteNav compact')
        ->and(preg_match('/<SiteNav(?![^>]*compact)[^>]*>/', $source))->toBe(0);
})->with([
    'js/layouts/player-layout.tsx',
    'js/components/legal-document.tsx',
    'js/pages/games/index.tsx',
    'js/pages/games/crossword.tsx',
    'js/pages/games/sky-quiz.tsx',
    'js/pages/games/knowledge-train.tsx',
    'js/components/block-battle/shared.tsx',
    'js/components/turbo-trivia/shared.tsx',
]);

it('shows the full weekday and month name in the desktop header clock', function (): void {
    $clock = file_get_contents(resource_path('js/components/digital-clock.tsx'));

    expect($clock)->toContain("weekday: 'long',\n        day: 'numeric',\n        month: 'long',\n        year: 'numeric',")
        ->and($clock)->toContain("weekday: 'long',\n        day: 'numeric',\n        month: 'short',")
        ->and($clock)->toContain("weekday: 'short',\n        day: 'numeric',\n        month: 'short',")
        ->and($clock)->toContain("i18n.language === 'en' ? 'en-GB' : 'id-ID'")
        ->and($clock)->toContain('data-day="full"')
        ->and($clock)->toContain('data-day="medium"')
        ->and($clock)->toContain('data-day="short"');
});

it('picks the clock date tier by measuring the header instead of fixed breakpoints', function (): void {
    $css = file_get_contents(resource_path('css/edu-nav.css'));

    expect($css)->not->toContain('@media (max-width: 1799px)')
        ->and($css)->not->toContain('@media (max-width: 1199px)')
        ->and($css)->not->toContain('@media (max-width: 1279px)')
        ->and($css)->toContain(".edu-clock[data-tier='full'] .edu-clock-day[data-day='full']")
        ->and($css)->toContain(".edu-clock[data-tier='medium'] .edu-clock-day[data-day='medium']")
        ->and($css)->toContain(".edu-clock[data-tier='short'] .edu-clock-day[data-day='short']");
});

it('steps the clock date down only after every nav label is an icon', function (): void {
    $hook = file_get_contents(resource_path('js/hooks/use-nav-fold.ts'));

    $folding = strpos($hook, "button.setAttribute('data-folded', '');");
    $tiers = strpos($hook, 'for (const tier of CLOCK_TIERS.slice(1)) {');
    $collapse = strpos($hook, "if (collapsible && crowded(nav)) {\n                nav.setAttribute('data-collapsed', '');");

    expect($hook)->toContain("export const CLOCK_TIERS = ['full', 'medium', 'short', 'time'] as const;")
        ->and($folding)->not->toBeFalse()
        ->and($tiers)->toBeGreaterThan($folding)
        ->and($collapse)->toBeGreaterThan($tiers)
        ->and($hook)->toContain("setClockTier(row, 'time');")
        ->and($hook)->toContain('rowContent.observe(row, { childList: true, subtree: true });')
        ->and($hook)->toContain("'.edu-game-brand, .auth-brand, .edu-brand-wordmark, h1, .edu-clock'");
});

it('keeps scroll anchors clear of the sticky header', function (): void {
    $css = file_get_contents(resource_path('css/edu-nav.css'));

    expect($css)->toMatch('/html:has\\(\\.edu-nav-bar\\) \\{\\s*scroll-padding-top: 96px;/');
});

it('links the brand to Beranda: dashboard when signed in, landing page for guests', function (): void {
    $brand = file_get_contents(resource_path('js/components/brand-link.tsx'));
    $indonesian = json_decode(file_get_contents(resource_path('js/locales/id-player.json')), true);
    $english = json_decode(file_get_contents(resource_path('js/locales/en-player.json')), true);

    expect($brand)->toContain("return props.auth?.user ? '/dashboard' : '/';")
        ->and($brand)->toContain("'aria-label': t('nav.brandHome')")
        ->and($brand)->toContain('<Link href={href} {...common}>')
        ->and($brand)->toContain('<a href={href} {...common}>')
        ->and($indonesian['nav']['brandHome'])->toBe('edufunhub.com, buka Beranda')
        ->and($english['nav']['brandHome'])->toBe('edufunhub.com, open Home');
});

it('renders the Beranda brand link on every player header', function (string $file, string $tag): void {
    $source = file_get_contents(resource_path($file));
    $header = substr($source, strpos($source, '<header'), 1500);

    expect($header)->toContain($tag)
        ->and($source)->not->toContain('href="/portal"\n                        className="auth-brand"');
})->with([
    'player layout' => ['js/layouts/player-layout.tsx', '<BrandLink hideWordmarkOnPhone />'],
    'legal document' => ['js/components/legal-document.tsx', '<BrandLink hideWordmarkOnPhone />'],
    'game list' => ['js/pages/games/index.tsx', '<BrandLink variant="mark" />'],
    'crossword' => ['js/pages/games/crossword.tsx', '<BrandLink variant="mark" />'],
    'economy heist' => ['js/pages/games/economy-heist.tsx', '<BrandLink variant="mark" />'],
    'floor drop' => ['js/pages/games/floor-drop.tsx', '<BrandLink variant="mark" />'],
    'knowledge train' => ['js/pages/games/knowledge-train.tsx', '<BrandLink variant="mark" />'],
    'mini game' => ['js/pages/games/mini-game.tsx', '<BrandLink variant="mark" />'],
    'order rush' => ['js/pages/games/order-rush.tsx', '<BrandLink variant="mark" />'],
    'port sorter' => ['js/pages/games/port-sorter.tsx', '<BrandLink variant="mark" />'],
    'quiz duel' => ['js/pages/games/quiz-duel.tsx', '<BrandLink variant="mark" />'],
    'block battle' => ['js/components/block-battle/shared.tsx', '<BrandLink variant="mark" />'],
    'turbo trivia' => ['js/components/turbo-trivia/shared.tsx', '<BrandLink variant="mark" />'],
]);

it('keeps the guest auth pages linking the brand to the landing page', function (string $file): void {
    expect(file_get_contents(resource_path($file)))->toContain('<a href="/" className="auth-brand"');
})->with([
    'js/components/auth-shell.tsx',
    'js/pages/auth/login.tsx',
    'js/pages/error.tsx',
]);

it('never lets the phone clock badge slide under the bell or menu button', function (): void {
    $hook = file_get_contents(resource_path('js/hooks/use-nav-fold.ts'));
    $css = file_get_contents(resource_path('css/edu-nav.css'));

    $phone = strpos($hook, 'if (isPhone()) {');
    $tight = strpos($hook, 'setClockTier(row, CLOCK_TIGHT_TIER);', $phone);
    $hidden = strpos($hook, 'setClockTier(row, CLOCK_HIDDEN_TIER);', $phone);

    expect($phone)->not->toBeFalse()
        ->and($tight)->toBeGreaterThan($phone)
        ->and($hidden)->toBeGreaterThan($tight)
        ->and($hook)->toContain("addEventListener?.('loadingdone'")
        ->and($css)->toContain(".edu-clock[data-tier='tight']")
        ->and($css)->toMatch("/\\.edu-clock\\[data-tier='hidden'\\]\\s*\\{\\s*display: none;/");
});
