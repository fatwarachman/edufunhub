/**
 * 3D version of the chibi player character drawn by draw-character.ts: same
 * proportions (big round head r=17, small rounded body, short arms, booted
 * legs), same face, hair and outfits, with the thick ink outline. Units match
 * the 2D drawing (1 unit = 1 px), feet at y = 0, +y up, face toward +z.
 * Items (hats, weapons, ...) come from model3d-items.ts.
 */
import * as THREE from 'three';
import { TessellateModifier } from 'three/examples/jsm/modifiers/TessellateModifier.js';
import { mergeVertices } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import {
    CHARACTER_SHIRTS,
    type CharacterLook,
    type CharacterPose,
    HAIR_COLORS,
    resolveItems,
    SKIN_TONES,
    STANDING_POSE,
} from './draw-character';
import { attachItems, coversHair } from './model3d-items';
import {
    FACE_TILT,
    geo,
    headPoint,
    INK,
    part,
    safeColor,
    shade,
} from './model3d-kit';

export interface CharacterRig {
    /** Feet at the origin; add this to the scene. */
    root: THREE.Group;
    /** Lean / squash / bob pivot at the feet. */
    body: THREE.Group;
    /** Pivot at the neck (0, 33, 0); hats and face items attach here. */
    head: THREE.Group;
    /** Pivot at the shoulder (11, 29, 0); the hand sits at (0, -12.5, 0). */
    armFront: THREE.Group;
    /** Pivot at the shoulder (-11, 29, 0); the shield attaches here. */
    armBack: THREE.Group;
    /** Pivot at the hip (4, 14, 0). */
    legFront: THREE.Group;
    /** Pivot at the hip (-4, 14, 0). */
    legBack: THREE.Group;
    /** Cape / wings anchor on the back (0, 30, -6). */
    backSlot: THREE.Group;
    /** Open eyes (hidden on blink). */
    eyes: THREE.Object3D[];
    /** Closed-eye curves (shown on blink). */
    blinkLines: THREE.Object3D[];
    look: CharacterLook;
    /** Top of the tallest part incl. hat, units above the feet. */
    top: number;
}

/** Default height of the character without a tall hat. */
export const CHARACTER_TOP = 80;

const NECK_Y = 33;
const SHOULDER_X = 11;
const SHOULDER_Y = 29;
const HIP_X = 4;
const HIP_Y = 14;
/** Head centre in head-group coordinates (above the neck pivot). */
const HEAD_CY = 17;
const HEAD_R = 17;
/** 2D HEAD_X = 1: the head sits 1 unit toward the face side. */
const HEAD_CX = 1;
/**
 * Equivalent yaw of the face (radians, around the head's y axis) for the 2D
 * 3/4 view. Face features are placed by projecting the 2D offsets onto the
 * head (eyes at 2D x = +6 and +13), which matches this turn.
 */
export const FACE_TURN = 0.6;
/** Torso depth relative to its width. */
const TORSO_DEPTH = 0.68;

const TROUSERS = '#2b3150';
const BOOTS = '#5b3a22';
const GOLD = '#f2c14e';
const SILVER = '#c9ced6';
const DRESS_BAND = '#ff7eb6';
const BLUSH = '#ff7882';
const WHITE = '#ffffff';

type Profile = readonly (readonly [number, number])[];

/** Torso outlines as (radius, y) lathe profiles, like the 2D round rects. */
const PROFILES: Record<string, Profile> = {
    tunic: [
        [0, 12],
        [8, 12],
        [10.4, 13],
        [11, 15],
        [11, 22],
        [10.2, 27],
        [8.6, 30.5],
        [6, 32.2],
        [0, 32.6],
    ],
    armor: [
        [0, 12],
        [9, 12],
        [11.4, 13],
        [12, 15],
        [12, 23],
        [11.2, 27.5],
        [9.4, 31],
        [6.5, 32.4],
        [0, 32.8],
    ],
    robe: [
        [0, 3],
        [12.5, 3],
        [13.8, 3.8],
        [14, 5],
        [12.6, 15],
        [11, 25],
        [9.4, 30.5],
        [7, 32.3],
        [0, 32.6],
    ],
    dress: [
        [0, 17.5],
        [9, 17.5],
        [10, 19],
        [10, 25],
        [9.3, 29],
        [7.8, 31.6],
        [5, 32.5],
        [0, 32.7],
    ],
};

