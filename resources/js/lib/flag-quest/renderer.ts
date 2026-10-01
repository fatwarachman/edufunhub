import { drawCharacter } from '@/lib/character/draw-character';
import {
    type ChallengeKind,
    type Checkpoint,
    type Decor,
    type Point,
    rotateDir,
    type WorldData,
} from './world';

export const TILE_W = 64;
export const TILE_H = 32;
const LAND_LIFT = 10;

export interface PlayerLook {
    name: string;
    grade: number;
    color: string;
    accessory: string;
}

export interface FrameState {
    world: WorldData;
    player: Point;
    facing: number;
    walking: boolean;
    time: number;
    rotation: number;
    camera: Point;
    zoom: number;
    /** Screen-space vertical shift so the player sits in the free area between HUD layers. */
    viewOffsetY: number;
    look: PlayerLook;
    activeStation: number | null;
    nearStation: number | null;
    raiseProgress: number;
    completed: boolean;
    gradeLabel: string;
}

export const KIND_COLOR: Record<ChallengeKind, string> = {
    quick_quiz: '#6c5ce7',
    true_false: '#e85d75',
    math_sprint: '#f5a623',
    snakes_ladders: '#1aab8a',
};

const INK = '#1d2238';

function hash(x: number, y: number): number {
    const h = Math.sin(x * 127.1 + y * 311.7) * 43758.5453;
    return h - Math.floor(h);
}

/** Lightens/darkens a #rrggbb colour and returns #rrggbb so results can be chained. */
export function shade(hex: string, amount: number): string {
    const n = /^#[0-9a-f]{6}$/i.test(hex)
        ? parseInt(hex.slice(1), 16)
        : 0x7fcf5b;
    const clamp = (v: number) => Math.max(0, Math.min(255, Math.round(v)));
    const r = clamp(((n >> 16) & 255) + amount);
    const g = clamp(((n >> 8) & 255) + amount);
    const b = clamp((n & 255) + amount);
    return `#${((r << 16) | (g << 8) | b).toString(16).padStart(6, '0')}`;
}

/** Projects a world point to base (unzoomed) iso pixels for a rotation. */
export function project(world: WorldData, p: Point, rotation: number): Point {
    const r = rotateDir(p.x - world.w / 2, p.y - world.h / 2, rotation);
    return { x: ((r.x - r.y) * TILE_W) / 2, y: ((r.x + r.y) * TILE_H) / 2 };
}

function depth(world: WorldData, p: Point, rotation: number): number {
    const r = rotateDir(p.x - world.w / 2, p.y - world.h / 2, rotation);
    return r.x + r.y;
}

interface GroundCache {
    canvas: HTMLCanvasElement;
    originX: number;
    originY: number;
    key: string;
}

const tileColors: Record<string, string> = {
    g: '#7fcf5b',
    s: '#eedba2',
    p: '#d8c692',
    b: '#c28a52',
    d: '#b77d45',
    z: '#e3d7bd',
    w: '#5bbde9',
};

export class FlagQuestRenderer {
    private ground: GroundCache | null = null;

    invalidate(): void {
        this.ground = null;
    }

