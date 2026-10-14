/**
 * 3D versions of every shop item (hats, face, back, weapons, shield), shaped
 * and coloured like draw-character.ts. Units match the 2D drawing (1 unit =
 * 1 px), +y up, the face looks toward +z. Head items live in the head group
 * (pivot at the neck, head centre at local (1, 17, 0)); weapons hang from the
 * front hand, the shield from the back arm, cape and wings from the back slot.
 */
import * as THREE from 'three';
import type { ItemLook, ItemSlot } from './draw-character';
import type { CharacterRig } from './model3d';
import {
    extrude,
    FACE_TILT,
    geo,
    headPoint,
    INK,
    part,
    safeColor,
    shade,
} from './model3d-kit';

type Vec3 = [number, number, number];
type PartOptions = { outline?: number; opacity?: number; flat?: boolean };

/** Head centre relative to the head group (neck pivot). */
const HEAD_CX = 1;
const HEAD_CY = 17;
const HEAD_R = 17;
/** Neck height above the feet (2D NECK_Y = -33). */
const NECK_Y = 33;
/** Hand position in the arm groups (shoulder pivot, arm hanging down). */
const HAND_Y = -12.5;

const GOLD = '#f2c14e';
const CREAM = '#f4ead2';
const WOOD = '#8a5a2b';
const GRIP = '#6b3f22';

/** Hat height above the top of the head, same as the 2D silhouettes. */
const HAT_HEIGHT: Record<string, number> = {
    cap: 7,
    flower: 0,
    hood: 3,
    wizard: 30,
    helmet: 9,
    circlet: 0,
    horned: 12,
    crown: 14,
};

/** Hat styles that hide the top hair (same list as 2D: not flower/circlet). */
export function coversHair(style: string | null | undefined): boolean {
    return (
        typeof style === 'string' &&
        style !== '' &&
        style !== 'flower' &&
        style !== 'circlet'
    );
}

/** Point relative to the head centre, in head-group space. */
function onHead(x: number, y: number, z: number): Vec3 {
    return [HEAD_CX + x, HEAD_CY + y, z];
}

function add(
    parent: THREE.Object3D,
    g: THREE.BufferGeometry,
    color: string,
    position: Vec3 = [0, 0, 0],
    opts: PartOptions = {},
): THREE.Group {
    const p = part(g, color, position, opts);
    parent.add(p);
    return p;
}

function pivot(parent: THREE.Object3D, position: Vec3): THREE.Group {
    const group = new THREE.Group();
    group.position.set(...position);
    parent.add(group);
    return group;
}

function sphere(r: number, w = 16, h = 12): THREE.BufferGeometry {
    return geo(
        `items:sphere:${r}:${w}:${h}`,
        () => new THREE.SphereGeometry(r, w, h),
    );
}

function cylinder(
    rTop: number,
    rBottom: number,
    height: number,
    segments = 16,
    open = false,
): THREE.BufferGeometry {
    return geo(
        `items:cyl:${rTop}:${rBottom}:${height}:${segments}:${open}`,
        () =>
            new THREE.CylinderGeometry(
                rTop,
                rBottom,
                height,
                segments,
                1,
                open,
            ),
    );
}

function dome(r: number, thetaLength: number): THREE.BufferGeometry {
    return geo(
        `items:dome:${r}:${thetaLength}`,
        () =>
            new THREE.SphereGeometry(r, 24, 12, 0, Math.PI * 2, 0, thetaLength),
    );
}

const centres = new Map<string, THREE.Vector3>();

/**
 * Geometry moved so its bounding box is centred on the origin, plus the
 * offset that puts it back. The ink hull of part() scales around the mesh
 * origin, so off-centre shapes would get a lopsided outline.
 */
function centred(
    key: string,
    make: () => THREE.BufferGeometry,
): { g: THREE.BufferGeometry; at: THREE.Vector3 } {
    const g = geo(`items:c:${key}`, () => {
        const src = make().clone();
        src.computeBoundingBox();
        const c = new THREE.Vector3();
        src.boundingBox?.getCenter(c);
        src.translate(-c.x, -c.y, -c.z);
        centres.set(key, c);
        return src;
    });
    return { g, at: centres.get(key) ?? new THREE.Vector3() };
}

/** Extruded 2D outline (y up) placed where it was drawn. */
function addShape(
    parent: THREE.Object3D,
    key: string,
    draw: (s: THREE.Shape) => void,
    depth: number,
    color: string,
    offset: Vec3 = [0, 0, 0],
    opts: PartOptions = {},
): THREE.Group {
    const { g, at } = centred(`shape:${key}:${depth}`, () =>
        extrude(`items:${key}`, draw, depth),
    );
    return add(
        parent,
        g,
        color,
        [offset[0] + at.x, offset[1] + at.y, offset[2] + at.z],
        opts,
    );
}

