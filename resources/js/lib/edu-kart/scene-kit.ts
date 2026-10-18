/**
 * Shared three.js building blocks of the EduKart scene: a resource kit
 * (cached materials, geometries and textures, disposed together), a
 * vertex-colour "bake" that merges many static parts into one geometry, and
 * canvas texture helpers.
 */
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

export const FONT_DISPLAY = '"Fredoka", "Quicksand", system-ui, sans-serif';

/** World tile edge (m) of chunked static meshes (frustum culling). */
export const TILE_SIZE = 160;

/** Tile key of a world position (chunked instancing). */
export function tileKey(
    x: number,
    z: number,
    size: number = TILE_SIZE,
): string {
    return `${Math.floor(x / size)},${Math.floor(z / size)}`;
}

/**
 * Vertex-clustering simplifier: snaps vertices to a `cell` sized grid,
 * averages each cluster and drops collapsed / duplicate triangles. The
 * result is indexed (smooth normals); a `color` attribute is averaged.
 */
export function simplifyByClustering(
    source: THREE.BufferGeometry,
    cell: number,
): THREE.BufferGeometry {
    const g = source.index ? source.toNonIndexed() : source;
    const pos = g.getAttribute('position') as THREE.BufferAttribute;
    const col = g.getAttribute('color') as THREE.BufferAttribute | undefined;
    const ids = new Int32Array(pos.count);
    const lookup = new Map<string, number>();
    const sums: number[] = [];
    for (let i = 0; i < pos.count; i++) {
        const x = pos.getX(i);
        const y = pos.getY(i);
        const z = pos.getZ(i);
        const key = `${Math.floor(x / cell)},${Math.floor(y / cell)},${Math.floor(z / cell)}`;
        let id = lookup.get(key);
        if (id === undefined) {
            id = lookup.size;
            lookup.set(key, id);
            sums.push(0, 0, 0, 0, 0, 0, 0);
        }
        ids[i] = id;
        const o = id * 7;
        sums[o] += x;
        sums[o + 1] += y;
        sums[o + 2] += z;
        if (col) {
            sums[o + 3] += col.getX(i);
            sums[o + 4] += col.getY(i);
            sums[o + 5] += col.getZ(i);
        }
        sums[o + 6] += 1;
    }
    const count = lookup.size;
    const outPos = new Float32Array(count * 3);
    const outCol = new Float32Array(count * 3);
    for (let id = 0; id < count; id++) {
        const o = id * 7;
        const n = sums[o + 6];
        outPos.set([sums[o] / n, sums[o + 1] / n, sums[o + 2] / n], id * 3);
        outCol.set([sums[o + 3] / n, sums[o + 4] / n, sums[o + 5] / n], id * 3);
    }
    const index: number[] = [];
    const seen = new Set<string>();
    for (let t = 0; t + 2 < pos.count; t += 3) {
        const a = ids[t];
        const b = ids[t + 1];
        const c = ids[t + 2];
        if (a === b || b === c || a === c) {
            continue;
        }
        const key =
            a < b && a < c
                ? `${a},${b},${c}`
                : b < c
                  ? `${b},${c},${a}`
                  : `${c},${a},${b}`;
        if (seen.has(key)) {
            continue;
        }
        seen.add(key);
        index.push(a, b, c);
    }
    if (g !== source) {
        g.dispose();
    }
    const out = new THREE.BufferGeometry();
    out.setAttribute('position', new THREE.BufferAttribute(outPos, 3));
    if (col) {
        out.setAttribute('color', new THREE.BufferAttribute(outCol, 3));
    }
    out.setIndex(index);
    out.computeVertexNormals();
    out.computeBoundingSphere();
    return out;
}

/**
 * Splits a geometry into square world tiles of `size` metres (triangle
 * centroid decides) so frustum culling drops the tiles behind the camera.
 * Keeps position / normal / color / uv; output is non-indexed.
 */