    private buildGround(world: WorldData, rotation: number): GroundCache {
        const key = `${world.mission}:${rotation}`;
        if (this.ground?.key === key) {
            return this.ground;
        }
        const corners = [
            { x: 0, y: 0 },
            { x: world.w, y: 0 },
            { x: 0, y: world.h },
            { x: world.w, y: world.h },
        ].map((c) => project(world, c, rotation));
        const minX = Math.min(...corners.map((c) => c.x)) - TILE_W;
        const maxX = Math.max(...corners.map((c) => c.x)) + TILE_W;
        const minY = Math.min(...corners.map((c) => c.y)) - TILE_H;
        const maxY = Math.max(...corners.map((c) => c.y)) + TILE_H * 2;
        const canvas = document.createElement('canvas');
        canvas.width = Math.ceil(maxX - minX);
        canvas.height = Math.ceil(maxY - minY);
        const ctx = canvas.getContext('2d');
        if (!ctx) {
            throw new Error('2d context unavailable');
        }
        const originX = -minX;
        const originY = -minY;
        ctx.fillStyle = '#4aa9dd';
        ctx.fillRect(0, 0, canvas.width, canvas.height);

        const tiles: { x: number; y: number; d: number }[] = [];
        for (let y = 0; y < world.h; y++) {
            for (let x = 0; x < world.w; x++) {
                tiles.push({
                    x,
                    y,
                    d: depth(world, { x: x + 0.5, y: y + 0.5 }, rotation),
                });
            }
        }
        tiles.sort((a, b) => a.d - b.d);

        const corner = (x: number, y: number, lift: number) => {
            const p = project(world, { x, y }, rotation);
            return { x: p.x + originX, y: p.y + originY - lift };
        };
        const isWater = (x: number, y: number) =>
            x < 0 ||
            y < 0 ||
            x >= world.w ||
            y >= world.h ||
            world.tiles[y][x] === 'w';

        // Water first (lowered), then land with cliff faces.
        for (const pass of ['water', 'land'] as const) {
            for (const t of tiles) {
                const code = world.tiles[t.y][t.x];
                const water = code === 'w';
                if ((pass === 'water') !== water) {
                    continue;
                }
                const lift = water
                    ? 0
                    : code === 'd'
                      ? LAND_LIFT - 3
                      : LAND_LIFT;
                const c = [
                    corner(t.x, t.y, lift),
                    corner(t.x + 1, t.y, lift),
                    corner(t.x + 1, t.y + 1, lift),
                    corner(t.x, t.y + 1, lift),
                ];
                const center = corner(t.x + 0.5, t.y + 0.5, lift);
                const n = hash(t.x, t.y);

                if (!water) {
                    const edges: [number, number, number, number][] = [
                        [0, 1, 0, -1],
                        [1, 2, 1, 0],
                        [2, 3, 0, 1],
                        [3, 0, -1, 0],
                    ];
                    for (const [a, b, nx, ny] of edges) {
                        const midY = (c[a].y + c[b].y) / 2;
                        if (midY <= center.y || !isWater(t.x + nx, t.y + ny)) {
                            continue;
                        }
                        ctx.fillStyle =
                            code === 'd' || code === 'b'
                                ? '#8a5a2e'
                                : '#a8743f';
                        ctx.beginPath();
                        ctx.moveTo(c[a].x, c[a].y);
                        ctx.lineTo(c[b].x, c[b].y);
                        ctx.lineTo(c[b].x, c[b].y + lift + 4);
                        ctx.lineTo(c[a].x, c[a].y + lift + 4);
                        ctx.closePath();
                        ctx.fill();
                        ctx.fillStyle = 'rgba(255,255,255,0.35)';
                        ctx.fillRect(
                            Math.min(c[a].x, c[b].x),
                            Math.max(c[a].y, c[b].y) + lift + 3,
                            Math.abs(c[a].x - c[b].x),
                            2,
                        );
                    }
                }

                const base = tileColors[code] ?? tileColors.g;
                const tone = water ? 0 : (n - 0.5) * 14;
                ctx.fillStyle = shade(base, tone + 6);
                ctx.beginPath();
                ctx.moveTo(c[0].x, c[0].y);
                ctx.lineTo(c[1].x, c[1].y);
                ctx.lineTo(c[2].x, c[2].y);
                ctx.closePath();
                ctx.fill();
                ctx.fillStyle = shade(base, tone - 6);
                ctx.beginPath();
                ctx.moveTo(c[0].x, c[0].y);
                ctx.lineTo(c[2].x, c[2].y);
                ctx.lineTo(c[3].x, c[3].y);
                ctx.closePath();
                ctx.fill();

                if (water) {
                    if (n > 0.72) {
                        ctx.strokeStyle = 'rgba(255,255,255,0.45)';
                        ctx.lineWidth = 2;
                        ctx.beginPath();
                        ctx.moveTo(center.x - 10, center.y);
                        ctx.quadraticCurveTo(
                            center.x - 5,
                            center.y - 3,
                            center.x,
                            center.y,
                        );
                        ctx.quadraticCurveTo(
                            center.x + 5,
                            center.y + 3,
                            center.x + 10,
                            center.y,
                        );
                        ctx.stroke();
                    }
                } else if (code === 'p') {
                    ctx.fillStyle = '#b8b09a';
                    this.hex(ctx, center.x + 1, center.y + 2, 17, 8.5);
                    ctx.fillStyle = n > 0.5 ? '#f1ecdd' : '#e8e1cd';
                    this.hex(ctx, center.x, center.y, 17, 8.5);
                } else if (code === 'b' || code === 'd') {
                    ctx.strokeStyle = 'rgba(80,45,15,0.45)';
                    ctx.lineWidth = 1.5;
                    for (let i = 1; i < 4; i++) {
                        const a = corner(t.x + i / 4, t.y, lift);
                        const b = corner(t.x + i / 4, t.y + 1, lift);
                        ctx.beginPath();
                        ctx.moveTo(a.x, a.y);
                        ctx.lineTo(b.x, b.y);
                        ctx.stroke();
                    }
                } else if (code === 'z') {
                    ctx.strokeStyle = 'rgba(120,100,70,0.3)';
                    ctx.lineWidth = 1;
                    ctx.beginPath();
                    ctx.moveTo(c[0].x, c[0].y);
                    ctx.lineTo(c[1].x, c[1].y);
                    ctx.lineTo(c[2].x, c[2].y);
                    ctx.lineTo(c[3].x, c[3].y);
                    ctx.closePath();
                    ctx.stroke();
                } else if (code === 'g' && n < 0.08) {
                    ctx.fillStyle = shade(base, -28);
                    for (let i = 0; i < 3; i++) {
                        ctx.fillRect(
                            center.x - 6 + i * 5,
                            center.y - 4 + (i % 2) * 2,
                            2,
                            5,
                        );
                    }
                }
            }
        }
        this.ground = { canvas, originX, originY, key };
        return this.ground;
    }

    private hex(
        ctx: CanvasRenderingContext2D,
        x: number,
        y: number,
        rx: number,
        ry: number,
    ): void {
        ctx.beginPath();
        for (let i = 0; i < 6; i++) {
            const a = (Math.PI / 3) * i;
            const px = x + Math.cos(a) * rx;
            const py = y + Math.sin(a) * ry;
            if (i === 0) {
                ctx.moveTo(px, py);
            } else {
                ctx.lineTo(px, py);
            }
        }
        ctx.closePath();
        ctx.fill();
    }

