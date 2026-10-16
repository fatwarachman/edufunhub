import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import ts from 'typescript';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

const require = createRequire(import.meta.url);
const source = readFileSync(new URL('../../resources/js/components/admin/assistant-answer.tsx', import.meta.url), 'utf8');
const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX } }).outputText;
const exports = {};
new Function('require', 'exports', compiled)((name) => name === '@inertiajs/react' ? { Link: (props) => React.createElement('a', props) } : require(name), exports);
const render = (content, props = {}) => renderToStaticMarkup(React.createElement(exports.AssistantAnswer, { content, ...props }));

test('renders emphasis headings lists and clickable admin links instead of raw markup', () => {
    const html = render('## Ringkasan\n**Poin penting**\n- Satu\n- Dua\n[Buka pemain](/admin/users)\n/admin/games');
    assert.match(html, /<strong[^>]*>Poin penting<\/strong>/);
    assert.match(html, /<h3/);
    assert.match(html, /<ul/);
    assert.match(html, /href="\/admin\/users"/);
    assert.match(html, /href="\/admin\/games"/);
    assert.ok(!html.includes('**'));
});

test('renders screenshot regression: italic inside bold numbered heading', () => {
    const html = render('1. **Skor Permainan (*Game Score*)**:\n- Asal: `Go` gameplay service.');
    assert.match(html, /<strong[^>]*>Skor Permainan \(<em>Game Score<\/em>\)<\/strong>/);
    assert.ok(!html.includes('**'));
    assert.ok(!html.includes('*Game Score*'));
});

test('chat uses distinct left and right bubbles', () => {
    const page = readFileSync(new URL('../../resources/js/pages/admin/ai-assistant/index.tsx', import.meta.url), 'utf8');
    for (const value of ['data-message-role', "'justify-end'", 'rounded-bl-md', 'rounded-br-md', 'bg-primary text-primary-foreground']) assert.ok(page.includes(value));
});

test('never executes HTML or dangerous link schemes', () => {
    for (const url of ['javascript:alert(1)', '//evil.test', '/admin/\\evil', 'https://user:pass@example.com']) assert.equal(exports.safeAssistantLink(url), null);
    const html = render('<script>alert(1)</script>\n[unsafe](javascript:alert)');
    assert.ok(!html.includes('<script>'));
    assert.ok(!html.includes('href="javascript:'));
});

test('teacher answers turn app paths into page buttons with friendly labels', () => {
    const answer = 'Langkah membuat soal bergambar:\n\n1. Buka /teacher/questions/create.\n2. Kelola soal tersimpan di /teacher/questions. Input massal pakai template Excel di `/teacher/questions/import`.\n3. Lihat [kelasmu](/teacher/classrooms).';
    const labels = { '/teacher/questions/create': 'Buat soal', '/teacher/questions': 'Bank soal' };
    const html = render(answer, { linkPrefixes: ['/teacher', '/my-classrooms'], linkLabel: (path) => labels[path] });
    assert.match(html, /href="\/teacher\/questions\/create"[^>]*>.*Buat soal/);
    assert.match(html, /href="\/teacher\/questions"[^>]*>.*Bank soal/);
    assert.match(html, /href="\/teacher\/questions\/import"/);
    assert.match(html, /href="\/teacher\/classrooms"[^>]*>.*kelasmu/);
    assert.equal((html.match(/data-testid="assistant-page-link"/g) ?? []).length, 4);
    assert.ok(!html.includes('href="/teacher/questions/create."'), 'sentence period stays outside the link');
    assert.ok(html.includes('</a>.'));
    assert.ok(!html.includes('<code'));
});

test('teacher answers never link outside the allowed prefixes', () => {
    const html = render('Buka /admin/users atau /teacher/../admin', { linkPrefixes: ['/teacher'] });
    assert.ok(!html.includes('href="/admin/users"'));
    assert.ok(!html.includes('href="/teacher/../admin"'));
    assert.equal(exports.safeAssistantLink('/teacher/../admin', ['/teacher']), null);
    assert.equal(exports.safeAssistantLink('/teacher/./x', ['/teacher']), null);
    assert.equal(exports.safeAssistantLink('/admin/users', ['/teacher']), null);
    assert.equal(exports.safeAssistantLink('/teacher/questions', ['/teacher']), '/teacher/questions');
});