export function splitTiles(
    source: THREE.BufferGeometry,
    size: number = TILE_SIZE,
): THREE.BufferGeometry[] {
    const g = source.index ? source.toNonIndexed() : source;
    const names = ['position', 'normal', 'color', 'uv'].filter((n) =>
        g.getAttribute(n),
    );
    const attrs = names.map((n) => g.getAttribute(n) as THREE.BufferAttribute);
    const pos = attrs[0];
    const buckets = new Map<string, number[]>();
    for (let t = 0; t + 2 < pos.count; t += 3) {
        const cx = (pos.getX(t) + pos.getX(t + 1) + pos.getX(t + 2)) / 3;
        const cz = (pos.getZ(t) + pos.getZ(t + 1) + pos.getZ(t + 2)) / 3;
        const key = tileKey(cx, cz, size);
        const list = buckets.get(key);
        if (list) {
            list.push(t);
        } else {
            buckets.set(key, [t]);
        }
    }
    const out: THREE.BufferGeometry[] = [];
    for (const tris of buckets.values()) {
        const part = new THREE.BufferGeometry();
        attrs.forEach((a, k) => {
            const size2 = a.itemSize;
            const arr = new Float32Array(tris.length * 3 * size2);
            let o = 0;
            for (const t of tris) {
                for (let v = 0; v < 3; v++) {
                    for (let c = 0; c < size2; c++) {
                        arr[o++] = a.array[(t + v) * size2 + c] as number;
                    }
                }
            }
            part.setAttribute(names[k], new THREE.BufferAttribute(arr, size2));
        });
        part.computeBoundingSphere();
        out.push(part);
    }
    if (g !== source) {
        g.dispose();
    }
    source.dispose();
    return out;
}

/** Owns every cached GPU resource of one scene; `dispose()` frees them. */
export class Kit {
    private materials = new Map<string, THREE.Material>();
    private geometries = new Map<string, THREE.BufferGeometry>();
    private owned: { dispose(): void }[] = [];
    readonly gradient: THREE.DataTexture;
    /** Gentler ramp for the avatars (matches the shared character look). */
    readonly softGradient: THREE.DataTexture;
    anisotropy = 1;

    constructor() {
        this.gradient = this.ramp([150, 215, 255]);
        this.softGradient = this.ramp([178, 228, 255]);
    }

    private ramp(levels: number[]): THREE.DataTexture {
        const data = new Uint8Array(levels.length * 4);
        levels.forEach((v, i) => {
            data.set([v, v, v, 255], i * 4);
        });
        const tex = new THREE.DataTexture(
            data,
            levels.length,
            1,
            THREE.RGBAFormat,
        );
        tex.minFilter = THREE.NearestFilter;
        tex.magFilter = THREE.NearestFilter;
        tex.generateMipmaps = false;
        tex.needsUpdate = true;
        return this.own(tex);
    }

    /** Registers any disposable (texture, geometry, material) with the kit. */
    own<T extends { dispose(): void }>(item: T): T {
        this.owned.push(item);
        return item;
    }

    material<T extends THREE.Material>(key: string, make: () => T): T {
        let m = this.materials.get(key);
        if (!m) {
            m = make();
            this.materials.set(key, m);
        }
        return m as T;
    }

    geometry<T extends THREE.BufferGeometry>(key: string, make: () => T): T {
        let g = this.geometries.get(key);
        if (!g) {
            g = make();
            this.geometries.set(key, g);
        }
        return g as T;
    }

    /** Cartoon toon material of a solid colour. */
    toon(color: string, emissive = 0): THREE.MeshToonMaterial {
        return this.material(`toon|${color}|${emissive}`, () => {
            const m = new THREE.MeshToonMaterial({
                color,
                gradientMap: this.gradient,
            });
            if (emissive > 0) {
                m.emissive = new THREE.Color(color);
                m.emissiveIntensity = emissive;
            }
            return m;
        });
    }

    /** Toon material that reads per-vertex colours (baked parts). */
    vertexToon(soft = false): THREE.MeshToonMaterial {
        return this.material(
            `vtoon${soft}`,
            () =>
                new THREE.MeshToonMaterial({
                    vertexColors: true,
                    gradientMap: soft ? this.softGradient : this.gradient,
                }),
        );
    }

