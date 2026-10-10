import {
    QuestionMedia,
    type QuestionMediaData,
} from '@/components/question-media';
import {
    type SnakeBoard as Board,
    type SnakeDirection,
} from '@/hooks/use-snake';
import { useTranslations } from '@/hooks/use-translations';
import { ArrowDown, ArrowLeft, ArrowRight, ArrowUp } from 'lucide-react';
import { useEffect, useRef } from 'react';
import './snake.css';

/** Seat colours, matching the avatar seat palette order. */
export const SEAT_COLORS = ['#34c759', '#fb923c', '#a78bfa', '#f43f5e'];
const FOOD_COLORS: Record<string, string> = {
    A: '#ffc356',
    B: '#7dd3fc',
    C: '#f9a8d4',
    D: '#86efac',
};
const INK = '#1f2a44';

function roundRect(
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    w: number,
    h: number,
    r: number,
) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
}

/** Mix a #rrggbb colour with white (amount > 0) or black (amount < 0). */
function shade(hex: string, amount: number): string {
    const n = parseInt(hex.slice(1), 16);
    const mix = (c: number) =>
        Math.round(amount >= 0 ? c + (255 - c) * amount : c * (1 + amount));
    const [r, g, b] = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map(mix);
    return `rgb(${r}, ${g}, ${b})`;
}

type Point = [number, number];

/** Cell centres of a body from head to tail, without coiled duplicates. */
function spine(body: [number, number][], cell: number): Point[] {
    const points: Point[] = [];
    for (const [x, y] of body) {
        const px = x * cell + cell / 2;
        const py = y * cell + cell / 2;
        const last = points[points.length - 1];
        if (!last || last[0] !== px || last[1] !== py) {
            points.push([px, py]);
        }
    }
    return points;
}

/** Chaikin corner cutting: rounds every bend, keeps both ends. */
function smooth(points: Point[], rounds = 3): Point[] {
    let out = points;
    for (let n = 0; n < rounds && out.length > 2; n++) {
        const next: Point[] = [out[0]];
        for (let i = 0; i < out.length - 1; i++) {
            const [ax, ay] = out[i];
            const [bx, by] = out[i + 1];
            next.push([ax * 0.75 + bx * 0.25, ay * 0.75 + by * 0.25]);
            next.push([ax * 0.25 + bx * 0.75, ay * 0.25 + by * 0.75]);
        }
        next.push(out[out.length - 1]);
        out = next;
    }
    return out;
}

/** Half body width at t (0 = head, 1 = tail tip): full neck, pointed tail. */
function halfWidth(t: number, cell: number): number {
    const full = cell * 0.44;
    if (t < 0.3) return full;
    const k = (t - 0.3) / 0.7;
    return full * (1 - k * k * 0.55);
}

/** Strokes path in short pieces so the width can follow t (round joins). */
function strokeTapered(
    ctx: CanvasRenderingContext2D,
    path: Point[],
    width: (t: number) => number,
    color: string,
) {
    const lengths = [0];
    for (let i = 1; i < path.length; i++) {
        lengths.push(
            lengths[i - 1] +
                Math.hypot(
                    path[i][0] - path[i - 1][0],
                    path[i][1] - path[i - 1][1],
                ),
        );
    }
    const total = lengths[lengths.length - 1] || 1;
    ctx.strokeStyle = color;
    ctx.lineCap = 'round';
    for (let i = path.length - 1; i > 0; i--) {
        ctx.lineWidth = 2 * width(lengths[i] / total);
        ctx.beginPath();
        ctx.moveTo(path[i][0], path[i][1]);
        ctx.lineTo(path[i - 1][0], path[i - 1][1]);
        ctx.stroke();
    }
}

/**
 * Cartoon snake: one smooth tapering body with an outline, a light belly
 * stripe and soft spots, and a big round head with eyes, cheeks, a smile
 * and a forked tongue.
 */