    render(
        ctx: CanvasRenderingContext2D,
        width: number,
        height: number,
        dpr: number,
        s: FrameState,
    ): void {
        const ground = this.buildGround(s.world, s.rotation);
        const cam = project(s.world, s.camera, s.rotation);
        const z = s.zoom;
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        ctx.fillStyle = '#4aa9dd';
        ctx.fillRect(0, 0, width, height);
        const offX = width / 2 - cam.x * z;
        const offY = height / 2 + s.viewOffsetY - cam.y * z;
        ctx.setTransform(dpr * z, 0, 0, dpr * z, dpr * offX, dpr * offY);
        ctx.imageSmoothingEnabled = true;
        ctx.drawImage(ground.canvas, -ground.originX, -ground.originY);

        this.drawWaterSparkles(ctx, s, cam, width / z, height / z);

        const halfW = width / z / 2 + 120;
        const halfH = height / z / 2 + 160;
        const visible = (p: Point) =>
            Math.abs(p.x - cam.x) < halfW && Math.abs(p.y - cam.y) < halfH;

        type Drawable = { d: number; draw: () => void };
        const list: Drawable[] = [];
        for (const d of s.world.decor) {
            if (d.k === 'station' || d.k === 'flagpole') {
                continue;
            }
            const p = project(s.world, d, s.rotation);
            if (!visible(p)) {
                continue;
            }
            list.push({
                d: depth(s.world, d, s.rotation),
                draw: () =>
                    this.drawDecor(ctx, d, p.x, p.y - LAND_LIFT, s.time),
            });
        }
        for (const cp of s.world.checkpoints) {
            const p = project(s.world, cp, s.rotation);
            if (visible(p)) {
                list.push({
                    d: depth(s.world, cp, s.rotation),
                    draw: () =>
                        this.drawStation(
                            ctx,
                            cp,
                            p.x,
                            p.y - LAND_LIFT,
                            s.time,
                            s.nearStation === cp.id ||
                                s.activeStation === cp.id,
                        ),
                });
            }
            const gc = { x: cp.gate.x + 0.3, y: cp.gate.y + cp.gate.h / 2 };
            const gp = project(s.world, gc, s.rotation);
            if (visible(gp)) {
                list.push({
                    d: depth(s.world, gc, s.rotation),
                    draw: () => this.drawGate(ctx, s, cp),
                });
            }
        }
        const fp = project(s.world, s.world.flag, s.rotation);
        if (visible(fp)) {
            list.push({
                d: depth(s.world, s.world.flag, s.rotation),
                draw: () => this.drawFlag(ctx, fp.x, fp.y - LAND_LIFT, s),
            });
        }
        const pp = project(s.world, s.player, s.rotation);
        list.push({
            d: depth(s.world, s.player, s.rotation) + 0.01,
            draw: () => this.drawPlayer(ctx, pp.x, pp.y - LAND_LIFT, s),
        });
        list.sort((a, b) => a.d - b.d);
        for (const item of list) {
            item.draw();
        }
        this.drawLabel(
            ctx,
            pp.x,
            pp.y - LAND_LIFT - 78,
            s.look.name,
            s.gradeLabel,
        );
        ctx.setTransform(1, 0, 0, 1, 0, 0);
    }

    private drawWaterSparkles(
        ctx: CanvasRenderingContext2D,
        s: FrameState,
        cam: Point,
        vw: number,
        vh: number,
    ): void {
        ctx.fillStyle = 'rgba(255,255,255,0.55)';
        const step = 90;
        const x0 = Math.floor((cam.x - vw / 2) / step) * step;
        const y0 = Math.floor((cam.y - vh / 2) / step) * step;
        for (let x = x0; x < cam.x + vw / 2; x += step) {
            for (let y = y0; y < cam.y + vh / 2; y += step) {
                const n = hash(x, y);
                const phase = Math.sin(s.time / 700 + n * 12);
                if (phase < 0.75) {
                    continue;
                }
                const px = x + n * step;
                const py = y + hash(y, x) * step;
                if (!this.isWaterAtScreen(s, px, py)) {
                    continue;
                }
                ctx.globalAlpha = (phase - 0.75) * 3;
                ctx.fillRect(px - 5, py, 10, 2);
                ctx.fillRect(px - 1, py - 3, 2, 8);
            }
        }
        ctx.globalAlpha = 1;
    }

    private isWaterAtScreen(s: FrameState, px: number, py: number): boolean {
        const rx = px / TILE_W + py / TILE_H;
        const ry = py / TILE_H - px / TILE_W;
        const w = rotateDir(rx, ry, 4 - s.rotation);
        const x = Math.floor(w.x + s.world.w / 2);
        const y = Math.floor(w.y + s.world.h / 2);
        return (
            x < 0 ||
            y < 0 ||
            x >= s.world.w ||
            y >= s.world.h ||
            s.world.tiles[y][x] === 'w'
        );
    }