    /** Unlit material that reads per-vertex colours. */
    vertexBasic(): THREE.MeshBasicMaterial {
        return this.material(
            'vbasic',
            () => new THREE.MeshBasicMaterial({ vertexColors: true }),
        );
    }

    /** Cheap Lambert material that reads per-vertex colours (scenery). */
    vertexLambert(): THREE.MeshLambertMaterial {
        return this.material(
            'vlambert',
            () => new THREE.MeshLambertMaterial({ vertexColors: true }),
        );
    }

    lambert(color: string): THREE.MeshLambertMaterial {
        return this.material(
            `lambert|${color}`,
            () => new THREE.MeshLambertMaterial({ color }),
        );
    }

    /** Unlit additive glow. */
    glow(color: string, opacity = 0.8): THREE.MeshBasicMaterial {
        return this.material(
            `glow|${color}|${opacity}`,
            () =>
                new THREE.MeshBasicMaterial({
                    color,
                    transparent: true,
                    opacity,
                    blending: THREE.AdditiveBlending,
                    depthWrite: false,
                    fog: false,
                }),
        );
    }

    /** Canvas texture registered for disposal. */
    canvasTexture(
        width: number,
        height: number,
        draw: (ctx: CanvasRenderingContext2D, w: number, h: number) => void,
        repeat = false,
    ): THREE.CanvasTexture {
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        if (ctx) {
            draw(ctx, width, height);
        }
        const tex = new THREE.CanvasTexture(canvas);
        tex.colorSpace = THREE.SRGBColorSpace;
        tex.anisotropy = this.anisotropy;
        if (repeat) {
            tex.wrapS = THREE.RepeatWrapping;
            tex.wrapT = THREE.RepeatWrapping;
        }
        return this.own(tex);
    }

    dispose(): void {
        for (const m of this.materials.values()) {
            m.dispose();
        }
        for (const g of this.geometries.values()) {
            g.dispose();
        }
        for (const o of this.owned) {
            o.dispose();
        }
        this.materials.clear();
        this.geometries.clear();
        this.owned = [];
    }
}

const tmpObject = new THREE.Object3D();
const tmpColor = new THREE.Color();

/** Cartoon ink colour (same as the shared character outline). */
export const INK_COLOR = '#1d2238';

/**
 * Moves every vertex of a non-indexed geometry out along the normal
 * averaged over all vertices at the same position (hard edges stay closed).
 */
export function inflate(g: THREE.BufferGeometry, width: number): void {
    const pos = g.getAttribute('position') as THREE.BufferAttribute;
    if (!g.getAttribute('normal')) {
        g.computeVertexNormals();
    }
    const nrm = g.getAttribute('normal') as THREE.BufferAttribute;
    const sums = new Map<string, [number, number, number]>();
    const keys: string[] = new Array(pos.count);
    for (let i = 0; i < pos.count; i++) {
        const key = `${Math.round(pos.getX(i) * 1000)},${Math.round(pos.getY(i) * 1000)},${Math.round(pos.getZ(i) * 1000)}`;
        keys[i] = key;
        const s = sums.get(key);
        if (s) {
            s[0] += nrm.getX(i);
            s[1] += nrm.getY(i);
            s[2] += nrm.getZ(i);
        } else {
            sums.set(key, [nrm.getX(i), nrm.getY(i), nrm.getZ(i)]);
        }
    }
    for (let i = 0; i < pos.count; i++) {
        const s = sums.get(keys[i]) as [number, number, number];
        const len = Math.hypot(s[0], s[1], s[2]) || 1;
        pos.setXYZ(
            i,
            pos.getX(i) + (s[0] / len) * width,
            pos.getY(i) + (s[1] / len) * width,
            pos.getZ(i) + (s[2] / len) * width,
        );
    }
    pos.needsUpdate = true;
}

