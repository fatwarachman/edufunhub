import { type CharacterPose } from '@/lib/character/draw-character';

/**
 * Idle animation for portal / shop / leaderboard avatars.
 *
 * The avatar always breathes and sways (sum of sines with unrelated periods,
 * so the motion never lines up into an obvious loop) and blinks at random
 * intervals. On top of that it performs one "move" at a time — wave, hop,
 * look around, dance, stretch… — picked at random (never the same move twice
 * in a row) with a random duration and a random rest in between. Every move
 * fades in and out of the rest pose, so moves blend instead of snapping.
 */

interface Move {
    key: string;
    weight: number;
    /** Duration range in ms. */
    duration: [number, number];
    /** Pose offsets at progress t (0..1); `env` is the fade in/out envelope. */
    pose: (t: number, env: number, holds: Holds) => Partial<CharacterPose>;
}

/** Which hands hold items: their arms move less so items stay in hand. */
export interface Holds {
    front: boolean;
    back: boolean;
}

const TAU = Math.PI * 2;
/** Highest front-arm raise (radians) that keeps the hand off the face. */
const FRONT_ARM_LIMIT = -2.1;

const MOVES: Move[] = [
    {
        key: 'wave',
        weight: 3,
        duration: [1400, 2200],
        pose: (t, env, holds) => ({
            armFront: holds.front
                ? -0.3 - env * 0.5
                : -0.3 - env * (1.75 + Math.sin(t * TAU * 3) * 0.3),
            headTilt: env * 0.08,
        }),
    },
    {
        key: 'hop',
        weight: 3,
        duration: [700, 1100],
        pose: (t) => {
            const jump = Math.max(0, Math.sin(t * Math.PI * 2));
            const land = t > 0.5 ? Math.sin((t - 0.5) * TAU) : 0;
            return {
                bob: jump * 7,
                squash: -jump * 0.08 + Math.max(0, land) * 0.07,
                armBack: 0.3 + jump * 0.6,
                armFront: -0.3 - jump * 0.6,
            };
        },
    },
    {
        key: 'double-hop',
        weight: 1.5,
        duration: [1200, 1500],
        pose: (t) => {
            const jump = Math.max(0, Math.sin(t * Math.PI * 4));
            return {
                bob: jump * 5,
                squash: -jump * 0.06,
                armBack: 0.3 + jump * 0.5,
                armFront: -0.3 - jump * 0.5,
            };
        },
    },
    {
        key: 'look-around',
        weight: 3,
        duration: [1800, 2800],
        pose: (t, env) => ({
            headTilt: env * Math.sin(t * TAU) * 0.18,
            lean: env * Math.sin(t * TAU) * 0.03,
        }),
    },
    {
        key: 'nod',
        weight: 2,
        duration: [900, 1300],
        pose: (t, env) => ({
            headTilt: env * Math.max(0, Math.sin(t * TAU * 2)) * 0.12,
        }),
    },
    {
        key: 'dance',
        weight: 2,
        duration: [2000, 3200],
        pose: (t, env, holds) => {
            const beat = Math.sin(t * TAU * 4);
            return {
                lean: env * beat * 0.07,
                bob: env * Math.abs(beat) * 2.5,
                phase: env * beat * 0.6,
                armBack:
                    0.3 + env * (holds.back ? 0.2 : 0.9) * Math.max(0, beat),
                armFront:
                    -0.3 - env * (holds.front ? 0.2 : 0.9) * Math.max(0, -beat),
                headTilt: env * -beat * 0.06,
            };
        },
    },
    {
        key: 'stretch',
        weight: 1.5,
        duration: [1600, 2200],
        pose: (_t, env, holds) => ({
            armBack: 0.3 + env * (holds.back ? 0.4 : 2.6),
            armFront: -0.3 - env * (holds.front ? 0.4 : 2.6),
            squash: -env * 0.05,
            bob: env * 1.5,
            blink: env > 0.6,
        }),
    },
    {
        key: 'cheer',
        weight: 2,
        duration: [1100, 1500],
        pose: (t, env, holds) => {
            const pump = Math.abs(Math.sin(t * TAU * 2));
            return {
                armBack: 0.3 + env * (holds.back ? 0.5 : 2.4 + pump * 0.3),
                armFront: -0.3 - env * (holds.front ? 0.5 : 2.4 + pump * 0.3),
                bob: env * pump * 4,
                squash: -env * pump * 0.04,
            };
        },
    },
    {
        key: 'march',
        weight: 2,
        duration: [1600, 2400],
        pose: (t, env) => {
            const step = Math.sin(t * TAU * 3);
            return {
                phase: env * step,
                bob: env * Math.abs(step) * 2,
            };
        },
    },
    {
        key: 'turn',
        weight: 1.5,
        duration: [1400, 2000],
        pose: (t) => ({
            flip: t > 0.3 && t < 0.75 ? -1 : 1,
            bob: Math.abs(Math.sin(t * TAU * 2)) * 1.5,
        }),
    },
    {
        key: 'shrug',
        weight: 1.5,
        duration: [1000, 1400],
        pose: (_t, env, holds) => ({
            armBack: 0.3 + env * (holds.back ? 0.3 : 1.1),
            armFront: -0.3 - env * (holds.front ? 0.3 : 1.1),
            headTilt: env * 0.1,
            squash: env * 0.03,
        }),
    },
    {
        key: 'spin-hop',
        weight: 1,
        duration: [1000, 1300],
        pose: (t) => {
            const jump = Math.max(0, Math.sin(t * Math.PI));
            return {
                bob: jump * 8,
                flip: t > 0.25 && t < 0.5 ? -1 : 1,
                facingBack: t > 0.5 && t < 0.72,
                squash: -jump * 0.06,
            };
        },
    },
];