    private shadow(
        ctx: CanvasRenderingContext2D,
        x: number,
        y: number,
        rx: number,
        ry: number,
    ): void {
        ctx.fillStyle = 'rgba(20,40,20,0.22)';
        ctx.beginPath();
        ctx.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2);
        ctx.fill();
    }

    private poly(
        ctx: CanvasRenderingContext2D,
        cx: number,
        cy: number,
        r: number,
        sides: number,
        color: string,
        ry = r,
    ): void {
        ctx.fillStyle = color;
        ctx.beginPath();
        for (let i = 0; i < sides; i++) {
            const a = (Math.PI * 2 * i) / sides - Math.PI / 2;
            const x = cx + Math.cos(a) * r;
            const y = cy + Math.sin(a) * ry;
            if (i === 0) {
                ctx.moveTo(x, y);
            } else {
                ctx.lineTo(x, y);
            }
        }
        ctx.closePath();
        ctx.fill();
    }

    private blob(
        ctx: CanvasRenderingContext2D,
        x: number,
        y: number,
        r: number,
        color: string,
    ): void {
        this.poly(ctx, x, y, r, 8, shade(color, -22));
        this.poly(ctx, x - r * 0.15, y - r * 0.15, r * 0.82, 8, color);
        this.poly(
            ctx,
            x - r * 0.35,
            y - r * 0.38,
            r * 0.38,
            6,
            shade(color, 26),
        );
    }

    private drawDecor(
        ctx: CanvasRenderingContext2D,
        d: Decor,
        x: number,
        y: number,
        t: number,
    ): void {
        const greens = ['#4fae4a', '#5cbf55', '#3f9d4a', '#6cc55a'];
        switch (d.k) {
            case 'tree': {
                const g = greens[d.v % greens.length];
                this.shadow(ctx, x, y, 20, 9);
                ctx.fillStyle = '#8a5a33';
                ctx.fillRect(x - 4, y - 22, 8, 22);
                ctx.fillStyle = '#6d4424';
                ctx.fillRect(x, y - 22, 4, 22);
                this.blob(ctx, x, y - 38, 22, g);
                this.blob(ctx, x + 9, y - 50, 14, shade(g, 8));
                break;
            }
            case 'pine': {
                this.shadow(ctx, x, y, 16, 7);
                ctx.fillStyle = '#7a4e2c';
                ctx.fillRect(x - 3, y - 14, 6, 14);
                const tones = ['#2f8a4f', '#3a9b58', '#48ad63'];
                for (let i = 0; i < 3; i++) {
                    const w = 22 - i * 5;
                    const base = y - 12 - i * 14;
                    ctx.fillStyle = tones[i];
                    ctx.beginPath();
                    ctx.moveTo(x - w, base);
                    ctx.lineTo(x, base - 24);
                    ctx.lineTo(x + w, base);
                    ctx.closePath();
                    ctx.fill();
                    ctx.fillStyle = 'rgba(0,0,0,0.12)';
                    ctx.beginPath();
                    ctx.moveTo(x, base - 24);
                    ctx.lineTo(x + w, base);
                    ctx.lineTo(x, base);
                    ctx.closePath();
                    ctx.fill();
                }
                break;
            }
            case 'bush':
            case 'berry': {
                this.shadow(ctx, x, y, 16, 7);
                const g = greens[(d.v + 1) % greens.length];
                this.blob(ctx, x - 8, y - 9, 10, g);
                this.blob(ctx, x + 8, y - 9, 10, g);
                this.blob(ctx, x, y - 16, 12, shade(g, 6));
                if (d.k === 'berry') {
                    ctx.fillStyle = '#f06292';
                    for (const [bx, by] of [
                        [-8, -12],
                        [4, -20],
                        [9, -9],
                        [-2, -8],
                        [-5, -21],
                    ]) {
                        ctx.beginPath();
                        ctx.arc(x + bx, y + by, 2.4, 0, Math.PI * 2);
                        ctx.fill();
                    }
                }
                break;
            }
            case 'rock': {
                this.shadow(ctx, x, y, 14, 6);
                ctx.fillStyle = '#8f96a3';
                ctx.beginPath();
                ctx.moveTo(x - 14, y - 2);
                ctx.lineTo(x - 8, y - 16);
                ctx.lineTo(x + 6, y - 18);
                ctx.lineTo(x + 14, y - 4);
                ctx.lineTo(x + 4, y + 2);
                ctx.closePath();
                ctx.fill();
                ctx.fillStyle = '#b3bac5';
                ctx.beginPath();
                ctx.moveTo(x - 8, y - 16);
                ctx.lineTo(x + 6, y - 18);
                ctx.lineTo(x + 1, y - 8);
                ctx.lineTo(x - 10, y - 6);
                ctx.closePath();
                ctx.fill();
                break;
            }
            case 'flowers': {
                const colors = ['#ff8fb1', '#b388ff', '#ffe066', '#ffffff'];
                for (let i = 0; i < 5; i++) {
                    const fx = x + Math.cos(i * 2.3 + d.v) * 9;
                    const fy = y + Math.sin(i * 1.7 + d.v) * 4;
                    ctx.fillStyle = '#3f8f3a';
                    ctx.fillRect(fx - 0.5, fy - 6, 1.5, 6);
                    ctx.fillStyle = colors[(i + d.v) % colors.length];
                    ctx.beginPath();
                    ctx.arc(fx, fy - 7, 3, 0, Math.PI * 2);
                    ctx.fill();
                }
                break;
            }
            case 'mushroom': {
                ctx.fillStyle = '#f5ecd7';
                ctx.fillRect(x - 2, y - 8, 4, 8);
                ctx.fillStyle = '#e04f4f';
                ctx.beginPath();
                ctx.ellipse(x, y - 9, 8, 5, 0, Math.PI, 0);
                ctx.fill();
                ctx.fillStyle = '#fff';
                ctx.fillRect(x - 4, y - 12, 2, 2);
                ctx.fillRect(x + 2, y - 11, 2, 2);
                break;
            }
            case 'campfire': {
                const glow = ctx.createRadialGradient(
                    x,
                    y - 10,
                    2,
                    x,
                    y - 10,
                    60,
                );
                glow.addColorStop(0, 'rgba(255,190,90,0.45)');
                glow.addColorStop(1, 'rgba(255,190,90,0)');
                ctx.fillStyle = glow;
                ctx.beginPath();
                ctx.ellipse(x, y - 6, 60, 32, 0, 0, Math.PI * 2);
                ctx.fill();
                for (let i = 0; i < 8; i++) {
                    const a = (Math.PI * 2 * i) / 8;
                    this.poly(
                        ctx,
                        x + Math.cos(a) * 18,
                        y + Math.sin(a) * 9,
                        5,
                        6,
                        i % 2 ? '#9aa1ab' : '#b8bec7',
                    );
                }
                ctx.fillStyle = '#7a4a26';
                ctx.save();
                ctx.translate(x, y - 3);
                ctx.rotate(0.5);
                ctx.fillRect(-14, -3, 28, 6);
                ctx.rotate(-1);
                ctx.fillRect(-14, -3, 28, 6);
                ctx.restore();
                const f = Math.sin(t / 90) * 2;
                ctx.fillStyle = '#ff7b2e';
                ctx.beginPath();
                ctx.moveTo(x - 11, y - 4);
                ctx.quadraticCurveTo(x - 6, y - 26 - f, x, y - 34 + f);
                ctx.quadraticCurveTo(x + 6, y - 26 + f, x + 11, y - 4);
                ctx.closePath();
                ctx.fill();
                ctx.fillStyle = '#ffd24a';
                ctx.beginPath();
                ctx.moveTo(x - 6, y - 4);
                ctx.quadraticCurveTo(x - 3, y - 18 + f, x + 1, y - 22 - f);
                ctx.quadraticCurveTo(x + 4, y - 14, x + 6, y - 4);
                ctx.closePath();
                ctx.fill();
                break;
            }
            case 'log': {
                this.shadow(ctx, x, y, 20, 6);
                ctx.fillStyle = '#8a5a33';
                ctx.fillRect(x - 20, y - 12, 40, 11);
                ctx.fillStyle = '#d7a86e';
                ctx.beginPath();
                ctx.ellipse(x + 20, y - 6.5, 4, 5.5, 0, 0, Math.PI * 2);
                ctx.fill();
                break;
            }
            case 'stump': {
                this.shadow(ctx, x, y, 12, 5);
                ctx.fillStyle = '#8a5a33';
                ctx.fillRect(x - 10, y - 12, 20, 12);
                ctx.fillStyle = '#e0b27a';
                ctx.beginPath();
                ctx.ellipse(x, y - 12, 10, 5, 0, 0, Math.PI * 2);
                ctx.fill();
                ctx.strokeStyle = '#b98550';
                ctx.beginPath();
                ctx.ellipse(x, y - 12, 5, 2.5, 0, 0, Math.PI * 2);
                ctx.stroke();
                break;
            }
            case 'tent': {
                this.shadow(ctx, x, y, 36, 14);
                const main = d.v ? '#6c5ce7' : '#f08a3c';
                ctx.fillStyle = main;
                ctx.beginPath();
                ctx.moveTo(x - 34, y);
                ctx.lineTo(x - 4, y - 44);
                ctx.lineTo(x + 4, y + 6);
                ctx.closePath();
                ctx.fill();
                ctx.fillStyle = shade(main, -30);
                ctx.beginPath();
                ctx.moveTo(x + 4, y + 6);
                ctx.lineTo(x - 4, y - 44);
                ctx.lineTo(x + 32, y - 6);
                ctx.closePath();
                ctx.fill();
                ctx.fillStyle = '#3a2a4a';
                ctx.beginPath();
                ctx.moveTo(x - 12, y + 2);
                ctx.lineTo(x - 4, y - 20);
                ctx.lineTo(x + 2, y + 5);
                ctx.closePath();
                ctx.fill();
                break;
            }
            case 'picnic': {
                this.shadow(ctx, x, y, 34, 14);
                ctx.fillStyle = '#8a5a33';
                ctx.fillRect(x - 24, y - 16, 4, 16);
                ctx.fillRect(x + 20, y - 16, 4, 16);
                ctx.fillRect(x - 4, y - 10, 4, 14);
                const top = [
                    { x: x - 30, y: y - 18 },
                    { x: x, y: y - 32 },
                    { x: x + 30, y: y - 18 },
                    { x: x, y: y - 4 },
                ];
                ctx.fillStyle = '#ffffff';
                ctx.beginPath();
                top.forEach((p, i) =>
                    i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y),
                );
                ctx.closePath();
                ctx.fill();
                ctx.fillStyle = '#e24b4b';
                for (let i = 0; i < 4; i++) {
                    for (let j = 0; j < 4; j++) {
                        if ((i + j) % 2) {
                            continue;
                        }
                        const u = i / 4;
                        const v = j / 4;
                        const px =
                            top[0].x +
                            (top[1].x - top[0].x) * u +
                            (top[3].x - top[0].x) * v;
                        const py =
                            top[0].y +
                            (top[1].y - top[0].y) * u +
                            (top[3].y - top[0].y) * v;
                        ctx.beginPath();
                        ctx.moveTo(px, py);
                        ctx.lineTo(px + 7.5, py - 3.5);
                        ctx.lineTo(px + 15, py);
                        ctx.lineTo(px + 7.5, py + 3.5);
                        ctx.closePath();
                        ctx.fill();
                    }
                }
                ctx.fillStyle = '#c98b4b';
                ctx.fillRect(x - 6, y - 30, 12, 8);
                ctx.fillStyle = '#ffd24a';
                ctx.fillRect(x + 10, y - 27, 5, 7);
                ctx.fillStyle = '#e8465c';
                ctx.beginPath();
                ctx.arc(x - 14, y - 20, 5, Math.PI, 0);
                ctx.fill();
                ctx.fillStyle = '#4caf50';
                ctx.fillRect(x - 19, y - 20, 10, 1.5);
                break;
            }
            case 'board': {
                this.shadow(ctx, x, y, 26, 8);
                ctx.fillStyle = '#7a4a26';
                ctx.fillRect(x - 24, y - 50, 4, 50);
                ctx.fillRect(x + 20, y - 50, 4, 50);
                ctx.fillStyle = '#c98b4b';
                ctx.fillRect(x - 28, y - 60, 56, 38);
                ctx.fillStyle = '#f7ecd3';
                ctx.fillRect(x - 25, y - 57, 50, 32);
                const notes = ['#7ec8f5', '#ff9ec4', '#8de0c9', '#ffe27a'];
                for (let i = 0; i < 8; i++) {
                    ctx.fillStyle = notes[i % notes.length];
                    ctx.fillRect(
                        x - 22 + (i % 4) * 12,
                        y - 53 + Math.floor(i / 4) * 13,
                        9,
                        9,
                    );
                }
                break;
            }
        }
    }

    private drawStation(
        ctx: CanvasRenderingContext2D,
        cp: Checkpoint,
        x: number,
        y: number,
        t: number,
        highlight: boolean,
    ): void {
        const color = KIND_COLOR[cp.kind];
        if (!cp.cleared) {
            const pulse = 1 + Math.sin(t / 300) * 0.08;
            ctx.strokeStyle = highlight ? '#ffd93d' : 'rgba(255,255,255,0.8)';
            ctx.lineWidth = highlight ? 4 : 3;
            ctx.setLineDash([8, 6]);
            ctx.beginPath();
            ctx.ellipse(x, y, 34 * pulse, 17 * pulse, 0, 0, Math.PI * 2);
            ctx.stroke();
            ctx.setLineDash([]);
        }
        this.shadow(ctx, x, y, 22, 9);
        ctx.fillStyle = '#7a4a26';
        ctx.fillRect(x - 3, y - 44, 6, 44);
        const bob = cp.cleared ? 0 : Math.sin(t / 400) * 2;
        const cy = y - 56 + bob;
        ctx.fillStyle = INK;
        ctx.beginPath();
        ctx.arc(cx(x), cy + 2, 20, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = cp.cleared ? '#27b36a' : color;
        ctx.beginPath();
        ctx.arc(x, cy, 18, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = '#fff';
        ctx.lineWidth = 3;
        ctx.stroke();
        ctx.fillStyle = '#fff';
        ctx.strokeStyle = '#fff';
        if (cp.cleared) {
            ctx.lineWidth = 4;
            ctx.beginPath();
            ctx.moveTo(x - 8, cy);
            ctx.lineTo(x - 2, cy + 6);
            ctx.lineTo(x + 9, cy - 6);
            ctx.stroke();
            return;
        }
        ctx.font = 'bold 20px "Instrument Sans", system-ui, sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        switch (cp.kind) {
            case 'quick_quiz':
                ctx.fillText('?', x, cy + 1);
                break;
            case 'true_false':
                ctx.font = 'bold 15px "Instrument Sans", system-ui, sans-serif';
                ctx.fillText('✓✗', x, cy + 1);
                break;
            case 'math_sprint':
                ctx.fillText('±', x, cy + 1);
                break;
            default:
                ctx.fillRect(x - 9, cy - 9, 18, 18);
                ctx.fillStyle = color;
                for (const [dx, dy] of [
                    [-4, -4],
                    [4, 4],
                    [4, -4],
                    [-4, 4],
                    [0, 0],
                ]) {
                    ctx.beginPath();
                    ctx.arc(x + dx, cy + dy, 2, 0, Math.PI * 2);
                    ctx.fill();
                }
        }
    }

    private drawGate(
        ctx: CanvasRenderingContext2D,
        s: FrameState,
        cp: Checkpoint,
    ): void {
        const g = cp.gate;
        const a = project(s.world, { x: g.x + 0.15, y: g.y + 0.1 }, s.rotation);
        const b = project(
            s.world,
            { x: g.x + 0.15, y: g.y + g.h - 0.1 },
            s.rotation,
        );
        a.y -= LAND_LIFT - 3;
        b.y -= LAND_LIFT - 3;
        const post = (p: Point) => {
            ctx.fillStyle = '#5b3a1e';
            ctx.fillRect(p.x - 4, p.y - 34, 8, 34);
            ctx.fillStyle = '#ffd93d';
            ctx.fillRect(p.x - 5, p.y - 38, 10, 5);
        };
        post(a);
        post(b);
        if (cp.cleared) {
            ctx.fillStyle = '#27b36a';
            ctx.beginPath();
            ctx.moveTo(a.x, a.y - 34);
            ctx.lineTo(a.x + 4, a.y - 80);
            ctx.lineTo(a.x + 10, a.y - 80);
            ctx.lineTo(a.x + 6, a.y - 34);
            ctx.closePath();
            ctx.fill();
            return;
        }
        const h = 26;
        const segments = 6;
        for (let i = 0; i < segments; i++) {
            const u0 = i / segments;
            const u1 = (i + 1) / segments;
            ctx.fillStyle = i % 2 ? '#ffffff' : '#e24b4b';
            ctx.beginPath();
            ctx.moveTo(a.x + (b.x - a.x) * u0, a.y + (b.y - a.y) * u0 - h);
            ctx.lineTo(a.x + (b.x - a.x) * u1, a.y + (b.y - a.y) * u1 - h);
            ctx.lineTo(a.x + (b.x - a.x) * u1, a.y + (b.y - a.y) * u1 - h + 9);
            ctx.lineTo(a.x + (b.x - a.x) * u0, a.y + (b.y - a.y) * u0 - h + 9);
            ctx.closePath();
            ctx.fill();
        }
        const mx = (a.x + b.x) / 2;
        const my = (a.y + b.y) / 2 - h + 4;
        ctx.fillStyle = INK;
        ctx.fillRect(mx - 8, my - 2, 16, 13);
        ctx.fillStyle = '#ffd93d';
        ctx.fillRect(mx - 6, my, 12, 9);
        ctx.strokeStyle = INK;
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.arc(mx, my - 2, 5, Math.PI, 0);
        ctx.stroke();
    }

    private drawFlag(
        ctx: CanvasRenderingContext2D,
        x: number,
        y: number,
        s: FrameState,
    ): void {
        this.shadow(ctx, x, y, 20, 8);
        ctx.fillStyle = '#9aa1ab';
        this.poly(ctx, x, y - 2, 16, 6, '#b8bec7', 8);
        ctx.fillStyle = '#d8dde4';
        ctx.fillRect(x - 2, y - 110, 4, 108);
        ctx.fillStyle = '#ffd93d';
        ctx.beginPath();
        ctx.arc(x, y - 112, 4, 0, Math.PI * 2);
        ctx.fill();
        const progress = s.completed ? 1 : s.raiseProgress;
        const top = y - 18 - progress * 86;
        const wave = (i: number) =>
            Math.sin(s.time / 180 + i) * (2 + progress * 3);
        const w = 34;
        const h = 22;
        ctx.fillStyle = '#e02b2b';
        ctx.beginPath();
        ctx.moveTo(x + 2, top);
        ctx.quadraticCurveTo(x + w / 2, top + wave(0), x + w, top + wave(1));
        ctx.lineTo(x + w, top + h / 2 + wave(1));
        ctx.quadraticCurveTo(
            x + w / 2,
            top + h / 2 + wave(0),
            x + 2,
            top + h / 2,
        );
        ctx.closePath();
        ctx.fill();
        ctx.fillStyle = '#ffffff';
        ctx.beginPath();
        ctx.moveTo(x + 2, top + h / 2);
        ctx.quadraticCurveTo(
            x + w / 2,
            top + h / 2 + wave(0),
            x + w,
            top + h / 2 + wave(1),
        );
        ctx.lineTo(x + w, top + h + wave(1));
        ctx.quadraticCurveTo(x + w / 2, top + h + wave(0), x + 2, top + h);
        ctx.closePath();
        ctx.fill();
        ctx.strokeStyle = 'rgba(0,0,0,0.25)';
        ctx.lineWidth = 1;
        ctx.stroke();
        if (s.completed) {
            for (let i = 0; i < 14; i++) {
                const a = (i / 14) * Math.PI * 2 + s.time / 900;
                const r = 30 + ((s.time / 12 + i * 20) % 60);
                ctx.fillStyle = ['#ffd93d', '#e85d75', '#6c5ce7', '#1aab8a'][
                    i % 4
                ];
                ctx.fillRect(
                    x + Math.cos(a) * r,
                    y - 70 + Math.sin(a) * r * 0.5,
                    5,
                    5,
                );
            }
        }
    }

    private drawPlayer(
        ctx: CanvasRenderingContext2D,
        x: number,
        y: number,
        s: FrameState,
    ): void {
        const phase = s.walking ? Math.sin(s.time / 95) : 0;
        const bob = s.walking ? Math.abs(phase) * 2.5 : Math.sin(s.time / 600);
        const facingBack = Math.sin(s.facing) < -0.3;
        const flip = Math.cos(s.facing) < 0 ? -1 : 1;

        ctx.strokeStyle = '#ffd93d';
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.ellipse(x, y, 20, 10, 0, 0, Math.PI * 2);
        ctx.stroke();
        this.shadow(ctx, x, y, 14, 6);

        drawCharacter(ctx, x, y, s.look, { phase, bob, facingBack, flip });
    }

    private drawLabel(
        ctx: CanvasRenderingContext2D,
        x: number,
        y: number,
        name: string,
        grade: string,
    ): void {
        ctx.font = 'bold 13px "Instrument Sans", system-ui, sans-serif';
        const text = name.length > 18 ? `${name.slice(0, 17)}…` : name;
        const tw = ctx.measureText(text).width;
        ctx.font = 'bold 11px "Instrument Sans", system-ui, sans-serif';
        const gw = ctx.measureText(grade).width;
        const w = tw + gw + 30;
        ctx.fillStyle = INK;
        roundRect(ctx, x - w / 2 + 2, y - 11, w, 22, 11);
        ctx.fillStyle = '#fffaf0';
        roundRect(ctx, x - w / 2, y - 13, w, 22, 11);
        ctx.fillStyle = '#6c5ce7';
        roundRect(ctx, x + w / 2 - gw - 14, y - 10, gw + 10, 16, 8);
        ctx.fillStyle = '#fff';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(grade, x + w / 2 - gw / 2 - 9, y - 2);
        ctx.font = 'bold 13px "Instrument Sans", system-ui, sans-serif';
        ctx.fillStyle = INK;
        ctx.textAlign = 'left';
        ctx.fillText(text, x - w / 2 + 9, y - 2);
    }
}