function addPolygon(
    parent: THREE.Object3D,
    key: string,
    points: readonly number[],
    depth: number,
    color: string,
    offset: Vec3 = [0, 0, 0],
    opts: PartOptions = {},
): THREE.Group {
    return addShape(
        parent,
        key,
        (s) => {
            s.moveTo(points[0], points[1]);
            for (let i = 2; i < points.length; i += 2) {
                s.lineTo(points[i], points[i + 1]);
            }
            s.closePath();
        },
        depth,
        color,
        offset,
        opts,
    );
}

/** Diamond used by the circlet gem and the shield emblem (2D 6 x 10). */
const DIAMOND = [0, 5, 3, 0, 0, -5, -3, 0] as const;

/**
 * Flat 2D detail (drawn in 2D head-centre offsets, y up) laid onto the head
 * so the default camera sees it exactly where 2D draws it: every vertex goes
 * through `headPoint`, the extrusion depth becomes lift above the skin.
 */
function onFace(
    key: string,
    draw: (s: THREE.Shape) => void,
    depth: number,
    lift: number,
): THREE.BufferGeometry {
    return geo(`items:face:${key}:${depth}:${lift}`, () => {
        const g = extrude(`items:face-src:${key}`, draw, depth).clone();
        const pos = g.attributes.position;
        const p = new THREE.Vector3();
        for (let i = 0; i < pos.count; i++) {
            headPoint(
                pos.getX(i),
                pos.getY(i),
                lift + pos.getZ(i) + depth / 2,
                p,
            );
            pos.setXYZ(i, p.x, p.y, p.z);
        }
        g.computeVertexNormals();
        return g;
    });
}

function ring(s: THREE.Shape, x: number, y: number, r: number, w: number) {
    s.absarc(x, y, r + w / 2, 0, Math.PI * 2, false);
    const hole = new THREE.Path();
    hole.absarc(x, y, r - w / 2, 0, Math.PI * 2, true);
    s.holes.push(hole);
}

// ---------------------------------------------------------------- hats

/** Wizard cone: base radius 13, 33 tall, tip bent sideways like 2D. */
function wizardCone(): THREE.BufferGeometry {
    const height = 33;
    const profile: THREE.Vector2[] = [];
    for (let i = 0; i <= 10; i++) {
        const t = i / 10;
        profile.push(
            new THREE.Vector2(Math.max(0.4, 13 * (1 - t) ** 1.25), t * height),
        );
    }
    const g = new THREE.LatheGeometry(profile, 24);
    const pos = g.attributes.position;
    for (let i = 0; i < pos.count; i++) {
        const t = pos.getY(i) / height;
        pos.setX(i, pos.getX(i) - 12 * t * t);
        pos.setZ(i, pos.getZ(i) - 3 * t * t);
    }
    g.computeVertexNormals();
    return g;
}

/**
 * Crown band: the 2D seven-point profile (valley 7, side spikes 14, centre
 * spike 18 above the base) repeated around an open, slightly flared ring.
 */
function crownRing(): THREE.BufferGeometry {
    const g = new THREE.CylinderGeometry(15, 14, 1, 48, 1, true);
    g.translate(0, 0.5, 0);
    const pos = g.attributes.position;
    const step = Math.PI / 4;
    for (let i = 0; i < pos.count; i++) {
        if (pos.getY(i) < 0.5) {
            continue;
        }
        const angle = Math.atan2(pos.getX(i), pos.getZ(i));
        const k = Math.round(angle / step);
        // 2D three-point crown: tall centre spike in front (+31 from the
        // head centre), side spikes at the silhouette edges (+27), flat
        // valleys between them.
        const spike = k === 0 ? 16.5 : Math.abs(k) % 2 === 0 ? 13 : 7;
        const off = Math.min(1, Math.abs(angle - k * step) / (step / 2));
        pos.setY(i, spike + (7 - spike) * off);
    }
    g.computeVertexNormals();
    return g;
}

/**
 * Surface grid: `at(u, v, target)` maps u, v in 0..1 to a head-group point.
 * Faces are wound so normals point away from the head centre.
 */
