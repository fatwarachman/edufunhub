/**
 * One shared WebGL renderer for every 2D-sized character slot on a page
 * (portal, shop grid, leaderboard, Flag Quest map). Browsers cap WebGL
 * contexts at about 16, so avatars never get their own context: each one
 * renders its posed rig here and copies the pixels into its own 2D canvas.
 *
 * The GL canvas has a fixed size; smaller avatars render into the bottom-left
 * square of it (viewport + scissor), so mixed avatar sizes never resize or
 * reallocate the drawing buffer.
 */
import * as THREE from 'three';
import {
    feetShadow,
    type FeetShadow,
    frameView,
    renderPixelSize,
} from './character-view';
import { CHARACTER_HEIGHT, type CharacterPose } from './draw-character';
import { type CharacterRig, poseCharacter } from './model3d';

/** Same view box as the 2D avatar (tall hats + hops + shadow fit). */
export const VIEW_UNITS = CHARACTER_HEIGHT + 38;
/** Feet position in units from the top of the view box. */
export const FEET_Y = VIEW_UNITS - 10;
/** Camera tilt so the model reads as 3D (slight 3/4 top-down view). */
export const VIEW_TILT_DEG = 12;
/** Largest square rendered by the shared renderer, in device pixels. */
const MAX_PIXELS = 512;

interface Stage {
    renderer: THREE.WebGLRenderer;
    scene: THREE.Scene;
    camera: THREE.OrthographicCamera;
}

let stage: Stage | null = null;
let failed = false;
let lost = false;
const shadow: FeetShadow = { alpha: 0, rx: 0, ry: 0 };

function createStage(): Stage | null {
    if (failed || typeof document === 'undefined') {
        failed = true;
        return null;
    }
    try {
        const canvas = document.createElement('canvas');
        canvas.width = MAX_PIXELS;
        canvas.height = MAX_PIXELS;
        const renderer = new THREE.WebGLRenderer({
            canvas,
            alpha: true,
            antialias: true,
            preserveDrawingBuffer: false,
            powerPreference: 'low-power',
        });
        renderer.setPixelRatio(1);
        renderer.setSize(MAX_PIXELS, MAX_PIXELS, false);
        renderer.setClearColor(0x000000, 0);
        renderer.autoClear = false;

        canvas.addEventListener('webglcontextlost', (event) => {
            event.preventDefault();
            lost = true;
        });
        canvas.addEventListener('webglcontextrestored', () => {
            lost = false;
        });

        const scene = new THREE.Scene();
        scene.add(new THREE.HemisphereLight(0xffffff, 0xd9cbb5, 1.9));
        const sun = new THREE.DirectionalLight(0xffffff, 1.6);
        sun.position.set(60, 140, 120);
        scene.add(sun);

        const framing = frameView(VIEW_UNITS, FEET_Y, VIEW_TILT_DEG);
        const camera = new THREE.OrthographicCamera(
            framing.left,
            framing.right,
            framing.top,
            framing.bottom,
            1,
            1000,
        );
        camera.position.set(...framing.eye);
        camera.lookAt(0, framing.targetY, 0);
        camera.updateProjectionMatrix();
        camera.updateMatrixWorld();

        return { renderer, scene, camera };
    } catch {
        failed = true;
        return null;
    }
}

function ensureStage(): Stage | null {
    if (!stage && !failed) {
        stage = createStage();
    }
    return lost ? null : stage;
}

/** True while the shared WebGL renderer can be used (callers else draw 2D). */
export function webglAvailable(): boolean {
    return ensureStage() !== null;
}

/**
 * Renders the (already posed) rig into the bottom-left `pixels` square of
 * the shared GL canvas. Returns the source canvas or null on failure. The
 * caller must copy it right away (the drawing buffer is not preserved).
 */
function renderRig(
    rig: CharacterRig,
    pixels: number,
): HTMLCanvasElement | null {
    const current = ensureStage();
    if (!current) {
        return null;
    }
    const { renderer, scene, camera } = current;
    const parent = rig.root.parent;
    try {
        scene.add(rig.root);
        renderer.setScissorTest(true);
        renderer.setScissor(0, 0, pixels, pixels);
        renderer.setViewport(0, 0, pixels, pixels);
        renderer.clear();
        renderer.render(scene, camera);
        return renderer.domElement;
    } catch {
        return null;
    } finally {
        scene.remove(rig.root);
        if (parent) {
            parent.add(rig.root);
        }
    }
}

/**
 * Draws the posed rig into a square 2D avatar canvas: clear, optional round
 * backdrop, ground shadow (shrinks with `bob`) and the 3D render on top.
 * Returns false when WebGL is unavailable so the caller can draw in 2D.
 */
export function renderCharacterTo(
    canvas: HTMLCanvasElement,
    rig: CharacterRig,
    opts: { backdrop: boolean; pixelSize: number; bob?: number },
): boolean {
    const ctx = canvas.getContext('2d');
    if (!ctx) {
        return false;
    }
    const pixels = renderPixelSize(opts.pixelSize, MAX_PIXELS);
    const source = renderRig(rig, pixels);
    if (!source) {
        return false;
    }
    const size = canvas.width;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, size, canvas.height);
    if (opts.backdrop) {
        ctx.fillStyle = 'rgba(255, 217, 61, 0.3)';
        ctx.beginPath();
        ctx.arc(size / 2, canvas.height / 2, size * 0.46, 0, Math.PI * 2);
        ctx.fill();
    }
    const scale = size / VIEW_UNITS;
    feetShadow(opts.bob ?? 0, shadow);
    ctx.setTransform(scale, 0, 0, scale, size / 2, 0);
    ctx.fillStyle = `rgba(20, 40, 20, ${shadow.alpha})`;
    ctx.beginPath();
    ctx.ellipse(0, FEET_Y, shadow.rx, shadow.ry, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.imageSmoothingEnabled = true;
    ctx.drawImage(
        source,
        0,
        source.height - pixels,
        pixels,
        pixels,
        0,
        0,
        size,
        canvas.height,
    );
    return true;
}

/**
 * Flag Quest map: poses the rig and draws it with its feet at (x, y) in the
 * current `ctx` space. `scale` = device pixels per map unit (dpr * zoom).
 * Returns false when WebGL is unavailable (draw the 2D character instead).
 */
export function drawCharacter3DAt(
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    scale: number,
    rig: CharacterRig,
    pose: CharacterPose,
): boolean {
    if (!ensureStage()) {
        return false;
    }
    poseCharacter(rig, pose);
    const pixels = renderPixelSize(VIEW_UNITS * scale, MAX_PIXELS);
    const source = renderRig(rig, pixels);
    if (!source) {
        return false;
    }
    ctx.drawImage(
        source,
        0,
        source.height - pixels,
        pixels,
        pixels,
        x - VIEW_UNITS / 2,
        y - FEET_Y,
        VIEW_UNITS,
        VIEW_UNITS,
    );
    return true;
}
