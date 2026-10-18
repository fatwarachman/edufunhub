import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { registerHooks } from 'node:module';
import test from 'node:test';

registerHooks({
    resolve(specifier, context, nextResolve) {
        try {
            return nextResolve(specifier, context);
        } catch (error) {
            if (specifier.startsWith('.') && !specifier.endsWith('.ts')) {
                return nextResolve(`${specifier}.ts`, context);
            }
            throw error;
        }
    },
});

const { Track } = await import('./track.ts');
const { DT, newKart, step, vehicleById } = await import('./physics.ts');
const { Interpolator, Predictor, pressDrift, toInput, emptyControls, kartOf } =
    await import('./netcode.ts');
const { isRaceFrame, isTrackMessage } = await import('./protocol.ts');

const root = new URL(
    '../../../../services/game/internal/edukart/',
    import.meta.url,
);
const track = new Track(
    JSON.parse(readFileSync(new URL('tracks/forest.json', root), 'utf8')),
);
const veh = vehicleById('classic');

function frameOf(kart, extra = {}) {
    return {
        ...kart,
        racer: 0,
        lap: 1,
        item: '',
        juiced: false,
        shield_ms: 0,
        tnt_ms: 0,
        finish_ms: 0,
        rank: 1,
        last_fire: 0,
        ...extra,
    };
}

test('prediction converges to the server state when fully acked', () => {
    const server = newKart();
    const p = new Predictor(track, veh);
    p.reconcile(frameOf(server), 0, false);
    const input = {
        seq: 1,
        steer: 0.2,
        throttle: 1,
        drift: false,
        hop: 0,
        turbo: 0,
        fire: 0,
    };
    for (let i = 0; i < 30; i++) {
        step(server, input, veh, track, DT);
    }
    // A small disagreement is folded in gradually (no visible pull)...
    p.reconcile(frameOf(server), 1, false);
    const firstGap = Math.abs(p.kart.p - server.p);
    assert.ok(firstGap > 0, 'not snapped in one frame');
    // ...and converges over a few server frames.
    for (let i = 0; i < 80; i++) {
        p.reconcile(frameOf(server), 1, false);
    }
    assert.ok(Math.abs(p.kart.p - server.p) < 1e-3, String(p.kart.p));
    assert.ok(Math.abs(p.kart.d - server.d) < 1e-3, String(p.kart.d));
});

test('own kart drawn motion stays smooth through soft corrections', () => {
    const p = new Predictor(track, veh);
    p.reconcile(frameOf(newKart()), 0, false);
    const input = {
        seq: 1,
        steer: 0,
        throttle: 1,
        drift: false,
        hop: 0,
        turbo: 0,
        fire: 0,
    };
    // Referee ahead of the client by a step or two at every frame.
    const server = newKart();
    let last = p.view().p;
    const speeds = [];
    for (let frame = 0; frame < 240; frame++) {
        p.advance(1 / 60, 1, input, false);
        if (frame % 3 === 0) {
            for (let k = 0; k < 3; k++) {
                step(server, input, veh, track, DT);
            }
            const ahead = { ...server };
            step(ahead, input, veh, track, DT);
            p.reconcile(frameOf(ahead), 1, false);
        }
        const now = p.view().p;
        if (frame > 60) {
            speeds.push((now - last) * 60 - p.view().v);
        }
        last = now;
    }
    const worst = Math.max(...speeds.map(Math.abs));
    assert.ok(worst < 3, `drawn speed off by ${worst.toFixed(2)} m/s`);
});

test('own kart keeps moving through hard corrections (bot bumps)', () => {
    // A bot rubbing the player pushes it sideways past the soft window every
    // few frames; the drawn kart (and through the camera every rival) must
    // keep its forward speed instead of losing a step on each correction.
    const p = new Predictor(track, veh);
    p.reconcile(frameOf(newKart()), 0, false);
    const input = {
        seq: 1,
        steer: 0,
        throttle: 1,
        drift: false,
        hop: 0,
        turbo: 0,
        fire: 0,
    };
    const server = newKart();
    let last = p.view().p;
    const errors = [];
    for (let frame = 0; frame < 300; frame++) {
        p.advance(1 / 60, 1, input, false);
        if (frame % 3 === 0) {
            for (let k = 0; k < 3; k++) {
                step(server, input, veh, track, DT);
            }
            if (frame % 12 === 0) {
                server.d += frame % 24 === 0 ? 1.4 : -1.4;
            }
            p.reconcile(frameOf({ ...server }), 1, false);
        }
        const now = p.view().p;
        if (frame > 90) {
            errors.push(Math.abs((now - last) * 60 - p.view().v));
        }
        last = now;
    }
    const worst = Math.max(...errors);
    assert.ok(worst < 3, `drawn speed off by ${worst.toFixed(2)} m/s`);
});

test('unacked inputs are replayed on top of the server state', () => {
    const p = new Predictor(track, veh);
    p.reconcile(frameOf(newKart()), 0, false);
    const input = {
        seq: 5,
        steer: 0,
        throttle: 1,
        drift: false,
        hop: 0,
        turbo: 0,
        fire: 0,
    };
    for (let i = 0; i < 60; i++) {
        p.advance(1 / 60, 5, input, false);
    }
    const predicted = p.kart.p;
    assert.ok(predicted > 1, 'kart moved');
    // Server has not applied seq 5 yet: still at start; replay must keep the lead.
    p.reconcile(frameOf(newKart()), 4, false);
    assert.ok(
        Math.abs(p.kart.p - predicted) < 0.5,
        `${p.kart.p} vs ${predicted}`,
    );
    // The visual offset hides the correction and fades out.
    p.advance(1, 5, input, false);
    assert.ok(Math.abs(p.offset.p) < 0.01);
});