function grid(
    nu: number,
    nv: number,
    at: (u: number, v: number, target: THREE.Vector3) => void,
): THREE.BufferGeometry {
    const points: number[] = [];
    const p = new THREE.Vector3();
    for (let j = 0; j <= nv; j++) {
        for (let i = 0; i <= nu; i++) {
            at(i / nu, j / nv, p);
            points.push(p.x, p.y, p.z);
        }
    }
    const index: number[] = [];
    for (let j = 0; j < nv; j++) {
        for (let i = 0; i < nu; i++) {
            const a = j * (nu + 1) + i;
            const b = a + 1;
            const c = a + nu + 1;
            const d = c + 1;
            index.push(a, b, d, a, d, c);
        }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(points, 3));
    g.setIndex(index);
    g.computeVertexNormals();
    const pos = g.attributes.position;
    const nor = g.attributes.normal;
    const mid = Math.floor(pos.count / 2);
    const out =
        (pos.getX(mid) - HEAD_CX) * nor.getX(mid) +
        (pos.getY(mid) - HEAD_CY) * nor.getY(mid) +
        pos.getZ(mid) * nor.getZ(mid);
    if (out < 0) {
        for (let k = 0; k < index.length; k += 3) {
            const t = index[k + 1];
            index[k + 1] = index[k + 2];
            index[k + 2] = t;
        }
        g.setIndex(index);
        g.computeVertexNormals();
    }
    return g;
}

const HOOD_R = 22;
/** 2D hood opening: brow edge (18,3) ~ (6,14) ~ (-6,8), cheek to (-14,-12). */
const hoodBrow = new THREE.QuadraticBezierCurve(
    new THREE.Vector2(-6, 8),
    new THREE.Vector2(6, 14),
    new THREE.Vector2(18, 3),
);

function hoodOuterY(x: number): number {
    return Math.sqrt(Math.max(0, HOOD_R * HOOD_R - x * x));
}

/** Front of the hood as the camera sees it: top band plus left cheek. */
function hoodFront(): THREE.BufferGeometry {
    const top = grid(40, 8, (u, v, target) => {
        // Above the brow: from the left rim across to the right rim.
        const x = -19.6 + u * 39;
        let low = 8;
        if (x >= -6) {
            const t = Math.min(1, (x + 6) / 24);
            low = hoodBrow.getPoint(t).y;
        }
        const high = hoodOuterY(x);
        const y = Math.min(low, high) + (high - Math.min(low, high)) * v;
        headPoint(x, y, HOOD_R - HEAD_R, target);
    });
    const cheek = grid(6, 16, (u, v, target) => {
        // Left of the cheek line (-6,8) -> (-14,-12).
        const y = -12 + v * 20;
        const inner = -6 - ((8 - y) / 20) * 8;
        const outer = -Math.sqrt(Math.max(0, HOOD_R * HOOD_R - y * y));
        headPoint(outer + (inner - outer) * u, y, HOOD_R - HEAD_R, target);
    });
    const merged = new THREE.BufferGeometry();
    const parts = [top, cheek];
    const positions: number[] = [];
    const index: number[] = [];
    for (const g of parts) {
        const base = positions.length / 3;
        positions.push(...(g.attributes.position.array as Float32Array));
        for (const k of g.index?.array ?? []) {
            index.push(base + k);
        }
    }
    merged.setAttribute(
        'position',
        new THREE.Float32BufferAttribute(positions, 3),
    );
    merged.setIndex(index);
    merged.computeVertexNormals();
    return merged;
}

/** Back half of the hood (away from the camera), bottom cut at y -13. */
function hoodBack(): THREE.BufferGeometry {
    const g = new THREE.SphereGeometry(
        HOOD_R,
        36,
        14,
        0,
        Math.PI * 2,
        0,
        Math.PI / 2,
    );
    g.rotateX(-Math.PI / 2 - FACE_TILT);
    const pos = g.attributes.position;
    const cos = Math.cos(FACE_TILT);
    const sin = Math.sin(FACE_TILT);
    for (let i = 0; i < pos.count; i++) {
        // Camera-frame height; squash the part below the chin line.
        const y = pos.getY(i) * cos - pos.getZ(i) * sin;
        if (y < -13) {
            const k = -13 / y;
            pos.setXYZ(i, pos.getX(i), pos.getY(i) * k, pos.getZ(i) * k);
        }
    }
    g.computeVertexNormals();
    return g;
}

