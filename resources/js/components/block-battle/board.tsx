import {
    type BBPiece,
    type BBPieceType,
    type BBPoint,
} from '@/hooks/use-block-battle';
import { useTranslations } from '@/hooks/use-translations';
import { cn } from '@/lib/utils';
import {
    type CSSProperties,
    type HTMLAttributes,
    type Ref,
    useEffect,
    useImperativeHandle,
    useRef,
} from 'react';

/** Personal board size (visible part, hidden spawn rows are not sent). */
export const BOARD_COLS = 10;
export const BOARD_ROWS = 20;

/** Fill colour per board code (`.` = empty). */
export const CELL_COLORS: Record<string, string> = {
    I: '#06b6d4',
    J: '#2563eb',
    L: '#f97316',
    O: '#facc15',
    S: '#22c55e',
    T: '#a855f7',
    Z: '#ef4444',
    G: '#6b7280',
    '#': '#78716c',
};

/** Text colour of a glyph drawn on a cell of that colour. */
const GLYPH_INK: Record<string, string> = {
    O: '#1f2a44',
    S: '#052e16',
    I: '#083344',
    L: '#1f2a44',
};

/** Spawn orientation of every piece, `[x, y]` inside a 4 x 2 box. */
export const PIECE_SHAPES: Record<BBPieceType, BBPoint[]> = {
    I: [
        [0, 0],
        [1, 0],
        [2, 0],
        [3, 0],
    ],
    J: [
        [0, 0],
        [0, 1],
        [1, 1],
        [2, 1],
    ],
    L: [
        [2, 0],
        [0, 1],
        [1, 1],
        [2, 1],
    ],
    O: [
        [1, 0],
        [2, 0],
        [1, 1],
        [2, 1],
    ],
    S: [
        [1, 0],
        [2, 0],
        [0, 1],
        [1, 1],
    ],
    T: [
        [1, 0],
        [0, 1],
        [1, 1],
        [2, 1],
    ],
    Z: [
        [0, 0],
        [1, 0],
        [1, 1],
        [2, 1],
    ],
};

/** Display form of a glyph (`x` and `-` read as × and − on the board). */
export function glyphLabel(glyph: string): string {
    if (glyph === 'x' || glyph === '*') {
        return '×';
    }
    if (glyph === '-') {
        return '−';
    }
    return glyph.toUpperCase();
}

function shade(hex: string, amount: number): string {
    const n = parseInt(hex.slice(1), 16);
    const mix = (c: number) =>
        Math.max(
            0,
            Math.min(
                255,
                Math.round(
                    amount > 0 ? c + (255 - c) * amount : c * (1 + amount),
                ),
            ),
        );
    const r = mix((n >> 16) & 255);
    const g = mix((n >> 8) & 255);
    const b = mix(n & 255);
    return `rgb(${r} ${g} ${b})`;
}

export interface BoardPaint {
    cols: number;
    rows: number;
    cells: string;
    glyphs?: string;
    piece?: BBPiece | null;
    ghost?: BBPoint[];
    armored?: number[];
    /** Draw the background grid lines. */
    grid?: boolean;
    /** Smallest cell size (CSS px) at which glyph letters are drawn. */
    glyphMin?: number;
    /** Gray-out (knocked out). */
    dim?: boolean;
}

