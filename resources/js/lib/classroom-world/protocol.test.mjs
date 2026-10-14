import assert from 'node:assert/strict';
import test from 'node:test';
import {
    boothAt,
    CHAT_MAX_RUNES,
    clampChat,
    NEAR_RADIUS,
    nearestWithin,
    parseInbox,
    parseRoster,
    parseSay,
    parseState,
    PLAYER_RADIUS,
    predictStep,
    roomEntry,
    SAY_RADIUS,
    sayPartner,
    teacherSeat,
    viewRange,
    wallWindows,
} from './protocol.ts';

const geometry = {
    room: { w: 24, d: 16 },
    desks: [{ x: 3.5, z: 1, w: 1.4, d: 0.9 }],
    teacher_desk: { x: 0, z: -6, w: 4, d: 1.2 },
    booths: [{ i: 0, game: 'ping-pong', x: -10.5, z: -5, r: 1.3 }],
};

test('parseState drops malformed rows', () => {
    const rows = parseState({
        p: [
            [1, 2, 3, 0.5, ''],
            [2, 'x', 3, 0, ''],
            'bad',
            [3, 1, Number.NaN, 0, ''],
            [4, 1, 1, 0, 'ping-pong'],
        ],
    });
    assert.deepEqual(
        rows.map((r) => r[0]),
        [1, 4],
    );
    assert.deepEqual(parseState({ p: 'nope' }), []);
});

test('predictStep clamps to the room and never enters a desk', () => {
    const out = predictStep(geometry, { x: 11.5, z: 0 }, { x: 1, z: 0 }, 1);
    assert.equal(out.x, 12 - PLAYER_RADIUS);
    let pos = { x: 1.5, z: 1 };
    for (let i = 0; i < 60; i++) {
        pos = predictStep(geometry, pos, { x: 1, z: 0 }, 1 / 30);
    }
    const desk = geometry.desks[0];
    const cx = Math.max(
        desk.x - desk.w / 2,
        Math.min(pos.x, desk.x + desk.w / 2),
    );
    const cz = Math.max(
        desk.z - desk.d / 2,
        Math.min(pos.z, desk.z + desk.d / 2),
    );
    assert.ok(Math.hypot(pos.x - cx, pos.z - cz) >= PLAYER_RADIUS - 1e-9);
});

test('predictStep normalises long input vectors', () => {
    const out = predictStep(geometry, { x: 0, z: 2 }, { x: 10, z: 0 }, 0.1);
    assert.ok(Math.abs(out.x - 0.35) < 1e-9);
});

test('boothAt finds the booth radius', () => {
    assert.equal(boothAt(geometry.booths, -10.5, -5), 0);
    assert.equal(boothAt(geometry.booths, -10.5, -3.5), -1);
});

test('clampChat keeps the rune limit and collapses whitespace', () => {
    const long = '😀'.repeat(200);
    assert.equal(Array.from(clampChat(long)).length, CHAT_MAX_RUNES);
    assert.equal(clampChat('a \n\t b'), 'a b');
});

test('predictStep uses the per-room bounds of a big classroom', () => {
    const big = { ...geometry, room: { w: 30, d: 58 }, desks: [] };
    let pos = { x: 0, z: 0 };
    for (let i = 0; i < 400; i++) {
        pos = predictStep(big, pos, { x: 0, z: 1 }, 0.1);
    }
    assert.equal(pos.z, 29 - PLAYER_RADIUS);
    const side = predictStep(big, { x: 14.5, z: 0 }, { x: 1, z: 0 }, 1);
    assert.equal(side.x, 15 - PLAYER_RADIUS);
});

test('roomEntry prefers the server entry and falls back to back right', () => {
    assert.deepEqual(roomEntry({ ...geometry, entry: { x: 12, z: 27 } }), {
        x: 12,
        z: 27,
    });
    assert.deepEqual(roomEntry(geometry), { x: 9, z: 6 });
});

test('wallWindows scale with wall length and skip the door', () => {
    assert.equal(wallWindows(16).length, 3);
    assert.ok(wallWindows(58).length > wallWindows(16).length);
    for (const z of wallWindows(58)) {
        assert.ok(Math.abs(z) <= 29 - 2.5);
    }
    const withDoor = wallWindows(16, 4, 2.5, 4);
    assert.ok(withDoor.every((z) => Math.abs(z - 4) >= 1.8));
    assert.deepEqual(wallWindows(3), []);
});

