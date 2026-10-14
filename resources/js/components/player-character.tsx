import { type Character3D } from '@/lib/character/character-3d';
import {
    character3D,
    loadCharacter3D,
} from '@/lib/character/character-3d-loader';
import {
    CHARACTER_HEIGHT,
    type CharacterLook,
    type CharacterPose,
    drawCharacter,
    STANDING_POSE,
} from '@/lib/character/draw-character';
import { createIdleAnimator } from '@/lib/character/idle-animation';
import { useEffect, useRef } from 'react';

/**
 * Drawing units framed by the canvas. Tall hats reach about 97 units above
 * the feet, so the frame leaves room above them (plus hops) and the shadow.
 */
const VIEW_UNITS = CHARACTER_HEIGHT + 38;
/** Feet position (in drawing units from the top of the frame). */
const FEET_Y = VIEW_UNITS - 10;
/** Idle animation frame rate: smooth enough, light on phones with many avatars. */
const FRAME_MS = 1000 / 30;
/** Slowest idle rate the adaptive throttle may fall back to (12 fps). */
const SLOWEST_FRAME_MS = 1000 / 12;
/** Time budget (ms) all avatars may take per frame before throttling. */
const FRAME_BUDGET_MS = 8;

export interface CharacterData extends CharacterLook {
    nickname: string | null;
}

interface Props {
    character: CharacterLook;
    /** Rendered width/height in CSS px. Defaults to filling the parent (max 192px). */
    size?: number;
    /** Show the round backdrop behind the character. */
    backdrop?: boolean;
    /** Idle animation (breathing, blinking and random moves). On by default. */
    animated?: boolean;
    className?: string;
}

type Frame = (now: number) => void;

/**
 * One shared requestAnimationFrame loop for every animated avatar on the
 * page, so a shop grid with 25 avatars still costs a single loop.
 */
const frames = new Set<Frame>();
let loop = 0;
let lastTick = 0;
/** Current idle frame interval; grows when rendering all avatars is slow. */
let frameMs = FRAME_MS;
/** Smoothed time (ms) one tick of all avatars takes. */
let tickCost = 0;

function tick(now: number) {
    loop = requestAnimationFrame(tick);
    if (now - lastTick < frameMs) {
        return;
    }
    lastTick = now;
    const started = performance.now();
    frames.forEach((frame) => frame(now));
    // Adaptive throttle: slow devices (or many 3D avatars) animate at a
    // lower rate instead of making the whole page janky.
    tickCost = tickCost * 0.8 + (performance.now() - started) * 0.2;
    if (tickCost > FRAME_BUDGET_MS) {
        frameMs = Math.min(SLOWEST_FRAME_MS, frameMs * 1.2);
    } else if (tickCost < FRAME_BUDGET_MS / 2) {
        frameMs = Math.max(FRAME_MS, frameMs * 0.95);
    }
}

function subscribe(frame: Frame): () => void {
    frames.add(frame);
    if (!loop) {
        loop = requestAnimationFrame(tick);
    }
    return () => {
        frames.delete(frame);
        if (frames.size === 0 && loop) {
            cancelAnimationFrame(loop);
            loop = 0;
        }
    };
}

function hash(text: string): number {
    let value = 2166136261;
    for (let index = 0; index < text.length; index++) {
        value = Math.imul(value ^ text.charCodeAt(index), 16777619);
    }
    return value >>> 0;
}

/**
 * Builds the 3D rig; null when the model cannot be built (the 2D drawing
 * is used instead).
 */
function tryBuild(
    stack: Character3D,
    look: CharacterLook,
): ReturnType<Character3D['buildCharacter']> | null {
    try {
        return stack.buildCharacter(look);
    } catch {
        return null;
    }
}

/**
 * Portal avatar: the 3D model of the in-game character (same shapes as the
 * Flag Quest drawing), rendered through one shared WebGL renderer, with the
 * 2D drawing as fallback when WebGL is unavailable. It idles with a random,
 * non-repeating sequence of moves; reduced-motion users and off-screen
 * avatars get the still pose.
 */
