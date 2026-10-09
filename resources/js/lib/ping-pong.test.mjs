import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import {
    answerKey,
    answerMessage,
    canSubmitAnswer,
    isValidOption,
} from './ping-pong.ts';

const state = {
    pin: '482913',
    round: 4,
    seq: 20,
    phase: 'playing',
    turn: 0,
    remaining_ms: 9000,
    players: [
        { seat: 0, controlled: true, bot: false },
        { seat: 1, controlled: false, bot: true },
    ],
};
test('controlled human can answer live turn', () =>
    assert.equal(canSubmitAnswer(state, true, null), true));
test('pending answer stays locked across sequence ticks', () =>
    assert.equal(
        canSubmitAnswer({ ...state, seq: 21 }, true, answerKey(state)),
        false,
    ));
test('new round releases answer lock', () =>
    assert.equal(
        canSubmitAnswer({ ...state, round: 5 }, true, answerKey(state)),
        true,
    ));
test('offline, expired, done and opponent turns reject input', () => {
    assert.equal(canSubmitAnswer(state, false, null), false);
    for (const update of [{ remaining_ms: 0 }, { phase: 'done' }, { turn: 1 }])
        assert.equal(
            canSubmitAnswer({ ...state, ...update }, true, null),
            false,
        );
});
test('bot remains non-interactive even if malformed controlled flag arrives', () =>
    assert.equal(
        canSubmitAnswer(
            { ...state, players: [{ seat: 0, controlled: true, bot: true }] },
            true,
            null,
        ),
        false,
    ));
test('answer message sends the displayed option index, never a layer', () => {
    assert.deepEqual(answerMessage(state, 2), {
        t: 'answer',
        round: 4,
        option: 2,
    });
    assert.equal('layer' in answerMessage(state, 0), false);
});
test('option index must point at a displayed option', () => {
    const live = { question: { options: ['A', 'B', 'C'] } };
    assert.equal(isValidOption(live, 0), true);
    assert.equal(isValidOption(live, 2), true);
    for (const bad of [-1, 3, 1.5, Number.NaN])
        assert.equal(isValidOption(live, bad), false);
    assert.equal(isValidOption({ question: null }, 0), false);
});
test('page uses the shared subject picker and option pads', () => {
    const page = readFileSync(
        new URL('../pages/games/ping-pong.tsx', import.meta.url),
        'utf8',
    );
    const court = readFileSync(
        new URL('../components/ping-pong/court.tsx', import.meta.url),
        'utf8',
    );
    assert.match(page, /<SubjectPicker/);
    assert.match(page, /send\(\{ t: 'subject', subject \}\)/);
    assert.match(page, /<SubjectFallbackNote/);
    assert.match(page, /<OptionPads/);
    assert.doesNotMatch(page + court, /LayerPads|pp-layer-|\blayer\b/);
    assert.match(court, /data-testid=\{`pp-option-\$\{index\}`\}/);
});
const catalog = (locale) =>
    JSON.parse(
        readFileSync(
            new URL(`../locales/${locale}-player.json`, import.meta.url),
        ),
    );
function keys(object, prefix = '') {
    return Object.entries(object)
        .flatMap(([key, value]) =>
            typeof value === 'object'
                ? keys(value, `${prefix}${key}.`)
                : [`${prefix}${key}`],
        )
        .sort();
}
test('Ping Pong locale keys match and required room errors exist', () => {
    assert.deepEqual(
        keys(catalog('id').pingPong),
        keys(catalog('en').pingPong),
    );
    for (const lang of ['id', 'en']) {
        for (const code of [
            'invalid_option',
            'stale_question',
            'not_your_turn',
        ])
            assert.ok(catalog(lang).room.errors[code]);
        assert.equal(catalog(lang).room.errors.invalid_layer, undefined);
        assert.equal(catalog(lang).pingPong.layers, undefined);
        assert.doesNotMatch(
            JSON.stringify(catalog(lang).pingPong),
            /OSI|Layer \d/,
        );
        assert.equal(catalog(lang).player.pingPong, 'Ping Pong');
        assert.equal(catalog(lang).pingPong.title, 'Ping Pong');
        assert.ok(Array.isArray(catalog(lang).pingPong.howTo.demoOptions));
        assert.deepEqual(Object.keys(catalog(lang).pingPong.howTo.scenes), [
            'subject',
            'read',
            'return',
            'goal',
            'rally',
            'win',
        ]);
        assert.ok(catalog(lang).player.pingPong);
        assert.ok(catalog(lang).portal.games.pingPong);
    }
});
test('real tutorial media has MP4/PDF signatures and six slide pages', () => {
    const video = readFileSync(
        new URL(
            '../../../public/tutorials/cara-bermain-ping-pong.mp4',
            import.meta.url,
        ),
    );
    const pdf = readFileSync(
        new URL(
            '../../../public/tutorials/cara-bermain-ping-pong.pdf',
            import.meta.url,
        ),
    );
    assert.equal(video.subarray(4, 8).toString(), 'ftyp');
    assert.equal(pdf.subarray(0, 4).toString(), '%PDF');
    assert.equal(
        (pdf.toString('latin1').match(/\/Type \/Page /g) ?? []).length,
        6,
    );
});

test('play again restarts the same room for the host instead of leaving', () => {
    const page = readFileSync(
        new URL('../pages/games/ping-pong.tsx', import.meta.url),
        'utf8',
    );
    assert.match(
        page,
        /const playAgain = \(\) => \{\s*send\(\{ t: 'start' \}\);/,
    );
    assert.match(page, /onPlayAgain=\{isHost \? playAgain : undefined\}/);
    assert.doesNotMatch(page, /onPlayAgain=\{leave\}/);
    assert.match(page, /data-testid="pp-wait-host"/);
});

test('game header uses the compact game nav like every other game', () => {
    const page = readFileSync(
        new URL('../pages/games/ping-pong.tsx', import.meta.url),
        'utf8',
    );
    assert.match(page, /<SiteNav compact \/>/);
    assert.doesNotMatch(page, /<SiteNav \/>/);
    assert.match(page, /edu-game-brand/);
    assert.match(page, /<DigitalClock className="edu-clock--game" \/>/);
});
