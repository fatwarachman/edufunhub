import assert from 'node:assert/strict';
import test from 'node:test';
import {
    answerKey,
    answerMessage,
    canAnswer,
    isValidOption,
    leadingTeam,
    ropeShift,
    teamCheck,
    teamSizes,
} from './tug-of-war.ts';

const state = {
    pin: '482913',
    round: 4,
    phase: 'playing',
    stage: 'question',
    you: 0,
    remaining_ms: 9000,
    your_choice: null,
    question: { options: ['a', 'b', 'c', 'd'] },
    players: [
        { seat: 0, team: 0, left: false },
        { seat: 1, team: 1, left: false },
    ],
};

test('answers only during a live question on a team', () => {
    assert.equal(canAnswer(state, true, null), true);
    assert.equal(canAnswer(state, false, null), false);
    assert.equal(canAnswer({ ...state, stage: 'reveal' }, true, null), false);
    assert.equal(
        canAnswer({ ...state, stage: 'countdown' }, true, null),
        false,
    );
    assert.equal(canAnswer({ ...state, your_choice: 1 }, true, null), false);
    assert.equal(canAnswer({ ...state, remaining_ms: 0 }, true, null), false);
    assert.equal(canAnswer(state, true, answerKey(state)), false);
    assert.equal(canAnswer({ ...state, you: -1 }, true, null), false);
    const watching = {
        ...state,
        players: [{ seat: 0, team: 2, left: false }, ...state.players.slice(1)],
    };
    assert.equal(canAnswer(watching, true, null), false);
});

test('validates displayed options and builds the intent', () => {
    assert.equal(isValidOption(state, 0), true);
    assert.equal(isValidOption(state, 3), true);
    assert.equal(isValidOption(state, 4), false);
    assert.equal(isValidOption(state, -1), false);
    assert.equal(isValidOption(state, 1.5), false);
    assert.equal(isValidOption({ question: null }, 0), false);
    assert.deepEqual(answerMessage(state, 2), {
        t: 'answer',
        round: 4,
        option: 2,
    });
});

test('mirrors the Go team start rules', () => {
    const seat = (seat, team, extra = {}) => ({
        seat,
        team,
        left: false,
        ...extra,
    });
    assert.deepEqual(teamCheck([]), { kind: 'empty' });
    assert.deepEqual(teamCheck([seat(0, 0)]), { kind: 'solo' });
    assert.deepEqual(teamCheck([seat(0, 2), seat(1, 0)]), { kind: 'solo' });
    assert.deepEqual(teamCheck([seat(0, 0), seat(1, 1), seat(2, 0)]), {
        kind: 'odd',
        count: 3,
    });
    assert.deepEqual(
        teamCheck([seat(0, 0), seat(1, 0), seat(2, 0), seat(3, 1)]),
        { kind: 'unbalanced', red: 3, blue: 1 },
    );
    assert.deepEqual(
        teamCheck([
            seat(0, 2),
            seat(1, 0),
            seat(2, 1),
            seat(3, 1, { left: true }),
        ]),
        { kind: 'ready', red: 1, blue: 1 },
    );
    assert.deepEqual(teamCheck([seat(0, 0), seat(1, 1, { bot: true })]), {
        kind: 'solo',
    });
    assert.deepEqual(
        teamSizes([seat(0, 0), seat(1, 1, { bot: true })]),
        [1, 1],
    );
});

test('maps the rope to a bounded shift and a leader', () => {
    assert.equal(ropeShift(0, 5), 0);
    assert.equal(ropeShift(-5, 5), -100);
    assert.equal(ropeShift(9, 5), 100);
    assert.equal(ropeShift(2, 5), 40);
    assert.equal(ropeShift(3, 0), 0);
    assert.equal(leadingTeam(-1), 0);
    assert.equal(leadingTeam(2), 1);
    assert.equal(leadingTeam(0), -1);
});
