/**
 * Pure helpers of the EduKart scene (no three.js, no DOM): colour
 * sanitising, seeded randomness, noise, label wrapping and countdown
 * bulbs. Relative imports only, so `node --test` can load it.
 */

/** Fallback kart colours per racer index (bright CTR-like palette). */
export const KART_PALETTE = [
    '#e53935',
    '#1e88e5',
    '#43a047',
    '#fdd835',
    '#8e24aa',
    '#fb8c00',
    '#00acc1',
    '#ec407a',
] as const;

/** Box colours of a true/false gate (BENAR, SALAH), same as the HUD. */
export const TF_COLORS = ['#16a34a', '#dc2626'] as const;
/** Box colours of a choice gate (A, B, C, D), same as the HUD options. */
export const CHOICE_COLORS = ['#2563eb', '#e11d48', '#ca8a04', '#16a34a'];

/** Relative luminance (0..1) of a `#rrggbb` colour. */
export function luminance(hex: string): number {
    const safe = sanitizeHex(hex, '#999999');
    const num = parseInt(safe.slice(1), 16);
    const lin = (c: number) => {
        const v = c / 255;
        return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
    };
    return (
        0.2126 * lin((num >> 16) & 255) +
        0.7152 * lin((num >> 8) & 255) +
        0.0722 * lin(num & 255)
    );
}

/** `#rgb` / `#rrggbb` only (lower case `#rrggbb` out), else the fallback. */
export function sanitizeHex(value: unknown, fallback: string): string {
    if (typeof value !== 'string') {
        return fallback;
    }
    const v = value.trim();
    if (/^#[0-9a-fA-F]{6}$/.test(v)) {
        return v.toLowerCase();
    }
    if (/^#[0-9a-fA-F]{3}$/.test(v)) {
        return `#${v
            .slice(1)
            .split('')
            .map((c) => c + c)
            .join('')
            .toLowerCase()}`;
    }
    return fallback;
}

/** Kart body colour for a racer: its own colour when valid, else palette. */
export function racerColor(color: unknown, racer: number): string {
    const index = Number.isFinite(racer) ? Math.abs(Math.floor(racer)) : 0;
    return sanitizeHex(color, KART_PALETTE[index % KART_PALETTE.length]);
}

/** Lighten (amount > 0) or darken (amount < 0) a `#rrggbb` colour. */
export function shadeHex(hex: string, amount: number): string {
    const safe = sanitizeHex(hex, '#999999');
    const num = parseInt(safe.slice(1), 16);
    const channel = (shift: number): string => {
        const c = (num >> shift) & 255;
        const next = amount < 0 ? c * (1 + amount) : c + (255 - c) * amount;
        return Math.max(0, Math.min(255, Math.round(next)))
            .toString(16)
            .padStart(2, '0');
    };
    return `#${channel(16)}${channel(8)}${channel(0)}`;
}

/** Box colours of an answer gate. */
export function laneColors(kind: 'tf' | 'choice', n: number): string[] {
    const out: string[] = [];
    for (let i = 0; i < n; i++) {
        out.push(
            kind === 'tf' && n === 2
                ? TF_COLORS[i]
                : CHOICE_COLORS[i % CHOICE_COLORS.length],
        );
    }
    return out;
}