function attachHat(head: THREE.Object3D, item: ItemLook): number {
    const color = safeColor(item.color, '#ffffff');
    switch (item.style) {
        case 'flower': {
            // 2D: centre (-9, +12) from the head centre, 5 petals r 2.8 at
            // radius 3.6, yellow centre r 2.2. Lifted proud of the hair and
            // facing the camera so it reads like the flat 2D flower.
            const at = headPoint(-9, 12, 4.5);
            const flower = pivot(head, [at.x, at.y, at.z + 2]);
            flower.rotation.x = -0.2;
            const petalGeo = geo(
                'items:flower-petal',
                () => new THREE.CylinderGeometry(2.8, 2.8, 1.4, 18),
            );
            for (let i = 0; i < 5; i++) {
                const a = (i / 5) * Math.PI * 2;
                const petal = add(
                    flower,
                    petalGeo,
                    color,
                    [Math.cos(a) * 3.6, Math.sin(a) * 3.6, 0],
                    { outline: 0.8 },
                );
                petal.rotation.x = Math.PI / 2;
            }
            const centre = add(
                flower,
                geo(
                    'items:flower-centre',
                    () => new THREE.CylinderGeometry(2.2, 2.2, 1.6, 16),
                ),
                '#ffd93d',
                [0, 0, 1],
                { outline: 0.7 },
            );
            centre.rotation.x = Math.PI / 2;
            return HAT_HEIGHT.flower;
        }
        case 'hood': {
            add(head, geo('items:hood-front', hoodFront), color, [0, 0, 0], {
                outline: 1,
            });
            add(
                head,
                geo('items:hood-back', hoodBack),
                color,
                onHead(0, 0, 0),
                {
                    outline: 1,
                },
            );
            // Inside of the back shell: the camera sees it through the face
            // opening, where the back-face ink hull would read as a dark
            // panel. A flipped lining keeps the hood one clean colour.
            add(
                head,
                geo('items:hood-lining', () => {
                    const g = hoodBack().clone();
                    g.scale(0.985, 0.985, 0.985);
                    const index = Array.from(g.index?.array ?? []);
                    for (let k = 0; k < index.length; k += 3) {
                        [index[k + 1], index[k + 2]] = [
                            index[k + 2],
                            index[k + 1],
                        ];
                    }
                    g.setIndex(index);
                    g.computeVertexNormals();
                    return g;
                }),
                color,
                onHead(0, 0, 0),
                { outline: 0, flat: true },
            );
            // Even ink line around the face opening (2D strokes the whole
            // hood path): brow (18,3) ~ (6,14) ~ (-6,8), cheek down to (-14,-12).
            add(
                head,
                geo('items:hood-edge', () => {
                    const cheek = new THREE.LineCurve(
                        new THREE.Vector2(-6, 8),
                        new THREE.Vector2(-14, -12),
                    );
                    const pts: THREE.Vector3[] = [];
                    for (let i = 0; i <= 16; i++) {
                        const p = hoodBrow.getPoint(1 - i / 16);
                        pts.push(headPoint(p.x, p.y, HOOD_R - HEAD_R + 0.2));
                    }
                    for (let i = 1; i <= 12; i++) {
                        const p = cheek.getPoint(i / 12);
                        pts.push(headPoint(p.x, p.y, HOOD_R - HEAD_R + 0.2));
                    }
                    return new THREE.TubeGeometry(
                        new THREE.CatmullRomCurve3(pts),
                        56,
                        0.75,
                        6,
                    );
                }),
                INK,
                [0, 0, 0],
                { outline: 0, flat: true },
            );
            return HAT_HEIGHT.hood;
        }
        case 'wizard': {
            add(
                head,
                cylinder(24, 24, 2, 32),
                shade(color, -0.1),
                onHead(0, 13, 0),
            );
            const { g, at } = centred('wizard-cone', wizardCone);
            add(head, g, color, onHead(at.x, 14 + at.y, at.z));
            add(
                head,
                cylinder(13.2, 13.6, 4, 28),
                '#a0672e',
                onHead(0, 16, 0),
                {
                    outline: 0.8,
                },
            );
            return HAT_HEIGHT.wizard;
        }
        case 'helmet': {
            // 2D: brim ellipse 23 x 5 at y +8 (shade -0.12), dome r 17 on it
            // (top at +25), light ridge strip 3 wide from +9 to +24.
            // Size baked into the geometry: part() scales the ink width with
            // the mesh scale, so a scaled unit sphere gets a huge outline.
            add(
                head,
                geo(
                    'items:helmet-brim',
                    () => new THREE.CylinderGeometry(23, 22, 3.2, 48),
                ),
                shade(color, -0.12),
                onHead(0, 7.8, 0),
                { outline: 1.1, flat: true },
            );
            // Ink seam where the dome meets the brim (2D strokes both).
            const seam = add(
                head,
                geo(
                    'items:helmet-seam',
                    () => new THREE.TorusGeometry(19, 0.6, 6, 48),
                ),
                INK,
                onHead(0, 9.5, 0),
                { outline: 0, flat: true },
            );
            seam.rotation.x = Math.PI / 2;
            const shell = add(
                head,
                dome(19, Math.PI / 2),
                color,
                onHead(0, 8.5, 0),
                { outline: 0.9 },
            );
            shell.scale.y = 16.5 / 19;
            const ridge = add(
                head,
                geo(
                    'items:helmet-ridge',
                    () =>
                        new THREE.TorusGeometry(
                            19.3,
                            1.5,
                            6,
                            24,
                            Math.PI * 0.42,
                        ),
                ),
                shade(color, 0.35),
                onHead(0, 8.5, 0),
                { outline: 0.6 },
            );
            ridge.rotation.set(0, -Math.PI / 2, Math.PI * 0.06);
            ridge.scale.set(1, 16.5 / 19, 1);
            return HAT_HEIGHT.helmet;
        }
        case 'circlet': {
            // 2D: stroke (-16,7) ~ ctrl (2,14) ~ (18,7), width 3 + ink 5,
            // gem diamond centred (7, 11). Laid proud of the hair.
            const curve = new THREE.QuadraticBezierCurve(
                new THREE.Vector2(-16, 7),
                new THREE.Vector2(2, 14),
                new THREE.Vector2(18, 7),
            );
            const band = onFace(
                'circlet-band',
                (s) => {
                    const top: THREE.Vector2[] = [];
                    const bottom: THREE.Vector2[] = [];
                    for (let i = 0; i <= 24; i++) {
                        const t = i / 24;
                        const p = curve.getPoint(t);
                        const d = curve.getTangent(t);
                        top.push(
                            new THREE.Vector2(p.x - d.y * 1.6, p.y + d.x * 1.6),
                        );
                        bottom.push(
                            new THREE.Vector2(p.x + d.y * 1.6, p.y - d.x * 1.6),
                        );
                    }
                    s.moveTo(top[0].x, top[0].y);
                    for (const p of top.slice(1)) {
                        s.lineTo(p.x, p.y);
                    }
                    for (const p of bottom.reverse()) {
                        s.lineTo(p.x, p.y);
                    }
                    s.closePath();
                },
                1.4,
                4.4,
            );
            add(head, band, color, [0, 0, 0], { outline: 0.9 });
            const gem = onFace(
                'circlet-gem',
                (s) => {
                    s.moveTo(7, 16);
                    s.lineTo(10, 11);
                    s.lineTo(7, 6);
                    s.lineTo(4, 11);
                    s.closePath();
                },
                1.4,
                5.6,
            );
            add(head, gem, '#2bd4c4', [0, 0, 0], { outline: 0.7 });
            return HAT_HEIGHT.circlet;
        }
        case 'horned':
            // 2D horn: (14,-6) ~ (26,-2) -> (24,12) ~ (20,2) -> (10,-1) from
            // the head top; kept thin and pulled slightly in (3D adds depth).
            for (const side of [-1, 1]) {
                const horn = addShape(
                    head,
                    `horn:${side}`,
                    (s) => {
                        s.moveTo(side * 14, -6);
                        s.quadraticCurveTo(side * 26, -2, side * 24, 12);
                        s.quadraticCurveTo(side * 20, 2, side * 10, -1);
                        s.closePath();
                    },
                    2.4,
                    CREAM,
                    onHead(0, HEAD_R - 1, 0),
                    { outline: 0.8 },
                );
                horn.scale.setScalar(0.85);
            }
            add(head, dome(19.5, Math.PI / 2), color, onHead(0, 7, 0));
            add(
                head,
                cylinder(19.9, 19.9, 4.6, 36, true),
                GOLD,
                onHead(0, 8.6, 0),
                { outline: 0.9 },
            );
            return HAT_HEIGHT.horned;
        case 'crown': {
            const { g, at } = centred('crown-ring', crownRing);
            add(head, g, color, onHead(at.x, 13 + at.y, at.z), {
                outline: 0.9,
            });
            // Filled inside like the solid 2D crown (hides the hair top).
            const fill = add(
                head,
                dome(15.2, Math.PI / 2),
                shade(color, -0.12),
                onHead(0, 13, 0),
                { outline: 0 },
            );
            fill.scale.y = 0.62;
            for (const [angle, gem] of [
                [-0.57, '#e74c3c'],
                [0, '#3d7be0'],
                [0.57, '#2bb5a3'],
            ] as const) {
                const stone = add(
                    head,
                    cylinder(1.8, 1.8, 1.2, 16),
                    gem,
                    onHead(
                        Math.sin(angle) * 15.2,
                        16.5,
                        Math.cos(angle) * 15.2,
                    ),
                    { outline: 0.5 },
                );
                stone.rotation.set(Math.PI / 2, 0, -angle);
            }
            return HAT_HEIGHT.crown;
        }
        default: {
            // 2D: dome ellipse 17 x 8 above top+3 (y +14), navy bill ellipse
            // 8 x 3.2 at (+11, +12) sticking out to the front-right. Radius
            // 21.5 keeps the covered hair inside the dome.
            add(head, dome(20.6, 0.95), color, onHead(0, -0.5, 0));
            const visor = pivot(head, onHead(0, 11.5, 0));
            visor.rotation.y = 0.75;
            const bill = add(
                visor,
                geo('items:cap-bill', () =>
                    new THREE.CylinderGeometry(1, 1, 2, 28).scale(8.5, 0.9, 10),
                ),
                '#23304f',
                [0, 0, 17],
                { outline: 0.9 },
            );
            bill.rotation.x = 0.1;
            add(head, sphere(2.6, 12, 8), '#ffd93d', onHead(0, 21.4, -1), {
                outline: 0.7,
            });
            return HAT_HEIGHT.cap;
        }
    }
}

