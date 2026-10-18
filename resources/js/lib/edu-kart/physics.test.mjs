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

const root = new URL(
    '../../../../services/game/internal/edukart/',
    import.meta.url,
);
const golden = JSON.parse(
    readFileSync(new URL('testdata/physics_golden.json', root), 'utf8'),
);

function goldenInput(i) {
    return {
        seq: i,
        steer: Math.round(Math.sin(i / 23) * 100) / 100,
        throttle: [1, 1, 1, 0, -1, 1][Math.floor(i / 90) % 6],
        drift: Math.floor(i / 120) % 3 === 1,
        hop: Math.floor(i / 120),
        turbo: Math.floor(i / 45),
        fire: 0,
    };
}

for (const id of ['forest', 'beach', 'mandalika']) {
    test(`physics matches the Go referee on ${id}`, () => {
        const track = new Track(
            JSON.parse(
                readFileSync(new URL(`tracks/${id}.json`, root), 'utf8'),
            ),
        );
        const veh = vehicleById('drifter');
        const k = newKart();
        let frame = 0;
        for (let i = 0; i < 900; i++) {
            step(k, goldenInput(i), veh, track, DT);
            if (i % 15 === 14) {
                const want = golden[id][frame++].kart;
                for (const key of [
                    'p',
                    'd',
                    'psi',
                    'v',
                    'y',
                    'charge',
                    'boost',
                    'stun',
                ]) {
                    assert.ok(
                        Math.abs(k[key] - want[key]) < 1e-6,
                        `${id} frame ${frame} ${key}: ${k[key]} vs ${want[key]}`,
                    );
                }
                for (const key of ['drifting', 'stage', 'fx', 'hops']) {
                    assert.equal(
                        k[key],
                        want[key],
                        `${id} frame ${frame} ${key}`,
                    );
                }
            }
        }
    });
}

test('track world() closes the loop and lanes split the road', () => {
    const track = new Track(
        JSON.parse(readFileSync(new URL('tracks/forest.json', root), 'utf8')),
    );
    const a = track.world(0, 0);
    const b = track.world(track.length, 0);
    assert.ok(Math.hypot(a[0] - b[0], a[2] - b[2]) < 1e-9);
    const [lanes, w] = track.answerLanes(4);
    assert.equal(lanes.length, 4);
    assert.equal(track.laneAt(4, lanes[0]), 0);
    assert.equal(track.laneAt(4, lanes[3]), 3);
    assert.ok(w > 3);
    assert.equal(track.laneAt(2, -track.halfWidth - 2), -1);
});
