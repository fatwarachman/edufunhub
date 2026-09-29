import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import ts from 'typescript';
const source = fs.readFileSync(new URL('../../resources/js/lib/sky-quiz.ts', import.meta.url), 'utf8');
const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ES2022 } }).outputText;
const { SKY_QUESTIONS, shuffledQuestions, hitBox, answerOutcome } = await import(`data:text/javascript;base64,${Buffer.from(compiled).toString('base64')}`);

test('each grade has eight distinct mixed-subject questions with valid answers', () => {
    for (const grade of [1, 2, 3, 4]) {
        const bank = SKY_QUESTIONS.filter(q => q.grade === grade);
        assert.equal(bank.length, 8);
        assert.equal(new Set(bank.map(q => q.text)).size, 8);
        assert.ok(new Set(bank.map(q => q.subject)).size >= 4);
        for (const q of bank) { assert.equal(new Set(q.options).size, 3); assert.ok(q.answer >= 0 && q.answer < 3); }
    }
});
test('shuffle preserves correct answers and grade for repeated sessions', () => {
    for (let run = 0; run < 100; run++) for (const grade of [1, 2, 3, 4]) {
        const questions = shuffledQuestions(grade);
        assert.equal(questions.length, 8);
        for (const q of questions) {
            const original = SKY_QUESTIONS.find(item => item.text === q.text);
            assert.equal(q.grade, grade);
            assert.equal(q.options[q.answer], original.options[original.answer]);
        }
    }
});
test('correct collision rewards and resolves; wrong collision costs shield', () => {
    assert.deepEqual(answerOutcome(true, false), { points: 100, damage: 0, resolve: true });
    assert.deepEqual(answerOutcome(false, false), { points: 0, damage: 1, resolve: true });
});
test('shooting a wrong answer rewards without resolving; correct answer penalizes', () => {
    assert.deepEqual(answerOutcome(false, true), { points: 20, damage: 0, resolve: false });
    assert.deepEqual(answerOutcome(true, true), { points: 0, damage: 1, resolve: true });
});
test('hit boxes reject misses and detect center hits', () => {
    assert.equal(hitBox(100, 100, 100, 100, 210, 52), true);
    assert.equal(hitBox(206, 100, 100, 100, 210, 52), false);
    assert.equal(hitBox(100, 130, 100, 100, 210, 52), false);
});
