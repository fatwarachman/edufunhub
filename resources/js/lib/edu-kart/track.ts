/**
 * EduKart track maths. Mirrors services/game/internal/edukart/track.go
 * exactly (the client predicts its own kart with the same numbers the Go
 * referee uses). Relative imports and `import type` only: node --test runs it.
 */

export interface Ramp {
    s: number;
    len: number;
    air: number;
}

export interface Pad {
    s: number;
    len: number;
    lateral: number;
    width: number;
}

export interface Fruit {
    s: number;
    lateral: number;
}

/** Wire shape of a track (Go `Track`, sent once in the room state). */
export interface TrackData {
    id: string;
    theme: string;
    step: number;
    length: number;
    half_width: number;
    /** [x, z, y] every `step` metres along the centre line. */
    samples: [number, number, number][];
    gates: number[];
    ramps: Ramp[];
    pads: Pad[];
    fruits: Fruit[];
}

export function wrapAngle(a: number): number {
    while (a > Math.PI) {
        a -= 2 * Math.PI;
    }
    while (a <= -Math.PI) {
        a += 2 * Math.PI;
    }
    return a;
}

export class Track {
    readonly id: string;
    readonly theme: string;
    readonly step: number;
    readonly length: number;
    readonly halfWidth: number;
    readonly samples: [number, number, number][];
    readonly gates: number[];
    readonly ramps: Ramp[];
    readonly pads: Pad[];
    readonly fruits: Fruit[];
    private readonly heading: Float64Array;
    private readonly curve: Float64Array;

    constructor(data: TrackData) {
        const n = data.samples.length;
        if (n < 16 || data.step <= 0 || data.half_width <= 0) {
            throw new Error('bad track');
        }
        this.id = data.id;
        this.theme = data.theme;
        this.step = data.step;
        this.length = n * data.step;
        this.halfWidth = data.half_width;
        this.samples = data.samples;
        this.gates = [...data.gates].sort((a, b) => a - b);
        this.ramps = data.ramps ?? [];
        this.pads = data.pads ?? [];
        this.fruits = data.fruits ?? [];
        this.heading = new Float64Array(n);
        this.curve = new Float64Array(n);
        for (let i = 0; i < n; i++) {
            const a = this.samples[(i - 1 + n) % n];
            const b = this.samples[(i + 1) % n];
            this.heading[i] = Math.atan2(b[1] - a[1], b[0] - a[0]);
        }
        for (let i = 1; i < n; i++) {
            this.heading[i] =
                this.heading[i - 1] +
                wrapAngle(this.heading[i] - this.heading[i - 1]);
        }
        for (let i = 0; i < n; i++) {
            const prev = this.heading[(i - 1 + n) % n];
            const next = this.heading[(i + 1) % n];
            this.curve[i] = wrapAngle(next - prev) / (2 * this.step);
        }
    }

    wrap(p: number): number {
        let s = p % this.length;
        if (s < 0) {
            s += this.length;
        }
        return s;
    }

    private locate(p: number): [number, number, number] {
        const s = this.wrap(p);
        const f = s / this.step;
        const n = this.samples.length;
        let i = Math.floor(f);
        if (i >= n) {
            i = n - 1;
        }
        return [i, (i + 1) % n, f - i];
    }

    curvature(p: number): number {
        const [i, j, f] = this.locate(p);
        return this.curve[i] + (this.curve[j] - this.curve[i]) * f;
    }

    headingAt(p: number): number {
        const [i, j, f] = this.locate(p);
        return (
            this.heading[i] + wrapAngle(this.heading[j] - this.heading[i]) * f
        );
    }

    height(p: number): number {
        const [i, j, f] = this.locate(p);
        return (
            this.samples[i][2] + (this.samples[j][2] - this.samples[i][2]) * f
        );
    }

    /** World position [x, y, z] of track coordinates (p, d). */
    world(p: number, d: number): [number, number, number] {
        const [i, j, f] = this.locate(p);
        const a = this.samples[i];
        const b = this.samples[j];
        const x = a[0] + (b[0] - a[0]) * f;
        const z = a[1] + (b[1] - a[1]) * f;
        const y = a[2] + (b[2] - a[2]) * f;
        const h = this.headingAt(p);
        return [x - Math.sin(h) * d, y, z + Math.cos(h) * d];
    }

    /** How far b is ahead of a along the loop, in (-L/2, L/2]. */
    ahead(a: number, b: number): number {
        let d = (b - a) % this.length;
        if (d > this.length / 2) {
            d -= this.length;
        }
        if (d <= -this.length / 2) {
            d += this.length;
        }
        return d;
    }

    /** Lateral centre of each answer box and the box width (option 0 = leftmost). */
    answerLanes(n: number): [number[], number] {
        const w = (2 * this.halfWidth) / n;
        const out: number[] = [];
        for (let i = 0; i < n; i++) {
            out.push(-this.halfWidth + w * (i + 0.5));
        }
        return [out, w];
    }

    laneAt(n: number, d: number): number {
        if (Math.abs(d) > this.halfWidth + 0.5) {
            return -1;
        }
        const [, w] = this.answerLanes(n);
        const i = Math.floor((d + this.halfWidth) / w);
        return Math.max(0, Math.min(n - 1, i));
    }

    /** Moving forward from a to b (unwrapped) passed track position s. */
    crossed(a: number, b: number, s: number): boolean {
        if (b <= a) {
            return false;
        }
        const ahead = this.wrap(s - a);
        return ahead > 0 && ahead <= b - a;
    }
}