function drawSnake(
    ctx: CanvasRenderingContext2D,
    snake: Board['snakes'][number],
    cell: number,
    isYou: boolean,
    mini: boolean,
) {
    const color = SEAT_COLORS[snake.seat % SEAT_COLORS.length];
    const points = spine(snake.body, cell);
    const [hx, hy] = points[0];
    const dirs: Record<string, Point> = {
        up: [0, -1],
        down: [0, 1],
        left: [-1, 0],
        right: [1, 0],
    };
    const [dx, dy] = dirs[snake.dir] ?? [1, 0];
    const outline = Math.max(1.5, cell * 0.12);
    const width = (t: number) => halfWidth(t, cell);

    ctx.save();
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    if (points.length > 1) {
        const path = smooth(points, 4);
        strokeTapered(
            ctx,
            path,
            (t) => width(t) + outline * (0.3 + (0.7 * width(t)) / width(0)),
            INK,
        );
        strokeTapered(ctx, path, width, color);
        if (!mini) {
            strokeTapered(
                ctx,
                path.slice(0, Math.ceil(path.length * 0.9)),
                (t) => width(t * 0.9) * 0.34,
                shade(color, 0.5),
            );
            ctx.fillStyle = shade(color, -0.2);
            const every = 8;
            for (let i = every * 2; i < path.length - every * 2; i += every) {
                const [ax, ay] = path[i];
                const [bx, by] = path[i + 1];
                const len = Math.hypot(bx - ax, by - ay) || 1;
                const t = i / (path.length - 1);
                const w = width(t);
                const side = (i / every) % 2 === 0 ? 1 : -1;
                ctx.beginPath();
                ctx.arc(
                    ax + (-(by - ay) / len) * side * w * 0.62,
                    ay + ((bx - ax) / len) * side * w * 0.62,
                    w * 0.2,
                    0,
                    Math.PI * 2,
                );
                ctx.fill();
            }
        }
    }

    const headR = cell * 0.6;
    ctx.translate(hx, hy);
    ctx.rotate(Math.atan2(dy, dx));
    if (!mini) {
        ctx.strokeStyle = '#e11d48';
        ctx.lineWidth = Math.max(2, cell * 0.1);
        ctx.beginPath();
        ctx.moveTo(headR * 0.8, 0);
        ctx.lineTo(headR * 1.55, 0);
        ctx.lineTo(headR * 1.8, -headR * 0.24);
        ctx.moveTo(headR * 1.55, 0);
        ctx.lineTo(headR * 1.8, headR * 0.24);
        ctx.stroke();
    }
    if (isYou && !mini) {
        ctx.shadowColor = '#ffffff';
        ctx.shadowBlur = cell * 0.5;
    }
    ctx.beginPath();
    ctx.ellipse(headR * 0.1, 0, headR * 1.1, headR * 0.95, 0, 0, Math.PI * 2);
    ctx.fillStyle = color;
    ctx.fill();
    ctx.shadowBlur = 0;
    ctx.lineWidth = outline * 1.5;
    ctx.strokeStyle = INK;
    ctx.stroke();
    if (!mini) {
        ctx.fillStyle = shade(color, 0.35);
        ctx.beginPath();
        ctx.ellipse(
            -headR * 0.25,
            0,
            headR * 0.45,
            headR * 0.3,
            0,
            0,
            Math.PI * 2,
        );
        ctx.fill();
        ctx.fillStyle = 'rgba(255, 110, 140, 0.85)';
        for (const side of [-1, 1]) {
            ctx.beginPath();
            ctx.ellipse(
                headR * 0.58,
                side * headR * 0.56,
                headR * 0.18,
                headR * 0.12,
                0,
                0,
                Math.PI * 2,
            );
            ctx.fill();
        }
    }
    for (const side of [-1, 1]) {
        const ex = headR * 0.12;
        const ey = side * headR * 0.4;
        const er = headR * (mini ? 0.3 : 0.34);
        ctx.beginPath();
        ctx.arc(ex, ey, er, 0, Math.PI * 2);
        ctx.fillStyle = '#ffffff';
        ctx.fill();
        ctx.lineWidth = Math.max(1, outline * 0.8);
        ctx.strokeStyle = INK;
        ctx.stroke();
        ctx.beginPath();
        ctx.arc(ex + er * 0.35, ey, er * 0.55, 0, Math.PI * 2);
        ctx.fillStyle = INK;
        ctx.fill();
        if (!mini) {
            ctx.beginPath();
            ctx.arc(ex + er * 0.5, ey - er * 0.25, er * 0.2, 0, Math.PI * 2);
            ctx.fillStyle = '#ffffff';
            ctx.fill();
        }
    }
    if (!mini) {
        ctx.strokeStyle = INK;
        ctx.lineWidth = Math.max(1.5, outline);
        ctx.beginPath();
        ctx.arc(headR * 0.5, 0, headR * 0.4, -0.7, 0.7);
        ctx.stroke();
    }
    ctx.restore();
}