function own<T>(
    table: Record<string, T>,
    key: string | null | undefined,
): T | undefined {
    return key && Object.hasOwn(table, key) ? table[key] : undefined;
}

function profileRadius(profile: Profile, y: number): number {
    for (let i = 1; i < profile.length; i++) {
        const [r0, y0] = profile[i - 1];
        const [r1, y1] = profile[i];
        if (y >= Math.min(y0, y1) && y <= Math.max(y0, y1) && y1 !== y0) {
            return r0 + ((y - y0) / (y1 - y0)) * (r1 - r0);
        }
    }
    return 0;
}

function profileMid(profile: Profile): number {
    return (profile[0][1] + profile[profile.length - 1][1]) / 2;
}

/** Lathe torso, centred on its own origin so the ink hull stays even. */
function torsoGeometry(key: string, profile: Profile): THREE.BufferGeometry {
    return geo(`body:torso:${key}`, () => {
        const mid = profileMid(profile);
        const points = profile.map(([r, y]) => new THREE.Vector2(r, y - mid));
        const g = new THREE.LatheGeometry(points, 28);
        g.computeVertexNormals();
        return g;
    });
}

function sphere(r: number, w = 20, h = 14): THREE.BufferGeometry {
    return geo(
        `body:sphere:${r}:${w}:${h}`,
        () => new THREE.SphereGeometry(r, w, h),
    );
}

function capsule(r: number, length: number): THREE.BufferGeometry {
    return geo(
        `body:capsule:${r}:${length}`,
        () => new THREE.CapsuleGeometry(r, length, 4, 10),
    );
}

function cylinder(
    top: number,
    bottom: number,
    height: number,
): THREE.BufferGeometry {
    return geo(
        `body:cyl:${top}:${bottom}:${height}`,
        () => new THREE.CylinderGeometry(top, bottom, height, 28),
    );
}

function box(w: number, h: number, d: number): THREE.BufferGeometry {
    return geo(`body:box:${w}:${h}:${d}`, () => new THREE.BoxGeometry(w, h, d));
}

function torus(r: number, tube: number, arc: number): THREE.BufferGeometry {
    return geo(
        `body:torus:${r}:${tube}:${arc}`,
        () => new THREE.TorusGeometry(r, tube, 6, 14, arc),
    );
}

/**
 * Slice of the torso surface between y0 and y1, pushed out a little: used
 * for the 2D fillRect bands and strips so they hug the body exactly.
 */
function shell(
    parent: THREE.Group,
    key: string,
    profile: Profile,
    y0: number,
    y1: number,
    color: string,
    phiLength = Math.PI * 2,
): void {
    const g = geo(`body:shell:${key}:${y0}:${y1}:${phiLength}`, () => {
        const points: THREE.Vector2[] = [];
        const steps = 6;
        for (let i = 0; i <= steps; i++) {
            const y = y0 + ((y1 - y0) * i) / steps;
            points.push(new THREE.Vector2(profileRadius(profile, y) + 0.45, y));
        }
        const lathe = new THREE.LatheGeometry(
            points,
            phiLength < Math.PI ? 4 : 28,
            -phiLength / 2,
            phiLength,
        );
        lathe.computeVertexNormals();
        return lathe;
    });
    const piece = part(g, color, [0, 0, 0], { outline: 0 });
    piece.scale.z = TORSO_DEPTH;
    parent.add(piece);
}

/** Full ring band centred at y (2D horizontal fillRect). */
function band(
    parent: THREE.Group,
    key: string,
    profile: Profile,
    y: number,
    height: number,
    color: string,
): void {
    shell(parent, key, profile, y - height / 2, y + height / 2, color);
}