/** Transform matrix from position, Euler rotation (YXZ) and scale. */
export function compose(
    x: number,
    y: number,
    z: number,
    ry = 0,
    rx = 0,
    rz = 0,
    sx = 1,
    sy = sx,
    sz = sx,
): THREE.Matrix4 {
    tmpObject.position.set(x, y, z);
    tmpObject.rotation.set(rx, ry, rz, 'YXZ');
    tmpObject.scale.set(sx, sy, sz);
    tmpObject.updateMatrix();
    return tmpObject.matrix.clone();
}

/**
 * Collects many small coloured parts and merges them into one non-indexed
 * geometry with a `color` attribute (one draw call for the lot).
 */
export class Bake {
    private parts: THREE.BufferGeometry[] = [];
    /** When set, `addInk` is a no-op (far LOD / cheap scenery). */
    skipInk = false;

    /** `withUv` keeps texture coordinates (textured bakes). */
    constructor(private withUv = false) {}

    private keep(g: THREE.BufferGeometry, normals: boolean): void {
        for (const name of Object.keys(g.attributes)) {
            const keep =
                name === 'position' ||
                (normals && name === 'normal') ||
                (this.withUv && name === 'uv');
            if (!keep) {
                g.deleteAttribute(name);
            }
        }
        if (this.withUv && !g.getAttribute('uv')) {
            const count = g.getAttribute('position').count;
            g.setAttribute(
                'uv',
                new THREE.BufferAttribute(new Float32Array(count * 2), 2),
            );
        }
    }

    get size(): number {
        return this.parts.length;
    }

    add(
        source: THREE.BufferGeometry,
        color: string | THREE.Color,
        matrix: THREE.Matrix4,
        shadeJitter = 0,
        random: () => number = Math.random,
    ): void {
        const g = source.index ? source.toNonIndexed() : source.clone();
        this.keep(g, true);
        if (!g.getAttribute('normal')) {
            g.computeVertexNormals();
        }
        g.applyMatrix4(matrix);
        tmpColor.set(color);
        if (shadeJitter > 0) {
            const k = 1 + (random() * 2 - 1) * shadeJitter;
            tmpColor.multiplyScalar(k);
        }
        const count = g.getAttribute('position').count;
        const colors = new Float32Array(count * 3);
        for (let i = 0; i < count; i++) {
            colors[i * 3] = tmpColor.r;
            colors[i * 3 + 1] = tmpColor.g;
            colors[i * 3 + 2] = tmpColor.b;
        }
        g.setAttribute('color', new THREE.BufferAttribute(colors, 3));
        this.parts.push(g);
    }

    /** Shortcut: add at a position / rotation / scale. */
    put(
        source: THREE.BufferGeometry,
        color: string | THREE.Color,
        x: number,
        y: number,
        z: number,
        ry = 0,
        rx = 0,
        rz = 0,
        sx = 1,
        sy = sx,
        sz = sx,
    ): void {
        this.add(source, color, compose(x, y, z, ry, rx, rz, sx, sy, sz));
    }

    /**
     * Adds a cartoon outline for `source`: the part pushed out by `width`
     * metres along smoothed normals, with flipped winding so the normal
     * front-face material draws its back side only (inverted hull) in the
     * same draw call as the fill.
     */
    addInk(
        source: THREE.BufferGeometry,
        matrix: THREE.Matrix4,
        width: number,
        color: string = INK_COLOR,
    ): void {
        if (this.skipInk) {
            return;
        }
        const g = source.index ? source.toNonIndexed() : source.clone();
        this.keep(g, false);
        g.applyMatrix4(matrix);
        inflate(g, width);
        const pos = g.getAttribute('position') as THREE.BufferAttribute;
        const arr = pos.array as Float32Array;
        for (let i = 0; i + 8 < arr.length; i += 9) {
            for (let c = 0; c < 3; c++) {
                const t = arr[i + 3 + c];
                arr[i + 3 + c] = arr[i + 6 + c];
                arr[i + 6 + c] = t;
            }
        }
        g.computeVertexNormals();
        tmpColor.set(color);
        const count = pos.count;
        const colors = new Float32Array(count * 3);
        for (let i = 0; i < count; i++) {
            colors[i * 3] = tmpColor.r;
            colors[i * 3 + 1] = tmpColor.g;
            colors[i * 3 + 2] = tmpColor.b;
        }
        g.setAttribute('color', new THREE.BufferAttribute(colors, 3));
        this.parts.push(g);
    }

