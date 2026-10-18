/**
 * Canvas-drawn textures of the EduKart scene (road surfaces, kerbs,
 * checkered line, speed pads, crates, answer labels, signs). No emoji: every
 * icon is drawn with paths. Player-facing text only arrives here already
 * localised (answer labels) and is drawn as plain canvas text.
 */
import * as THREE from 'three';
import { FONT_DISPLAY, type Kit, roundRect, speckle } from './scene-kit';
import { fitLabel, luminance, seededRandom, shadeHex } from './scene-text';
import type { SceneTheme } from './scene-theme';

/** Road surface: u across the road (0 = left edge), v along (8 m tile). */
export function roadTexture(kit: Kit, theme: SceneTheme): THREE.CanvasTexture {
    const rnd = seededRandom(7);
    return kit.canvasTexture(
        256,
        512,
        (ctx, w, h) => {
            ctx.fillStyle = theme.road.base;
            ctx.fillRect(0, 0, w, h);
            speckle(ctx, w, h, theme.road.speckle, 5200, 2.4, rnd);
            // Tyre marks / racing line wear.
            ctx.fillStyle = theme.road.marks;
            for (const u of [0.3, 0.37, 0.63, 0.7]) {
                ctx.fillRect(u * w - 5, 0, 10, h);
            }
            // Darker edges (dirt pushed to the side / old paint).
            const edge = ctx.createLinearGradient(0, 0, w, 0);
            edge.addColorStop(0, 'rgba(0,0,0,0.28)');
            edge.addColorStop(0.08, 'rgba(0,0,0,0)');
            edge.addColorStop(0.92, 'rgba(0,0,0,0)');
            edge.addColorStop(1, 'rgba(0,0,0,0.28)');
            ctx.fillStyle = edge;
            ctx.fillRect(0, 0, w, h);
            if (theme.road.edgeLine) {
                ctx.fillStyle = theme.road.edgeLine;
                ctx.fillRect(7, 0, 7, h);
                ctx.fillRect(w - 14, 0, 7, h);
            }
            if (theme.road.dash) {
                ctx.fillStyle = theme.road.dash;
                ctx.fillRect(w / 2 - 4, 0, 8, h * 0.45);
            }
        },
        true,
    );
}

/** Red / white kerb blocks (v along the track: one red + one white). */
export function kerbTexture(kit: Kit): THREE.CanvasTexture {
    return kit.canvasTexture(
        64,
        128,
        (ctx, w, h) => {
            ctx.fillStyle = '#f4f4f4';
            ctx.fillRect(0, 0, w, h);
            ctx.fillStyle = '#e02a2a';
            ctx.fillRect(0, 0, w, h / 2);
            ctx.fillStyle = 'rgba(0,0,0,0.18)';
            ctx.fillRect(0, h / 2 - 3, w, 3);
            ctx.fillRect(0, h - 3, w, 3);
            ctx.fillStyle = 'rgba(255,255,255,0.25)';
            ctx.fillRect(0, 0, 6, h);
        },
        true,
    );
}

/** Black / white checkered start-finish line. */
export function checkerTexture(kit: Kit): THREE.CanvasTexture {
    const tex = kit.canvasTexture(256, 64, (ctx, w, h) => {
        const cell = h / 4;
        for (let y = 0; y < 4; y++) {
            for (let x = 0; x < w / cell; x++) {
                ctx.fillStyle = (x + y) % 2 === 0 ? '#111111' : '#f8f8f8';
                ctx.fillRect(x * cell, y * cell, cell, cell);
            }
        }
    });
    tex.magFilter = THREE.NearestFilter;
    // Repeats across the road (clamped, the far half smeared to stripes).
    tex.wrapS = THREE.RepeatWrapping;
    tex.wrapT = THREE.RepeatWrapping;
    return tex;
}