const TOTAL_WEIGHT = MOVES.reduce((sum, move) => sum + move.weight, 0);

/** Small seeded PRNG (mulberry32) so each avatar gets its own sequence. */
function random(seed: number): () => number {
    let state = seed >>> 0;
    return () => {
        state = (state + 0x6d2b79f5) >>> 0;
        let value = state;
        value = Math.imul(value ^ (value >>> 15), value | 1);
        value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
        return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
    };
}

const between = (rand: () => number, [min, max]: [number, number]) =>
    min + rand() * (max - min);

/** Smooth fade in/out over the first and last 22% of a move. */
function envelope(t: number): number {
    const edge = 0.22;
    const x = t < edge ? t / edge : t > 1 - edge ? (1 - t) / edge : 1;
    return x * x * (3 - 2 * x);
}

export interface IdleAnimator {
    pose: (now: number) => CharacterPose;
}

export function createIdleAnimator(seed: number, holds: Holds): IdleAnimator {
    const rand = random(seed);
    const offset = rand() * 10_000;
    let move: Move | null = null;
    let recent: string[] = [];
    let moveStart = 0;
    let moveEnd = 0;
    let restUntil = -1;
    let nextBlink = -1;
    let blinkUntil = 0;

    const pick = (): Move => {
        for (let attempt = 0; attempt < 8; attempt++) {
            let roll = rand() * TOTAL_WEIGHT;
            const candidate =
                MOVES.find((entry) => (roll -= entry.weight) <= 0) ?? MOVES[0];
            if (!recent.includes(candidate.key)) {
                return candidate;
            }
        }
        return MOVES.find((entry) => !recent.includes(entry.key)) ?? MOVES[0];
    };

    return {
        pose(now) {
            const time = now + offset;
            if (restUntil < 0) {
                restUntil = now + between(rand, [300, 2500]);
                nextBlink = now + between(rand, [800, 3500]);
            }

            if (move && now >= moveEnd) {
                move = null;
                restUntil = now + between(rand, [600, 3200]);
            }
            if (!move && now >= restUntil) {
                move = pick();
                recent = [move.key, ...recent].slice(0, 2);
                moveStart = now;
                moveEnd = now + between(rand, move.duration);
            }

            if (now >= nextBlink) {
                blinkUntil = now + 120;
                // Occasionally a quick double blink.
                nextBlink =
                    now + (rand() < 0.2 ? 260 : between(rand, [1800, 5200]));
            }

            // Always-on breathing and sway: unrelated periods never realign.
            const breathe =
                Math.sin(time / 640) * 0.6 + Math.sin(time / 1730) * 0.4;
            const base: CharacterPose = {
                phase: 0,
                bob: 0.6 + breathe * 0.8,
                facingBack: false,
                flip: 1,
                lean:
                    Math.sin(time / 2310) * 0.018 +
                    Math.sin(time / 3770) * 0.01,
                squash: breathe * 0.012,
                headTilt:
                    Math.sin(time / 1910) * 0.035 +
                    Math.sin(time / 4390) * 0.02,
                armBack: 0.3 + Math.sin(time / 1270) * 0.05,
                armFront: -0.3 - Math.sin(time / 1490) * 0.05,
                blink: now < blinkUntil,
            };

            if (!move) {
                return base;
            }
            const t = Math.min(1, (now - moveStart) / (moveEnd - moveStart));
            const extra = move.pose(t, envelope(t), holds);
            return {
                ...base,
                ...extra,
                // The front arm is drawn over the head: past this angle the
                // hand would cover the face, so raised arms stop beside it.
                armFront: Math.max(
                    FRONT_ARM_LIMIT,
                    extra.armFront ?? base.armFront ?? 0,
                ),
                bob: base.bob + (extra.bob ?? 0),
                lean: (base.lean ?? 0) + (extra.lean ?? 0),
                squash: (base.squash ?? 0) + (extra.squash ?? 0),
                headTilt: (base.headTilt ?? 0) + (extra.headTilt ?? 0),
                blink: base.blink || (extra.blink ?? false),
            };
        },
    };
}
