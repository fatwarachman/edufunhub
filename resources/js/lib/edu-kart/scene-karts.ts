/**
 * Low-poly cartoon karts (8 vehicle styles) with a seated avatar driver.
 * Each kart body + driver is baked into ONE vertex-coloured toon mesh with
 * inverted-hull ink outline; wheels are separate meshes (spin / steer).
 * Local frame: +z forward, +y up, +x to the kart's left.
 */
import type { CharacterLook } from '@/lib/character/draw-character';
import { FACE_TURN } from '@/lib/character/model3d';
import { buildAvatar } from '@/lib/classroom-world/avatar';
import * as THREE from 'three';
import {
    Bake,
    beam,
    compose,
    type Kit,
    type Shapes,
    simplifyByClustering,
} from './scene-kit';
import { shadeHex } from './scene-text';

export interface KartModel {
    root: THREE.Group;
    /** Tilt / spin pivot (child of root). */
    body: THREE.Group;
    /** Front steering pivots. */
    steer: THREE.Group[];
    /** Every wheel pivot (spin around local x); drawn by the shared instanced wheels. */
    wheels: THREE.Object3D[];
    /** Wheel style per entry of `wheels` (instanced batch). */
    wheelKinds: WheelKind[];
    wheelRadius: number;
    /** Exhaust points (body space). */
    exhausts: THREE.Vector3[];
    /** Rear wheel contact points for smoke / sparks (body space). */
    rear: THREE.Vector3[];
    hover: boolean;
    /** Driver head top (body space y). */
    headY: number;
    /** Full detail body + driver (near the camera). */
    near: THREE.Mesh;
    /** Cheap body + driver without ink (far LOD). */
    far: THREE.Mesh;
    /** Top centre of the driver's head (body space): TNT sits there. */
    headTop: THREE.Vector3;
    /** Blob shadow size (x, z) in metres. */
    footprint: [number, number];
    /** Owned geometries (near + far bake) to dispose. */
    geometry: THREE.BufferGeometry;
    farGeometry: THREE.BufferGeometry;
    /**
     * Head pivot (viewer kart only): the head is its own mesh so it can
     * turn a little into the steer and show the face to the chase cam.
     */
    head: THREE.Group | null;
    headGeometry: THREE.BufferGeometry | null;
    /** Boost flames on every exhaust (blue core, orange cone), hidden. */
    flame: THREE.Mesh;
    flameGeometry: THREE.BufferGeometry;
}

export type WheelKind = 'std' | 'big';

/** Driver bake detail: near (ink on big parts) or far (no ink, coarser). */
type DriverLod = 'near' | 'far';

const INK = 0.022;
const BOT_LOOKS: CharacterLook[] = [
    { color: 'coral', gender: 'girl', skin: 'tan', hair: 'pink' },
    { color: 'teal', gender: 'boy', skin: 'brown', hair: 'blonde' },
    { color: 'violet', gender: 'girl', skin: 'light', hair: 'red' },
    { color: 'amber', gender: 'boy', skin: 'dark', hair: 'teal' },
    { color: 'teal', gender: 'girl', skin: 'brown', hair: 'pink' },
    { color: 'coral', gender: 'boy', skin: 'light', hair: 'blonde' },
    { color: 'violet', gender: 'boy', skin: 'tan', hair: 'blue' },
];

function asLook(value: unknown): CharacterLook | null {
    if (!value || typeof value !== 'object') {
        return null;
    }
    const v = value as Record<string, unknown>;
    if (typeof v.color !== 'string') {
        return null;
    }
    return v as unknown as CharacterLook;
}

const lowCache = new Map<string, THREE.BufferGeometry>();

/**
 * Low-poly copy of a shared avatar geometry. Primitives are rebuilt with a
 * segment count from their size on screen (`metres` = world radius), so a
 * big head stays round while eyes and fingers become a few triangles.
 * Custom shapes (hair, extrusions) are vertex-clustered. Cached.
 */
function lowPoly(
    g: THREE.BufferGeometry,
    metres: number,
    lod: DriverLod,
): THREE.BufferGeometry {
    const density = lod === 'near' ? 40 : 24;
    const cap = lod === 'near' ? 8 : 6;
    const seg = Math.max(4, Math.min(cap, Math.round(metres * density)));
    const key = `${g.uuid}|${seg}|${lod}`;
    const hit = lowCache.get(key);
    if (hit) {
        return hit;
    }
    let out: THREE.BufferGeometry;
    if (g instanceof THREE.SphereGeometry) {
        const p = g.parameters;
        const partial = p.phiLength < Math.PI * 1.99 ? 1.4 : 1;
        out = new THREE.SphereGeometry(
            p.radius,
            Math.min(p.widthSegments, Math.round(seg * partial)),
            Math.min(p.heightSegments, Math.max(3, Math.round(seg * 0.65))),
            p.phiStart,
            p.phiLength,
            p.thetaStart,
            p.thetaLength,
        );
    } else if (g instanceof THREE.CapsuleGeometry) {
        const p = g.parameters;
        out = new THREE.CapsuleGeometry(
            p.radius,
            p.height,
            seg > 8 ? 2 : 1,
            Math.min(8, seg),
            1,
        );
    } else if (g instanceof THREE.LatheGeometry) {
        const p = g.parameters;
        out = new THREE.LatheGeometry(
            p.points,
            Math.min(p.segments, seg + 2),
            p.phiStart,
            p.phiLength,
        );
    } else if (g instanceof THREE.CylinderGeometry) {
        const p = g.parameters;
        out = new THREE.CylinderGeometry(
            p.radiusTop,
            p.radiusBottom,
            p.height,
            Math.min(p.radialSegments, seg),
            1,
            p.openEnded,
            p.thetaStart,
            p.thetaLength,
        );
    } else if (g instanceof THREE.TorusGeometry) {
        const p = g.parameters;
        out = new THREE.TorusGeometry(
            p.radius,
            p.tube,
            3,
            Math.min(p.tubularSegments, seg),
            p.arc,
        );
    } else if (g instanceof THREE.BoxGeometry) {
        out = g.clone();
    } else {
        out = cluster(g, lod);
    }
    // Primitives reshaped after construction (scaled brims, sculpted
    // heads) no longer match their parameters: cluster those instead.
    if (!sameBounds(g, out)) {
        out.dispose();
        out = cluster(g, lod);
    }
    lowCache.set(key, out);
    return out;
}