/** Glowing green speed pad with arrows (scrolls along v). */
export function padTexture(kit: Kit): THREE.CanvasTexture {
    return kit.canvasTexture(
        128,
        128,
        (ctx, w, h) => {
            ctx.fillStyle = '#0d7a2b';
            ctx.fillRect(0, 0, w, h);
            ctx.fillStyle = '#35e05a';
            roundRect(ctx, 6, 4, w - 12, h - 8, 10);
            ctx.fill();
            ctx.lineJoin = 'round';
            ctx.lineCap = 'round';
            ctx.strokeStyle = '#f4ffb0';
            ctx.lineWidth = 16;
            ctx.beginPath();
            // Arrow pointing along +v (track forward; canvas top = v 1).
            ctx.moveTo(22, 90);
            ctx.lineTo(w / 2, 36);
            ctx.lineTo(w - 22, 90);
            ctx.stroke();
            ctx.strokeStyle = '#0b5c20';
            ctx.lineWidth = 4;
            ctx.strokeRect(2, 0, w - 4, h);
        },
        true,
    );
}

/** Yellow / black chevrons for ramps. */
export function chevronTexture(kit: Kit): THREE.CanvasTexture {
    return kit.canvasTexture(
        128,
        128,
        (ctx, w, h) => {
            ctx.fillStyle = '#ffcf2e';
            ctx.fillRect(0, 0, w, h);
            ctx.fillStyle = '#1e1e1e';
            ctx.beginPath();
            ctx.moveTo(0, 108);
            ctx.lineTo(w / 2, 44);
            ctx.lineTo(w, 108);
            ctx.lineTo(w, 72);
            ctx.lineTo(w / 2, 8);
            ctx.lineTo(0, 72);
            ctx.closePath();
            ctx.fill();
        },
        true,
    );
}

/**
 * Lane stripe of the answer reading zone: crisp opaque band in the box
 * colour with hard white edges and chevrons pointing forward (v = along
 * the track, canvas top = forward). One tile per 4 m.
 */
export function zoneTexture(kit: Kit, color: string): THREE.CanvasTexture {
    const tex = kit.canvasTexture(
        64,
        128,
        (ctx, w, h) => {
            ctx.clearRect(0, 0, w, h);
            const edge = 7;
            ctx.fillStyle = color;
            ctx.fillRect(edge, 0, w - edge * 2, h);
            ctx.fillStyle = '#ffffff';
            ctx.fillRect(0, 0, edge - 2, h);
            ctx.fillRect(w - edge + 2, 0, edge - 2, h);
            ctx.lineJoin = 'miter';
            ctx.lineCap = 'butt';
            ctx.lineWidth = 12;
            ctx.strokeStyle = '#ffffff';
            ctx.beginPath();
            ctx.moveTo(14, 92);
            ctx.lineTo(w / 2, 46);
            ctx.lineTo(w - 14, 92);
            ctx.stroke();
            ctx.lineWidth = 3;
            ctx.strokeStyle = shadeHex(color, -0.45);
            ctx.beginPath();
            ctx.moveTo(14, 102);
            ctx.lineTo(w / 2, 56);
            ctx.lineTo(w - 14, 102);
            ctx.stroke();
        },
        true,
    );
    tex.wrapS = THREE.ClampToEdgeWrapping;
    return tex;
}

/**
 * CTR '?' crate side: planks, metal-banded edges with rivets and a big
 * question mark (tinted by the material colour).
 */
export function crateTexture(kit: Kit): THREE.CanvasTexture {
    const rnd = seededRandom(11);
    return kit.canvasTexture(128, 128, (ctx, w, h) => {
        ctx.fillStyle = '#f0c27a';
        ctx.fillRect(0, 0, w, h);
        speckle(ctx, w, h, ['#d9a35a', '#f7d49a', '#c98f48'], 500, 2, rnd);
        ctx.strokeStyle = 'rgba(110,62,20,0.55)';
        ctx.lineWidth = 3;
        for (let y = 32; y < h; y += 32) {
            ctx.beginPath();
            ctx.moveTo(0, y);
            ctx.lineTo(w, y);
            ctx.stroke();
        }
        // Metal bands on every edge + corner rivets.
        ctx.strokeStyle = '#59606b';
        ctx.lineWidth = 16;
        ctx.strokeRect(8, 8, w - 16, h - 16);
        ctx.strokeStyle = '#aab3bf';
        ctx.lineWidth = 4;
        ctx.strokeRect(6, 6, w - 12, h - 12);
        ctx.fillStyle = '#e6ebf1';
        for (const [x, y] of [
            [10, 10],
            [w - 10, 10],
            [10, h - 10],
            [w - 10, h - 10],
            [w / 2, 10],
            [w / 2, h - 10],
        ]) {
            ctx.beginPath();
            ctx.arc(x, y, 4, 0, Math.PI * 2);
            ctx.fill();
        }
        ctx.font = `900 78px ${FONT_DISPLAY}`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.lineWidth = 8;
        ctx.strokeStyle = '#5a3210';
        ctx.strokeText('?', w / 2, h / 2 + 4);
        ctx.fillStyle = '#fff6d8';
        ctx.fillText('?', w / 2, h / 2 + 4);
    });
}

