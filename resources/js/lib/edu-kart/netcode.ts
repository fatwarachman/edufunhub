/**
 * EduKart client netcode: own-kart prediction with server reconciliation
 * and interpolation of the other racers. Pure (no DOM, no React), so it is
 * node-testable. Relative imports only.
 */
import {
    DT,
    type Input,
    type Kart,
    newKart,
    step,
    type Vehicle,
} from './physics';
import type { RaceFrame, RacerFrame } from './protocol';
import type { Track } from './track';

/** How far behind the newest frame other racers are drawn (ms). */
export const INTERP_DELAY = 110;
/** Corrections bigger than this snap instead of blending (metres). */
export const SNAP_DISTANCE = 6;
/** How fast a visual correction offset fades (per second). */
const SMOOTH_RATE = 6;
/**
 * Soft reconciliation window: errors below these (metres / radians) are
 * folded into the local kart by SOFT_GAIN per server frame (~0.5 s time
 * constant at 20 Hz) instead of being drawn as a correction.
 */
const SOFT_P = 6;
const SOFT_D = 1.2;
const SOFT_PSI = 0.2;
const SOFT_GAIN = 0.1;
/** Most local steps kept for replay (~2 s). */
const HISTORY = 120;

function copyKart(k: Kart): Kart {
    return { ...k };
}

/** Kart fields of a server racer frame. */
export function kartOf(frame: RacerFrame): Kart {
    const k = newKart();
    for (const key of Object.keys(k) as (keyof Kart)[]) {
        const value = frame[key];
        if (typeof value === typeof k[key]) {
            (k as unknown as Record<string, unknown>)[key] = value;
        }
    }
    return k;
}

interface HistoryStep {
    seq: number;
    input: Input;
}

/**
 * Predicts the viewer's kart at 60 Hz with the shared physics. Each server
 * frame resets the kart to the referee's state and replays the local steps
 * whose input the referee has not applied yet; the visual difference fades
 * out instead of snapping, so the camera never jumps.
 */
export class Predictor {
    kart: Kart = newKart();
    /** Visual correction offset added when drawing (fades to 0). */
    offset = { p: 0, d: 0, psi: 0 };
    /** State one physics step before `kart`, for render interpolation. */
    private prev: Kart = newKart();
    private history: HistoryStep[] = [];
    private acc = 0;
    private ready = false;
    private track: Track;
    private vehicle: Vehicle;

    constructor(track: Track, vehicle: Vehicle) {
        this.track = track;
        this.vehicle = vehicle;
    }

    setVehicle(vehicle: Vehicle): void {
        this.vehicle = vehicle;
    }

    get started(): boolean {
        return this.ready;
    }

    /**
     * Advances by `elapsed` seconds of wall time with the current input.
     * `seq` must be the sequence number of the message that carries `input`
     * to the referee (send first, then advance), so `ack` maps exactly onto
     * the local history.
     */
    advance(elapsed: number, seq: number, input: Input, frozen: boolean): void {
        if (!this.ready) {
            return;
        }
        this.acc = Math.min(this.acc + Math.max(0, elapsed), 0.25);
        while (this.acc >= DT) {
            this.acc -= DT;
            this.prev = copyKart(this.kart);
            if (!frozen) {
                step(this.kart, input, this.vehicle, this.track, DT);
            }
            this.history.push({ seq, input: { ...input } });
            if (this.history.length > HISTORY) {
                this.history.shift();
            }
        }
        const fade = Math.exp(-SMOOTH_RATE * Math.max(0, elapsed));
        this.offset.p *= fade;
        this.offset.d *= fade;
        this.offset.psi *= fade;
    }

