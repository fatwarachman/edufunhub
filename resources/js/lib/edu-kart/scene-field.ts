/**
 * Track-space helpers for scenery placement: a spatial hash of the centre
 * line samples answering "how far from the road is (x, z), on which side,
 * at what road height" quickly, plus a scatter helper that keeps props off
 * the road.
 */
import type { Track } from './track';

export interface Nearest {
    /** Distance to the nearest centre-line sample (m). */
    dist: number;
    /** Signed lateral offset (right positive) from that sample. */
    lateral: number;
    /** Sample index. */
    index: number;
    /** Road height there. */
    height: number;
}

const CELL = 12;

/** Regular grid of road distance / height (terrain shaping). */
export interface FieldGrid {
    x0: number;
    z0: number;
    cell: number;
    cols: number;
    rows: number;
    dist: Float32Array;
    height: Float32Array;
}

/** Bilinear sample of a grid array at world (x, z) (clamped to the grid). */
export function sampleGrid(
    grid: FieldGrid,
    values: Float32Array,
    x: number,
    z: number,
): number {
    const fx = Math.min(
        grid.cols - 1.001,
        Math.max(0, (x - grid.x0) / grid.cell),
    );
    const fz = Math.min(
        grid.rows - 1.001,
        Math.max(0, (z - grid.z0) / grid.cell),
    );
    const c = Math.floor(fx);
    const r = Math.floor(fz);
    const tx = fx - c;
    const tz = fz - r;
    const i = r * grid.cols + c;
    const a = values[i];
    const b = values[i + 1];
    const d = values[i + grid.cols];
    const e = values[i + grid.cols + 1];
    return (a + (b - a) * tx) * (1 - tz) + (d + (e - d) * tx) * tz;
}

export class TrackField {
    readonly minX: number;
    readonly maxX: number;
    readonly minZ: number;
    readonly maxZ: number;
    readonly centerX: number;
    readonly centerZ: number;
    readonly minHeight: number;
    readonly maxHeight: number;
    private grid = new Map<number, number[]>();
    private headings: Float64Array;
    private curvatures: Float64Array;

    constructor(readonly track: Track) {
        const s = track.samples;
        let minX = Infinity;
        let maxX = -Infinity;
        let minZ = Infinity;
        let maxZ = -Infinity;
        let minH = Infinity;
        let maxH = -Infinity;
        let cx = 0;
        let cz = 0;
        this.headings = new Float64Array(s.length);
        this.curvatures = new Float64Array(s.length);
        for (let i = 0; i < s.length; i++) {
            const [x, z, y] = s[i];
            minX = Math.min(minX, x);
            maxX = Math.max(maxX, x);
            minZ = Math.min(minZ, z);
            maxZ = Math.max(maxZ, z);
            minH = Math.min(minH, y);
            maxH = Math.max(maxH, y);
            cx += x;
            cz += z;
            const key = this.key(Math.floor(x / CELL), Math.floor(z / CELL));
            let list = this.grid.get(key);
            if (!list) {
                list = [];
                this.grid.set(key, list);
            }
            list.push(i);
            this.headings[i] = track.headingAt(i * track.step);
            this.curvatures[i] = track.curvature(i * track.step);
        }
        this.minX = minX;
        this.maxX = maxX;
        this.minZ = minZ;
        this.maxZ = maxZ;
        this.minHeight = minH;
        this.maxHeight = maxH;
        this.centerX = cx / s.length;
        this.centerZ = cz / s.length;
    }

    private key(ix: number, iz: number): number {
        return (ix + 2048) * 4096 + (iz + 2048);
    }

    heading(index: number): number {
        return this.headings[index];
    }

    curvature(index: number): number {
        return this.curvatures[index];
    }