/** Front surface z of the torso at (x, y). */
function torsoFront(profile: Profile, x: number, y: number): number {
    const r = profileRadius(profile, y);
    return TORSO_DEPTH * Math.sqrt(Math.max(0, r * r - x * x));
}

function addTorso(
    parent: THREE.Group,
    key: string,
    profile: Profile,
    color: string,
): void {
    const torso = part(torsoGeometry(key, profile), color, [
        0,
        profileMid(profile),
        0,
    ]);
    torso.scale.z = TORSO_DEPTH;
    parent.add(torso);
}

/** Builds the outfit like drawOutfit() and returns the sleeve colour. */
function buildOutfit(
    parent: THREE.Group,
    look: CharacterLook,
    style: string,
    itemColor: string | null | undefined,
): string {
    const baseColor = safeColor(look.color, '#f5a623');
    const [shirt, shirtDark] = own(CHARACTER_SHIRTS, look.color) ?? [
        baseColor,
        shade(baseColor, -0.25),
    ];
    const color = safeColor(itemColor, shirt);
    switch (style) {
        case 'robe': {
            const profile = PROFILES.robe;
            addTorso(parent, 'robe', profile, color);
            shell(parent, 'robe', profile, 4, 31, GOLD, 0.3);
            band(parent, 'robe', profile, 5.75, 2.5, GOLD);
            return color;
        }
        case 'dress': {
            const profile = PROFILES.dress;
            addTorso(parent, 'dress', profile, color);
            const skirt = part(
                cylinder(9.3, 15, 13),
                shade(color, 0.15),
                [0, 12.5, 0],
            );
            skirt.scale.z = 0.75;
            parent.add(skirt);
            const ring = part(cylinder(10.3, 10.3, 3), DRESS_BAND, [0, 19, 0], {
                outline: 0,
            });
            ring.scale.z = 0.75;
            parent.add(ring);
            return color;
        }
        case 'armor': {
            const profile = PROFILES.armor;
            addTorso(parent, 'armor', profile, color);
            const plate = geo('body:armor-plate', () => {
                const shape = new THREE.Shape();
                shape.moveTo(-8, 7);
                shape.lineTo(8, 7);
                shape.lineTo(6, -7);
                shape.lineTo(-6, -7);
                shape.closePath();
                const g = new THREE.ExtrudeGeometry(shape, {
                    depth: 1.4,
                    bevelEnabled: true,
                    bevelThickness: 0.4,
                    bevelSize: 0.4,
                    bevelSegments: 1,
                });
                g.translate(0, 0, -0.7);
                g.computeVertexNormals();
                return g;
            });
            // Opaque flat-lit breastplate (2D ink(shade(+0.25), 1.6)).
            parent.add(
                part(
                    plate,
                    shade(color, 0.25),
                    [0, 23, torsoFront(profile, 0, 23) + 0.3],
                    { flat: true, ink: 1.6 },
                ),
            );
            // Gold belt as a straight ring just outside the hips.
            const belt = part(cylinder(12.6, 12.6, 3), GOLD, [0, 13.5, 0], {
                flat: true,
                outline: 0,
            });
            belt.scale.z = TORSO_DEPTH + 0.06;
            parent.add(belt);
            // Round shoulder pads r=5 (2D ink(shade(-0.15), 1.8)).
            for (const side of [-1, 1]) {
                const pad = part(
                    sphere(5),
                    shade(color, -0.15),
                    [side * 12, 30, 0.5],
                    { ink: 1.8 },
                );
                pad.scale.z = 0.85;
                parent.add(pad);
            }
            return color;
        }
        case 'leather': {
            const profile = PROFILES.tunic;
            addTorso(parent, 'tunic', profile, color);
            // Dark leather belt (2D fillRect y 14.5..18), flat-lit so it
            // keeps the 2D contrast.
            const belt = part(
                cylinder(11.45, 11.45, 3.5),
                shade(color, -0.3),
                [0, 16.25, 0],
                { flat: true, outline: 0 },
            );
            belt.scale.z = TORSO_DEPTH + 0.05;
            parent.add(belt);
            for (const x of [-6, 0, 6]) {
                const stud = part(
                    sphere(1.45, 12, 10),
                    SILVER,
                    [x, 26, torsoFront(profile, x, 26) + 0.35],
                    { flat: true, outline: 0 },
                );
                stud.scale.z = 0.6;
                parent.add(stud);
            }
            parent.add(
                part(
                    box(4, 4.5, 1.2),
                    GOLD,
                    [0, 16.25, torsoFront(profile, 0, 16.25) + 0.9],
                    { flat: true, outline: 0 },
                ),
            );
            return color;
        }
        default: {
            const profile = PROFILES.tunic;
            addTorso(parent, 'tunic', profile, shirt);
            band(parent, 'tunic', profile, 15.5, 3, shirtDark);
            return shirt;
        }
    }
}

