/**
 * EduKart kart physics. Line-by-line port of
 * services/game/internal/edukart/physics.go: the client predicts its own kart
 * with it and the Go referee corrects it. Change both together; the parity
 * test (physics.test.mjs + Go golden file) fails when they drift apart.
 */
import { type Track } from './track';

export const DT = 1 / 60;
export const GRAVITY = 22;
export const WALL_MARGIN = 2.5;
export const OFFROAD_TOP = 13;
export const FRUIT_SPEED = 0.12;
export const MAX_FRUIT = 10;
export const MAX_PSI = 1.2;
export const HOP_SPEED = 3.2;
export const CHARGE_TIME = 0.9;
export const TURBO_WINDOW = 0.7;
export const OVERHEAT = 1.35;
export const DRIFT_SPIN_OUT = 5;
export const MIN_DRIFT_SPEED = 7;
export const LANDING_AIR = 0.45;
export const WALL_HIT_SPEED = 2;
export const TURBO_POWER = [6, 7, 9] as const;

export const FX_TURBO = 1;
export const FX_BACKFIRE = 2;
export const FX_SPIN_OUT = 4;
export const FX_WALL = 8;
export const FX_LAND = 16;
export const FX_PAD = 32;
export const FX_JUMP = 64;
export const FX_HOP = 128;

export type VehicleClass = 'balanced' | 'speed' | 'accel' | 'turn';

export interface Vehicle {
    id: string;
    class: VehicleClass;
    top: number;
    accel: number;
    turn: number;
}

const CLASS_STATS: Record<VehicleClass, [number, number, number]> = {
    balanced: [26, 13, 1.9],
    speed: [27.5, 11, 1.65],
    accel: [25, 16, 1.9],
    turn: [25, 13, 2.25],
};

export const VEHICLE_IDS = [
    'classic',
    'formula',
    'buggy',
    'hover',
    'monster',
    'bajaj',
    'drifter',
    'rocket',
] as const;

export type VehicleId = (typeof VEHICLE_IDS)[number];

const VEHICLE_CLASS: Record<VehicleId, VehicleClass> = {
    classic: 'balanced',
    formula: 'speed',
    buggy: 'accel',
    hover: 'turn',
    monster: 'speed',
    bajaj: 'accel',
    drifter: 'turn',
    rocket: 'balanced',
};

export function vehicleById(id: string): Vehicle {
    const known = (VEHICLE_IDS as readonly string[]).includes(id);
    const vid = (known ? id : 'classic') as VehicleId;
    const cls = VEHICLE_CLASS[vid];
    const [top, accel, turn] = CLASS_STATS[cls];
    return { id: vid, class: cls, top, accel, turn };
}

export interface Input {
    seq: number;
    steer: number;
    throttle: number;
    drift: boolean;
    hop: number;
    turbo: number;
    fire: number;
}

export interface Kart {
    p: number;
    d: number;
    psi: number;
    v: number;
    y: number;
    vy: number;
    air: number;
    drifting: boolean;
    drift_dir: number;
    drift_time: number;
    charge: number;
    stage: number;
    boost: number;
    boost_pow: number;
    stun: number;
    fruit: number;
    zone_cap: number;
    last_hop: number;
    last_turbo: number;
    hops: number;
    fx: number;
}

export function newKart(): Kart {
    return {
        p: 0,
        d: 0,
        psi: 0,
        v: 0,
        y: 0,
        vy: 0,
        air: 0,
        drifting: false,
        drift_dir: 0,
        drift_time: 0,
        charge: 0,
        stage: 0,
        boost: 0,
        boost_pow: 0,
        stun: 0,
        fruit: 0,
        zone_cap: 0,
        last_hop: 0,
        last_turbo: 0,
        hops: 0,
        fx: 0,
    };
}

function finite(v: number): number {
    return Number.isFinite(v) ? v : 0;
}

function clamp(v: number, lo: number, hi: number): number {
    return Math.max(lo, Math.min(hi, v));
}

function sign(v: number): number {
    return v < 0 ? -1 : 1;
}

export function cleanInput(input: Input): Input {
    return {
        ...input,
        steer: clamp(finite(input.steer), -1, 1),
        throttle: clamp(finite(input.throttle), -1, 1),
    };
}

export function topSpeed(k: Kart, veh: Vehicle, t: Track): number {
    let top = veh.top + FRUIT_SPEED * k.fruit;
    if (k.y <= 0 && Math.abs(k.d) > t.halfWidth) {
        top = Math.min(top, OFFROAD_TOP);
    }
    if (k.boost > 0) {
        top += k.boost_pow;
    }
    if (k.zone_cap > 0) {
        let cap = k.zone_cap;
        if (k.boost > 0) {
            cap += 4;
        }
        top = Math.min(top, cap);
    }
    return top;
}

function endDrift(k: Kart): void {
    k.drifting = false;
    k.charge = 0;
    k.stage = 0;
    k.drift_time = 0;
}

