/**
 * Contract between the EduKart page (netcode, HUD, controls) and the 3D
 * scene (lib/edu-kart/scene.ts). The page owns timing and data; the scene
 * only draws what `render()` gets. Keep this file free of three.js imports.
 */
import type {
    Hazard,
    ItemKind,
    Projectile,
    RaceEvent,
    RacerInfo,
} from './protocol';

/** One kart as the scene draws it (track space, already predicted/interpolated). */
export interface SceneKart {
    racer: number;
    p: number;
    d: number;
    /** Height above the road (hop / jump), metres. */
    y: number;
    /** Yaw relative to the road direction, radians (right positive). */
    psi: number;
    /** Speed m/s (wheel spin, exhaust). */
    v: number;
    drifting: boolean;
    drift_dir: number;
    /** Turbo meter 0..1.35 (smoke turns dark from 0.7). */
    charge: number;
    boosting: boolean;
    stunned: boolean;
    shield: boolean;
    /** TNT crate sitting on the kart. */
    tnt: boolean;
    juiced: boolean;
    finished: boolean;
}

/** Answer gate as drawn on the road. */
export interface SceneGate {
    id: string;
    /** Unwrapped progress of the box row. */
    at: number;
    /** Zone start (speed cap area, drawn as a coloured strip). */
    zone: number;
    kind: 'tf' | 'choice';
    /** Labels already localised by the page (e.g. "BENAR"/"SALAH", "A. Jakarta"). */
    labels: string[];
    /** Lane the player's kart is currently in (highlight), -1 none. */
    aim: number;
    /** After the answer: index of the box the player hit and whether it was right. */
    result: { choice: number; correct: boolean; answer: number | null } | null;
}

export interface SceneView {
    /** Seconds since scene start (animation clock). */
    time: number;
    /** The viewer's racer index (camera target), -1 = spectate racer 0. */
    you: number;
    karts: SceneKart[];
    projectiles: Projectile[];
    hazards: Hazard[];
    gate: SceneGate | null;
    /** Fruit indexes (track.fruits) the viewer already took this lap (hidden). */
    taken: number[];
    /** Countdown lights: 3, 2, 1, 0 = GO, null = racing. */
    lights: number | null;
}

export interface SceneOptions {
    /** pointer: coarse (phones): lower pixel ratio, no shadows, fewer props. */
    coarse: boolean;
    reducedMotion: boolean;
}

/** Public surface of `EduKartScene` (scene.ts implements it). */
export interface EduKartSceneApi {
    setRacers(racers: RacerInfo[]): void;
    render(view: SceneView): void;
    /** One-shot visual effects for race events (explosions, sparks, pickups). */
    effect(event: RaceEvent): void;
    /** Item fired by the viewer before the server confirms (instant feedback). */
    localFire(item: ItemKind): void;
    dispose(): void;
}

/**
 * scene.ts exports `createEduKartScene: EduKartSceneFactory`. The page loads
 * it with a dynamic `import('@/lib/edu-kart/scene')` so three.js stays out of
 * other pages' bundles. The scene owns its canvas (appended to `host`), a
 * ResizeObserver and its own rAF-free draw: the page calls `render()` from
 * its single requestAnimationFrame loop.
 */
export type EduKartSceneFactory = (
    host: HTMLElement,
    track: import('./track').Track,
    options: SceneOptions,
) => EduKartSceneApi;
