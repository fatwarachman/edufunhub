import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (path) => readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8');

test('assistant locale catalogs have matching nonempty entries and suggestions', () => {
    const id = JSON.parse(read('resources/js/locales/id-ai-assistant.json'));
    const en = JSON.parse(read('resources/js/locales/en-ai-assistant.json'));
    assert.deepEqual(Object.keys(id).sort(), Object.keys(en).sort());
    for (const catalog of [id, en]) {
        for (const value of Object.values(catalog)) {
            if (Array.isArray(value)) {
                assert.equal(value.length, 4);
                assert.ok(value.every((entry) => typeof entry === 'string' && entry.trim().length > 0));
            } else {
                assert.ok(typeof value === 'string' && value.trim().length > 0);
            }
        }
    }
});

test('assistant navigation stays restricted and bilingual', () => {
    const navigation = read('resources/js/lib/admin-navigation.ts');
    assert.match(navigation, /title: 'AI Assistant',[\s\S]*?href: '\/admin\/ai-assistant',[\s\S]*?superadminOnly: true/);
    for (const locale of ['id', 'en']) {
        assert.ok(JSON.parse(read(`resources/js/locales/${locale}-admin.json`))['AI Assistant']);
    }
});
