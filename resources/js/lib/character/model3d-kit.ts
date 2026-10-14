/**
 * Shared building blocks for the 3D character (model3d.ts body, model3d-items.ts
 * items): toon materials, the ink outline (inverted hull), colour helpers and a
 * geometry cache. Units match the 2D drawing: 1 unit = 1 px of draw-character.ts,
 * feet at y = 0, +y up, +x to the character's front-right (where the 2D face
 * looks), +z toward the camera.
 */
import * as THREE from 'three';

export const INK = '#1d2238';
/** Outline thickness in drawing units (2D LINE is 2.2 px, half sits outside). */
export const OUTLINE = 1.1;

/** Head sphere centre in head-group space (neck pivot at the origin). */
export const HEAD_CENTER: readonly [number, number, number] = [1, 17, 0];
export const HEAD_RADIUS = 17;
/**
 * Top-down tilt of the avatar camera (character-renderer VIEW_TILT_DEG).
 * Face features are placed so they land on the 2D pixel from this view.
 */
export const FACE_TILT = (12 * Math.PI) / 180;

/**
 * Head-group point that the default camera sees at the 2D offset (x, y)
 * from the head centre (y up), `lift` units above the head sphere. Points
 * outside the head disc stay in the plane through the centre. The 2D face
 * looks to the viewer's right (3/4 view), so features use the 2D x values
 * (eyes at x = +6 and +13, mouth +10, blush +15, ear -9).
 */
export function headPoint(
    x: number,
    y: number,
    lift = 0,
    target = new THREE.Vector3(),
): THREE.Vector3 {
    const r = HEAD_RADIUS + lift;
    const depth = Math.sqrt(Math.max(0, r * r - x * x - y * y));
    const cos = Math.cos(FACE_TILT);
    const sin = Math.sin(FACE_TILT);
    return target.set(
        HEAD_CENTER[0] + x,
        HEAD_CENTER[1] + y * cos + depth * sin,
        HEAD_CENTER[2] - y * sin + depth * cos,
    );
}

const HEX = /^#[0-9a-f]{6}$|^#[0-9a-f]{3}$/i;

/** Item and look colours come from the database: anything else falls back. */
export function safeColor(
    color: string | null | undefined,
    fallback: string,
): string {
    return color && HEX.test(color) ? color : fallback;
}

/** Same maths as draw-character.ts `shade()` so 2D and 3D tints match. */
export function shade(hex: string, amount: number): string {
    const value = hex.replace('#', '');
    const full =
        value.length === 3
            ? value
                  .split('')
                  .map((c) => c + c)
                  .join('')
            : value;
    const num = parseInt(full, 16);
    if (Number.isNaN(num)) {
        return hex;
    }
    const channel = (shift: number) => {
        const c = (num >> shift) & 255;
        const next = amount < 0 ? c * (1 + amount) : c + (255 - c) * amount;
        return Math.max(0, Math.min(255, Math.round(next)));
    };
    return `#${[channel(16), channel(8), channel(0)].map((c) => c.toString(16).padStart(2, '0')).join('')}`;
}

let gradient: THREE.DataTexture | null = null;

/** Three-step toon ramp: flat cartoon shading like the 2D fills. */
function toonGradient(): THREE.DataTexture {
    if (!gradient) {
        // Gentle steps keep the 2D flat fills (no orange shift on skin).
        const data = new Uint8Array([
            178, 178, 178, 255, 228, 228, 228, 255, 255, 255, 255, 255,
        ]);
        gradient = new THREE.DataTexture(data, 3, 1, THREE.RGBAFormat);
        gradient.minFilter = THREE.NearestFilter;
        gradient.magFilter = THREE.NearestFilter;
        gradient.generateMipmaps = false;
        gradient.needsUpdate = true;
    }
    return gradient;
}

const materials = new Map<string, THREE.Material>();

