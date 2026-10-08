/**
 * Shared Flag Quest protocol types and a client-side mirror of the Go collision
 * rules (services/game/internal/world). The Go service stays authoritative; this
 * mirror only powers client prediction so movement feels instant.
 */

export type ChallengeKind =
    'quick_quiz' | 'true_false' | 'math_sprint' | 'snakes_ladders';

export interface Point {
    x: number;
    y: number;
}

export interface Rect extends Point {
    w: number;
    h: number;
}

export interface Decor extends Point {
    k: string;
    r: number;
    v: number;
}

export interface Checkpoint extends Point {
    id: number;
    kind: ChallengeKind;
    gate: Rect;
    cleared: boolean;
}

export interface WorldData {
    mission: string;
    w: number;
    h: number;
    tiles: string[];
    decor: Decor[];
    checkpoints: Checkpoint[];
    flag: Point;
    spawn: Point;
}

export interface MissionInfo {
    id: string;
    difficulty: number;
    kinds: ChallengeKind[];
}

export interface ChallengeFeedback {
    correct: boolean;
    answer: string;
    hint?: string;
    timeout?: boolean;
}

export interface ChallengeState {
    checkpoint: number;
    kind: ChallengeKind;
    phase: 'question' | 'roll' | 'done';
    step: number;
    total: number;
    needed: number;
    correct: number;
    wrong: number;
    passed: boolean;
    /** True when this attempt continues a failed one (progress kept). */
    resumed?: boolean;
    deadline_ms?: number;
    ends_ms?: number;
    question?: { prompt: string; subject: string; options: string[] };
    feedback?: ChallengeFeedback;
    board?: {
        size: number;
        cols: number;
        jumps: [number, number][];
        pending_roll: number;
        move_from: number;
        move_landing: number;
        position: number;
        turns: number;
        max_turns: number;
        last_roll: number;
        last_jump: number;
    };
    receivedAt: number;
}

export interface CompleteState {
    mission: string;
    points: number;
    correct: number;
    wrong: number;
    seconds: number;
    flawless: boolean;
}

export const PLAYER_RADIUS = 0.3;
export const INTERACT_DIST = 1.9;

export function tileAt(world: WorldData, x: number, y: number): string {
    const tx = Math.floor(x);
    const ty = Math.floor(y);
    if (tx < 0 || ty < 0 || tx >= world.w || ty >= world.h) {
        return 'w';
    }
    return world.tiles[ty][tx];
}

export function isBlocked(world: WorldData, x: number, y: number): boolean {
    const r = PLAYER_RADIUS;
    for (const [px, py] of [
        [x - r, y - r],
        [x + r, y - r],
        [x - r, y + r],
        [x + r, y + r],
    ]) {
        if (tileAt(world, px, py) === 'w') {
            return true;
        }
    }
    for (const cp of world.checkpoints) {
        const g = cp.gate;
        if (
            !cp.cleared &&
            x > g.x - r &&
            x < g.x + g.w + r &&
            y > g.y - r &&
            y < g.y + g.h + r
        ) {
            return true;
        }
    }
    for (const d of world.decor) {
        if (d.r > 0 && Math.hypot(d.x - x, d.y - y) < d.r + r) {
            return true;
        }
    }
    return false;
}

export function moveWithCollision(
    world: WorldData,
    from: Point,
    dx: number,
    dy: number,
    dist: number,
): Point {
    const len = Math.hypot(dx, dy);
    if (len === 0 || dist <= 0) {
        return from;
    }
    const ux = dx / len;
    const uy = dy / len;
    const steps = Math.ceil(dist / 0.1);
    const s = dist / steps;
    let { x, y } = from;
    for (let i = 0; i < steps; i++) {
        let movedX = false;
        let movedY = false;
        if (!isBlocked(world, x + ux * s, y)) {
            x += ux * s;
            movedX = true;
        }
        if (!isBlocked(world, x, y + uy * s)) {
            y += uy * s;
            movedY = true;
        }
        // Corner assist (mirrors Go world.Move): slide around corners when pushing along one axis.
        if (!movedX && Math.abs(ux) > 0.7) {
            const side = freeSide(world, x + ux * s, y, false);
            if (side !== 0 && !isBlocked(world, x, y + side * s)) {
                y += side * s;
            }
        }
        if (!movedY && Math.abs(uy) > 0.7) {
            const side = freeSide(world, x, y + uy * s, true);
            if (side !== 0 && !isBlocked(world, x + side * s, y)) {
                x += side * s;
            }
        }
    }
    return { x, y };
}

const CORNER_ASSIST_OFFSETS = [0.1, 0.2, 0.3, 0.45];

function freeSide(
    world: WorldData,
    tx: number,
    ty: number,
    alongX: boolean,
): number {
    for (const off of CORNER_ASSIST_OFFSETS) {
        for (const sign of [1, -1]) {
            const px = alongX ? tx + sign * off : tx;
            const py = alongX ? ty : ty + sign * off;
            if (!isBlocked(world, px, py)) {
                return sign;
            }
        }
    }
    return 0;
}

export function distance(a: Point, b: Point): number {
    return Math.hypot(a.x - b.x, a.y - b.y);
}

/** Rotates a direction vector by k quarter turns (view rotation). */
export function rotateDir(x: number, y: number, k: number): Point {
    switch (((k % 4) + 4) % 4) {
        case 1:
            return { x: -y, y: x };
        case 2:
            return { x: -x, y: -y };
        case 3:
            return { x: y, y: -x };
        default:
            return { x, y };
    }
}

/** Converts a screen-space input vector into a world direction for the current view rotation. */
export function screenToWorldDir(
    sx: number,
    sy: number,
    rotation: number,
): Point {
    const rx = sx + sy;
    const ry = sy - sx;
    return rotateDir(rx, ry, 4 - rotation);
}

export type NearbyTarget =
    { type: 'station'; checkpoint: Checkpoint } | { type: 'flag' } | null;

export function findNearby(world: WorldData, pos: Point): NearbyTarget {
    for (const cp of world.checkpoints) {
        if (!cp.cleared && distance(pos, cp) <= INTERACT_DIST) {
            return { type: 'station', checkpoint: cp };
        }
    }
    if (distance(pos, world.flag) <= INTERACT_DIST) {
        return { type: 'flag' };
    }
    return null;
}