    /**
     * Adds a geometry that already has its own `color` attribute (swept
     * strips) as it is.
     */
    addColored(source: THREE.BufferGeometry, matrix?: THREE.Matrix4): void {
        const g = source.index ? source.toNonIndexed() : source.clone();
        const color = g.getAttribute('color');
        this.keep(g, true);
        if (color) {
            g.setAttribute('color', color);
        }
        if (!g.getAttribute('normal')) {
            g.computeVertexNormals();
        }
        if (matrix) {
            g.applyMatrix4(matrix);
        }
        this.parts.push(g);
    }

    /**
     * Like `add` but colours each triangle with `paint(triangle index)`
     * (striped umbrellas, painted tyres).
     */
    addPainted(
        source: THREE.BufferGeometry,
        paint: (triangle: number) => string,
        matrix: THREE.Matrix4,
    ): void {
        const g = source.index ? source.toNonIndexed() : source.clone();
        this.keep(g, true);
        g.applyMatrix4(matrix);
        const count = g.getAttribute('position').count;
        const colors = new Float32Array(count * 3);
        for (let i = 0; i < count; i++) {
            if (i % 3 === 0) {
                tmpColor.set(paint(i / 3));
            }
            colors[i * 3] = tmpColor.r;
            colors[i * 3 + 1] = tmpColor.g;
            colors[i * 3 + 2] = tmpColor.b;
        }
        g.setAttribute('color', new THREE.BufferAttribute(colors, 3));
        this.parts.push(g);
    }

    /**
     * Like `add` with a vertical two-tone: vertices low on the (unit,
     * -0.5..0.5) source get `under` (darker underside / skirt), the top
     * half keeps `color`, with an optional light `top` band.
     */
    addShaded(
        source: THREE.BufferGeometry,
        color: string,
        under: string,
        matrix: THREE.Matrix4,
        ink = 0,
        top: string | null = null,
    ): void {
        const g = source.index ? source.toNonIndexed() : source.clone();
        this.keep(g, true);
        if (!g.getAttribute('normal')) {
            g.computeVertexNormals();
        }
        const pos = g.getAttribute('position') as THREE.BufferAttribute;
        const count = pos.count;
        const colors = new Float32Array(count * 3);
        const base = new THREE.Color(color);
        const low = new THREE.Color(under);
        const high = top ? new THREE.Color(top) : base;
        for (let i = 0; i < count; i++) {
            const y = pos.getY(i);
            if (y < -0.12) {
                tmpColor.copy(low);
            } else if (y > 0.38) {
                tmpColor.copy(high);
            } else {
                tmpColor.copy(base);
            }
            colors[i * 3] = tmpColor.r;
            colors[i * 3 + 1] = tmpColor.g;
            colors[i * 3 + 2] = tmpColor.b;
        }
        g.applyMatrix4(matrix);
        g.setAttribute('color', new THREE.BufferAttribute(colors, 3));
        this.parts.push(g);
        if (ink > 0) {
            this.addInk(source, matrix, ink);
        }
    }

    /** Fill + outline in one go. */
    addOutlined(
        source: THREE.BufferGeometry,
        color: string | THREE.Color,
        matrix: THREE.Matrix4,
        ink: number,
    ): void {
        this.add(source, color, matrix);
        if (ink > 0) {
            this.addInk(source, matrix, ink);
        }
    }

    /** Merged geometry (null when empty); the parts are freed. */
    build(): THREE.BufferGeometry | null {
        if (this.parts.length === 0) {
            return null;
        }
        const merged = mergeGeometries(this.parts, false);
        for (const p of this.parts) {
            p.dispose();
        }
        this.parts = [];
        merged?.computeBoundingSphere();
        return merged;
    }
}