function cx(x: number): number {
    return x + 2;
}

function roundRect(
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    w: number,
    h: number,
    r: number,
): void {
    ctx.beginPath();
    ctx.roundRect(x, y, w, h, r);
    ctx.fill();
}

/** Draws a north-up overview minimap. */
export function drawMinimap(
    ctx: CanvasRenderingContext2D,
    size: { w: number; h: number },
    world: WorldData,
    player: Point,
    facing: number,
    time: number,
): void {
    const sx = size.w / world.w;
    const sy = size.h / world.h;
    const colors: Record<string, string> = {
        g: '#7fcf5b',
        s: '#eedba2',
        p: '#efe7cf',
        b: '#c28a52',
        d: '#b77d45',
        z: '#e3d7bd',
        w: '#5bbde9',
    };
    for (let y = 0; y < world.h; y++) {
        const row = world.tiles[y];
        for (let x = 0; x < world.w; x++) {
            ctx.fillStyle = colors[row[x]] ?? colors.g;
            ctx.fillRect(x * sx, y * sy, sx + 0.6, sy + 0.6);
        }
    }
    ctx.fillStyle = 'rgba(47,138,79,0.55)';
    for (const d of world.decor) {
        if (d.k === 'tree' || d.k === 'pine') {
            ctx.fillRect(d.x * sx - 1, d.y * sy - 1, 2.2, 2.2);
        }
    }
    for (const cp of world.checkpoints) {
        ctx.fillStyle = cp.cleared ? '#27b36a' : '#e24b4b';
        ctx.fillRect(
            (cp.gate.x - 0.2) * sx,
            cp.gate.y * sy,
            sx * 0.9,
            cp.gate.h * sy,
        );
        ctx.fillStyle = INK;
        ctx.beginPath();
        ctx.arc(cp.x * sx, cp.y * sy, 4.5, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = cp.cleared ? '#27b36a' : KIND_COLOR[cp.kind];
        ctx.beginPath();
        ctx.arc(cp.x * sx, cp.y * sy, 3.3, 0, Math.PI * 2);
        ctx.fill();
    }
    const fx = world.flag.x * sx;
    const fy = world.flag.y * sy;
    ctx.fillStyle = INK;
    ctx.fillRect(fx - 1, fy - 10, 2, 12);
    ctx.fillStyle = '#e02b2b';
    ctx.fillRect(fx + 1, fy - 10, 8, 3);
    ctx.fillStyle = '#fff';
    ctx.fillRect(fx + 1, fy - 7, 8, 3);
    const px = player.x * sx;
    const py = player.y * sy;
    const pulse = 5 + Math.sin(time / 250) * 1.5;
    ctx.fillStyle = 'rgba(255,217,61,0.45)';
    ctx.beginPath();
    ctx.arc(px, py, pulse + 3, 0, Math.PI * 2);
    ctx.fill();
    ctx.save();
    ctx.translate(px, py);
    ctx.rotate(facing);
    ctx.fillStyle = '#ffd93d';
    ctx.strokeStyle = INK;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(6, 0);
    ctx.lineTo(-4, -4.5);
    ctx.lineTo(-2, 0);
    ctx.lineTo(-4, 4.5);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.restore();
}
