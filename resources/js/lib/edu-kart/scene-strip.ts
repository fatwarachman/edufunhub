/**
 * Track-following strip geometry: sweeps a cross-section profile (lateral
 * offset, height above the road) along the centre line. Used for the road,
 * shoulders, verges, rails, armco, ramps, pads and the reading zone.
 */
import * as THREE from 'three';
import type { Track } from './track';

/** Cross-section point: lateral offset (right +), height above road, colour. */
export interface ProfilePoint {
    d: number;
    y: number;
    color?: string;
    /** u texture coordinate (defaults to the normalised index). */
    u?: number;
    /** Not raised by `lift` (bottom edge of a ramp side). */
    fixed?: boolean;
}

export interface SweepOptions {
    from: number;
    to: number;
    /** Distance between rows (m). */
    step: number;
    /** v texture coordinate per metre along the track. */
    vPerMetre?: number;
    /** Extra height per row (ramps): f(p) added to every profile point. */
    lift?: (p: number) => number;
    /** Flat-shaded (non-indexed) output so faces keep hard normals. */
    hard?: boolean;
    /** Per-row lateral shift (e.g. scatter jitter), m. */
    shift?: (p: number) => number;
    /** Per-vertex colour override: (p, profile index) => colour or null. */
    paint?: (p: number, j: number) => string | null;
    /**
     * Keep inner-side offsets inside the curve radius (no folded triangles
     * on hairpins). Default true.
     */
    clampInner?: boolean;
    /** Follow the visual banking of curves (default true). */
    bank?: boolean;
}

const color = new THREE.Color();

/** Max visual bank lift of the outer road edge (m). */
const BANK_MAX = 0.55;

/**
 * Visual banking: the outer side of a curve rises a little (CTR feel).
 * Zero on the centre line (track.world stays the physics truth), linear
 * across the road, held over the kerb / barrier and faded out on the verge.
 */
export function bankLift(track: Track, p: number, d: number): number {
    const kappa = track.curvature(p);
    // Outer side: d and kappa have opposite signs (kappa > 0 turns right).
    if (kappa * d >= 0) {
        return 0;
    }
    // Rises across the road, held over the kerb, back to 0 before the
    // barrier line (posts / props placed on the flat ground stay put).
    const edge = track.halfWidth + 1;
    const a = Math.abs(d);
    const dd = Math.min(a, edge);
    const fade = a <= edge ? 1 : Math.max(0, 1 - (a - edge) / 2);
    return Math.min(BANK_MAX, Math.abs(kappa) * dd * 1.1) * fade;
}

/** Roll angle (radians, right side up positive) of the banked road at (p, d). */
export function bankRoll(track: Track, p: number, d: number): number {
    const a = bankLift(track, p, d + 0.5);
    const b = bankLift(track, p, d - 0.5);
    return Math.atan(a - b);
}

/**
 * Lateral offset kept inside the curve on the inner side (kappa * d may
 * not exceed 0.85, else the strip folds over itself on hairpins).
 */
export function innerClamp(d: number, kappa: number): number {
    if (kappa * d <= 0 || Math.abs(kappa) < 1e-6) {
        return d;
    }
    const limit = 0.85 / Math.abs(kappa);
    return Math.abs(d) > limit ? Math.sign(d) * limit : d;
}

/**
 * Builds an indexed geometry with position, normal, uv and colour.
 * Profiles must go from left (-d) to right (+d) or bottom-up on the left
 * face so triangles face outwards/upwards (see winding note in the code).
 */
export function sweep(
    track: Track,
    profile: ProfilePoint[],
    opts: SweepOptions,
): THREE.BufferGeometry {
    const points = profile;
    const k = points.length;
    const span = Math.max(0.01, opts.to - opts.from);
    const rows = Math.max(1, Math.round(span / opts.step));
    const vPerMetre = opts.vPerMetre ?? 1 / 8;
    const positions = new Float32Array((rows + 1) * k * 3);
    const uvs = new Float32Array((rows + 1) * k * 2);
    const colors = new Float32Array((rows + 1) * k * 3);
    for (let r = 0; r <= rows; r++) {
        const p = opts.from + (span * r) / rows;
        const h = track.headingAt(p);
        const [cx, cy, cz] = track.world(p, 0);
        const lift = opts.lift ? opts.lift(p) : 0;
        const shift = opts.shift ? opts.shift(p) : 0;
        const kappa = opts.clampInner === false ? 0 : track.curvature(p);
        const sx = -Math.sin(h);
        const sz = Math.cos(h);
        const banked = opts.bank !== false;
        for (let j = 0; j < k; j++) {
            const pt = points[j];
            const o = (r * k + j) * 3;
            const d = innerClamp(pt.d + shift, kappa);
            positions[o] = cx + sx * d;
            positions[o + 1] =
                cy +
                pt.y +
                (pt.fixed ? 0 : lift) +
                (banked ? bankLift(track, p, d) : 0);
            positions[o + 2] = cz + sz * d;
            color.set((opts.paint && opts.paint(p, j)) || pt.color || '#fff');
            colors[o] = color.r;
            colors[o + 1] = color.g;
            colors[o + 2] = color.b;
            uvs[(r * k + j) * 2] = pt.u ?? j / Math.max(1, k - 1);
            uvs[(r * k + j) * 2 + 1] = (p - opts.from) * vPerMetre;
        }
    }
    // Quad (a = row r point j, b = j+1, c = row r+1 point j, d = c+1):
    // triangles (a, b, c) and (b, d, c) face along right x forward = up.
    const index: number[] = [];
    for (let r = 0; r < rows; r++) {
        for (let j = 0; j < k - 1; j++) {
            const a = r * k + j;
            const b = a + 1;
            const c = a + k;
            const d = c + 1;
            index.push(a, b, c, b, d, c);
        }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    g.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
    g.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    g.setIndex(index);
    if (opts.hard) {
        const flat = g.toNonIndexed();
        g.dispose();
        flat.computeVertexNormals();
        flat.computeBoundingSphere();
        return flat;
    }
    g.computeVertexNormals();
    g.computeBoundingSphere();
    return g;
}

/** Profile of a rectangular bar (rail) centred at lateral d. */
export function barProfile(
    d: number,
    y0: number,
    y1: number,
    halfThick: number,
    colorTop: string,
    colorSide = colorTop,
): ProfilePoint[] {
    return [
        { d: d - halfThick, y: y0, color: colorSide },
        { d: d - halfThick, y: y1, color: colorSide },
        { d: d + halfThick, y: y1, color: colorTop },
        { d: d + halfThick, y: y0, color: colorSide },
    ];
}

/** Ramp lift above the road at progress p (0 outside the wedge). */
export function rampLift(
    track: Track,
    p: number,
    ramps: { s: number; len: number }[],
    height: number,
): number {
    const s = track.wrap(p);
    for (const r of ramps) {
        const into = track.wrap(s - (r.s - r.len));
        if (into <= r.len) {
            return (height * into) / r.len;
        }
    }
    return 0;
}