function buildArm(
    x: number,
    side: number,
    sleeve: string,
    skin: string,
): THREE.Group {
    const pivot = new THREE.Group();
    pivot.position.set(x, SHOULDER_Y, 0);
    pivot.rotation.order = 'ZXY';
    /** The A-pose splay comes from poseArm (2D angle maps to z). */
    const limb = new THREE.Group();
    limb.add(
        part(capsule(3, 5), shade(sleeve, -0.12), [0, -5.5, 0], {
            outline: 0.9,
        }),
    );
    limb.add(
        part(sphere(3.2, 14, 10), skin, [0, -12.5, 0.3], { outline: 0.9 }),
    );
    pivot.add(limb);
    return pivot;
}

function buildLeg(x: number): THREE.Group {
    const pivot = new THREE.Group();
    pivot.position.set(x, HIP_Y, 0);
    pivot.add(part(capsule(3, 6), TROUSERS, [0, -5, 0], { outline: 0.9 }));
    const boot = part(capsule(2.4, 4), BOOTS, [0, -HIP_Y + 2.4, 1], {
        outline: 0.9,
    });
    boot.rotation.x = Math.PI / 2;
    boot.scale.x = 1.35;
    pivot.add(boot);
    return pivot;
}

const Z_AXIS = new THREE.Vector3(0, 0, 1);
/** Direction toward the default (slightly top-down) avatar camera. */
const VIEW_DIR = new THREE.Vector3(0, Math.sin(FACE_TILT), Math.cos(FACE_TILT));

/**
 * Group lying on the face where the default camera sees the 2D offset
 * (x, y) from the 2D head centre (y up), its +z along the surface normal.
 * Using the 2D numbers directly gives the 2D 3/4 face turned to the right.
 */
function faceAnchor(x: number, y: number, lift = 0, facing = 0.7): THREE.Group {
    const p = headPoint(x, y, lift);
    const n = new THREE.Vector3(p.x - HEAD_CX, p.y - HEAD_CY, p.z).normalize();
    // Lean flat features toward the camera so they keep their 2D size.
    n.addScaledVector(VIEW_DIR, facing).normalize();
    const anchor = new THREE.Group();
    anchor.position.copy(p);
    anchor.quaternion.setFromUnitVectors(Z_AXIS, n);
    return anchor;
}

/** Hair shell over the skull, tilted back so the back is covered lower. */
function hairCap(
    parent: THREE.Group,
    color: string,
    radius: number,
    tiltX: number,
    tiltZ: number,
): void {
    const g = geo(
        `body:hair-cap:${radius}`,
        () =>
            new THREE.SphereGeometry(
                radius,
                32,
                16,
                0,
                Math.PI * 2,
                0,
                Math.PI * 0.45,
            ),
    );
    const skull = new THREE.Group();
    skull.position.set(HEAD_CX, HEAD_CY, 0);
    const cap = part(g, color);
    cap.rotation.set(tiltX, 0, tiltZ);
    skull.add(cap);
    parent.add(skull);
}

/**
 * 2D hair silhouette (head-centre coords, y up) made solid and wrapped over
 * the head: inside the head disc the surface follows a sphere just above
 * the skull, outside (spikes) it tapers to a slab. Built in the camera's
 * view frame so the default view shows exactly the 2D shape.
 */