/** Unit primitives shared by the bakes (disposed by the kit). */
export class Shapes {
    constructor(private kit: Kit) {}

    box(): THREE.BoxGeometry {
        return this.kit.geometry('box', () => new THREE.BoxGeometry(1, 1, 1));
    }

    /** Unit cylinder (radius 1, height 1) along y. */
    cylinder(segments = 10, open = false): THREE.CylinderGeometry {
        return this.kit.geometry(
            `cyl${segments}${open}`,
            () => new THREE.CylinderGeometry(1, 1, 1, segments, 1, open),
        );
    }

    /** Unit cone (radius 1, height 1) along y, base at y = -0.5. */
    cone(segments = 8): THREE.ConeGeometry {
        return this.kit.geometry(
            `cone${segments}`,
            () => new THREE.ConeGeometry(1, 1, segments),
        );
    }

    sphere(detail = 1): THREE.IcosahedronGeometry {
        return this.kit.geometry(
            `ico${detail}`,
            () => new THREE.IcosahedronGeometry(1, detail),
        );
    }

    ball(w = 12, h = 8): THREE.SphereGeometry {
        return this.kit.geometry(
            `ball${w}x${h}`,
            () => new THREE.SphereGeometry(1, w, h),
        );
    }

    dodeca(): THREE.DodecahedronGeometry {
        return this.kit.geometry(
            'dodeca',
            () => new THREE.DodecahedronGeometry(1, 0),
        );
    }

    /** Unit rounded box (corner radius 0.22 of the unit), low segment count. */
    rbox(segments = 2): THREE.BufferGeometry {
        return this.kit.geometry(
            `rbox${segments}`,
            () => new RoundedBoxGeometry(1, 1, 1, segments, 0.22),
        );
    }

    /** Unit capsule along z (fits the unit box, rounded ends front/back). */
    capsule(): THREE.BufferGeometry {
        return this.kit.geometry('capsule-z', () =>
            new THREE.CapsuleGeometry(0.5, 1, 3, 10)
                .rotateX(Math.PI / 2)
                .scale(1, 1, 0.5),
        );
    }

    torus(): THREE.TorusGeometry {
        return this.kit.geometry(
            'torus',
            () => new THREE.TorusGeometry(1, 0.35, 4, 10),
        );
    }
}

/** Matrix of a cylinder of `radius` spanning from a to b. */
export function beam(
    a: THREE.Vector3,
    b: THREE.Vector3,
    radius: number,
): THREE.Matrix4 {
    const dir = new THREE.Vector3().subVectors(b, a);
    const length = dir.length();
    const q = new THREE.Quaternion().setFromUnitVectors(
        new THREE.Vector3(0, 1, 0),
        dir.normalize(),
    );
    const m = new THREE.Matrix4();
    m.compose(
        new THREE.Vector3().addVectors(a, b).multiplyScalar(0.5),
        q,
        new THREE.Vector3(radius, length, radius),
    );
    return m;
}

/** Rounded rectangle path. */
export function roundRect(
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    w: number,
    h: number,
    r: number,
): void {
    const rr = Math.min(r, w / 2, h / 2);
    ctx.beginPath();
    ctx.moveTo(x + rr, y);
    ctx.arcTo(x + w, y, x + w, y + h, rr);
    ctx.arcTo(x + w, y + h, x, y + h, rr);
    ctx.arcTo(x, y + h, x, y, rr);
    ctx.arcTo(x, y, x + w, y, rr);
    ctx.closePath();
}

/** Speckle noise over a canvas region (asphalt, dirt, sand grain). */
export function speckle(
    ctx: CanvasRenderingContext2D,
    w: number,
    h: number,
    colors: string[],
    count: number,
    size: number,
    random: () => number,
): void {
    for (let i = 0; i < count; i++) {
        ctx.fillStyle = colors[Math.floor(random() * colors.length)];
        const s = size * (0.5 + random());
        ctx.fillRect(random() * w, random() * h, s, s);
    }
}
