import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import ts from 'typescript';
const source = fs.readFileSync(new URL('../../resources/js/lib/snakes-board.ts', import.meta.url), 'utf8');
const js = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ES2022 } }).outputText;
const { boardPoint, BOARD_LADDERS, BOARD_SNAKES } = await import(`data:text/javascript;base64,${Buffer.from(js).toString('base64')}`);

test('100 unique cells stay inside board and start bottom-left', () => {
    const points = Array.from({ length: 100 }, (_, i) => boardPoint(i + 1));
    assert.equal(new Set(points.map(p => `${p.x},${p.y}`)).size, 100);
    for (const p of points) { assert.ok(p.x >= 40 && p.x <= 960); assert.ok(p.y >= 160 && p.y <= 950); }
    assert.ok(boardPoint(1).x < boardPoint(10).x);
    assert.ok(boardPoint(100).y < boardPoint(1).y);
});
test('every sequential move connects neighboring cells, including turns', () => {
    for (let i = 1; i < 100; i++) {
        const a = boardPoint(i), b = boardPoint(i + 1);
        assert.ok((Math.abs(a.x-b.x) === 90 && a.y === b.y) || (a.x === b.x && Math.abs(a.y-b.y) === 82));
    }
});
test('illustrated snake and ladder endpoints use valid gameplay mappings', () => {
    assert.equal(Object.keys(BOARD_LADDERS).length, 8);
    assert.equal(Object.keys(BOARD_SNAKES).length, 8);
    for (const [from, to] of Object.entries(BOARD_LADDERS)) { assert.ok(to > Number(from) && to < 100); assert.ok(boardPoint(to).y < boardPoint(Number(from)).y); }
    for (const [from, to] of Object.entries(BOARD_SNAKES)) { assert.ok(to < Number(from) && to >= 1); assert.ok(boardPoint(to).y > boardPoint(Number(from)).y); }
});
test('favicon is a real ICO container and Apple icon is 180px', () => {
    const ico = fs.readFileSync(new URL('../../public/favicon.ico', import.meta.url));
    assert.equal(ico.readUInt16LE(0), 0); assert.equal(ico.readUInt16LE(2), 1); assert.equal(ico.readUInt16LE(4), 1);
    assert.equal(ico.readUInt32LE(18), 22); assert.equal(ico.readUInt32LE(14), ico.length - 22);
    const png = fs.readFileSync(new URL('../../public/apple-touch-icon.png', import.meta.url));
    assert.equal(png.readUInt32BE(16), 180); assert.equal(png.readUInt32BE(20), 180);
});