function wrappedHair(
    key: string,
    points: readonly number[],
    curve?: (shape: THREE.Shape) => void,
): THREE.BufferGeometry {
    return geo(`body:wrap-hair:${key}`, () => {
        const shape = new THREE.Shape();
        if (curve) {
            curve(shape);
        } else {
            shape.moveTo(points[0], points[1]);
            for (let i = 2; i < points.length; i += 2) {
                shape.lineTo(points[i], points[i + 1]);
            }
            shape.closePath();
        }
        const solid = new THREE.ExtrudeGeometry(shape, {
            depth: 2,
            bevelEnabled: false,
            curveSegments: 10,
        });
        let g: THREE.BufferGeometry = new TessellateModifier(1.6, 8).modify(
            solid,
        );
        g.deleteAttribute('normal');
        g.deleteAttribute('uv');
        g = mergeVertices(g, 1e-3);
        const position = g.getAttribute('position');
        const shell = HEAD_R + 1.6;
        for (let i = 0; i < position.count; i++) {
            const x = position.getX(i);
            const y = position.getY(i);
            const t = position.getZ(i) - 1;
            const r2 = x * x + y * y;
            const dome = Math.sqrt(Math.max(0, shell * shell - r2));
            const slab = Math.max(
                2.2,
                0.6 * Math.sqrt(Math.max(0, (shell + 8) ** 2 - r2)),
            );
            position.setZ(i, t * Math.max(dome, slab));
        }
        g.rotateX(-FACE_TILT);
        g.translate(HEAD_CX, HEAD_CY, 0);
        g.computeVertexNormals();
        return g;
    });
}

/** 2D boy hair poly (drawHead), relative to the head centre, y up. */
const BOY_HAIR = [
    -17, -2, -19, 12, -11, 15, -10, 24, -2, 18, 4, 26, 8, 17, 17, 20, 17, 9, 19,
    4, 10, 8, 5, 4, -2, 8, -9, 4,
] as const;

/**
 * Hair over the back of the skull down to the nape (2D facingBack shape):
 * hidden behind the head from the front, seen when the rig turns around.
 */
function hairBack(parent: THREE.Group, color: string): void {
    const g = geo(
        'body:hair-back',
        () =>
            new THREE.SphereGeometry(
                HEAD_R + 0.7,
                28,
                16,
                Math.PI + 0.2,
                Math.PI - 0.4,
                0,
                Math.PI * 0.8,
            ),
    );
    parent.add(part(g, color, [HEAD_CX, HEAD_CY, 0]));
}

function buildBoyHair(
    parent: THREE.Group,
    hair: string,
    covered: boolean,
): void {
    hairCap(parent, hair, 17.8, -0.75, 0);
    hairBack(parent, hair);
    if (covered) {
        // 2D covered fringe: arc over the top + zigzag over the brows.
        const g = wrappedHair('boy-covered', [], (shape) => {
            shape.moveTo(-17, -2);
            shape.absarc(
                0,
                0,
                HEAD_R + 0.5,
                Math.PI * 0.98,
                Math.PI * 0.1,
                true,
            );
            shape.lineTo(11, 6);
            shape.lineTo(5, 3);
            shape.lineTo(-1, 7);
            shape.lineTo(-9, 3);
            shape.closePath();
        });
        parent.add(part(g, hair));
        return;
    }
    parent.add(part(wrappedHair('boy', BOY_HAIR), hair));
}