    /** Applies the referee's state for the viewer (`ack` = last applied seq). */
    reconcile(server: RacerFrame, ack: number, frozen: boolean): void {
        const shown = this.ready ? this.view() : null;
        const before = copyKart(this.kart);
        const next = kartOf(server);
        // Drop history the referee has applied.
        let first = this.history.findIndex((h) => h.seq > ack);
        if (first < 0) {
            first = this.history.length;
        }
        this.history = this.history.slice(first);
        let prev = copyKart(next);
        if (!frozen) {
            for (const h of this.history) {
                prev = copyKart(next);
                step(next, h.input, this.vehicle, this.track, DT);
            }
        }
        // Fire/hop/turbo counters must stay monotonic locally.
        next.last_hop = Math.max(next.last_hop, before.last_hop);
        next.last_turbo = Math.max(next.last_turbo, before.last_turbo);
        const nextPrev =
            this.history.length > 0 && !frozen ? prev : copyKart(next);
        if (!shown) {
            this.kart = next;
            this.prev = nextPrev;
            this.offset = { p: 0, d: 0, psi: 0 };
            this.ready = true;
            return;
        }
        // The referee runs 3 steps per 50 ms tick, so the replay lands a
        // step or two off the local clock. That timing error (mostly along
        // the road) is not a real disagreement: fold small errors into the
        // local kart a little per frame instead of pulling it every packet.
        const ep = next.p - before.p;
        const ed = next.d - before.d;
        const epsi = next.psi - before.psi;
        if (
            !frozen &&
            Math.abs(ep) < SOFT_P &&
            Math.abs(ed) < SOFT_D &&
            Math.abs(epsi) < SOFT_PSI &&
            next.stun <= 0 === before.stun <= 0
        ) {
            const kp = ep * SOFT_GAIN;
            const kd = ed * SOFT_GAIN;
            const kpsi = epsi * SOFT_GAIN;
            const keep = {
                p: before.p + kp,
                d: before.d + kd,
                psi: before.psi + kpsi,
                v: before.v + (next.v - before.v) * SOFT_GAIN,
                y: before.y,
                vy: before.vy,
            };
            this.kart = { ...next, ...keep };
            this.prev = {
                ...this.prev,
                p: this.prev.p + kp,
                d: this.prev.d + kd,
                psi: this.prev.psi + kpsi,
            };
            // Hide even this nudge: the offset spreads it over ~0.2 s.
            this.offset = {
                p: this.offset.p - kp,
                d: this.offset.d - kd,
                psi: this.offset.psi - kpsi,
            };
            return;
        }
        // Keep the last step's motion (prev -> kart) on the new state: with
        // prev == kart the render blend loses up to one step of travel and
        // the kart (and, through the camera, every rival) visibly hitches.
        // Rival bumps push sideways past the soft window, so this path runs
        // whenever a bot rubs the player.
        const motion = {
            p: before.p - this.prev.p,
            d: before.d - this.prev.d,
            psi: before.psi - this.prev.psi,
            y: before.y - this.prev.y,
        };
        this.kart = next;
        this.prev =
            this.history.length > 0 && !frozen
                ? nextPrev
                : {
                      ...next,
                      p: next.p - motion.p,
                      d: next.d - motion.d,
                      psi: next.psi - motion.psi,
                      y: next.y - motion.y,
                  };
        // Keep the drawn kart exactly where it was; the gap fades out.
        this.offset = { p: 0, d: 0, psi: 0 };
        const fresh = this.view();
        const dp = shown.p - fresh.p;
        const dd = shown.d - fresh.d;
        const dpsi = shown.psi - fresh.psi;
        if (Math.hypot(dp, dd) > SNAP_DISTANCE) {
            return;
        }
        this.offset = { p: dp, d: dd, psi: dpsi };
    }

    /**
     * Kart to draw: blended between the last two physics steps by the time
     * left in the accumulator (smooth on 90/120 Hz screens and uneven
     * frames), plus the fading correction offset.
     */
    view(): Kart {
        const a = Math.max(0, Math.min(1, this.acc / DT));
        const k = this.kart;
        const b = this.prev;
        const jump = Math.abs(k.p - b.p) > 5 || Math.abs(k.d - b.d) > 5;
        const f = jump ? 1 : a;
        const mix = (x: number, y: number) => x + (y - x) * f;
        return {
            ...k,
            p: mix(b.p, k.p) + this.offset.p,
            d: mix(b.d, k.d) + this.offset.d,
            psi: mix(b.psi, k.psi) + this.offset.psi,
            y: mix(b.y, k.y),
            v: mix(b.v, k.v),
        };
    }

    reset(): void {
        this.kart = newKart();
        this.prev = newKart();
        this.offset = { p: 0, d: 0, psi: 0 };
        this.history = [];
        this.acc = 0;
        this.ready = false;
    }
}

interface Snapshot {
    /** Referee race time of the frame (ms), evenly spaced by TICK_MS. */
    ms: number;
    racers: Map<number, RacerFrame>;
}

/** Referee frame spacing (ms), mirrors Go `TickMs`. */
export const TICK_MS = 50;
/** Longest gap (ms) bridged by extrapolating before a racer holds still. */
export const MAX_EXTRAPOLATE = 220;
/** Upper bound of the adaptive interpolation delay (ms). */
const MAX_DELAY = 320;

/**
 * Buffers frames and draws the other racers a little in the past.
 *
 * Frames are placed on the referee's own clock (`frame.ms`), not on their
 * arrival time: network jitter bunches and delays packets, and timing by
 * arrival made rivals surge, freeze and jump. A smoothed offset maps local
 * time onto referee time, the delay grows with the measured jitter, and a
 * late frame is bridged by extrapolating along the last known motion.
 */
export class Interpolator {
    private snaps: Snapshot[] = [];
    private offset: number | null = null;
    private jitter = 0;
    private delay = INTERP_DELAY;