// ---------------------------------------------------------------- face

function attachFace(head: THREE.Object3D, item: ItemLook): void {
    if (item.style === 'mask') {
        // 2D roundRect(HEAD_X + 1, HEAD_Y - 4, 17, 8, r 4): x 1..18, y -4..4.
        const color = safeColor(item.color, INK);
        const band = onFace(
            'mask-band',
            (s) => {
                // Centred on the 3D eyes (y -1) and a little taller so the
                // band hides both eyes completely, as 2D does.
                s.moveTo(5.5, 3.5);
                s.lineTo(13.5, 3.5);
                s.absarc(13.5, -1, 4.5, Math.PI / 2, -Math.PI / 2, true);
                s.lineTo(5.5, -5.5);
                s.absarc(5.5, -1, 4.5, -Math.PI / 2, Math.PI / 2, true);
                s.closePath();
            },
            1.2,
            1.4,
        );
        add(head, band, color, [0, 0, 0], { outline: 0.8, flat: true });
        for (const ex of [6, 13]) {
            const hole = onFace(
                `mask-hole:${ex}`,
                (s) => {
                    s.absarc(ex, -1, 1.6, 0, Math.PI * 2, false);
                },
                0.3,
                2.7,
            );
            add(head, hole, '#ffffff', [0, 0, 0], { outline: 0, flat: true });
        }
        return;
    }
    // 2D: thin rings r 4.2 (lineWidth 1.8) at (+6, -1) and (+14, -1), bridge.
    for (const ex of [6, 14]) {
        const frame = onFace(
            `glasses:${ex}`,
            (s) => {
                ring(s, ex, -1, 4.2, 1.2);
            },
            0.6,
            1.4,
        );
        add(head, frame, INK, [0, 0, 0], { outline: 0, flat: true });
    }
    const bridge = onFace(
        'glasses-bridge',
        (s) => {
            s.moveTo(9.6, 0.6);
            s.lineTo(10.4, 0.6);
            s.lineTo(10.4, -0.4);
            s.lineTo(9.6, -0.4);
            s.closePath();
        },
        0.6,
        1.4,
    );
    add(head, bridge, INK, [0, 0, 0], { outline: 0, flat: true });
}