/** Advances the kart by dt seconds (mutates k). Same order as Go `Step`. */
export function step(
    k: Kart,
    raw: Input,
    veh: Vehicle,
    t: Track,
    dt: number,
): void {
    const input = cleanInput(raw);
    k.fx = 0;
    let hops = input.hop > k.last_hop;
    let turbo = input.turbo > k.last_turbo;
    if (input.hop > k.last_hop) {
        k.hops += input.hop - k.last_hop;
        k.last_hop = input.hop;
    }
    if (input.turbo > k.last_turbo) {
        k.last_turbo = input.turbo;
    }
    const stunned = k.stun > 0;
    if (stunned) {
        k.stun = Math.max(0, k.stun - dt);
        input.steer = 0;
        input.throttle = 0;
        input.drift = false;
        hops = false;
        turbo = false;
        k.v *= Math.exp(-3 * dt);
    }
    let grounded = k.y <= 0 && k.vy <= 0;

    if (hops && grounded) {
        k.vy = HOP_SPEED;
        k.fx |= FX_HOP;
        grounded = false;
    }
    void grounded;

    const top = topSpeed(k, veh, t);
    if (!stunned) {
        if (input.throttle > 0) {
            if (k.v < top) {
                let gain = veh.accel * input.throttle;
                if (k.boost > 0) {
                    gain = Math.max(gain, veh.accel * 2.5);
                }
                k.v = Math.min(top, k.v + gain * dt);
            } else {
                k.v = Math.max(top, k.v - 18 * dt);
            }
        } else if (input.throttle < 0) {
            if (k.v > 0) {
                k.v = Math.max(0, k.v + 30 * input.throttle * dt);
            } else {
                k.v = Math.max(-6, k.v + veh.accel * 0.5 * input.throttle * dt);
            }
        } else if (k.boost > 0 && k.v < top) {
            k.v = Math.min(top, k.v + veh.accel * 2.5 * dt);
        } else if (k.v > 0) {
            k.v = Math.max(0, k.v - 6 * dt);
        } else {
            k.v = Math.min(0, k.v + 6 * dt);
        }
        if (k.v > top && input.throttle <= 0) {
            k.v = Math.max(top, k.v - 18 * dt);
        }
    }

    if (k.drifting && (!input.drift || k.v < MIN_DRIFT_SPEED || stunned)) {
        endDrift(k);
    }
    if (
        !k.drifting &&
        input.drift &&
        !stunned &&
        Math.abs(input.steer) > 0.25 &&
        k.v > 9
    ) {
        k.drifting = true;
        k.drift_dir = sign(input.steer);
        k.drift_time = 0;
        k.charge = 0;
        k.stage = 0;
    }
    if (k.drifting) {
        k.drift_time += dt;
        k.charge += dt / CHARGE_TIME;
        if (turbo) {
            if (k.charge >= TURBO_WINDOW && k.stage < 3) {
                k.stage++;
                k.boost = Math.max(k.boost, 0.9 + 0.25 * (k.stage - 1));
                k.boost_pow = Math.max(k.boost_pow, TURBO_POWER[k.stage - 1]);
                k.fx |= FX_TURBO;
            } else {
                k.fx |= FX_BACKFIRE;
            }
            k.charge = 0;
        } else if (k.charge >= OVERHEAT) {
            k.charge = 0;
            k.fx |= FX_BACKFIRE;
        }
        if (k.drift_time >= DRIFT_SPIN_OUT) {
            endDrift(k);
            k.stun = 0.9;
            k.fx |= FX_SPIN_OUT;
        }
    }

    const grip = clamp(Math.abs(k.v) / 6, 0, 1);
    let yaw: number;
    if (k.drifting) {
        yaw = k.drift_dir * veh.turn * (1 + 0.45 * input.steer * k.drift_dir);
    } else {
        const dir = k.v < 0 ? -1 : 1;
        yaw = input.steer * veh.turn * grip * dir;
        yaw -= k.psi * 1.2 * (1 - Math.abs(input.steer)) * grip;
    }
    const kappa = t.curvature(k.p);
    const den = Math.max(0.3, 1 - kappa * k.d);
    const dp = (k.v * Math.cos(k.psi)) / den;
    k.psi = clamp(k.psi + (yaw - kappa * dp) * dt, -MAX_PSI, MAX_PSI);

    const prev = k.p;
    k.d += k.v * Math.sin(k.psi) * dt;
    k.p += dp * dt;

    const limit = t.halfWidth + WALL_MARGIN;
    if (Math.abs(k.d) > limit) {
        const side = sign(k.d);
        k.d = side * limit;
        if (k.psi * side > 0) {
            if (Math.abs(k.v * Math.sin(k.psi)) > WALL_HIT_SPEED) {
                k.psi = -k.psi * 0.3;
                k.v *= 0.7;
                k.fx |= FX_WALL;
                if (k.drifting) {
                    endDrift(k);
                }
            } else {
                k.psi = -side * 0.02;
            }
        }
    }

    if (k.y <= 0 && k.vy <= 0) {
        for (const r of t.ramps) {
            if (k.v > 8 && t.crossed(prev, k.p, r.s)) {
                k.vy = (GRAVITY * r.air) / 2;
                k.fx |= FX_JUMP;
            }
        }
        const s = t.wrap(k.p);
        for (const pad of t.pads) {
            if (
                t.wrap(s - pad.s) < pad.len &&
                Math.abs(k.d - pad.lateral) < pad.width / 2
            ) {
                if (k.boost < 1) {
                    k.fx |= FX_PAD;
                }
                k.boost = Math.max(k.boost, 1);
                k.boost_pow = Math.max(k.boost_pow, 8);
            }
        }
    }

    if (k.y > 0 || k.vy > 0) {
        k.vy -= GRAVITY * dt;
        k.y += k.vy * dt;
        k.air += dt;
        if (k.y <= 0) {
            k.y = 0;
            k.vy = 0;
            if (k.air >= LANDING_AIR && !stunned) {
                k.boost = Math.max(k.boost, 0.4 + 0.6 * k.air);
                k.boost_pow = Math.max(k.boost_pow, 6);
                k.fx |= FX_LAND;
            }
            k.air = 0;
        }
    }

    if (k.boost > 0) {
        k.boost -= dt;
        if (k.boost <= 0) {
            k.boost = 0;
            k.boost_pow = 0;
        }
    }
}