export default function PlayerCharacter({
    character,
    size,
    backdrop = true,
    animated = true,
    className = 'mx-auto w-full max-w-48',
}: Props) {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const signature = JSON.stringify(character);

    useEffect(() => {
        const canvas = canvasRef.current;
        const ctx = canvas?.getContext('2d');
        if (!canvas || !ctx) {
            return;
        }
        const look = JSON.parse(signature) as CharacterLook;
        const items = look.items ?? {};
        const animator = createIdleAnimator(
            hash(signature) ^ Math.floor(Math.random() * 0xffffffff),
            { front: Boolean(items.weapon), back: Boolean(items.offhand) },
        );
        let scale = 1;
        let stack: Character3D | null = character3D();
        let rig = stack ? tryBuild(stack, look) : null;
        let lastPose: CharacterPose = STANDING_POSE;
        let disposed = false;

        const resize = () => {
            const px = canvas.clientWidth || size || 192;
            const dpr = Math.min(window.devicePixelRatio || 1, 3);
            const width = Math.round(px * dpr);
            if (canvas.width !== width) {
                canvas.width = width;
                canvas.height = width;
            }
            scale = (px / VIEW_UNITS) * dpr;
        };

        const draw = (pose: CharacterPose) => {
            lastPose = pose;
            if (stack && rig) {
                stack.poseCharacter(rig, pose);
                if (
                    stack.renderCharacterTo(canvas, rig, {
                        backdrop,
                        pixelSize: canvas.width,
                        bob: pose.bob,
                    })
                ) {
                    canvas.dataset.render = '3d';
                    return;
                }
            }
            canvas.dataset.render = '2d';
            ctx.setTransform(1, 0, 0, 1, 0, 0);
            ctx.clearRect(0, 0, canvas.width, canvas.height);
            if (backdrop) {
                ctx.fillStyle = 'rgba(255, 217, 61, 0.3)';
                ctx.beginPath();
                ctx.arc(
                    canvas.width / 2,
                    canvas.height / 2,
                    canvas.width * 0.46,
                    0,
                    Math.PI * 2,
                );
                ctx.fill();
            }
            ctx.setTransform(scale, 0, 0, scale, canvas.width / 2, 0);
            // The shadow shrinks while the avatar is in the air.
            const lift = Math.max(0, Math.min(1, pose.bob / 10));
            ctx.fillStyle = `rgba(20, 40, 20, ${0.18 - lift * 0.08})`;
            ctx.beginPath();
            ctx.ellipse(
                0,
                FEET_Y,
                16 * (1 - lift * 0.3),
                5 * (1 - lift * 0.3),
                0,
                0,
                Math.PI * 2,
            );
            ctx.fill();
            drawCharacter(ctx, -2, FEET_Y, look, pose);
        };

        resize();
        draw(STANDING_POSE);
        // three.js loads lazily: show the 2D drawing until the 3D stack is
        // ready, then switch over (or stay 2D if it cannot load).
        if (!stack) {
            void loadCharacter3D().then((loaded) => {
                if (disposed || !loaded) {
                    return;
                }
                stack = loaded;
                rig = tryBuild(loaded, look);
                draw(lastPose);
            });
        }
        const observer = new ResizeObserver(() => {
            resize();
            draw(STANDING_POSE);
        });
        observer.observe(canvas);

        const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)');
        const release = () => {
            disposed = true;
            if (stack && rig) {
                stack.disposeCharacter(rig);
            }
            rig = null;
        };
        if (!animated || typeof IntersectionObserver === 'undefined') {
            return () => {
                observer.disconnect();
                release();
            };
        }

        let unsubscribe: (() => void) | null = null;
        let visible = false;
        const sync = () => {
            const run =
                visible &&
                !reduced?.matches &&
                document.visibilityState === 'visible';
            if (run && !unsubscribe) {
                unsubscribe = subscribe((now) => draw(animator.pose(now)));
            } else if (!run && unsubscribe) {
                unsubscribe();
                unsubscribe = null;
                draw(STANDING_POSE);
            }
        };
        const viewport = new IntersectionObserver((entries) => {
            visible = entries.some((entry) => entry.isIntersecting);
            sync();
        });
        viewport.observe(canvas);
        document.addEventListener('visibilitychange', sync);
        reduced?.addEventListener?.('change', sync);

        return () => {
            observer.disconnect();
            viewport.disconnect();
            document.removeEventListener('visibilitychange', sync);
            reduced?.removeEventListener?.('change', sync);
            unsubscribe?.();
            release();
        };
    }, [signature, size, backdrop, animated]);

    return (
        <canvas
            ref={canvasRef}
            className={`aspect-square ${className}`}
            style={size ? { width: size, height: size } : undefined}
            data-character-color={character.color}
            data-character-gender={character.gender ?? 'boy'}
            data-character-items={Object.values(character.items ?? {})
                .filter(Boolean)
                .map((item) => item?.style)
                .join(' ')}
            data-animated={animated ? 'true' : 'false'}
            aria-hidden="true"
        />
    );
}