test('big corrections snap instead of blending', () => {
    const p = new Predictor(track, veh);
    p.reconcile(frameOf(newKart()), 0, false);
    const far = newKart();
    far.p = 200;
    p.reconcile(frameOf(far), 0, false);
    assert.equal(p.offset.p, 0);
    assert.equal(p.view().p, 200);
});

test('countdown freezes prediction', () => {
    const p = new Predictor(track, veh);
    p.reconcile(frameOf(newKart()), 0, true);
    p.advance(
        1,
        1,
        {
            seq: 1,
            steer: 0,
            throttle: 1,
            drift: false,
            hop: 0,
            turbo: 0,
            fire: 0,
        },
        true,
    );
    assert.equal(p.kart.p, 0);
});

test('interpolator blends between frames', () => {
    const it = new Interpolator();
    const a = frameOf(newKart());
    const b = frameOf({ ...newKart(), p: 10 });
    it.push(
        {
            t: 'race',
            ms: 0,
            you: 0,
            ack: 0,
            racers: [a],
            projectiles: [],
            hazards: [],
            question: null,
            taken: [],
            events: [],
        },
        1000,
    );
    it.push(
        {
            t: 'race',
            ms: 50,
            you: 0,
            ack: 0,
            racers: [b],
            projectiles: [],
            hazards: [],
            question: null,
            taken: [],
            events: [],
        },
        1050,
    );
    const mid = it.sample(0, 1025 + 110);
    assert.ok(mid.p > 4 && mid.p < 6, String(mid.p));
    assert.equal(it.sample(7, 1100), null);
});

test('drift button: hop first, turbo while sliding; inputs stay clamped', () => {
    let c = emptyControls();
    c = pressDrift(c, false);
    assert.equal(c.hop, 1);
    c = pressDrift(c, true);
    assert.equal(c.turbo, 1);
    const input = toInput({ ...c, steer: 5, throttle: Number.NaN }, 3);
    assert.equal(input.steer, 1);
    assert.equal(input.throttle, 0);
    assert.equal(input.seq, 3);
});

test('kartOf ignores wrong field types', () => {
    const k = kartOf(frameOf(newKart(), { p: 'x', v: 4 }));
    assert.equal(k.p, 0);
    assert.equal(k.v, 4);
});

test('protocol guards', () => {
    assert.equal(
        isRaceFrame({ t: 'race', ms: 1, racers: [], events: [] }),
        true,
    );
    assert.equal(isRaceFrame({ t: 'race', ms: 1 }), false);
    assert.equal(
        isTrackMessage({ t: 'edukart_track', track: { id: 'x', samples: [] } }),
        false,
    );
});

function raceFrame(ms, racers) {
    return {
        t: 'race',
        ms,
        you: 9,
        ack: 0,
        racers,
        projectiles: [],
        hazards: [],
        question: null,
        taken: [],
        events: [],
    };
}

// Simulates a rival driving 20 m/s; frames every 50 ms arrive with jitter
// (bunched pairs, late packets, one dropped frame). The drawn motion at
// 60 fps must stay smooth: no freeze, no backwards step, no big surge.
test('rivals stay smooth under network jitter and loss', () => {
    const it = new Interpolator();
    let seed = 7;
    const rand = () =>
        (seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648;
    const arrivals = [];
    for (let i = 0; i < 120; i++) {
        if (i === 60) {
            continue; // lost packet
        }
        const ms = i * 50;
        const late = i % 7 === 3 ? 90 : rand() * 45; // spikes + jitter
        arrivals.push({ at: 1000 + ms + late, ms, p: ms * 0.02 });
    }
    arrivals.sort((a, b) => a.at - b.at);
    let next = 0;
    const speeds = [];
    let prev = null;
    for (let now = 1300; now < 1000 + 5800; now += 1000 / 60) {
        while (next < arrivals.length && arrivals[next].at <= now) {
            const a = arrivals[next++];
            it.push(
                raceFrame(a.ms, [
                    frameOf({ ...newKart(), p: a.p, v: 20 }, { racer: 2 }),
                ]),
                a.at,
            );
        }
        const s = it.sample(2, now);
        if (prev !== null) {
            speeds.push((s.p - prev) / (1 / 60));
        }
        prev = s.p;
    }
    const settled = speeds.slice(60);
    const min = Math.min(...settled);
    const max = Math.max(...settled);
    assert.ok(min > 12, `freeze/backwards: min speed ${min.toFixed(1)}`);
    assert.ok(max < 28, `surge: max speed ${max.toFixed(1)}`);
});

test('interpolator ignores stale frames and snaps on respawn jumps', () => {
    const it = new Interpolator();
    const r = (p) => [frameOf({ ...newKart(), p }, { racer: 1 })];
    it.push(raceFrame(0, r(0)), 1000);
    it.push(raceFrame(50, r(1)), 1050);
    it.push(raceFrame(25, r(99)), 1060); // out of order: ignored
    it.push(raceFrame(100, r(60)), 1100); // respawn jump
    const s = it.sample(1, 1075 + it.playbackDelay);
    assert.ok(s.p === 60 || s.p <= 1, String(s.p));
});