function buildGirlHair(parent: THREE.Group, hair: string): void {
    hairCap(parent, hair, 17.8, -0.5, 0.1);
    hairBack(parent, hair);
    // 2D side-swept fringe (drawHead girl branch), relative to the head
    // centre, y up: arc over the top, then a wavy edge over the brows.
    const fringe = wrappedHair('girl-fringe', [], (shape) => {
        shape.moveTo(-17, -4);
        shape.absarc(0, 0, HEAD_R + 1, Math.PI, 0, true);
        shape.lineTo(18, 2);
        shape.quadraticCurveTo(13, 6, 8, 4);
        shape.quadraticCurveTo(2, 1, -4, 5);
        shape.quadraticCurveTo(-11, -1, -17, -4);
    });
    parent.add(part(fringe, hair));
    // One long tapered lock behind the head on the left (drawHairBack).
    const lock = geo('body:girl-lock', () => {
        const shape = new THREE.Shape();
        shape.moveTo(-15, 6);
        shape.quadraticCurveTo(-23, -14, -15, -26);
        shape.quadraticCurveTo(-8, -24, -5, -14);
        shape.lineTo(-2, -4);
        shape.closePath();
        const g = new THREE.ExtrudeGeometry(shape, {
            depth: 5,
            bevelEnabled: true,
            bevelThickness: 1,
            bevelSize: 0.3,
            bevelSegments: 2,
            curveSegments: 12,
        });
        g.translate(0, 0, -2.5);
        g.rotateX(-FACE_TILT);
        g.computeVertexNormals();
        return g;
    });
    parent.add(part(lock, shade(hair, -0.08), [HEAD_CX, HEAD_CY, -5]));
    // Back of the head (2D facingBack shape), hidden behind the head and
    // body from the front.
    const back = geo('body:girl-back-hair', () => {
        const shape = new THREE.Shape();
        shape.moveTo(-17, 2);
        shape.quadraticCurveTo(-20, -20, -11, -26);
        shape.lineTo(11, -26);
        shape.quadraticCurveTo(20, -20, 17, 2);
        shape.quadraticCurveTo(0, 22, -17, 2);
        const g = new THREE.ExtrudeGeometry(shape, {
            depth: 6,
            bevelEnabled: true,
            bevelThickness: 1.2,
            bevelSize: 1,
            bevelSegments: 2,
            curveSegments: 12,
        });
        g.translate(0, 0, -3);
        g.computeVertexNormals();
        return g;
    });
    // Kept narrow so from the front it stays inside the head and shoulders
    // (the 2D front view shows only the left lock).
    const backHair = part(back, shade(hair, -0.08), [HEAD_CX, HEAD_CY, -12]);
    backHair.rotation.x = -0.15;
    backHair.scale.set(0.6, 0.9, 1);
    parent.add(backHair);
}

/** Opaque mix of the 2D blush rgba(255,120,130,0.55) over the skin. */
function blushOver(skin: string): string {
    const base = parseInt(skin.slice(1), 16);
    const blush = parseInt(BLUSH.slice(1), 16);
    const mix = (shift: number) => {
        const a = (base >> shift) & 255;
        const b = (blush >> shift) & 255;
        return Math.round(a * 0.45 + b * 0.55)
            .toString(16)
            .padStart(2, '0');
    };
    return `#${mix(16)}${mix(8)}${mix(0)}`;
}

/**
 * Width factor that undoes the sphere's foreshortening for a feature lying
 * on the head, so the camera sees it at its 2D width.
 */
function foreshorten(anchor: THREE.Object3D): number {
    const n = Z_AXIS.clone().applyQuaternion(anchor.quaternion);
    const facing = n.dot(VIEW_DIR);
    return 1 / Math.max(0.55, facing);
}