function drawBlock(
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    size: number,
    code: string,
    glyph: string | undefined,
    glyphMin: number,
    dpr: number,
) {
    const color = CELL_COLORS[code] ?? '#94a3b8';
    const inset = Math.max(1, size * 0.06);
    ctx.fillStyle = color;
    ctx.fillRect(x, y, size, size);
    if (size >= 6 * dpr) {
        ctx.fillStyle = shade(color, 0.35);
        ctx.fillRect(x, y, size, inset);
        ctx.fillRect(x, y, inset, size);
        ctx.fillStyle = shade(color, -0.35);
        ctx.fillRect(x, y + size - inset, size, inset);
        ctx.fillRect(x + size - inset, y, inset, size);
    }
    if (code === 'G' && size >= 8 * dpr) {
        ctx.strokeStyle = 'rgb(255 255 255 / 0.18)';
        ctx.lineWidth = Math.max(1, size * 0.08);
        ctx.beginPath();
        ctx.moveTo(x + size * 0.25, y + size * 0.75);
        ctx.lineTo(x + size * 0.75, y + size * 0.25);
        ctx.stroke();
    }
    if (glyph && glyph !== ' ' && size >= glyphMin * dpr) {
        ctx.fillStyle = GLYPH_INK[code] ?? '#ffffff';
        ctx.font = `900 ${Math.round(size * 0.62)}px ui-rounded, system-ui, sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(
            glyphLabel(glyph),
            x + size / 2,
            y + size / 2 + size * 0.04,
        );
    }
}

/** Paints a board (cells, ghost, falling piece, glyphs) onto a canvas. */
export function paintBoard(
    canvas: HTMLCanvasElement,
    paint: BoardPaint,
    cssWidth: number,
) {
    const ctx = canvas.getContext('2d');
    if (!ctx) {
        return;
    }
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const size = Math.max(1, Math.floor((cssWidth * dpr) / paint.cols));
    const width = size * paint.cols;
    const height = size * paint.rows;
    if (canvas.width !== width || canvas.height !== height) {
        canvas.width = width;
        canvas.height = height;
    }
    const glyphMin = paint.glyphMin ?? 9;
    ctx.clearRect(0, 0, width, height);
    ctx.fillStyle = '#0f172a';
    ctx.fillRect(0, 0, width, height);
    if (paint.grid !== false && size >= 8 * dpr) {
        ctx.strokeStyle = 'rgb(148 163 184 / 0.12)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        for (let c = 1; c < paint.cols; c++) {
            ctx.moveTo(c * size + 0.5, 0);
            ctx.lineTo(c * size + 0.5, height);
        }
        for (let r = 1; r < paint.rows; r++) {
            ctx.moveTo(0, r * size + 0.5);
            ctx.lineTo(width, r * size + 0.5);
        }
        ctx.stroke();
    }
    const total = paint.cols * paint.rows;
    for (let i = 0; i < total; i++) {
        const code = paint.cells[i];
        if (!code || code === '.') {
            continue;
        }
        const x = (i % paint.cols) * size;
        const y = Math.floor(i / paint.cols) * size;
        drawBlock(ctx, x, y, size, code, paint.glyphs?.[i], glyphMin, dpr);
    }
    for (const row of paint.armored ?? []) {
        ctx.strokeStyle = '#e2e8f0';
        ctx.lineWidth = Math.max(2, size * 0.12);
        ctx.strokeRect(
            ctx.lineWidth / 2,
            row * size + ctx.lineWidth / 2,
            width - ctx.lineWidth,
            size - ctx.lineWidth,
        );
    }
    if (paint.piece && paint.ghost?.length) {
        const color = CELL_COLORS[paint.piece.type] ?? '#94a3b8';
        ctx.strokeStyle = color;
        ctx.fillStyle = `${color}33`;
        ctx.lineWidth = Math.max(1, size * 0.08);
        for (const [gx, gy] of paint.ghost) {
            if (gy < 0) {
                continue;
            }
            ctx.fillRect(gx * size, gy * size, size, size);
            ctx.strokeRect(
                gx * size + ctx.lineWidth / 2,
                gy * size + ctx.lineWidth / 2,
                size - ctx.lineWidth,
                size - ctx.lineWidth,
            );
        }
    }
    if (paint.piece) {
        paint.piece.cells.forEach(([px, py], i) => {
            if (py < 0) {
                return;
            }
            drawBlock(
                ctx,
                px * size,
                py * size,
                size,
                paint.piece!.type,
                paint.piece!.glyphs?.[i],
                glyphMin,
                dpr,
            );
        });
    }
    if (paint.dim) {
        ctx.fillStyle = 'rgb(15 23 42 / 0.55)';
        ctx.fillRect(0, 0, width, height);
    }
}

export interface BoardHandle {
    element: HTMLDivElement | null;
}

/**
 * Canvas board renderer from the board string encoding. Resizes with its
 * box (aspect ratio cols:rows) and repaints whenever the input changes.
 */
export function BoardCanvas({
    paint,
    className,
    style,
    testId,
    label,
    ref,
    children,
    ...rest
}: {
    paint: BoardPaint;
    className?: string;
    style?: CSSProperties;
    testId?: string;
    label?: string;
    ref?: Ref<BoardHandle>;
    children?: React.ReactNode;
} & Omit<HTMLAttributes<HTMLDivElement>, 'style'> & {
        [data: `data-${string}`]: string | number | undefined;
    }) {
    const box = useRef<HTMLDivElement>(null);
    const canvas = useRef<HTMLCanvasElement>(null);
    const paintRef = useRef(paint);
    useImperativeHandle(ref, () => ({ element: box.current }), []);

    useEffect(() => {
        paintRef.current = paint;
        const el = box.current;
        if (el && canvas.current) {
            paintBoard(canvas.current, paint, el.clientWidth);
        }
    }, [paint]);

    useEffect(() => {
        const el = box.current;
        if (!el || typeof ResizeObserver === 'undefined') {
            return;
        }
        const observer = new ResizeObserver(() => {
            if (canvas.current) {
                paintBoard(canvas.current, paintRef.current, el.clientWidth);
            }
        });
        observer.observe(el);
        return () => observer.disconnect();
    }, []);

    return (
        <div
            {...rest}
            ref={box}
            className={cn('relative overflow-hidden', className)}
            style={{ aspectRatio: `${paint.cols} / ${paint.rows}`, ...style }}
            data-testid={testId}
            role="img"
            aria-label={label}
        >
            <canvas
                ref={canvas}
                className="absolute inset-0 block size-full [image-rendering:pixelated]"
                aria-hidden="true"
            />
            {children}
        </div>
    );
}

/** Next-queue preview of one piece (CSS grid, 4 x 2). */
export function PiecePreview({
    type,
    glyphs,
    className,
    cell = 12,
}: {
    type: BBPieceType;
    glyphs?: string[];
    className?: string;
    cell?: number;
}) {
    const { t } = useTranslations();
    const shape = PIECE_SHAPES[type] ?? PIECE_SHAPES.T;
    const color = CELL_COLORS[type];
    return (
        <span
            className={cn('relative inline-block shrink-0', className)}
            style={{ width: cell * 4, height: cell * 2 }}
            role="img"
            aria-label={t('blockBattle.controller.pieceLabel', { piece: type })}
            data-testid="bb-next-piece"
            data-piece={type}
        >
            {shape.map(([x, y], i) => (
                <span
                    key={i}
                    className="absolute grid place-items-center rounded-[3px] border border-black/25 font-black"
                    style={{
                        left: x * cell,
                        top: y * cell,
                        width: cell,
                        height: cell,
                        background: color,
                        color: GLYPH_INK[type] ?? '#fff',
                        fontSize: cell * 0.62,
                        lineHeight: 1,
                    }}
                >
                    {glyphs?.[i] && glyphs[i] !== ' '
                        ? glyphLabel(glyphs[i])
                        : ''}
                </span>
            ))}
        </span>
    );
}

/**
 * CSS-grid board used by the animated walkthrough: every cell is an element
 * so rows can explode / slide with keyframes. `rowClass` styles whole rows.
 */
export function GridBoard({
    cells,
    glyphs,
    cols = BOARD_COLS,
    rows,
    rowClass,
    className,
    style,
    children,
}: {
    cells: string;
    glyphs?: string;
    cols?: number;
    rows: number;
    rowClass?: (row: number) => string | undefined;
    className?: string;
    style?: CSSProperties;
    children?: React.ReactNode;
}) {
    return (
        <div
            className={cn(
                'relative overflow-hidden rounded-lg border-2 border-[#1f2a44] bg-[#0f172a]',
                className,
            )}
            style={style}
            aria-hidden="true"
        >
            <div
                className="grid"
                style={{ gridTemplateColumns: `repeat(${cols}, 1fr)` }}
            >
                {Array.from({ length: rows }, (_, r) => (
                    <div
                        key={r}
                        className={cn('col-span-full grid', rowClass?.(r))}
                        style={{ gridTemplateColumns: `repeat(${cols}, 1fr)` }}
                    >
                        {Array.from({ length: cols }, (_, c) => {
                            const i = r * cols + c;
                            const code = cells[i] ?? '.';
                            const glyph = glyphs?.[i];
                            return (
                                <span
                                    key={c}
                                    className={cn(
                                        'bb-cell grid aspect-square place-items-center text-[0.6em] leading-none font-black',
                                        code !== '.' && 'bb-cell--on',
                                    )}
                                    style={
                                        code !== '.'
                                            ? {
                                                  background: CELL_COLORS[code],
                                                  color:
                                                      GLYPH_INK[code] ?? '#fff',
                                              }
                                            : undefined
                                    }
                                >
                                    {glyph && glyph !== ' '
                                        ? glyphLabel(glyph)
                                        : ''}
                                </span>
                            );
                        })}
                    </div>
                ))}
            </div>
            {children}
        </div>
    );
}

/** Static board string from a list of rows (top to bottom), for demos. */
export function boardFromRows(rows: string[], cols = BOARD_COLS): string {
    return rows.map((r) => r.padEnd(cols, '.').slice(0, cols)).join('');
}
