import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const read = (path) => readFileSync(new URL(path, import.meta.url));
const locale = (lang) =>
    JSON.parse(read(`../locales/${lang}-player.json`).toString());

test('Main Ular has matching Indonesian and English copy', () => {
    const id = locale('id');
    const en = locale('en');
    assert.equal(id.player.snake, 'Main Ular');
    assert.equal(id.snake.title, 'Main Ular');
    const keys = (obj, prefix = '') =>
        Object.entries(obj).flatMap(([k, v]) =>
            v && typeof v === 'object' && !Array.isArray(v)
                ? keys(v, `${prefix}${k}.`)
                : [`${prefix}${k}`],
        );
    assert.deepEqual(keys(id.snake).sort(), keys(en.snake).sort());
    assert.equal(id.snake.howTo.demoOptions.length, 4);
});

test('snake copy is not nested inside another game', () => {
    for (const lang of ['id', 'en']) {
        const data = locale(lang);
        assert.equal(data.monsterCafe.snake, undefined);
        assert.equal(data.monsterCafe.edusnake, undefined);
    }
});

test('tutorial video and slides ship in the EduFunHub format', () => {
    const video = read('../../../public/tutorials/cara-bermain-main-ular.mp4');
    const pdf = read('../../../public/tutorials/cara-bermain-main-ular.pdf');
    assert.equal(video.subarray(4, 8).toString(), 'ftyp');
    assert.equal(pdf.subarray(0, 5).toString(), '%PDF-');
    const text = pdf.toString('latin1');
    assert.equal((text.match(/\/Type \/Page /g) ?? []).length, 6);
    assert.ok(text.includes('/MediaBox [0 0 396 696]'));
});