/** Cached toon material for a fill colour. */
export function toon(
    color: string,
    opts: { opacity?: number; side?: THREE.Side } = {},
): THREE.Material {
    const safe = safeColor(color, '#999999').toLowerCase();
    const key = `t${safe}|${opts.opacity ?? 1}|${opts.side ?? THREE.FrontSide}`;
    let m = materials.get(key);
    if (!m) {
        const mat = new THREE.MeshToonMaterial({
            color: safe,
            gradientMap: toonGradient(),
        });
        if (opts.opacity !== undefined && opts.opacity < 1) {
            mat.transparent = true;
            mat.opacity = opts.opacity;
        }
        if (opts.side !== undefined) {
            mat.side = opts.side;
        }
        m = mat;
        materials.set(key, m);
    }
    return m;
}

/** Flat unlit colour (eye highlights, ink details). */
export function flat(color: string): THREE.Material {
    const safe = safeColor(color, '#999999').toLowerCase();
    const key = `f${safe}`;
    let m = materials.get(key);
    if (!m) {
        m = new THREE.MeshBasicMaterial({ color: safe });
        materials.set(key, m);
    }
    return m;
}

/** Thinnest ink line in drawing units, so tiny details still read. */
export const MIN_INK = 1.4;
/** Gain from the `outline` option to the drawn ink width in drawing units. */
const INK_GAIN = 1.7;

/** Ink width actually drawn for an `outline` option value (0 = none). */
export function inkWidth(outline: number): number {
    if (!(outline > 0)) {
        return 0;
    }
    return Math.max(MIN_INK, outline * INK_GAIN);
}

const inkMaterials = new Map<string, THREE.MeshBasicMaterial>();

const INK_VERTEX_HEAD = /* glsl */ `#include <common>
attribute vec3 outlineNormal;
uniform float inkWidth;`;

/**
 * Normal-offset hull: every vertex moves out along its smoothed normal by a
 * constant width in view space (times the mesh's mean scale), so long thin
 * parts get the same thick ink as the head, unlike a uniform scale-up.
 */
const INK_VERTEX_PROJECT = /* glsl */ `vec4 mvPosition = modelViewMatrix * vec4( transformed, 1.0 );
float inkScale = pow( abs( determinant( mat3( modelViewMatrix ) ) ), 1.0 / 3.0 );
vec3 inkNormal = normalMatrix * outlineNormal;
float inkLength = length( inkNormal );
if ( inkLength > 0.0 ) {
    mvPosition.xyz += ( inkNormal / inkLength ) * inkWidth * inkScale;
}
gl_Position = projectionMatrix * mvPosition;`;

/** Back-face ink used by the hull outline, cached per width. */
function inkHull(width: number): THREE.MeshBasicMaterial {
    const rounded = Math.round(width * 20) / 20;
    const key = rounded.toFixed(2);
    let m = inkMaterials.get(key);
    if (!m) {
        const mat = new THREE.MeshBasicMaterial({
            color: INK,
            side: THREE.BackSide,
        });
        mat.onBeforeCompile = (shader) => {
            shader.uniforms.inkWidth = { value: rounded };
            shader.vertexShader = shader.vertexShader
                .replace('#include <common>', INK_VERTEX_HEAD)
                .replace('#include <project_vertex>', INK_VERTEX_PROJECT);
        };
        mat.customProgramCacheKey = () => 'edufunhub-ink-hull';
        m = mat;
        inkMaterials.set(key, m);
    }
    return m;
}

const smoothed = new WeakSet<THREE.BufferGeometry>();

/**
 * Adds `outlineNormal`: the vertex normals averaged over every vertex at the
 * same position, so hard edges (boxes, cylinder caps, extrusions) move out
 * together and the hull never cracks open at a crease.
 */