/** Hair / extrusions / sculpted parts: vertex clustering by size. */
function cluster(
    g: THREE.BufferGeometry,
    lod: DriverLod,
): THREE.BufferGeometry {
    g.computeBoundingSphere();
    const r = g.boundingSphere?.radius ?? 10;
    return simplifyByClustering(g, r * (lod === 'near' ? 0.26 : 0.36));
}

function sameBounds(a: THREE.BufferGeometry, b: THREE.BufferGeometry): boolean {
    a.computeBoundingSphere();
    b.computeBoundingSphere();
    const sa = a.boundingSphere as THREE.Sphere;
    const sb = b.boundingSphere as THREE.Sphere;
    const tolerance = Math.max(1e-6, sa.radius * 0.15);
    return (
        Math.abs(sa.radius - sb.radius) < tolerance &&
        sa.center.distanceTo(sb.center) < tolerance
    );
}

/**
 * Bakes a seated, low-poly avatar into `bake` at the seat position and
 * returns the head top (body space y). Ink outlines only on the big parts
 * (head, hair, torso) at the near LOD so the CTR chibi silhouette reads.
 */
/** Bright scarf colour that contrasts with the kart paint. */
function scarfColor(kart: string): string {
    const c = new THREE.Color(kart);
    const hsl = { h: 0, s: 0, l: 0 };
    c.getHSL(hsl);
    // Yellow-ish karts get a hot pink scarf, everything else CTR yellow.
    return hsl.h > 0.1 && hsl.h < 0.2 ? '#ff3b8d' : '#ffd23a';
}

const flairCache = new Map<string, THREE.BufferGeometry>();

/** Basic material for the extra driver parts (the bake reads `color`). */
function flat(color: string): THREE.MeshBasicMaterial {
    return new THREE.MeshBasicMaterial({ color });
}

/**
 * CTR flair added to the avatar rig (drawing units, before baking):
 * goggles with a strap on the forehead and a scarf whose tails stream
 * back. Returns the temporary resources to free after the bake.
 */
function addFlair(
    rig: ReturnType<typeof buildAvatar>,
    scarf: string,
): { dispose(): void }[] {
    const owned: { dispose(): void }[] = [];
    const mat = (color: string) => {
        const m = flat(color);
        owned.push(m);
        return m;
    };
    // Shared across builds (like the avatar's own geometry caches) so the
    // low-poly cache keyed by geometry never grows per kart.
    const geo = (key: string, make: () => THREE.BufferGeometry) => {
        let g = flairCache.get(key);
        if (!g) {
            g = make();
            flairCache.set(key, g);
        }
        return g;
    };
    // Face direction in character space (the rig looks FACE_TURN right).
    const f = new THREE.Vector3(Math.sin(FACE_TURN), 0, Math.cos(FACE_TURN));
    const right = new THREE.Vector3(f.z, 0, -f.x);
    const up = new THREE.Vector3(0, 1, 0);
    const cx = 1;
    const cy = 17;
    const r = 17;
    // Strap: ring round the head, tilted up at the front.
    const strap = new THREE.Mesh(
        geo('strap', () => new THREE.TorusGeometry(r + 2.6, 1.8, 3, 14)),
        mat('#2b2d33'),
    );
    strap.position.set(cx, cy + 7.5, 0);
    strap.rotation.set(Math.PI / 2, 0, 0);
    strap.rotateOnWorldAxis(right, -0.32);
    rig.head.add(strap);
    // Two lenses on the forehead (above the eyes / fringe).
    const a = 0.62;
    for (const side of [-1, 1]) {
        const dir = f
            .clone()
            .multiplyScalar(Math.cos(a))
            .addScaledVector(up, Math.sin(a))
            .addScaledVector(right, side * 0.36)
            .normalize();
        const rim = new THREE.Mesh(
            geo('rim', () => new THREE.CylinderGeometry(4.6, 4.6, 3, 10)),
            mat('#3a3d46'),
        );
        rim.position.set(cx, cy, 0).addScaledVector(dir, r + 3.4);
        rim.quaternion.setFromUnitVectors(up, dir);
        rig.head.add(rim);
        const lens = new THREE.Mesh(
            geo('lens', () => new THREE.CylinderGeometry(3.4, 3.4, 3.4, 10)),
            mat('#5fd3ff'),
        );
        lens.position.copy(rim.position).addScaledVector(dir, 0.25);
        lens.quaternion.copy(rim.quaternion);
        rig.head.add(lens);
    }
    // Scarf: collar ring + two tails streaming back and up.
    const collar = new THREE.Mesh(
        geo('collar', () => new THREE.TorusGeometry(8.5, 2.8, 4, 12)),
        mat(scarf),
    );
    collar.position.set(0.5, 32, 0);
    collar.rotation.x = Math.PI / 2;
    rig.body.add(collar);
    const back = f.clone().negate();
    for (const [k, lift, len, side] of [
        [0, 0.45, 24, 1],
        [1, 0.25, 19, -1],
    ] as const) {
        const tail = new THREE.Mesh(
            geo(`tail${len}`, () => new THREE.BoxGeometry(7, 1.8, len)),
            mat(k === 0 ? scarf : shadeHex(scarf, -0.12)),
        );
        const dir = back
            .clone()
            .addScaledVector(up, lift)
            .addScaledVector(right, side * 0.25)
            .normalize();
        tail.position
            .set(0.5, 31 - k * 2, 0)
            .addScaledVector(back, 8)
            .addScaledVector(dir, len / 2);
        tail.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), dir);
        tail.rotateZ(side * 0.35);
        rig.body.add(tail);
    }
    return owned;
}