test('viewRange grows with the room but keeps the classic minimum', () => {
    assert.deepEqual(viewRange({ w: 24, d: 16 }), {
        cameraMax: 16,
        fogNear: 24,
        fogFar: 48,
        far: 100,
    });
    const big = viewRange({ w: 30, d: 58 });
    assert.ok(big.cameraMax > 16 && big.fogFar > 58 && big.far >= big.fogFar);
});

test('parseRoster keeps valid players and normalises the teacher flag', () => {
    const players = parseRoster({
        players: [
            { id: 1, name: 'Ani', character: null },
            {
                id: 2,
                name: 'Bu Sari',
                character: { gender: 'girl' },
                teacher: true,
            },
            { id: 'x', name: 'bad' },
            null,
            { id: 3, name: 7 },
            { id: 4, name: 'Budi', character: 'nope', teacher: 'yes' },
        ],
    });
    assert.deepEqual(
        players.map((p) => [p.id, p.teacher, p.character === null]),
        [
            [1, false, true],
            [2, true, false],
            [4, false, true],
        ],
    );
    assert.deepEqual(parseRoster({ players: 'nope' }), []);
});

test('parseSay validates frames and fills defaults', () => {
    assert.deepEqual(
        parseSay({ t: 'say', id: 2, to: 5, name: 'Ani', text: 'hai', at: 9 }),
        { t: 'say', id: 2, to: 5, name: 'Ani', text: 'hai', at: 9 },
    );
    const noName = parseSay({ t: 'say', id: 2, to: 5, text: 'hai' });
    assert.equal(noName?.name, '');
    assert.ok(Number.isFinite(noName?.at));
    assert.equal(parseSay({ t: 'say', id: 2, text: 'hai' }), null);
    assert.equal(parseSay({ t: 'say', id: 2, to: 5, text: '' }), null);
    assert.equal(parseSay({ t: 'chat', id: 2, to: 5, text: 'x' }), null);
    assert.equal(parseSay({ t: 'say', id: 2, to: 5, text: { a: 1 } }), null);
});

test('sayPartner is the other side of the conversation', () => {
    const msg = { t: 'say', id: 2, to: 5, name: '', text: 'x', at: 0 };
    assert.equal(sayPartner(msg, 2), 5);
    assert.equal(sayPartner(msg, 5), 2);
});

test('teacherSeat reads welcome.teacher and tolerates old servers', () => {
    assert.deepEqual(teacherSeat({ teacher: { id: 9, x: 0, z: -7.4 } }), {
        id: 9,
        x: 0,
        z: -7.4,
    });
    assert.deepEqual(teacherSeat({ teacher: { id: 0, x: 1, z: 2 } }, 7), {
        id: 7,
        x: 1,
        z: 2,
    });
    assert.equal(teacherSeat({ teacher: { id: 0, x: 1, z: 2 } }), null);
    assert.equal(teacherSeat({}, 7), null);
    assert.equal(teacherSeat({ teacher: { id: 3, x: 'a', z: 2 } }), null);
});

test('nearestWithin picks the closest candidate inside the radius', () => {
    const me = { x: 0, z: 0 };
    const list = [
        { id: 1, x: 2.4, z: 0 },
        { id: 2, x: 0, z: 1 },
        { id: 3, x: 5, z: 5 },
    ];
    assert.equal(nearestWithin(me, list, NEAR_RADIUS)?.id, 2);
    assert.equal(nearestWithin(me, [list[2]], NEAR_RADIUS), null);
    assert.equal(nearestWithin(me, [], NEAR_RADIUS), null);
    assert.ok(NEAR_RADIUS < SAY_RADIUS);
});

test('parseInbox keeps valid unread senders only', () => {
    const rows = parseInbox({
        total: 3,
        senders: [
            {
                user_id: 4,
                name: 'Rina',
                teacher: false,
                unread: 2,
                last_at: '2026-10-14T01:00:00Z',
                messages: [
                    { id: 1, text: 'Halo', at: null },
                    { id: 'x', text: 'bad' },
                    { id: 2, text: '<b>hi</b>' },
                ],
            },
            { user_id: 5, name: 'Nol', unread: 0, messages: [] },
            { user_id: 'x', name: 'Bad', unread: 1 },
            null,
            { user_id: 9, name: 'Guru', teacher: true, unread: 1.7 },
        ],
    });
    assert.equal(rows.length, 2);
    assert.deepEqual(
        rows[0].messages.map((m) => m.text),
        ['Halo', '<b>hi</b>'],
    );
    assert.equal(rows[1].teacher, true);
    assert.equal(rows[1].unread, 1);
    assert.deepEqual(rows[1].messages, []);
    assert.deepEqual(parseInbox(null), []);
    assert.deepEqual(parseInbox({ senders: 'x' }), []);
});