/** Deterministic 32-bit PRNG (mulberry32), returns [0, 1). */
export function seededRandom(seed: number): () => number {
    let a = seed >>> 0;
    return () => {
        a = (a + 0x6d2b79f5) >>> 0;
        let t = a;
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

/** FNV-1a hash of a string (seeds per track). */
export function hashString(text: string): number {
    let h = 0x811c9dc5;
    for (let i = 0; i < text.length; i++) {
        h ^= text.charCodeAt(i);
        h = Math.imul(h, 0x01000193);
    }
    return h >>> 0;
}

export function clamp(v: number, min: number, max: number): number {
    return v < min ? min : v > max ? max : v;
}

export function smoothstep(edge0: number, edge1: number, x: number): number {
    const t = clamp((x - edge0) / (edge1 - edge0), 0, 1);
    return t * t * (3 - 2 * t);
}

/** Smooth 2D value noise in [-1, 1] with two octaves. */
export function valueNoise(seed: number): (x: number, z: number) => number {
    const lattice = (ix: number, iz: number): number => {
        let h = Math.imul(ix, 374761393) ^ Math.imul(iz, 668265263) ^ seed;
        h = Math.imul(h ^ (h >>> 13), 1274126177);
        return (((h ^ (h >>> 16)) >>> 0) / 4294967295) * 2 - 1;
    };
    const octave = (x: number, z: number): number => {
        const ix = Math.floor(x);
        const iz = Math.floor(z);
        const fx = x - ix;
        const fz = z - iz;
        const ux = fx * fx * (3 - 2 * fx);
        const uz = fz * fz * (3 - 2 * fz);
        const a = lattice(ix, iz);
        const b = lattice(ix + 1, iz);
        const c = lattice(ix, iz + 1);
        const d = lattice(ix + 1, iz + 1);
        return a + (b - a) * ux + (c - a) * uz + (a - b - c + d) * ux * uz;
    };
    return (x, z) => octave(x, z) * 0.7 + octave(x * 2.3 + 17, z * 2.3) * 0.3;
}

/**
 * Word-wraps `text` into at most `maxLines` lines no wider than `maxWidth`.
 * Words longer than a line are split; when it still overflows, the last
 * line ends with an ellipsis.
 */
export function wrapWords(
    text: string,
    measure: (s: string) => number,
    maxWidth: number,
    maxLines: number,
): { lines: string[]; overflow: boolean } {
    const words = text.trim().split(/\s+/).filter(Boolean);
    const lines: string[] = [];
    let line = '';
    for (const word of words) {
        let w = word;
        while (w.length > 1 && measure(w) > maxWidth) {
            let k = w.length - 1;
            while (k > 1 && measure(w.slice(0, k)) > maxWidth) {
                k--;
            }
            if (line) {
                lines.push(line);
                line = '';
            }
            lines.push(w.slice(0, k));
            w = w.slice(k);
        }
        const next = line ? `${line} ${w}` : w;
        if (measure(next) <= maxWidth) {
            line = next;
        } else {
            if (line) {
                lines.push(line);
            }
            line = w;
        }
    }
    if (line) {
        lines.push(line);
    }
    if (lines.length <= maxLines) {
        return { lines, overflow: false };
    }
    const kept = lines.slice(0, Math.max(1, maxLines));
    let last = `${kept[kept.length - 1]}…`;
    while (last.length > 1 && measure(last) > maxWidth) {
        last = `${last.slice(0, -2)}…`;
    }
    kept[kept.length - 1] = last;
    return { lines: kept, overflow: true };
}

/**
 * Biggest font size (step 2 px, from `maxSize` down to `minSize`) at which
 * the text fits `maxLines` lines; `measureAt(text, size)` measures a run.
 */
export function fitLabel(
    text: string,
    measureAt: (s: string, size: number) => number,
    maxWidth: number,
    maxHeight: number,
    maxLines: number,
    maxSize: number,
    minSize: number,
): { size: number; lines: string[] } {
    for (let size = maxSize; size >= minSize; size -= 2) {
        const fitLines = Math.min(
            maxLines,
            Math.floor(maxHeight / (size * 1.15)),
        );
        if (fitLines < 1) {
            continue;
        }
        const res = wrapWords(
            text,
            (s) => measureAt(s, size),
            maxWidth,
            fitLines,
        );
        const longest = Math.max(
            0,
            ...text
                .trim()
                .split(/\s+/)
                .map((w) => measureAt(w, size)),
        );
        if (!res.overflow && longest <= maxWidth) {
            return { size, lines: res.lines };
        }
    }
    const lines = Math.max(
        1,
        Math.min(maxLines, Math.floor(maxHeight / (minSize * 1.15))),
    );
    return {
        size: minSize,
        lines: wrapWords(text, (s) => measureAt(s, minSize), maxWidth, lines)
            .lines,
    };
}

/** Strips a leading option letter ("A. ", "b) ") from a choice label. */
export function stripOptionLetter(label: string): string {
    return label.replace(/^\s*[A-Da-d]\s*[.):-]\s*/, '').trim() || label;
}

export type BulbState = 'off' | 'red' | 'green';

/**
 * Three start bulbs: 3 = one red, 2 = two red, 1 = three red, 0 = all
 * green (GO), null = off (racing).
 */
export function lightBulbs(lights: number | null): BulbState[] {
    if (lights === null || !Number.isFinite(lights) || lights > 3) {
        return ['off', 'off', 'off'];
    }
    if (lights <= 0) {
        return ['green', 'green', 'green'];
    }
    const red = 4 - Math.round(lights);
    return [0, 1, 2].map((i) => (i < red ? 'red' : 'off'));
}