// ---------------------------------------------------------------- back

function attachBack(slot: THREE.Object3D, item: ItemLook): void {
    const color = safeColor(item.color, '#d6453d');
    if (item.style === 'wings') {
        for (const side of [-1, 1]) {
            // 2D lobes at shoulder level, spread sideways, tilted -0.08.
            const hinge = pivot(slot, [0, 0, -1]);
            hinge.rotation.set(0, side * 0.3, side * -0.08);
            addShape(
                hinge,
                `wing:${side}`,
                (s) => {
                    s.moveTo(side * 4, 0);
                    s.quadraticCurveTo(side * 26, 22, side * 30, 4);
                    s.quadraticCurveTo(side * 28, -8, side * 18, -12);
                    s.quadraticCurveTo(side * 14, -6, side * 4, -10);
                    s.closePath();
                },
                1.2,
                color,
                [0, 0, 0],
                { opacity: 0.9, outline: 0.9 },
            );
        }
        return;
    }
    // Cloth panel hanging from the shoulders, flaring back toward the feet.
    const hang = pivot(slot, [0, 2, -1.5]);
    hang.rotation.x = 0.12;
    addShape(
        hang,
        'cape',
        (s) => {
            s.moveTo(-11, 0);
            s.lineTo(11, 0);
            s.quadraticCurveTo(21, -16, 21, -30);
            s.lineTo(-21, -30);
            s.quadraticCurveTo(-21, -16, -11, 0);
            s.closePath();
        },
        1.5,
        shade(color, -0.12),
    );
    // Front collar around the neck and the gold clasp (slot sits 6 behind the body centre).
    add(slot, cylinder(8.5, 11.5, 5, 24, true), color, [0, 0, 6], {
        outline: 0.9,
    });
    add(slot, sphere(2.4, 12, 8), GOLD, [0, -1, 17.5], { outline: 0.7 });
}