    /**
     * Nearest sample to (x, z); `limit` caps the search radius (beyond it
     * dist = limit and index = -1, height = minHeight).
     */
    nearest(x: number, z: number, limit = 120): Nearest {
        const s = this.track.samples;
        const ix = Math.floor(x / CELL);
        const iz = Math.floor(z / CELL);
        let best = -1;
        let bestD2 = Infinity;
        const maxRing = Math.ceil(limit / CELL) + 1;
        for (let ring = 0; ring <= maxRing; ring++) {
            for (let dx = -ring; dx <= ring; dx++) {
                for (let dz = -ring; dz <= ring; dz++) {
                    if (Math.max(Math.abs(dx), Math.abs(dz)) !== ring) {
                        continue;
                    }
                    const list = this.grid.get(this.key(ix + dx, iz + dz));
                    if (!list) {
                        continue;
                    }
                    for (const i of list) {
                        const ddx = s[i][0] - x;
                        const ddz = s[i][1] - z;
                        const d2 = ddx * ddx + ddz * ddz;
                        if (d2 < bestD2) {
                            bestD2 = d2;
                            best = i;
                        }
                    }
                }
            }
            // A sample found in ring r is exact once ring r+1 is searched.
            if (best >= 0 && Math.sqrt(bestD2) < ring * CELL) {
                break;
            }
        }
        if (best < 0 || bestD2 > limit * limit) {
            return {
                dist: limit,
                lateral: 0,
                index: -1,
                height: this.minHeight,
            };
        }
        const h = this.headings[best];
        const lateral =
            (x - s[best][0]) * -Math.sin(h) + (z - s[best][1]) * Math.cos(h);
        return {
            dist: Math.sqrt(bestD2),
            lateral,
            index: best,
            height: s[best][2],
        };
    }

    /**
     * Rejection-sampled scatter points at a distance from the road in
     * [minDist, maxDist], inside the bounding box grown by `margin`.
     */
    scatter(
        count: number,
        minDist: number,
        maxDist: number,
        margin: number,
        random: () => number,
        accept?: (x: number, z: number, near: Nearest) => boolean,
    ): { x: number; z: number; near: Nearest }[] {
        const out: { x: number; z: number; near: Nearest }[] = [];
        const w = this.maxX - this.minX + margin * 2;
        const d = this.maxZ - this.minZ + margin * 2;
        let tries = 0;
        while (out.length < count && tries < count * 30) {
            tries++;
            const x = this.minX - margin + random() * w;
            const z = this.minZ - margin + random() * d;
            const near = this.nearest(x, z, maxDist + CELL);
            if (near.dist < minDist || near.dist > maxDist) {
                continue;
            }
            if (accept && !accept(x, z, near)) {
                continue;
            }
            out.push({ x, z, near });
        }
        return out;
    }

    /**
     * Dense distance field: nodes every `cell` metres covering the bounding
     * box grown by `margin`. Each node stores the distance to the nearest
     * centre-line sample (capped at `limit`) and that sample's road height.
     * Samples are stamped onto nearby nodes (fast, no per-node search).
     */
    buildGrid(cell: number, margin: number, limit: number): FieldGrid {
        const x0 = this.minX - margin;
        const z0 = this.minZ - margin;
        const cols = Math.ceil((this.maxX - this.minX + margin * 2) / cell) + 1;
        const rows = Math.ceil((this.maxZ - this.minZ + margin * 2) / cell) + 1;
        const dist = new Float32Array(cols * rows).fill(limit);
        const height = new Float32Array(cols * rows).fill(this.minHeight);
        const reach = Math.ceil(limit / cell);
        for (const [sx, sz, sy] of this.track.samples) {
            const cc = Math.round((sx - x0) / cell);
            const rr = Math.round((sz - z0) / cell);
            for (
                let r = Math.max(0, rr - reach);
                r <= Math.min(rows - 1, rr + reach);
                r++
            ) {
                const dz = z0 + r * cell - sz;
                for (
                    let c = Math.max(0, cc - reach);
                    c <= Math.min(cols - 1, cc + reach);
                    c++
                ) {
                    const dx = x0 + c * cell - sx;
                    const d = Math.sqrt(dx * dx + dz * dz);
                    const i = r * cols + c;
                    if (d < dist[i]) {
                        dist[i] = d;
                        height[i] = sy;
                    }
                }
            }
        }
        return { x0, z0, cell, cols, rows, dist, height };
    }

    /**
     * Points along one side of the road every `spacing` metres at lateral
     * `offset` (signed): [x, y, z, heading, sampleIndex].
     */
    along(
        spacing: number,
        offset: number,
        from = 0,
        to = this.track.length,
    ): [number, number, number, number, number][] {
        const out: [number, number, number, number, number][] = [];
        for (let p = from; p < to; p += spacing) {
            const [x, y, z] = this.track.world(p, offset);
            const index = Math.floor(this.track.wrap(p) / this.track.step);
            out.push([x, y, z, this.track.headingAt(p), index]);
        }
        return out;
    }
}