/** Big round answer token covering size x size cells. */
function drawFood(
    ctx: CanvasRenderingContext2D,
    food: Board['foods'][number],
    cell: number,
    mini: boolean,
) {
    const size = food.size ?? 1;
    const cx = (food.x + size / 2) * cell;
    const cy = (food.y + size / 2) * cell;
    const r = (size * cell) / 2 - Math.max(1, cell * 0.04);
    const color = FOOD_COLORS[food.label] ?? '#fff9dc';
    ctx.save();
    ctx.fillStyle = 'rgba(31, 42, 68, 0.25)';
    ctx.beginPath();
    ctx.arc(cx + r * 0.08, cy + r * 0.12, r, 0, Math.PI * 2);
    ctx.fill();
    const gradient = ctx.createRadialGradient(
        cx - r * 0.35,
        cy - r * 0.4,
        r * 0.1,
        cx,
        cy,
        r,
    );
    gradient.addColorStop(0, shade(color, 0.6));
    gradient.addColorStop(1, color);
    ctx.fillStyle = gradient;
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.lineWidth = Math.max(2, cell * 0.12);
    ctx.strokeStyle = INK;
    ctx.stroke();
    if (!mini) {
        ctx.fillStyle = 'rgba(255, 255, 255, 0.75)';
        ctx.beginPath();
        ctx.ellipse(
            cx - r * 0.4,
            cy - r * 0.48,
            r * 0.22,
            r * 0.12,
            -0.6,
            0,
            Math.PI * 2,
        );
        ctx.fill();
        ctx.fillStyle = INK;
        ctx.font = `900 ${Math.round(r * 1.1)}px system-ui, sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(food.label, cx, cy + r * 0.06);
    }
    ctx.restore();
}

/**
 * Draws one grid (snakes, food, junk blocks) on a canvas. Pure renderer:
 * every position comes from the Go referee.
 */
export function SnakeCanvas({
    board,
    grid,
    you,
    label,
    mini = false,
}: {
    board: Board;
    grid: number;
    you: number;
    label: string;
    mini?: boolean;
}) {
    const ref = useRef<HTMLCanvasElement>(null);
    useEffect(() => {
        const canvas = ref.current;
        if (!canvas) return;
        const size = canvas.clientWidth || 480;
        const ratio = window.devicePixelRatio || 1;
        canvas.width = size * ratio;
        canvas.height = size * ratio;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;
        ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
        const cell = size / grid;
        ctx.fillStyle = '#c4e89c';
        ctx.fillRect(0, 0, size, size);
        ctx.fillStyle = '#b4dc86';
        for (let y = 0; y < grid; y++) {
            for (let x = 0; x < grid; x++) {
                if ((x + y) % 2 === 0) {
                    ctx.fillRect(x * cell, y * cell, cell, cell);
                }
            }
        }
        for (const [x, y] of board.blocks) {
            ctx.fillStyle = INK;
            roundRect(ctx, x * cell + 1, y * cell + 1, cell - 2, cell - 2, 4);
            ctx.fill();
            ctx.strokeStyle = '#ff9e44';
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.moveTo(x * cell + 4, y * cell + 4);
            ctx.lineTo(x * cell + cell - 4, y * cell + cell - 4);
            ctx.stroke();
        }
        for (const food of board.foods) {
            drawFood(ctx, food, cell, mini);
        }
        for (const snake of board.snakes) {
            if (!snake.alive || snake.body.length === 0) continue;
            if (!snake.frozen) {
                drawSnake(ctx, snake, cell, snake.seat === you, mini);
                continue;
            }
            const layer = document.createElement('canvas');
            layer.width = canvas.width;
            layer.height = canvas.height;
            const layerCtx = layer.getContext('2d');
            if (!layerCtx) continue;
            layerCtx.setTransform(ratio, 0, 0, ratio, 0, 0);
            drawSnake(layerCtx, snake, cell, snake.seat === you, mini);
            ctx.save();
            ctx.setTransform(1, 0, 0, 1, 0, 0);
            ctx.globalAlpha = 0.5;
            ctx.drawImage(layer, 0, 0);
            ctx.restore();
        }
    }, [board, grid, you, mini]);
    return (
        <canvas
            ref={ref}
            className={mini ? 'sn-canvas sn-canvas--mini' : 'sn-canvas'}
            role="img"
            aria-label={label}
            data-testid={mini ? 'sn-mini-board' : 'sn-board'}
        />
    );
}

/** Keyboard (arrows / WASD) and swipe steering. */
export function useSnakeControls(
    enabled: boolean,
    turn: (direction: SnakeDirection) => void,
    surface: React.RefObject<HTMLElement | null>,
) {
    useEffect(() => {
        if (!enabled) return;
        const keys: Record<string, SnakeDirection> = {
            ArrowUp: 'up',
            ArrowDown: 'down',
            ArrowLeft: 'left',
            ArrowRight: 'right',
            w: 'up',
            s: 'down',
            a: 'left',
            d: 'right',
        };
        const onKey = (event: KeyboardEvent) => {
            const target = event.target as HTMLElement | null;
            if (target?.closest('input, textarea, select')) return;
            const dir =
                keys[
                    event.key.length === 1 ? event.key.toLowerCase() : event.key
                ];
            if (dir) {
                event.preventDefault();
                turn(dir);
            }
        };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, [enabled, turn]);
    useEffect(() => {
        const el = surface.current;
        if (!enabled || !el) return;
        let start: { x: number; y: number } | null = null;
        const down = (e: TouchEvent) => {
            start = { x: e.touches[0].clientX, y: e.touches[0].clientY };
        };
        const move = (e: TouchEvent) => {
            if (start) e.preventDefault();
        };
        const up = (e: TouchEvent) => {
            if (!start) return;
            const dx = e.changedTouches[0].clientX - start.x;
            const dy = e.changedTouches[0].clientY - start.y;
            start = null;
            if (Math.max(Math.abs(dx), Math.abs(dy)) < 18) return;
            turn(
                Math.abs(dx) > Math.abs(dy)
                    ? dx > 0
                        ? 'right'
                        : 'left'
                    : dy > 0
                      ? 'down'
                      : 'up',
            );
        };
        el.addEventListener('touchstart', down, { passive: true });
        el.addEventListener('touchmove', move, { passive: false });
        el.addEventListener('touchend', up);
        return () => {
            el.removeEventListener('touchstart', down);
            el.removeEventListener('touchmove', move);
            el.removeEventListener('touchend', up);
        };
    }, [enabled, turn, surface]);
}

/** On-screen D-pad for phones and tablets. */
export function DPad({
    disabled,
    onTurn,
}: {
    disabled: boolean;
    onTurn: (direction: SnakeDirection) => void;
}) {
    const { t } = useTranslations();
    const pad = (dir: SnakeDirection, Icon: typeof ArrowUp) => (
        <button
            type="button"
            className={`sn-dpad-btn sn-dpad-${dir}`}
            disabled={disabled}
            aria-label={t(`snake.dir.${dir}`)}
            data-testid={`sn-dpad-${dir}`}
            onPointerDown={(event) => {
                event.preventDefault();
                onTurn(dir);
            }}
        >
            <Icon aria-hidden="true" />
        </button>
    );
    return (
        <div className="sn-dpad" role="group" aria-label={t('snake.dpad')}>
            {pad('up', ArrowUp)}
            {pad('left', ArrowLeft)}
            {pad('right', ArrowRight)}
            {pad('down', ArrowDown)}
        </div>
    );
}

/** Live question with the food label legend (A–D). */
export function QuestionBar({
    text,
    subject,
    options,
    labels,
    media,
}: {
    text: string;
    subject?: string;
    options: string[];
    labels: string[];
    media?: QuestionMediaData | null;
}) {
    const { t } = useTranslations();
    return (
        <div className="sn-question" data-testid="sn-question">
            <div className="sn-question-meta">
                <p>{t('snake.question')}</p>
                {subject && <span className="sn-subject-chip">{subject}</span>}
            </div>
            <QuestionMedia media={media} size="sm" className="my-2" />
            <h2>{text}</h2>
            <ul className="sn-options" aria-label={t('snake.options')}>
                {options.map((option, index) => (
                    <li key={index} data-testid={`sn-option-${index}`}>
                        <span
                            aria-hidden="true"
                            style={{
                                background:
                                    FOOD_COLORS[labels[index]] ?? '#fff9dc',
                            }}
                        >
                            {labels[index]}
                        </span>
                        <strong>{option}</strong>
                    </li>
                ))}
            </ul>
        </div>
    );
}

/** Tail gauge: from the start length down to 0 (stage clear). */
export function TailGauge({ tail, start }: { tail: number; start: number }) {
    const { t } = useTranslations();
    const percent = Math.max(
        0,
        Math.min(100, Math.round(((start - tail) / start) * 100)),
    );
    const over = tail > start;
    return (
        <div className="sn-gauge" data-testid="sn-gauge">
            <div className="sn-gauge-meta">
                <span>{t('snake.tailLeft', { count: tail })}</span>
                <strong>{t('snake.cleared', { percent })}</strong>
            </div>
            <div
                className="sn-gauge-track"
                role="progressbar"
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={percent}
                aria-label={t('snake.gauge')}
            >
                <span
                    className="sn-gauge-fill"
                    data-over={over}
                    style={{ width: `${over ? 100 : percent}%` }}
                />
            </div>
        </div>
    );
}