// ---------------------------------------------------------------- weapons

/**
 * Rest abduction of the front arm in model3d.ts poseArm (rotation.z at the
 * standing pose). 2D draws weapons unrotated by the arm, so the frame
 * subtracts it to keep the 2D tilt on screen.
 */
const ARM_REST_ROLL = 0.3;

/**
 * Weapon frame at the front hand. Inside it the 2D weapon coordinates are
 * used with y negated; the 2D tilt becomes a roll around z and the plane
 * stays almost facing the camera, as flat as the 2D drawing.
 */
function weaponFrame(arm: THREE.Object3D, tilt: number): THREE.Group {
    const frame = pivot(arm, [2, HAND_Y, 3]);
    // Keep the 2D weapon plane facing the camera (2D draws it flat).
    frame.rotation.set(0.3, -0.15, -tilt - ARM_REST_ROLL);
    return frame;
}

function stick(
    frame: THREE.Object3D,
    r: number,
    from: number,
    to: number,
    color: string,
): void {
    add(frame, cylinder(r, r, to - from, 10), color, [0, (from + to) / 2, 0], {
        outline: 0.8,
    });
}

function attachWeapon(arm: THREE.Object3D, item: ItemLook): void {
    const color = safeColor(item.color, '#d7dde6');
    switch (item.style) {
        case 'wand': {
            const frame = weaponFrame(arm, 0.6);
            stick(frame, 1.5, -2, 24, CREAM);
            addPolygon(
                frame,
                'wand-star',
                [
                    0, 34, 2.6, 28, 8, 27, 3.8, 23.5, 5, 18, 0, 21, -5, 18,
                    -3.8, 23.5, -8, 27, -2.6, 28,
                ],
                1.2,
                color,
                [0, 0, 0],
                { outline: 0.8 },
            );
            return;
        }
        case 'bow': {
            // 2D: arc r 18 (-1.1..1.1) centred 17 left of the grip, 10
            // above the hand, drawn over the body. Held well in front of
            // the hand (z) and square to the camera so the whole arc shows.
            const frame = pivot(arm, [3, HAND_Y + 2, 9]);
            frame.rotation.set(0.12, 0, -ARM_REST_ROLL);
            const limb = add(
                frame,
                geo(
                    'items:bow-limb',
                    () => new THREE.TorusGeometry(18, 1.6, 8, 32, 2.2),
                ),
                color,
                [-17, 10, 0],
                { outline: 1 },
            );
            limb.rotation.z = -1.1;
            add(
                frame,
                cylinder(0.6, 0.6, 36 * Math.sin(1.1), 8),
                CREAM,
                [-17 + 18 * Math.cos(1.1), 10, -0.5],
                { outline: 0.4, flat: true },
            );
            add(
                frame,
                geo(
                    'items:bow-grip',
                    () => new THREE.CapsuleGeometry(2.3, 3, 4, 10),
                ),
                GRIP,
                [0.5, 10, 0.4],
                { outline: 0.7 },
            );
            return;
        }
        case 'staff': {
            const frame = weaponFrame(arm, 0.3);
            stick(frame, 2, -8, 48, color);
            const hook = add(
                frame,
                geo(
                    'items:staff-hook',
                    () => new THREE.TorusGeometry(6, 1.4, 8, 24, Math.PI * 1.2),
                ),
                color,
                [0, 50, 0],
                { outline: 0.8 },
            );
            hook.rotation.z = -Math.PI * 0.1;
            add(frame, sphere(3.5, 14, 10), '#7de3ff', [0, 50, 0], {
                outline: 0.7,
            });
            return;
        }
        case 'spear': {
            const frame = weaponFrame(arm, 0.3);
            stick(frame, 1.6, -10, 46, WOOD);
            addPolygon(
                frame,
                'spear-head',
                [0, 60, 5, 48, 0, 44, -5, 48],
                2.4,
                color,
                [0, 0, 0],
                { outline: 0.8 },
            );
            return;
        }
        case 'mace': {
            const frame = weaponFrame(arm, 0.65);
            stick(frame, 1.8, -4, 20, WOOD);
            const spike = geo(
                'items:mace-spike',
                () => new THREE.ConeGeometry(1.7, 5, 8),
            );
            for (let i = 0; i < 8; i++) {
                const a = -(i / 8) * Math.PI * 2;
                const s = add(
                    frame,
                    spike,
                    '#c9ced6',
                    [Math.cos(a) * 8, 25 + Math.sin(a) * 8, 0],
                    { outline: 0.5 },
                );
                s.rotation.z = a - Math.PI / 2;
            }
            add(frame, sphere(7, 18, 12), color, [0, 25, 0]);
            return;
        }
        case 'axe': {
            const frame = weaponFrame(arm, 0.65);
            stick(frame, 1.8, -6, 30, WOOD);
            for (const side of [-1, 1]) {
                addShape(
                    frame,
                    `axe-blade:${side}`,
                    (s) => {
                        s.moveTo(0, 30);
                        s.quadraticCurveTo(side * 14, 36, side * 13, 24);
                        s.quadraticCurveTo(side * 12, 14, 0, 20);
                        s.closePath();
                    },
                    1.6,
                    color,
                    [0, 0, 0],
                    { outline: 0.8 },
                );
            }
            return;
        }
        default: {
            const frame = weaponFrame(arm, 0.6);
            addPolygon(
                frame,
                'sword-blade',
                [-2.5, 4, 2.5, 4, 2.5, 32, 0, 37, -2.5, 32],
                1.6,
                color,
                [0, 0, 0],
                { outline: 0.8 },
            );
            const guard = add(
                frame,
                geo(
                    'items:sword-guard',
                    () => new THREE.CapsuleGeometry(1.75, 9.5, 4, 10),
                ),
                GOLD,
                [0, 3.25, 0],
                { outline: 0.7 },
            );
            guard.rotation.z = Math.PI / 2;
            add(frame, cylinder(1.6, 1.6, 6, 10), GRIP, [0, -1.5, 0], {
                outline: 0.6,
            });
        }
    }
}

