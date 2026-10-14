/**
 * Pure maths shared by the 3D character renderer and the classroom avatar:
 * camera framing of the 2D view box, the ground shadow and the classroom
 * walk/emote pose. No runtime imports so `node --test` can load it.
 */
import type { CharacterPose } from './draw-character';

/** Orthographic frustum + camera placement for the avatar view box. */
export interface ViewFraming {
    left: number;
    right: number;
    top: number;
    bottom: number;
    /** Height (units above the feet) the camera looks at. */
    targetY: number;
    /** Camera position (units, feet at the origin). */
    eye: [number, number, number];
}

/**
 * Frames the same square box as the 2D avatar (`viewUnits` wide, feet
 * `feetY` units below the top edge) with a camera tilted `tiltDeg` down.
 * The vertical frustum is shortened by cos(tilt) so an upright character
 * keeps exactly the height it has in 2D and the feet land on `feetY`.
 */
export function frameView(
    viewUnits: number,
    feetY: number,
    tiltDeg: number,
    distance = 300,
): ViewFraming {
    const tilt = (tiltDeg * Math.PI) / 180;
    const half = viewUnits / 2;
    const vertical = half * Math.cos(tilt);
    const targetY = feetY - half;
    return {
        left: -half,
        right: half,
        top: vertical,
        bottom: -vertical,
        targetY,
        eye: [
            0,
            targetY + Math.sin(tilt) * distance,
            Math.cos(tilt) * distance,
        ],
    };
}

/** Screen-space fraction (0 top .. 1 bottom) of a point on the y axis. */
export function projectHeight(
    framing: ViewFraming,
    y: number,
    tiltDeg: number,
): number {
    const tilt = (tiltDeg * Math.PI) / 180;
    const v = (y - framing.targetY) * Math.cos(tilt);
    return (framing.top - v) / (framing.top - framing.bottom);
}

/** Ground shadow under the feet; shrinks while the character is in the air. */
export interface FeetShadow {
    alpha: number;
    rx: number;
    ry: number;
}

/** Same maths as the 2D avatar shadow. Writes into `out` (no allocation). */
export function feetShadow(bob: number, out: FeetShadow): FeetShadow {
    const lift = Math.max(0, Math.min(1, bob / 10));
    out.alpha = 0.18 - lift * 0.08;
    out.rx = 16 * (1 - lift * 0.3);
    out.ry = 5 * (1 - lift * 0.3);
    return out;
}

/** WebGL render size for a target size in device pixels. */
export function renderPixelSize(pixels: number, max = 512): number {
    if (!Number.isFinite(pixels) || pixels < 1) {
        return 1;
    }
    return Math.min(max, Math.round(pixels));
}

/** Highest front-arm raise used by the 2D idle animation. */
const FRONT_ARM_LIMIT = -2.1;

/**
 * Classroom walk / idle / emote pose. `t` seconds, `speed` 0..1, `emoteAge`
 * seconds since the emote started. Writes into `out` (no allocation).
 */
export function classroomPose(
    t: number,
    speed: number,
    emote: string | null,
    emoteAge: number,
    out: CharacterPose,
): CharacterPose {
    const walking = speed > 0.05;
    const step = Math.sin(t * 10);
    out.phase = walking ? step * speed : 0;
    out.bob = walking
        ? Math.abs(step) * 2.5 * speed
        : (Math.sin(t * 2) + 1) * 0.4;
    out.facingBack = false;
    out.flip = 1;
    out.lean = 0;
    out.squash = 0;
    out.headTilt = walking ? 0 : Math.sin(t * 1.3) * 0.05;
    out.armBack = undefined;
    out.armFront = undefined;
    out.blink = false;

    if (emote && emoteAge >= 0 && emoteAge < 1.6) {
        const k = Math.sin(emoteAge * 14);
        if (emote === 'wave') {
            out.armFront = Math.max(FRONT_ARM_LIMIT, -1.9 + k * 0.2);
        } else if (emote === 'clap') {
            out.armFront = -1.3 - k * 0.2;
            out.armBack = -1.3 - k * 0.2;
        } else if (emote === 'jump') {
            const air = Math.max(
                0,
                Math.sin((Math.min(emoteAge, 0.6) / 0.6) * Math.PI),
            );
            out.bob = air * 25;
            out.squash = -air * 0.06;
            out.armFront = -2.4;
            out.armBack = 2.4;
        }
    }
    return out;
}