function bakeDriver(
    bake: Bake,
    character: unknown,
    botNo: number,
    seat: THREE.Vector3,
    scale: number,
    lod: DriverLod,
    scarf: string,
    headBake: Bake | null = null,
    headPivot: THREE.Vector3 | null = null,
): THREE.Vector3 {
    const look: CharacterLook | null =
        botNo > 0
            ? BOT_LOOKS[(botNo - 1) % BOT_LOOKS.length]
            : asLook(character);
    let rig;
    try {
        rig = buildAvatar(look);
    } catch {
        rig = buildAvatar(null);
    }
    // Seated pose: thighs forward, hands on the wheel.
    rig.legL.rotation.set(-1.45, 0, 0);
    rig.legR.rotation.set(-1.45, 0, 0);
    rig.armL.rotation.set(-1.25, 0, 0.18);
    rig.armR.rotation.set(-1.25, 0, -0.18);
    // CTR chibi: big expressive head on a small body.
    rig.head.scale.setScalar(1.4);
    const flair = addFlair(rig, scarf);
    rig.root.scale.setScalar(scale);
    rig.root.position.copy(seat);
    // The shared character looks FACE_TURN to its right; face the kart nose.
    rig.root.rotation.y = -FACE_TURN;
    rig.root.updateMatrixWorld(true);
    const inHead = new Set<THREE.Object3D>();
    rig.head.traverse((o) => inHead.add(o));
    const pivotInverse = new THREE.Matrix4();
    if (headBake && headPivot) {
        rig.head.getWorldPosition(headPivot);
        pivotInverse.makeTranslation(-headPivot.x, -headPivot.y, -headPivot.z);
    }
    const local = new THREE.Matrix4();
    const color = new THREE.Color();
    const scaleOf = new THREE.Vector3();
    let top = seat.y;
    const box = new THREE.Box3();
    const head = new THREE.Box3();
    rig.root.traverseVisible((obj) => {
        if (!(obj instanceof THREE.Mesh)) {
            return;
        }
        const m = obj.material as THREE.MeshBasicMaterial;
        if (m.transparent || m.side === THREE.BackSide) {
            return;
        }
        obj.matrixWorld.decompose(
            new THREE.Vector3(),
            new THREE.Quaternion(),
            scaleOf,
        );
        obj.geometry.computeBoundingSphere();
        const radius =
            (obj.geometry.boundingSphere?.radius ?? 0) *
            Math.max(scaleOf.x, scaleOf.y, scaleOf.z);
        const low = lowPoly(obj.geometry, radius, lod);
        color.copy(m.color ?? new THREE.Color('#ffffff'));
        const split = headBake !== null && inHead.has(obj);
        const target = split ? (headBake as Bake) : bake;
        const matrix = split
            ? local.multiplyMatrices(pivotInverse, obj.matrixWorld)
            : obj.matrixWorld;
        target.add(low, color, matrix);
        // Ink only on the big chibi shapes (head, hair), from the coarse
        // copy: the outline reads the same at a fraction of the triangles.
        if (lod === 'near' && radius > 0.25) {
            target.addInk(lowPoly(obj.geometry, radius, 'far'), matrix, 0.014);
        }
        if (!low.boundingBox) {
            low.computeBoundingBox();
        }
        box.copy(low.boundingBox as THREE.Box3).applyMatrix4(obj.matrixWorld);
        top = Math.max(top, box.max.y);
        if (radius > 0.25) {
            head.union(box);
        }
    });
    rig.root.removeFromParent();
    for (const o of flair) {
        o.dispose();
    }
    // Head top: y = highest point, x/z = centre of the head + hair bounds.
    const centre = head.isEmpty()
        ? seat.clone()
        : head.getCenter(new THREE.Vector3());
    return new THREE.Vector3(centre.x, top, centre.z);
}

interface Spec {
    wheels: [number, number, number, number, boolean][]; // x, y, z, radius, front
    seat: [number, number, number];
    exhausts: [number, number, number][];
    hover?: boolean;
}

export class KartFactory {
    constructor(
        private kit: Kit,
        private shapes: Shapes,
        private shadows: boolean,
    ) {}

    /**
     * Unit wheel (radius 1, width 1 along x) shared by every kart; the
     * instance matrix scales it per vehicle.
     */
    private wheelGeometry(big: boolean): THREE.BufferGeometry {
        return this.kit.geometry(`wheel-unit${big}`, () => {
            const sh = this.shapes;
            const b = new Bake();
            const tyre = compose(0, 0, 0, 0, 0, Math.PI / 2, 1, 1, 1);
            // Chunky balloon tyre (rounded shoulders), chrome hub cap with a
            // coloured centre and 8 tread lugs so the spin reads.
            b.addOutlined(sh.cylinder(12), '#23242a', tyre, 0.07);
            b.add(
                sh.cylinder(12, true),
                '#34363e',
                compose(0, 0, 0, 0, 0, Math.PI / 2, 1.06, 0.7, 1.06),
            );
            b.add(
                sh.cylinder(8),
                '#e6eaf0',
                compose(0, 0, 0, 0, 0, Math.PI / 2, 0.58, 1.08, 0.58),
            );
            b.add(
                sh.cylinder(6),
                big ? '#e0322c' : '#ffcf2e',
                compose(0, 0, 0, 0, 0, Math.PI / 2, 0.22, 1.16, 0.22),
            );
            for (let i = 0; i < 8; i++) {
                const a = (i / 8) * Math.PI * 2;
                b.add(
                    sh.box(),
                    '#3a3c44',
                    compose(
                        i % 2 ? 0.18 : -0.18,
                        Math.cos(a) * 1.02,
                        Math.sin(a) * 1.02,
                        0,
                        a,
                        0,
                        0.52,
                        0.12,
                        0.26,
                    ),
                );
            }
            return b.build() ?? new THREE.BufferGeometry();
        });
    }