    push(frame: RaceFrame, receivedAt: number): void {
        const last = this.snaps[this.snaps.length - 1];
        if (last && frame.ms <= last.ms) {
            if (frame.ms < last.ms - 1000) {
                this.reset();
            } else {
                return;
            }
        }
        const racers = new Map<number, RacerFrame>();
        for (const r of frame.racers) {
            racers.set(r.racer, r);
        }
        this.snaps.push({ ms: frame.ms, racers });
        if (this.snaps.length > 40) {
            this.snaps.shift();
        }
        const sample = receivedAt - frame.ms;
        if (this.offset === null) {
            this.offset = sample;
            return;
        }
        const error = sample - this.offset;
        this.jitter += (Math.abs(error) - this.jitter) * 0.1;
        // Early packets reveal the true offset quickly; late ones only drift
        // it slowly (clock skew), so one slow packet never shifts playback.
        this.offset += error * (error < 0 ? 0.2 : 0.01);
        const target = Math.min(
            MAX_DELAY,
            Math.max(INTERP_DELAY, TICK_MS + 30 + this.jitter * 3),
        );
        this.delay += (target - this.delay) * 0.05;
    }

    reset(): void {
        this.snaps = [];
        this.offset = null;
        this.jitter = 0;
        this.delay = INTERP_DELAY;
    }

    /** Current playback delay behind the referee (ms), for diagnostics. */
    get playbackDelay(): number {
        return this.delay;
    }

    /** Interpolated racer at local time `now` (ms), null when unknown. */
    sample(racer: number, now: number): RacerFrame | null {
        const snaps = this.snaps;
        if (snaps.length === 0 || this.offset === null) {
            return null;
        }
        const t = now - this.offset - this.delay;
        const b = snaps.findIndex((s) => s.ms >= t);
        if (b === 0) {
            return snaps[0].racers.get(racer) ?? null;
        }
        if (b < 0) {
            return this.extrapolate(racer, t);
        }
        const a = snaps[b - 1];
        const c = snaps[b];
        const ra = a.racers.get(racer);
        const rc = c.racers.get(racer);
        if (!ra || !rc) {
            return rc ?? ra ?? null;
        }
        const f = Math.max(
            0,
            Math.min(1, (t - a.ms) / Math.max(1, c.ms - a.ms)),
        );
        return blend(ra, rc, f);
    }

    /** Newest frame pushed forward along its last motion, bounded in time. */
    private extrapolate(racer: number, t: number): RacerFrame | null {
        const snaps = this.snaps;
        const c = snaps[snaps.length - 1];
        const rc = c.racers.get(racer);
        if (!rc) {
            return null;
        }
        const a = snaps.length > 1 ? snaps[snaps.length - 2] : null;
        const ra = a?.racers.get(racer);
        if (!a || !ra || rc.stun > 0 || rc.finish_ms > 0) {
            return rc;
        }
        const ahead = Math.min(t - c.ms, MAX_EXTRAPOLATE);
        return blend(ra, rc, 1 + ahead / Math.max(1, c.ms - a.ms));
    }
}

function blend(ra: RacerFrame, rc: RacerFrame, f: number): RacerFrame {
    // A jump of more than a few metres between frames is a respawn or
    // reset, never motion: show the newer state instead of sliding.
    if (Math.abs(rc.p - ra.p) > 25 || Math.abs(rc.d - ra.d) > 8) {
        return rc;
    }
    return {
        ...rc,
        p: ra.p + (rc.p - ra.p) * f,
        d: ra.d + (rc.d - ra.d) * f,
        psi: ra.psi + (rc.psi - ra.psi) * f,
        y: f > 1 ? rc.y : ra.y + (rc.y - ra.y) * f,
        v: f > 1 ? rc.v : ra.v + (rc.v - ra.v) * f,
    };
}

/** Raw controls of the page (keyboard + touch merged). */
export interface Controls {
    steer: number;
    throttle: number;
    drift: boolean;
    hop: number;
    turbo: number;
    fire: number;
}

export function emptyControls(): Controls {
    return { steer: 0, throttle: 0, drift: false, hop: 0, turbo: 0, fire: 0 };
}

/**
 * Drift/hop/turbo on one button like CTR: pressing it hops (and starts the
 * slide when steering); while sliding, every further press is a turbo
 * attempt. Returns the counters after one press.
 */
export function pressDrift(c: Controls, drifting: boolean): Controls {
    if (drifting) {
        return { ...c, drift: true, turbo: c.turbo + 1 };
    }
    return { ...c, drift: true, hop: c.hop + 1 };
}

/** Clamps controls into a wire input. */
export function toInput(c: Controls, seq: number): Input {
    const clamp = (v: number) =>
        Number.isFinite(v) ? Math.max(-1, Math.min(1, v)) : 0;
    return {
        seq,
        steer: Math.round(clamp(c.steer) * 100) / 100,
        throttle: Math.round(clamp(c.throttle) * 100) / 100,
        drift: c.drift,
        hop: Math.max(0, Math.floor(c.hop)),
        turbo: Math.max(0, Math.floor(c.turbo)),
        fire: Math.max(0, Math.floor(c.fire)),
    };
}
