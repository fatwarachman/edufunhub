import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

const read = (path) =>
    readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8');

test('TKJ games expose the in-game language toggle', () => {
    const toggle = read('resources/js/components/game-language-toggle.tsx');
    assert.match(toggle, /router\.patch\(\s*'\/locale'/);
    assert.match(toggle, /i18n\.changeLanguage\(code\)/);
    assert.match(toggle, /role="radiogroup"/);

    for (const [page, testId] of [
        ['resources/js/pages/games/order-rush.tsx', 'or-language-toggle'],
        ['resources/js/pages/games/port-sorter.tsx', 'port-language-toggle'],
    ]) {
        const source = read(page);
        assert.match(
            source,
            /import \{ GameLanguageToggle \} from '@\/components\/game-language-toggle';/,
            `${page} imports the toggle`,
        );
        assert.ok(
            source.includes(`testId="${testId}"`),
            `${page} renders the toggle (${testId})`,
        );
    }
});

test('TKJ games forward the active language to the Go referee', () => {
    assert.match(
        read('resources/js/pages/games/order-rush.tsx'),
        /useOrderRush\([\s\S]*?i18n\.language,/,
    );
    assert.match(
        read('resources/js/pages/games/port-sorter.tsx'),
        /usePortSorterConnection\([\s\S]*?i18n\.language,/,
    );
    assert.match(
        read('resources/js/hooks/use-game-socket.ts'),
        /send\(\{ t: 'locale', locale \}\)/,
    );
});

test('language labels exist in both player catalogs', () => {
    for (const locale of ['id', 'en']) {
        const catalog = JSON.parse(
            read(`resources/js/locales/${locale}-player.json`),
        );
        for (const key of ['label', 'id', 'en']) {
            assert.ok(
                typeof catalog.language[key] === 'string' &&
                    catalog.language[key].trim() !== '',
                `${locale}: language.${key}`,
            );
        }
    }
});