// ---------------------------------------------------------------- shield

function attachShield(arm: THREE.Object3D, item: ItemLook): void {
    const color = safeColor(item.color, '#c0392b');
    // 2D centre (-13, -21): in front of the back forearm, disc facing the
    // camera (+z) like the flat 2D circle.
    // Counter the arm's A-pose roll/pitch so the disc and the upright emblem
    // face the camera like the flat 2D circle.
    const shield = pivot(arm, [-2, -8, 5]);
    shield.rotation.set(0.12, 0, 0.3);
    // Thin gold ring (9 -> 6.5) behind a red face that fills most of the
    // disc: the face sits proud so the toon light keeps it the item colour.
    const rim = add(shield, cylinder(9, 9, 1.4, 40), '#c9a227', [0, 0, 0], {
        outline: 1.1,
    });
    rim.rotation.x = Math.PI / 2;
    const face = add(shield, cylinder(7.4, 7.4, 1.2, 36), color, [0, 0, 1.1], {
        outline: 0.45,
        flat: true,
    });
    face.rotation.x = Math.PI / 2;
    addPolygon(shield, 'diamond', DIAMOND, 0.4, CREAM, [0, 0, 2], {
        outline: 0.35,
        flat: true,
    });
}

// ---------------------------------------------------------------- entry

function validItem(item: unknown): item is ItemLook {
    return (
        typeof item === 'object' &&
        item !== null &&
        typeof (item as ItemLook).style === 'string'
    );
}

/**
 * Builds every equipped item onto the rig. Unknown styles fall back like 2D
 * (cap / sword / cape); bad colours fall back to the 2D defaults.
 */
export function attachItems(
    rig: CharacterRig,
    items: Partial<Record<ItemSlot, ItemLook>>,
): void {
    if (!rig || !items || typeof items !== 'object') {
        return;
    }
    const { hat, face, back, weapon, offhand } = items;
    if (validItem(hat) && rig.head) {
        const height = attachHat(rig.head, hat);
        const neck = rig.head.position.y || NECK_Y;
        const top = neck + HEAD_CY + HEAD_R + height;
        if (!Number.isFinite(rig.top) || rig.top < top) {
            rig.top = top;
        }
    }
    if (validItem(face) && rig.head) {
        attachFace(rig.head, face);
    }
    if (validItem(back) && rig.backSlot) {
        attachBack(rig.backSlot, back);
    }
    if (validItem(weapon) && rig.armFront) {
        attachWeapon(rig.armFront, weapon);
    }
    if (validItem(offhand) && rig.armBack) {
        attachShield(rig.armBack, offhand);
    }
}
