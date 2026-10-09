import {
    type SnakeBoard as Board,
    type SnakeDirection,
} from '@/hooks/use-snake';
import { useTranslations } from '@/hooks/use-translations';
import { ArrowDown, ArrowLeft, ArrowRight, ArrowUp } from 'lucide-react';
import { useEffect, useRef } from 'react';
import './snake.css';

/** Seat colours, matching the avatar seat palette order. */
export const SEAT_COLORS = ['#fff9dc', '#fb923c', '#a78bfa', '#f43f5e'];
const FOOD_COLORS: Record<string, string> = {
    A: '#ffc356',
    B: '#bfeaf4',
    C: '#f9b4c9',
    D: '#c9efd8',
};

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
        ctx.fillStyle = '#156653';
        ctx.fillRect(0, 0, size, size);
        for (let y = 0; y < grid; y++) {
            for (let x = 0; x < grid; x++) {
                if ((x + y) % 2 === 0) {
                    ctx.fillStyle = '#17705b';
                    ctx.fillRect(x * cell, y * cell, cell, cell);
                }
            }
        }
        for (const [x, y] of board.blocks) {
            ctx.fillStyle = '#1f2a44';
            roundRect(ctx, x * cell + 1, y * cell + 1, cell - 2, cell - 2, 3);
            ctx.fill();
            ctx.strokeStyle = '#ff9e44';
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.moveTo(x * cell + 4, y * cell + 4);
            ctx.lineTo(x * cell + cell - 4, y * cell + cell - 4);
            ctx.stroke();
        }
        for (const food of board.foods) {
            const cx = food.x * cell + cell / 2;
            const cy = food.y * cell + cell / 2;
            ctx.fillStyle = FOOD_COLORS[food.label] ?? '#fff9dc';
            ctx.strokeStyle = '#1f2a44';
            ctx.lineWidth = Math.max(1.5, cell * 0.08);
            ctx.beginPath();
            ctx.arc(cx, cy, cell * 0.47, 0, Math.PI * 2);
            ctx.fill();
            ctx.stroke();
            if (!mini) {
                ctx.fillStyle = '#1f2a44';
                ctx.font = `900 ${Math.round(cell * 0.62)}px system-ui, sans-serif`;
                ctx.textAlign = 'center';
                ctx.textBaseline = 'middle';
                ctx.fillText(food.label, cx, cy + 1);
            }
        }
        for (const snake of board.snakes) {
            if (!snake.alive) continue;
            const color = SEAT_COLORS[snake.seat % SEAT_COLORS.length];
            ctx.globalAlpha = snake.frozen ? 0.45 : 1;
            for (let i = snake.body.length - 1; i >= 0; i--) {
                const [x, y] = snake.body[i];
                const pad = i === 0 ? 0.5 : cell * 0.12;
                ctx.fillStyle = i === 0 ? '#1f2a44' : color;
                ctx.strokeStyle = '#1f2a44';
                ctx.lineWidth = Math.max(1, cell * 0.08);
                roundRect(
                    ctx,
                    x * cell + pad,
                    y * cell + pad,
                    cell - pad * 2,
                    cell - pad * 2,
                    cell * 0.3,
                );
                ctx.fill();
                if (i > 0) ctx.stroke();
            }
            const [hx, hy] = snake.body[0];
            ctx.fillStyle = color;
            roundRect(
                ctx,
                hx * cell + cell * 0.14,
                hy * cell + cell * 0.14,
                cell * 0.72,
                cell * 0.72,
                cell * 0.25,
            );
            ctx.fill();
            if (snake.seat === you && !mini) {
                ctx.strokeStyle = '#fff9dc';
                ctx.lineWidth = 2;
                ctx.stroke();
            }
            ctx.fillStyle = '#1f2a44';
            const eye = cell * 0.09;
            const [ex, ey] =
                snake.dir === 'up' || snake.dir === 'down'
                    ? [cell * 0.2, 0]
                    : [0, cell * 0.2];
            const ox =
                snake.dir === 'left' ? -0.12 : snake.dir === 'right' ? 0.12 : 0;
            const oy =
                snake.dir === 'up' ? -0.12 : snake.dir === 'down' ? 0.12 : 0;
            for (const s of [-1, 1]) {
                ctx.beginPath();
                ctx.arc(
                    hx * cell + cell / 2 + s * ex + ox * cell,
                    hy * cell + cell / 2 + s * ey + oy * cell,
                    eye,
                    0,
                    Math.PI * 2,
                );
                ctx.fill();
            }
            ctx.globalAlpha = 1;
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
}: {
    text: string;
    subject?: string;
    options: string[];
    labels: string[];
}) {
    const { t } = useTranslations();
    return (
        <div className="sn-question" data-testid="sn-question">
            <div className="sn-question-meta">
                <p>{t('snake.question')}</p>
                {subject && <span className="sn-subject-chip">{subject}</span>}
            </div>
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