function ensureOutlineNormals(g: THREE.BufferGeometry): void {
    if (smoothed.has(g) && g.getAttribute('outlineNormal')) {
        return;
    }
    smoothed.add(g);
    const position = g.getAttribute('position');
    if (!position) {
        return;
    }
    if (!g.getAttribute('normal')) {
        g.computeVertexNormals();
    }
    const normal = g.getAttribute('normal');
    const count = position.count;
    const sums = new Map<string, [number, number, number]>();
    const keys: string[] = new Array(count);
    for (let i = 0; i < count; i++) {
        const key = `${Math.round(position.getX(i) * 100)},${Math.round(position.getY(i) * 100)},${Math.round(position.getZ(i) * 100)}`;
        keys[i] = key;
        let sum = sums.get(key);
        if (!sum) {
            sum = [0, 0, 0];
            sums.set(key, sum);
        }
        sum[0] += normal.getX(i);
        sum[1] += normal.getY(i);
        sum[2] += normal.getZ(i);
    }
    const out = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
        const [x, y, z] = sums.get(keys[i]) ?? [0, 0, 0];
        const length = Math.hypot(x, y, z);
        if (length > 1e-6) {
            out[i * 3] = x / length;
            out[i * 3 + 1] = y / length;
            out[i * 3 + 2] = z / length;
        } else {
            out[i * 3] = normal.getX(i);
            out[i * 3 + 1] = normal.getY(i);
            out[i * 3 + 2] = normal.getZ(i);
        }
    }
    g.setAttribute('outlineNormal', new THREE.BufferAttribute(out, 3));
}

const geometries = new Map<string, THREE.BufferGeometry>();

/** Geometry cache: same key, same shape, shared by every character. */
export function geo(
    key: string,
    make: () => THREE.BufferGeometry,
): THREE.BufferGeometry {
    let g = geometries.get(key);
    if (!g) {
        g = make();
        geometries.set(key, g);
    }
    return g;
}

/**
 * A filled part with the thick ink outline of the 2D drawing: the fill mesh
 * plus a back-face hull in ink pushed out along the normals. `outline` 0 =
 * no outline; other values map through `inkWidth()` (at least `MIN_INK`
 * units wide). `ink` sets the exact ink width in drawing units instead.
 */
export function part(
    g: THREE.BufferGeometry,
    color: string,
    position: [number, number, number] = [0, 0, 0],
    opts: {
        outline?: number;
        opacity?: number;
        flat?: boolean;
        ink?: number;
    } = {},
): THREE.Group {
    const group = new THREE.Group();
    group.position.set(...position);
    const fill = new THREE.Mesh(
        g,
        opts.flat ? flat(color) : toon(color, { opacity: opts.opacity }),
    );
    group.add(fill);
    const width =
        opts.ink !== undefined
            ? Math.max(0, opts.ink)
            : inkWidth(opts.outline ?? OUTLINE);
    if (width > 0) {
        ensureOutlineNormals(g);
        const hull = new THREE.Mesh(g, inkHull(width));
        hull.renderOrder = -1;
        // The hull grows on the GPU, outside the geometry's bounding sphere.
        hull.frustumCulled = false;
        group.add(hull);
    }
    return group;
}

/**
 * Extruded flat shape (a 2D outline made thick), centred on z. Draw the shape
 * in y-UP units: negate the y values copied from draw-character.ts.
 */
export function extrude(
    key: string,
    draw: (shape: THREE.Shape) => void,
    depth: number,
): THREE.BufferGeometry {
    return geo(`x:${key}:${depth}`, () => {
        const shape = new THREE.Shape();
        draw(shape);
        const g = new THREE.ExtrudeGeometry(shape, {
            depth,
            bevelEnabled: true,
            bevelThickness: Math.min(1, depth / 4),
            bevelSize: Math.min(0.8, depth / 5),
            bevelSegments: 2,
            curveSegments: 10,
        });
        g.translate(0, 0, -depth / 2);
        g.computeVertexNormals();
        return g;
    });
}