/** TNT crate face. */
export function tntTexture(kit: Kit): THREE.CanvasTexture {
    return kit.canvasTexture(128, 128, (ctx, w, h) => {
        ctx.fillStyle = '#d9822b';
        ctx.fillRect(0, 0, w, h);
        ctx.strokeStyle = '#6b3a12';
        ctx.lineWidth = 10;
        ctx.strokeRect(5, 5, w - 10, h - 10);
        ctx.fillStyle = '#c4161c';
        ctx.fillRect(10, 38, w - 20, 52);
        ctx.font = `900 46px ${FONT_DISPLAY}`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.lineWidth = 6;
        ctx.strokeStyle = '#2b0b06';
        ctx.strokeText('TNT', w / 2, 66);
        ctx.fillStyle = '#ffe14d';
        ctx.fillText('TNT', w / 2, 66);
    });
}

/** Green glowing nitro crate face. */
export function nitroTexture(kit: Kit): THREE.CanvasTexture {
    return kit.canvasTexture(128, 128, (ctx, w, h) => {
        ctx.fillStyle = '#1fbf3a';
        ctx.fillRect(0, 0, w, h);
        ctx.strokeStyle = '#0c5c1a';
        ctx.lineWidth = 10;
        ctx.strokeRect(5, 5, w - 10, h - 10);
        ctx.fillStyle = '#b8ff6a';
        ctx.beginPath();
        // Lightning bolt.
        ctx.moveTo(72, 14);
        ctx.lineTo(34, 70);
        ctx.lineTo(60, 70);
        ctx.lineTo(50, 114);
        ctx.lineTo(94, 52);
        ctx.lineTo(66, 52);
        ctx.closePath();
        ctx.fill();
        ctx.strokeStyle = '#0c5c1a';
        ctx.lineWidth = 4;
        ctx.stroke();
    });
}

/** Check mark (true) or cross (false) path for TF boxes. */
function drawTfIcon(
    ctx: CanvasRenderingContext2D,
    cx: number,
    cy: number,
    r: number,
    yes: boolean,
): void {
    ctx.save();
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.lineWidth = r * 0.42;
    ctx.strokeStyle = '#1d2238';
    const path = () => {
        ctx.beginPath();
        if (yes) {
            ctx.moveTo(cx - r * 0.75, cy);
            ctx.lineTo(cx - r * 0.2, cy + r * 0.55);
            ctx.lineTo(cx + r * 0.8, cy - r * 0.6);
        } else {
            ctx.moveTo(cx - r * 0.6, cy - r * 0.6);
            ctx.lineTo(cx + r * 0.6, cy + r * 0.6);
            ctx.moveTo(cx + r * 0.6, cy - r * 0.6);
            ctx.lineTo(cx - r * 0.6, cy + r * 0.6);
        }
    };
    path();
    ctx.stroke();
    ctx.lineWidth = r * 0.24;
    ctx.strokeStyle = '#ffffff';
    path();
    ctx.stroke();
    ctx.restore();
}

/**
 * Front face of an answer box: colour panel, letter badge (choice) or
 * check / cross (true-false) and the wrapped label (max 3 lines, auto size).
 */