function buildFace(
    head: THREE.Group,
    skin: string,
    girl: boolean,
    eyes: THREE.Object3D[],
    blinkLines: THREE.Object3D[],
): void {
    for (const ex of [6, 13]) {
        // 2D: tall dark ellipse 2.4 x 3.6 at (ex, +1 down) + highlight r=1.
        const eye = faceAnchor(ex, -1, 0.15, 0);
        const widen = foreshorten(eye);
        const pupil = part(sphere(1, 16, 12), INK, [0, 0, 0], {
            outline: 0,
            flat: true,
        });
        pupil.scale.set(2.4 * widen, 3.6, 0.5);
        eye.add(pupil);
        const glint = part(sphere(1, 10, 8), WHITE, [0.8 * widen, 1.4, 0.5], {
            outline: 0,
            flat: true,
        });
        glint.scale.set(widen, 1, 0.4);
        eye.add(glint);
        head.add(eye);
        eyes.push(eye);

        // Blink: shallow downward curve from ex-2.4 to ex+2.4 (sag 0.7).
        const closed = faceAnchor(ex, -1.9, 0.15, 0);
        const arc = 1.14;
        const curve = part(torus(4.46, 0.75, arc), INK, [0, 4.46, 0], {
            outline: 0,
            flat: true,
        });
        curve.rotation.z = -Math.PI / 2 - arc / 2;
        curve.scale.x = foreshorten(closed);
        closed.add(curve);
        closed.visible = false;
        head.add(closed);
        blinkLines.push(closed);
    }
    // Thin short brows (2D lineWidth 2), inner ends slightly lower.
    for (const [bx, by, angle] of [
        [5.75, 5.25, -0.27],
        [13.25, 5.25, 0.32],
    ] as const) {
        const brow = faceAnchor(bx, by, 0.25, 0);
        const line = part(capsule(0.8, 4.2), INK, [0, 0, 0], {
            outline: 0,
            flat: true,
        });
        line.rotation.z = Math.PI / 2 + angle;
        brow.scale.x = foreshorten(brow);
        brow.add(line);
        head.add(brow);
    }
    if (girl) {
        for (const [lx, ly, angle] of [
            [16, 1.75, 0.64],
            [3.25, 2.25, -0.79],
        ] as const) {
            const lash = faceAnchor(lx, ly, 0.25, 0);
            const line = part(capsule(0.6, 1.3), INK, [0, 0, 0], {
                outline: 0,
                flat: true,
            });
            line.rotation.z = Math.PI / 2 + angle;
            lash.scale.x = foreshorten(lash);
            lash.add(line);
            head.add(lash);
        }
    }
    // One blush on the far right cheek (2D circle r=2.4 at (+15, +7 down)).
    // Lifted and turned toward the camera so the whole disc reads, as the
    // 2D fill does (it even spills over the face outline).
    const blush = faceAnchor(14.6, -7, 0.45, 0.8);
    const cheek = part(sphere(1, 16, 12), blushOver(skin), [0, 0, 0], {
        outline: 0,
        flat: true,
    });
    cheek.scale.set(2.6 * foreshorten(blush), 2.5, 0.2);
    blush.add(cheek);
    head.add(blush);

    // Small smile arc r=2.6 at (+10, +7 down).
    const mouth = faceAnchor(10, -7, 0.2, 0);
    const smileArc = Math.PI - 0.5;
    const smile = part(torus(2.6, 0.75, smileArc), INK, [0, 0, 0], {
        outline: 0,
        flat: true,
    });
    smile.rotation.z = -Math.PI / 2 - smileArc / 2;
    mouth.scale.x = foreshorten(mouth);
    mouth.add(smile);
    head.add(mouth);
}