    private batches = new Map<WheelKind, THREE.InstancedMesh>();
    private blobs: THREE.InstancedMesh | null = null;
    private static readonly CAPACITY = 64;

    /** Instanced wheels of one style (all karts, one draw call). */
    private batch(kind: WheelKind): THREE.InstancedMesh {
        let mesh = this.batches.get(kind);
        if (!mesh) {
            mesh = new THREE.InstancedMesh(
                this.wheelGeometry(kind === 'big'),
                this.kit.vertexToon(),
                KartFactory.CAPACITY,
            );
            mesh.count = 0;
            mesh.frustumCulled = false;
            mesh.castShadow = this.shadows;
            this.group.add(mesh);
            this.batches.set(kind, mesh);
        }
        return mesh;
    }

    /** Group holding the instanced wheels and blob shadows (add to scene). */
    readonly group = new THREE.Group();

    private blobMesh(): THREE.InstancedMesh {
        if (!this.blobs) {
            const tex = this.kit.canvasTexture(64, 64, (ctx, w, h) => {
                const g = ctx.createRadialGradient(
                    w / 2,
                    h / 2,
                    0,
                    w / 2,
                    h / 2,
                    w / 2,
                );
                g.addColorStop(0, 'rgba(0,0,0,0.55)');
                g.addColorStop(0.6, 'rgba(0,0,0,0.35)');
                g.addColorStop(1, 'rgba(0,0,0,0)');
                ctx.fillStyle = g;
                ctx.fillRect(0, 0, w, h);
            });
            const mat = this.kit.material(
                'kart-blob',
                () =>
                    new THREE.MeshBasicMaterial({
                        map: tex,
                        transparent: true,
                        depthWrite: false,
                        polygonOffset: true,
                        polygonOffsetFactor: -6,
                        polygonOffsetUnits: -6,
                    }),
            );
            this.blobs = new THREE.InstancedMesh(
                this.kit.geometry('blob-plane', () =>
                    new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2),
                ),
                mat,
                KartFactory.CAPACITY,
            );
            this.blobs.count = 0;
            this.blobs.frustumCulled = false;
            this.blobs.renderOrder = 1;
            this.group.add(this.blobs);
        }
        return this.blobs;
    }

    private wheelMatrix = new THREE.Matrix4();
    private wheelScale = new THREE.Matrix4();

    /**
     * Packs the wheels of every visible kart into the instanced batches and
     * puts a blob contact shadow under each (`ground` = road y under it).
     * Call after the kart roots were placed this frame.
     */
    sync(list: { model: KartModel; ground: number; visible: boolean }[]): void {
        const counts: Record<WheelKind, number> = { std: 0, big: 0 };
        const blobs = this.blobMesh();
        let blobCount = 0;
        for (const { model, ground, visible } of list) {
            if (!visible) {
                continue;
            }
            model.root.updateMatrixWorld(true);
            model.wheels.forEach((w, i) => {
                const kind = model.wheelKinds[i];
                const mesh = this.batch(kind);
                const n = counts[kind];
                if (n >= KartFactory.CAPACITY) {
                    return;
                }
                const r = (w.userData.radius as number) ?? 0.35;
                const width = (w.userData.width as number) ?? 0.3;
                this.wheelScale.makeScale(width, r, r);
                this.wheelMatrix.multiplyMatrices(
                    w.matrixWorld,
                    this.wheelScale,
                );
                mesh.setMatrixAt(n, this.wheelMatrix);
                counts[kind] = n + 1;
            });
            if (blobCount < KartFactory.CAPACITY) {
                const p = model.root.position;
                const lift = Math.max(0, p.y - ground);
                const k = Math.max(0.35, 1 - lift * 0.35);
                this.wheelMatrix.compose(
                    new THREE.Vector3(p.x, ground + 0.06, p.z),
                    model.root.quaternion,
                    new THREE.Vector3(
                        model.footprint[0] * k,
                        1,
                        model.footprint[1] * k,
                    ),
                );
                blobs.setMatrixAt(blobCount++, this.wheelMatrix);
            }
        }
        for (const kind of ['std', 'big'] as WheelKind[]) {
            const mesh = this.batches.get(kind);
            if (mesh) {
                mesh.count = counts[kind];
                mesh.instanceMatrix.needsUpdate = true;
            }
        }
        blobs.count = blobCount;
        blobs.instanceMatrix.needsUpdate = true;
    }

    /** Bakes the vehicle body into `b` and returns its layout. */
    private body(b: Bake, vehicle: string, color: string): Spec {
        const sh = this.shapes;
        const c = color;
        const dark = shadeHex(c, -0.35);
        const light = shadeHex(c, 0.3);
        const box = (
            col: string,
            x: number,
            y: number,
            z: number,
            sx: number,
            sy: number,
            sz: number,
            rx = 0,
            ry = 0,
            rz = 0,
            ink = INK,
        ) => {
            const matrix = compose(x, y, z, ry, rx, rz, sx, sy, sz);
            // Chunky CTR panels: big parts are rounded and two-tone
            // (darker underside, light top edge); thin trims stay boxes.
            if (Math.min(sx, sy, sz) >= 0.18) {
                b.addShaded(
                    sh.rbox(1),
                    col,
                    shadeHex(col, -0.38),
                    matrix,
                    ink,
                    shadeHex(col, 0.16),
                );
            } else {
                b.addOutlined(sh.box(), col, matrix, ink);
            }
        };
        /** Rounded capsule nose / pod along z, two-tone. */
        const pod = (
            col: string,
            x: number,
            y: number,
            z: number,
            sx: number,
            sy: number,
            sz: number,
            rx = 0,
        ) =>
            b.addShaded(
                sh.capsule(),
                col,
                shadeHex(col, -0.38),
                compose(x, y, z, 0, rx, 0, sx, sy, sz),
                INK,
                shadeHex(col, 0.18),
            );
        const cyl = (
            col: string,
            x: number,
            y: number,
            z: number,
            r: number,
            len: number,
            rx = 0,
            rz = 0,
            seg = 8,
            ink = INK,
        ) =>
            b.addOutlined(
                sh.cylinder(seg),
                col,
                compose(x, y, z, 0, rx, rz, r, len, r),
                ink,
            );
        const cone = (
            col: string,
            x: number,
            y: number,
            z: number,
            r: number,
            len: number,
            rx: number,
            seg = 10,
        ) =>
            b.addOutlined(
                sh.cone(seg),
                col,
                compose(x, y, z, 0, rx, 0, r, len, r),
                INK,
            );
        const ball = (
            col: string,
            x: number,
            y: number,
            z: number,
            sx: number,
            sy: number,
            sz: number,
        ) =>
            b.addOutlined(
                sh.ball(10, 7),
                col,
                compose(x, y, z, 0, 0, 0, sx, sy, sz),
                INK,
            );
        const steeringWheel = (z: number, y: number) => {
            b.add(
                sh.torus(),
                '#1d2238',
                compose(0, y, z, 0, -0.9, 0, 0.17, 0.17, 0.17),
            );
        };
        // Big chrome CTR pipes: flared tip + dark bore, angled up a bit.
        const exhaustPipes = (z: number, y: number, xs: number[]) => {
            // Angled up and out so the chase cam sees chrome tubes, not
            // two round holes.
            for (const x of xs) {
                const out = Math.sign(x) * 0.25;
                cyl('#d5dce6', x, y + 0.02, z + 0.1, 0.1, 0.55, 0.9, -out, 8);
                cyl(
                    '#f4f7fb',
                    x + out * 0.2,
                    y + 0.2,
                    z - 0.1,
                    0.14,
                    0.14,
                    0.9,
                    -out,
                    8,
                );
            }
        };
        /** Number plate at the back (white plate, dark digits bar). */
        const plate = (z: number, y: number) => {
            b.addOutlined(
                sh.box(),
                '#f6f6f2',
                compose(0, y, z, 0, 0, 0, 0.42, 0.22, 0.04),
                0.012,
            );
            b.add(
                sh.box(),
                '#2a6fd6',
                compose(0, y, z - 0.025, 0, 0, 0, 0.3, 0.05, 0.02),
            );
        };
        const id = vehicle;
        let spec: Spec;
        if (id === 'formula') {
            spec = {
                wheels: [
                    [0.78, 0.36, 1.0, 0.36, true],
                    [-0.78, 0.36, 1.0, 0.36, true],
                    [0.8, 0.42, -0.95, 0.42, false],
                    [-0.8, 0.42, -0.95, 0.42, false],
                ],
                seat: [0, 0.3, -0.25],
                exhausts: [
                    [0.2, 0.58, -1.62],
                    [-0.2, 0.58, -1.62],
                ],
            };
            pod(c, 0, 0.36, 0.25, 0.7, 0.4, 2.7);
            pod(light, 0, 0.3, 1.45, 0.42, 0.26, 0.9);
            box(light, 0, 0.18, 1.85, 1.65, 0.07, 0.35);
            box(dark, 0.78, 0.22, 1.85, 0.05, 0.25, 0.4);
            box(dark, -0.78, 0.22, 1.85, 0.05, 0.25, 0.4);
            box(dark, 0.5, 0.33, -0.2, 0.34, 0.3, 1.0);
            box(dark, -0.5, 0.33, -0.2, 0.34, 0.3, 1.0);
            box(c, 0, 0.62, -0.75, 0.42, 0.42, 0.7);
            box('#1d2238', 0, 0.7, -1.35, 0.08, 0.3, 0.12);
            box(light, 0, 0.88, -1.42, 1.5, 0.08, 0.4);
            box(dark, 0.74, 0.8, -1.42, 0.05, 0.3, 0.45);
            box(dark, -0.74, 0.8, -1.42, 0.05, 0.3, 0.45);
            steeringWheel(0.32, 0.62);
            exhaustPipes(-1.5, 0.58, [0.2, -0.2]);
            plate(-1.2, 0.3);
        } else if (id === 'buggy') {
            spec = {
                wheels: [
                    [0.82, 0.44, 0.95, 0.44, true],
                    [-0.82, 0.44, 0.95, 0.44, true],
                    [0.86, 0.52, -0.85, 0.52, false],
                    [-0.86, 0.52, -0.85, 0.52, false],
                ],
                seat: [0, 0.42, -0.15],
                exhausts: [
                    [0.3, 0.75, -1.3],
                    [-0.3, 0.75, -1.3],
                ],
            };
            box(c, 0, 0.45, 0.1, 1.1, 0.35, 2.0);
            box(light, 0, 0.55, 1.1, 0.9, 0.3, 0.4, 0.35);
            box('#2b2d33', 0, 0.3, 1.35, 1.2, 0.18, 0.18);
            box(dark, 0, 0.7, -0.95, 0.9, 0.45, 0.6);
            const cage = [
                [
                    new THREE.Vector3(0.48, 0.6, 0.5),
                    new THREE.Vector3(0.42, 1.6, 0.1),
                ],
                [
                    new THREE.Vector3(-0.48, 0.6, 0.5),
                    new THREE.Vector3(-0.42, 1.6, 0.1),
                ],
                [
                    new THREE.Vector3(0.48, 0.6, -0.7),
                    new THREE.Vector3(0.42, 1.6, -0.45),
                ],
                [
                    new THREE.Vector3(-0.48, 0.6, -0.7),
                    new THREE.Vector3(-0.42, 1.6, -0.45),
                ],
                [
                    new THREE.Vector3(0.42, 1.6, 0.1),
                    new THREE.Vector3(-0.42, 1.6, 0.1),
                ],
                [
                    new THREE.Vector3(0.42, 1.6, -0.45),
                    new THREE.Vector3(-0.42, 1.6, -0.45),
                ],
                [
                    new THREE.Vector3(0.42, 1.6, 0.1),
                    new THREE.Vector3(0.42, 1.6, -0.45),
                ],
                [
                    new THREE.Vector3(-0.42, 1.6, 0.1),
                    new THREE.Vector3(-0.42, 1.6, -0.45),
                ],
            ];
            for (const [p0, p1] of cage) {
                b.addOutlined(
                    sh.cylinder(6),
                    '#f2c14e',
                    beam(p0, p1, 0.05),
                    0.015,
                );
            }
            cyl('#fff6b0', 0.3, 1.62, 0.18, 0.1, 0.08, Math.PI / 2);
            cyl('#fff6b0', -0.3, 1.62, 0.18, 0.1, 0.08, Math.PI / 2);
            steeringWheel(0.45, 0.8);
            exhaustPipes(-1.25, 0.75, [0.3, -0.3]);
            plate(-1.27, 0.42);
        } else if (id === 'hover') {
            spec = {
                wheels: [],
                seat: [0, 0.42, -0.1],
                exhausts: [
                    [0.45, 0.55, -1.35],
                    [-0.45, 0.55, -1.35],
                ],
                hover: true,
            };
            ball(c, 0, 0.45, 0, 0.95, 0.3, 1.45);
            ball(light, 0, 0.6, 0.75, 0.5, 0.2, 0.6);
            box(dark, 0.95, 0.55, -0.6, 0.12, 0.4, 0.8, 0, 0, -0.4);
            box(dark, -0.95, 0.55, -0.6, 0.12, 0.4, 0.8, 0, 0, 0.4);
            cyl('#5d6470', 0.45, 0.55, -1.15, 0.2, 0.5, Math.PI / 2);
            cyl('#5d6470', -0.45, 0.55, -1.15, 0.2, 0.5, Math.PI / 2);
            box('#7fe8ff', 0, 0.85, 0.55, 0.7, 0.25, 0.3, -0.5, 0, 0, 0.012);
            steeringWheel(0.4, 0.8);
        } else if (id === 'monster') {
            spec = {
                wheels: [
                    [0.92, 0.62, 0.95, 0.62, true],
                    [-0.92, 0.62, 0.95, 0.62, true],
                    [0.92, 0.62, -0.95, 0.62, false],
                    [-0.92, 0.62, -0.95, 0.62, false],
                ],
                seat: [0, 0.95, -0.15],
                exhausts: [
                    [0.35, 1.7, -0.75],
                    [-0.35, 1.7, -0.75],
                ],
            };
            box('#3a3c44', 0, 0.62, 0, 1.3, 0.2, 2.2);
            box(c, 0, 1.0, 0.05, 1.45, 0.45, 2.5);
            box(light, 0, 1.18, 1.0, 1.3, 0.2, 0.6, 0.2);
            box(dark, 0, 1.35, -0.85, 1.2, 0.4, 0.55);
            box('#d7dbe2', 0, 0.95, 1.33, 1.2, 0.2, 0.1);
            for (const x of [0.35, -0.35]) {
                cyl('#c9d0da', x, 1.55, -0.75, 0.1, 0.6);
                cyl('#eef2f7', x, 1.86, -0.75, 0.14, 0.12);
            }
            plate(-1.32, 0.95);
            // Side steps / pods.
            box(dark, 0.78, 0.82, 0, 0.2, 0.22, 1.4);
            box(dark, -0.78, 0.82, 0, 0.2, 0.22, 1.4);
            steeringWheel(0.45, 1.35);
        } else if (id === 'bajaj') {
            spec = {
                wheels: [
                    [0, 0.34, 1.15, 0.34, true],
                    [0.72, 0.34, -0.85, 0.34, false],
                    [-0.72, 0.34, -0.85, 0.34, false],
                ],
                seat: [0, 0.45, -0.1],
                exhausts: [[0.45, 0.35, -1.35]],
            };
            box(c, 0, 0.45, -0.25, 1.3, 0.35, 1.9);
            box(c, 0, 0.75, 0.85, 0.75, 0.75, 0.5, -0.25);
            box('#2a6fd6', 0, 0.62, 1.12, 0.12, 0.5, 0.12);
            // Canopy roof clear of the driver's head, on four posts (it read
            // as a white slab floating over the head with front posts only).
            box(light, 0, 2.08, -0.05, 1.45, 0.1, 1.9);
            box(c, 0, 2.0, -0.05, 1.5, 0.08, 1.95);
            for (const [px, pz] of [
                [0.62, 0.85],
                [-0.62, 0.85],
                [0.62, -0.95],
                [-0.62, -0.95],
            ]) {
                box(dark, px, 1.3, pz, 0.07, 1.42, 0.07);
            }
            box('#bfe9ff', 0, 1.3, 0.92, 0.66, 0.5, 0.04, -0.1, 0, 0, 0.012);
            box('#f6c142', 0, 1.0, 1.1, 0.25, 0.18, 0.06);
            box(dark, 0, 0.62, -1.15, 1.3, 0.28, 0.12);
            steeringWheel(0.5, 0.9);
            exhaustPipes(-1.3, 0.35, [0.45]);
            plate(-1.22, 0.55);
        } else if (id === 'drifter') {
            spec = {
                wheels: [
                    [0.82, 0.32, 1.0, 0.32, true],
                    [-0.82, 0.32, 1.0, 0.32, true],
                    [0.84, 0.34, -0.9, 0.34, false],
                    [-0.84, 0.34, -0.9, 0.34, false],
                ],
                seat: [0, 0.32, -0.15],
                exhausts: [
                    [0.3, 0.4, -1.45],
                    [-0.3, 0.4, -1.45],
                ],
            };
            box(c, 0, 0.4, 0.05, 1.5, 0.34, 2.6);
            box(light, 0, 0.5, 1.05, 1.3, 0.2, 0.7, 0.18);
            box('#fff6b0', 0.5, 0.45, 1.37, 0.32, 0.1, 0.05);
            box('#fff6b0', -0.5, 0.45, 1.37, 0.32, 0.1, 0.05);
            box(dark, 0, 0.62, -0.9, 1.1, 0.3, 0.6);
            box(dark, 0.5, 0.8, -1.3, 0.07, 0.35, 0.1);
            box(dark, -0.5, 0.8, -1.3, 0.07, 0.35, 0.1);
            box(light, 0, 1.0, -1.35, 1.7, 0.08, 0.45, 0.12);
            box('#1d2238', 0.84, 0.9, -1.35, 0.05, 0.3, 0.5);
            box('#1d2238', -0.84, 0.9, -1.35, 0.05, 0.3, 0.5);
            steeringWheel(0.4, 0.62);
            exhaustPipes(-1.4, 0.4, [0.3, -0.3]);
            plate(-1.36, 0.42);
        } else if (id === 'rocket') {
            spec = {
                wheels: [
                    [0.78, 0.32, 0.95, 0.32, true],
                    [-0.78, 0.32, 0.95, 0.32, true],
                    [0.8, 0.34, -0.85, 0.34, false],
                    [-0.8, 0.34, -0.85, 0.34, false],
                ],
                seat: [0, 0.32, 0.05],
                exhausts: [[0, 0.95, -1.75]],
            };
            pod(c, 0, 0.4, 0.25, 1.2, 0.36, 2.5);
            cone(light, 0, 0.44, 1.5, 0.3, 0.5, Math.PI / 2, 8);
            cyl('#d7dbe2', 0, 0.95, -0.85, 0.36, 1.6, Math.PI / 2, 12);
            cone('#e0322c', 0, 0.95, 0.15, 0.36, 0.5, Math.PI / 2, 12);
            cyl('#3a3c44', 0, 0.95, -1.7, 0.3, 0.2, Math.PI / 2, 12);
            for (let i = 0; i < 3; i++) {
                const a = (i / 3) * Math.PI * 2 + Math.PI / 2;
                b.addOutlined(
                    sh.box(),
                    c,
                    compose(
                        Math.cos(a) * 0.45,
                        0.95 + Math.sin(a) * 0.45,
                        -1.4,
                        0,
                        0,
                        a - Math.PI / 2,
                        0.06,
                        0.4,
                        0.5,
                    ),
                    0.015,
                );
            }
            steeringWheel(0.6, 0.62);
        } else {
            // classic CTR kart.
            spec = {
                wheels: [
                    [0.78, 0.3, 0.9, 0.3, true],
                    [-0.78, 0.3, 0.9, 0.3, true],
                    [0.82, 0.36, -0.85, 0.36, false],
                    [-0.82, 0.36, -0.85, 0.36, false],
                ],
                seat: [0, 0.3, -0.2],
                exhausts: [
                    [0.28, 0.65, -1.35],
                    [-0.28, 0.65, -1.35],
                ],
            };
            // Dark chassis tray, rounded nose bubble, side pods, engine
            // block with big twin chrome pipes and a rear spoiler.
            box('#2b2d33', 0, 0.22, 0, 1.05, 0.14, 2.3);
            pod(c, 0, 0.42, 0.72, 1.0, 0.36, 1.35);
            pod(light, 0, 0.34, 1.32, 1.3, 0.2, 0.42);
            pod(c, 0.62, 0.36, -0.12, 0.38, 0.32, 1.05);
            pod(c, -0.62, 0.36, -0.12, 0.38, 0.32, 1.05);
            box(dark, 0, 0.56, -0.85, 0.8, 0.44, 0.6);
            box('#9aa1ab', 0, 0.84, -0.85, 0.55, 0.15, 0.4);
            // Spoiler: wing on two struts with end plates.
            box(dark, 0.42, 0.86, -1.3, 0.06, 0.32, 0.08);
            box(dark, -0.42, 0.86, -1.3, 0.06, 0.32, 0.08);
            box(light, 0, 1.06, -1.36, 1.4, 0.09, 0.38);
            box('#1d2238', 0.72, 1.02, -1.36, 0.05, 0.26, 0.42);
            box('#1d2238', -0.72, 1.02, -1.36, 0.05, 0.26, 0.42);
            // Number roundel on the nose.
            b.add(
                sh.cylinder(10),
                '#ffffff',
                compose(0, 0.6, 0.95, 0, 0.32, 0, 0.2, 0.02, 0.2),
            );
            steeringWheel(0.35, 0.62);
            exhaustPipes(-1.2, 0.62, [0.26, -0.26]);
            plate(-1.16, 0.32);
        }
        if (!spec.hover) {
            // Seat back.
            box(
                '#2b2d33',
                0,
                spec.seat[1] + 0.45,
                spec.seat[2] - 0.32,
                0.6,
                0.6,
                0.12,
            );
        }
        return spec;
    }

    /**
     * Boost flame for every exhaust merged into one additive mesh: a blue
     * hot core inside an orange cone (CTR turbo), along -z from each tip.
     */
    private flameGeometry(
        exhausts: [number, number, number][],
    ): THREE.BufferGeometry {
        const b = new Bake();
        const cone = this.shapes.cone(8);
        for (const [x, y, z] of exhausts) {
            // Cone points along -z (tip away from the kart), base at the pipe.
            b.add(
                cone,
                '#ff7a1a',
                compose(x, y, z - 0.55, 0, -Math.PI / 2, 0, 0.24, 1.1, 0.24),
            );
            b.add(
                cone,
                '#4fc3ff',
                compose(x, y, z - 0.32, 0, -Math.PI / 2, 0, 0.13, 0.62, 0.13),
            );
        }
        return b.build() ?? new THREE.BufferGeometry();
    }

    build(
        vehicle: string,
        color: string,
        character: unknown,
        botNo: number,
        viewer = false,
    ): KartModel {
        const id = vehicle;
        const scarf = scarfColor(color);
        const nearBake = new Bake();
        const spec = this.body(nearBake, vehicle, color);
        const seat = new THREE.Vector3(...spec.seat);
        // The viewer's head is its own small mesh (turns into the steer).
        const headBake = viewer ? new Bake() : null;
        const headPivot = viewer ? new THREE.Vector3() : null;
        const headTop = bakeDriver(
            nearBake,
            character,
            botNo,
            seat,
            0.86,
            'near',
            scarf,
            headBake,
            headPivot,
        );
        const geometry = nearBake.build() ?? new THREE.BufferGeometry();
        const farBake = new Bake();
        farBake.skipInk = true;
        this.body(farBake, vehicle, color);
        bakeDriver(farBake, character, botNo, seat, 0.86, 'far', scarf);
        const farGeometry = farBake.build() ?? new THREE.BufferGeometry();
        const root = new THREE.Group();
        const body = new THREE.Group();
        root.add(body);
        const near = new THREE.Mesh(geometry, this.kit.vertexToon(true));
        near.castShadow = this.shadows;
        body.add(near);
        const far = new THREE.Mesh(farGeometry, this.kit.vertexToon(true));
        far.visible = false;
        body.add(far);
        let head: THREE.Group | null = null;
        let headGeometry: THREE.BufferGeometry | null = null;
        if (headBake && headPivot) {
            headGeometry = headBake.build();
            if (headGeometry) {
                head = new THREE.Group();
                head.position.copy(headPivot);
                const headMesh = new THREE.Mesh(
                    headGeometry,
                    this.kit.vertexToon(true),
                );
                headMesh.castShadow = this.shadows;
                head.add(headMesh);
                near.add(head);
            }
        }
        const flameGeometry = this.flameGeometry(spec.exhausts);
        const flame = new THREE.Mesh(
            flameGeometry,
            this.kit.material(
                'kart-flame',
                () =>
                    new THREE.MeshBasicMaterial({
                        vertexColors: true,
                        transparent: true,
                        opacity: 0.95,
                        blending: THREE.AdditiveBlending,
                        depthWrite: false,
                        fog: false,
                    }),
            ),
        );
        flame.visible = false;
        body.add(flame);
        const steer: THREE.Group[] = [];
        const wheels: THREE.Object3D[] = [];
        const wheelKinds: WheelKind[] = [];
        const rear: THREE.Vector3[] = [];
        let wheelRadius = 0.35;
        let halfX = 0.8;
        let halfZ = 1.3;
        for (const [x, y, z, r, front] of spec.wheels) {
            const width = id === 'monster' ? 0.5 : id === 'buggy' ? 0.38 : 0.3;
            const wheel = new THREE.Object3D();
            wheel.userData.radius = r;
            wheel.userData.width = width;
            const pivot = new THREE.Group();
            pivot.position.set(x, y, z);
            pivot.add(wheel);
            body.add(pivot);
            wheels.push(wheel);
            wheelKinds.push(id === 'monster' ? 'big' : 'std');
            halfX = Math.max(halfX, Math.abs(x) + width / 2);
            halfZ = Math.max(halfZ, Math.abs(z) + r);
            if (front) {
                steer.push(pivot);
            } else {
                rear.push(new THREE.Vector3(x, 0.08, z - r * 0.6));
                wheelRadius = r;
            }
        }
        if (spec.hover) {
            const ring = new THREE.Mesh(
                this.kit.geometry(
                    'hover-ring',
                    () => new THREE.CircleGeometry(1, 16),
                ),
                this.kit.glow('#3ee8ff', 0.7),
            );
            ring.rotation.x = -Math.PI / 2;
            ring.scale.set(0.9, 1.3, 1);
            ring.position.y = 0.12;
            body.add(ring);
            rear.push(
                new THREE.Vector3(0.4, 0.15, -1.2),
                new THREE.Vector3(-0.4, 0.15, -1.2),
            );
        }
        return {
            root,
            body,
            steer,
            wheels,
            wheelKinds,
            wheelRadius,
            exhausts: spec.exhausts.map((e) => new THREE.Vector3(...e)),
            rear,
            hover: !!spec.hover,
            headY: headTop.y,
            headTop,
            near,
            far,
            geometry,
            farGeometry,
            head,
            headGeometry,
            flame,
            flameGeometry,
            footprint: [halfX * 2.3, halfZ * 2.2],
        };
    }
}