export function labelTexture(
    kit: Kit,
    label: string,
    color: string,
    badge: string | null,
    tf: boolean | null,
    aspect: number,
): THREE.CanvasTexture {
    const h = 320;
    const w = Math.round(Math.min(1024, Math.max(256, h * aspect)) / 8) * 8;
    return kit.canvasTexture(w, h, (ctx) => {
        ctx.fillStyle = shadeHex(color, -0.35);
        ctx.fillRect(0, 0, w, h);
        ctx.fillStyle = color;
        roundRect(ctx, 12, 12, w - 24, h - 24, 26);
        ctx.fill();
        const gloss = ctx.createLinearGradient(0, 12, 0, h * 0.55);
        gloss.addColorStop(0, 'rgba(255,255,255,0.35)');
        gloss.addColorStop(1, 'rgba(255,255,255,0)');
        ctx.fillStyle = gloss;
        roundRect(ctx, 12, 12, w - 24, h * 0.5, 26);
        ctx.fill();
        ctx.lineWidth = 8;
        ctx.strokeStyle = '#ffffff';
        roundRect(ctx, 20, 20, w - 40, h - 40, 20);
        ctx.stroke();

        let top = 34;
        const iconSize = 38;
        if (badge || tf !== null) {
            const cx = w / 2;
            const cy = top + iconSize;
            ctx.fillStyle = '#ffffff';
            ctx.beginPath();
            ctx.arc(cx, cy, iconSize, 0, Math.PI * 2);
            ctx.fill();
            ctx.lineWidth = 6;
            ctx.strokeStyle = '#1d2238';
            ctx.stroke();
            if (tf !== null) {
                drawTfIcon(ctx, cx, cy, iconSize * 0.62, tf);
            } else if (badge) {
                ctx.fillStyle = shadeHex(color, -0.25);
                ctx.font = `800 ${iconSize * 1.25}px ${FONT_DISPLAY}`;
                ctx.textAlign = 'center';
                ctx.textBaseline = 'middle';
                ctx.fillText(badge, cx, cy + 3);
            }
            top = cy + iconSize + 10;
        }

        const boxW = w - 96;
        const boxH = h - top - 30;
        const fitted = fitLabel(
            label,
            (s, size) => {
                ctx.font = `700 ${size}px ${FONT_DISPLAY}`;
                return ctx.measureText(s).width;
            },
            boxW,
            boxH,
            3,
            Math.min(96, Math.floor(boxH * 0.85)),
            20,
        );
        ctx.font = `900 ${fitted.size}px ${FONT_DISPLAY}`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.lineJoin = 'round';
        const lineH = fitted.size * 1.12;
        const startY =
            top + boxH / 2 - ((fitted.lines.length - 1) * lineH) / 2 + 4;
        // Light panels (yellow, light blue) get a heavier dark stroke so the
        // white label still reads at 25-40 m.
        const light = luminance(color) > 0.3;
        fitted.lines.forEach((line, i) => {
            const y = startY + i * lineH;
            ctx.lineWidth = Math.max(8, fitted.size * (light ? 0.32 : 0.24));
            ctx.strokeStyle = '#141830';
            ctx.strokeText(line, w / 2, y);
            ctx.fillStyle = '#ffffff';
            ctx.fillText(line, w / 2, y);
        });
    });
}

/** Glowing outline frame (aim highlight around an answer box face). */
export function frameTexture(kit: Kit): THREE.CanvasTexture {
    return kit.canvasTexture(128, 128, (ctx, w, h) => {
        ctx.clearRect(0, 0, w, h);
        ctx.lineWidth = 16;
        ctx.strokeStyle = '#ffe14d';
        roundRect(ctx, 10, 10, w - 20, h - 20, 14);
        ctx.stroke();
        ctx.lineWidth = 4;
        ctx.strokeStyle = '#1d2238';
        roundRect(ctx, 2, 2, w - 4, h - 4, 18);
        ctx.stroke();
        roundRect(ctx, 19, 19, w - 38, h - 38, 8);
        ctx.stroke();
    });
}

/** Big "?" question sign for the arch at the reading zone start. */
export function questionTexture(kit: Kit): THREE.CanvasTexture {
    return kit.canvasTexture(256, 256, (ctx, w, h) => {
        ctx.fillStyle = '#ffcf2e';
        ctx.beginPath();
        ctx.arc(w / 2, h / 2, w / 2 - 6, 0, Math.PI * 2);
        ctx.fill();
        ctx.lineWidth = 12;
        ctx.strokeStyle = '#1d2238';
        ctx.stroke();
        ctx.fillStyle = '#7b2fd0';
        ctx.beginPath();
        ctx.arc(w / 2, h / 2, w / 2 - 26, 0, Math.PI * 2);
        ctx.fill();
        ctx.font = `900 170px ${FONT_DISPLAY}`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.lineWidth = 14;
        ctx.strokeStyle = '#1d2238';
        ctx.strokeText('?', w / 2, h / 2 + 10);
        ctx.fillStyle = '#ffffff';
        ctx.fillText('?', w / 2, h / 2 + 10);
    });
}