export function buildCharacter(look: CharacterLook): CharacterRig {
    const items = resolveItems(look);
    const girl = look.gender === 'girl';
    const skin = safeColor(own(SKIN_TONES, look.skin), SKIN_TONES.light);
    const hair = safeColor(own(HAIR_COLORS, look.hair), HAIR_COLORS.brown);
    const hatStyle =
        typeof items.hat?.style === 'string' ? items.hat.style : null;

    const root = new THREE.Group();
    root.name = 'character';
    const body = new THREE.Group();
    root.add(body);

    const legFront = buildLeg(HIP_X);
    const legBack = buildLeg(-HIP_X);
    body.add(legFront, legBack);

    const outfitStyle =
        typeof items.outfit?.style === 'string' ? items.outfit.style : 'tunic';
    const sleeve = buildOutfit(body, look, outfitStyle, items.outfit?.color);

    // No neck: like 2D the head sits straight on the collar (head bottom
    // at y = 33 overlaps the torso top at 32.6).

    const armFront = buildArm(SHOULDER_X, 1, sleeve, skin);
    const armBack = buildArm(-SHOULDER_X, -1, sleeve, skin);
    body.add(armFront, armBack);

    const backSlot = new THREE.Group();
    backSlot.position.set(0, 30, -6);
    body.add(backSlot);

    const head = new THREE.Group();
    head.position.set(0, NECK_Y, 0);
    body.add(head);

    const skull = part(sphere(HEAD_R, 36, 26), skin, [HEAD_CX, HEAD_CY, 0]);
    head.add(skull);

    if (hatStyle !== 'hood') {
        // One ear on the left (2D circle r=3.5 at (-9, +2 down)).
        const ear = faceAnchor(-9, -2, 1.4, 0);
        ear.add(
            part(sphere(3.5, 14, 10), shade(skin, -0.06), [0, 0, 0], {
                outline: 0.9,
            }),
        );
        ear.children[0].scale.set(foreshorten(ear), 1, 0.35);
        head.add(ear);
    }

    const eyes: THREE.Object3D[] = [];
    const blinkLines: THREE.Object3D[] = [];
    buildFace(head, skin, girl, eyes, blinkLines);

    if (girl) {
        buildGirlHair(head, hair);
    } else {
        buildBoyHair(head, hair, coversHair(hatStyle));
    }

    const rig: CharacterRig = {
        root,
        body,
        head,
        armFront,
        armBack,
        legFront,
        legBack,
        backSlot,
        eyes,
        blinkLines,
        look,
        top: CHARACTER_TOP,
    };
    attachItems(rig, items);
    poseCharacter(rig, STANDING_POSE);
    return rig;
}

function finite(value: number | undefined, min: number, max: number): number {
    if (value === undefined || !Number.isFinite(value)) {
        return 0;
    }
    return value < min ? min : value > max ? max : value;
}

/**
 * Arm angle from 2D onto the 3D arm. The 2D angle rotates the arm in the
 * screen plane (front -0.3 / back +0.3 = A-pose, wave -2 = beside the head),
 * so it maps to z exactly; the walk swing away from the rest angle also
 * moves the hand forward/back (x) so it reads as 3D.
 */
function poseArm(arm: THREE.Group, angle: number, side: number): void {
    const rest = -0.3 * side;
    const delta = (angle - rest) * 0.8;
    const x = -0.12 + (delta > 0.6 ? 0.6 : delta < -0.6 ? -0.6 : delta);
    let z = -angle;
    // Never swing into the body.
    if (side * z < -0.05) {
        z = -0.05 * side;
    }
    z = z > 2.6 ? 2.6 : z < -2.6 ? -2.6 : z;
    arm.rotation.set(x, 0, z);
}

export function poseCharacter(rig: CharacterRig, pose: CharacterPose): void {
    const phase = finite(pose.phase, -1.5, 1.5);
    rig.legFront.rotation.x = phase * 0.6;
    rig.legBack.rotation.x = -phase * 0.6;

    const armBack = pose.armBack ?? 0.3 + phase * 0.35;
    const armFront = pose.armFront ?? -0.3 - phase * 0.35;
    poseArm(rig.armBack, finite(armBack, -Math.PI, Math.PI), -1);
    poseArm(rig.armFront, finite(armFront, -Math.PI, Math.PI), 1);

    const squash = finite(pose.squash, -0.5, 0.5);
    rig.body.position.y = finite(pose.bob, -100, 100);
    rig.body.rotation.z = -finite(pose.lean, -Math.PI, Math.PI);
    rig.body.scale.set(1 + squash * 0.6, 1 - squash, 1 + squash * 0.6);

    const tilt = finite(pose.headTilt, -Math.PI, Math.PI);
    rig.head.rotation.set(tilt * 0.5, 0, -tilt);

    const blink = pose.blink === true;
    for (const eye of rig.eyes) {
        eye.visible = !blink;
    }
    for (const line of rig.blinkLines) {
        line.visible = blink;
    }

    rig.root.rotation.y = pose.facingBack ? Math.PI : 0;
    rig.root.scale.x = pose.flip < 0 ? -1 : 1;
}

/** Removes the rig from its parent; geometries and materials stay cached. */
export function disposeCharacter(rig: CharacterRig): void {
    rig.root.removeFromParent();
}
