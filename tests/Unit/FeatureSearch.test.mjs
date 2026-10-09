import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import ts from 'typescript';

const source = fs.readFileSync(new URL('../../resources/js/lib/feature-search.ts', import.meta.url), 'utf8');
const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ES2022 } }).outputText;
const { searchFeatures } = await import(`data:text/javascript;base64,${Buffer.from(compiled).toString('base64')}`);
const entries = [
    { href: '/admin/users', title: 'Pengguna', group: 'Administrasi', keywords: 'Users' },
    { href: '/admin/questions', title: 'Bank soal', group: 'Administrasi', keywords: 'Question Bank', superadminOnly: true },
    { href: '/teacher/questions', title: 'Soal guru', group: 'Guru', keywords: 'Teacher', teacherOnly: true },
    { href: '/games/monster-cafe', title: 'Monster Café', group: 'Permainan', keywords: 'game' },
];
const access = { superadmin: true, teacher: true };
test('finds translated and English feature names ignoring case and spacing', () => {
    for (const query of ['pengguna', ' USERS ', 'users administrasi']) {
        assert.equal(searchFeatures(entries, query, access)[0].href, '/admin/users');
    }
    assert.equal(searchFeatures(entries, 'monster cafe', access)[0].href, '/games/monster-cafe');
});
test('filters protected features before matching', () => {
    assert.equal(searchFeatures(entries, 'soal', { superadmin: false, teacher: false }).length, 0);
    assert.equal(searchFeatures(entries, 'soal', { superadmin: true, teacher: false }).length, 1);
    assert.equal(searchFeatures(entries, 'soal', { superadmin: false, teacher: true }).length, 1);
});
test('empty query lists accessible destinations without duplicates', () => {
    assert.equal(searchFeatures([...entries, entries[0]], '  ', access).length, entries.length);
});
test('unknown query returns no results', () => {
    assert.deepEqual(searchFeatures(entries, 'nonexistent', access), []);
});