/** Generic billboard / banner with a brand word (no sponsors). */
export function billboardTexture(
    kit: Kit,
    text: string,
    bg: string,
    fg: string,
    stripe: string | null,
): THREE.CanvasTexture {
    return kit.canvasTexture(512, 128, (ctx, w, h) => {
        ctx.fillStyle = bg;
        ctx.fillRect(0, 0, w, h);
        if (stripe) {
            ctx.fillStyle = stripe;
            ctx.fillRect(0, h - 22, w, 22);
        }
        ctx.font = `800 74px ${FONT_DISPLAY}`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.lineWidth = 8;
        ctx.strokeStyle = 'rgba(0,0,0,0.35)';
        ctx.strokeText(text, w / 2, h / 2 - (stripe ? 8 : 0));
        ctx.fillStyle = fg;
        ctx.fillText(text, w / 2, h / 2 - (stripe ? 8 : 0));
    });
}

/** Sea surface ripples (tiles, scrolls). */
export function waveTexture(kit: Kit, base: string): THREE.CanvasTexture {
    const rnd = seededRandom(5);
    return kit.canvasTexture(
        256,
        256,
        (ctx, w, h) => {
            ctx.fillStyle = base;
            ctx.fillRect(0, 0, w, h);
            ctx.strokeStyle = 'rgba(255,255,255,0.45)';
            ctx.lineCap = 'round';
            for (let i = 0; i < 46; i++) {
                const x = rnd() * w;
                const y = rnd() * h;
                const len = 10 + rnd() * 26;
                ctx.lineWidth = 2 + rnd() * 2;
                ctx.beginPath();
                ctx.moveTo(x, y);
                ctx.quadraticCurveTo(x + len / 2, y - 5, x + len, y);
                ctx.stroke();
            }
        },
        true,
    );
}

/** Falling water (vertical streaks, scrolls down). */
export function waterfallTexture(kit: Kit): THREE.CanvasTexture {
    const rnd = seededRandom(9);
    return kit.canvasTexture(
        128,
        256,
        (ctx, w, h) => {
            ctx.fillStyle = '#5cc8f2';
            ctx.fillRect(0, 0, w, h);
            for (let i = 0; i < 70; i++) {
                ctx.fillStyle =
                    rnd() > 0.5
                        ? 'rgba(255,255,255,0.7)'
                        : 'rgba(30,130,200,0.5)';
                ctx.fillRect(
                    rnd() * w,
                    rnd() * h,
                    2 + rnd() * 4,
                    20 + rnd() * 60,
                );
            }
        },
        true,
    );
}

/** Soft round particle sprite (white, alpha falloff). */
export function dotTexture(kit: Kit): THREE.CanvasTexture {
    return kit.canvasTexture(64, 64, (ctx, w, h) => {
        const g = ctx.createRadialGradient(
            w / 2,
            h / 2,
            0,
            w / 2,
            h / 2,
            w / 2,
        );
        g.addColorStop(0, 'rgba(255,255,255,1)');
        g.addColorStop(0.45, 'rgba(255,255,255,0.75)');
        g.addColorStop(1, 'rgba(255,255,255,0)');
        ctx.fillStyle = g;
        ctx.fillRect(0, 0, w, h);
    });
}

/** Number plate / emblem disc for a kart nose. */
export function emblemTexture(kit: Kit): THREE.CanvasTexture {
    return kit.canvasTexture(64, 64, (ctx, w, h) => {
        ctx.fillStyle = '#ffffff';
        ctx.beginPath();
        ctx.arc(w / 2, h / 2, w / 2 - 2, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#1d2238';
        ctx.beginPath();
        // Five point star.
        for (let i = 0; i < 10; i++) {
            const r = i % 2 === 0 ? 24 : 10;
            const a = -Math.PI / 2 + (i * Math.PI) / 5;
            ctx.lineTo(w / 2 + Math.cos(a) * r, h / 2 + Math.sin(a) * r);
        }
        ctx.closePath();
        ctx.fill();
    });
}
