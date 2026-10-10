import { useTranslations } from '@/hooks/use-translations';
import { cn } from '@/lib/utils';
import { Laptop, Router, Server, TerminalSquare } from 'lucide-react';

type Bilingual = { id: string; en: string };

interface Wire {
    color: string;
    stripe?: string;
}

/**
 * Optional illustration of a bank question (mirrors
 * App\Services\QuestionVisual). Sent by the Go service as `media`.
 */
export type QuestionMediaData =
    | { kind: 'image'; src: string; alt?: Bilingual; caption?: Bilingual }
    | {
          kind: 'cable';
          style?: 'utp' | 'fiber';
          wires: Wire[];
          caption?: Bilingual;
      }
    | {
          kind: 'topology';
          shape: TopologyShape;
          caption?: Bilingual;
      }
    | { kind: 'terminal'; lines: string[]; caption?: Bilingual };

export const TOPOLOGY_SHAPES = [
    'star',
    'bus',
    'ring',
    'mesh',
    'tree',
    'point',
] as const;

export type TopologyShape = (typeof TOPOLOGY_SHAPES)[number];

type NodeType = 'pc' | 'switch' | 'router' | 'tap';

/** Node positions on a 240×140 canvas and the links between them. */
const TOPOLOGIES: Record<
    TopologyShape,
    { nodes: [number, number, NodeType][]; edges: [number, number][] }
> = {
    star: {
        nodes: [
            [120, 70, 'switch'],
            [40, 26, 'pc'],
            [120, 18, 'pc'],
            [200, 26, 'pc'],
            [40, 114, 'pc'],
            [120, 122, 'pc'],
            [200, 114, 'pc'],
        ],
        edges: [
            [0, 1],
            [0, 2],
            [0, 3],
            [0, 4],
            [0, 5],
            [0, 6],
        ],
    },
    bus: {
        nodes: [
            [16, 70, 'tap'],
            [224, 70, 'tap'],
            [56, 22, 'pc'],
            [104, 118, 'pc'],
            [144, 22, 'pc'],
            [192, 118, 'pc'],
            [56, 70, 'tap'],
            [104, 70, 'tap'],
            [144, 70, 'tap'],
            [192, 70, 'tap'],
        ],
        edges: [
            [0, 1],
            [6, 2],
            [7, 3],
            [8, 4],
            [9, 5],
        ],
    },
    ring: {
        nodes: [
            [120, 18, 'pc'],
            [196, 46, 'pc'],
            [196, 98, 'pc'],
            [120, 122, 'pc'],
            [44, 98, 'pc'],
            [44, 46, 'pc'],
        ],
        edges: [
            [0, 1],
            [1, 2],
            [2, 3],
            [3, 4],
            [4, 5],
            [5, 0],
        ],
    },
    mesh: {
        nodes: [
            [120, 18, 'pc'],
            [200, 60, 'pc'],
            [168, 122, 'pc'],
            [72, 122, 'pc'],
            [40, 60, 'pc'],
        ],
        edges: [
            [0, 1],
            [0, 2],
            [0, 3],
            [0, 4],
            [1, 2],
            [1, 3],
            [1, 4],
            [2, 3],
            [2, 4],
            [3, 4],
        ],
    },
    tree: {
        nodes: [
            [120, 18, 'router'],
            [68, 66, 'switch'],
            [172, 66, 'switch'],
            [36, 120, 'pc'],
            [96, 120, 'pc'],
            [144, 120, 'pc'],
            [204, 120, 'pc'],
        ],
        edges: [
            [0, 1],
            [0, 2],
            [1, 3],
            [1, 4],
            [2, 5],
            [2, 6],
        ],
    },
    point: {
        nodes: [
            [48, 70, 'pc'],
            [192, 70, 'pc'],
        ],
        edges: [[0, 1]],
    },
};

const INK = '#1f2a44';

function pick(text: Bilingual | undefined, locale: string): string {
    if (!text) {
        return '';
    }
    return (locale === 'en' ? text.en || text.id : text.id || text.en).trim();
}

/** Whether a payload is a renderable question visual. */
export function hasQuestionMedia(
    media: QuestionMediaData | null | undefined,
): media is QuestionMediaData {
    if (!media || typeof media !== 'object') {
        return false;
    }
    switch (media.kind) {
        case 'image':
            return typeof media.src === 'string' && media.src !== '';
        case 'cable':
            return Array.isArray(media.wires) && media.wires.length > 0;
        case 'topology':
            return media.shape in TOPOLOGIES;
        case 'terminal':
            return Array.isArray(media.lines) && media.lines.length > 0;
        default:
            return false;
    }
}

/**
 * Shared question illustration for every quiz game: an uploaded picture,
 * a UTP/fibre cable, a network topology or console output. Renders nothing
 * for questions without a visual.
 */
export function QuestionMedia({
    media,
    className,
    size = 'md',
    tone = 'light',
}: {
    media: QuestionMediaData | null | undefined;
    className?: string;
    /** sm for phone controllers and side panels, lg for projector arenas. */
    size?: 'sm' | 'md' | 'lg';
    /** dark: on a dark question panel (arena screens). */
    tone?: 'light' | 'dark';
}) {
    const { t, i18n } = useTranslations();
    if (!hasQuestionMedia(media)) {
        return null;
    }
    const locale = i18n.language?.startsWith('en') ? 'en' : 'id';
    const caption = pick(media.caption, locale);
    const height =
        size === 'sm' ? 'max-h-36' : size === 'lg' ? 'max-h-72' : 'max-h-52';

    return (
        <figure
            className={cn(
                'mx-auto flex w-full max-w-md flex-col items-center gap-1.5',
                size === 'lg' && 'max-w-xl',
                className,
            )}
            data-testid="question-media"
            data-kind={media.kind}
        >
            {media.kind === 'image' && (
                <img
                    src={media.src}
                    alt={
                        pick(media.alt, locale) ||
                        caption ||
                        t('questionMedia.imageAlt')
                    }
                    loading="eager"
                    decoding="async"
                    className={cn(
                        'w-auto max-w-full rounded-2xl border-3 border-[#1f2a44] bg-white object-contain shadow-[3px_3px_0px_#1f2a44]',
                        height,
                    )}
                />
            )}
            {media.kind === 'cable' && (
                <CableVisual
                    wires={media.wires}
                    fiber={media.style === 'fiber'}
                    size={size}
                />
            )}
            {media.kind === 'topology' && (
                <TopologyVisual shape={media.shape} className={height} />
            )}
            {media.kind === 'terminal' && (
                <TerminalVisual lines={media.lines} size={size} />
            )}
            {caption && (
                <figcaption
                    className={cn(
                        'text-center text-xs font-bold',
                        tone === 'dark' ? 'text-white/80' : 'text-slate-600',
                    )}
                >
                    {caption}
                </figcaption>
            )}
        </figure>
    );
}

/** Wires left to right (pin/core 1 first), white wires with a coloured stripe. */
function CableVisual({
    wires,
    fiber,
    size,
}: {
    wires: Wire[];
    fiber: boolean;
    size: 'sm' | 'md' | 'lg';
}) {
    const { t } = useTranslations();
    const label = t(
        fiber ? 'questionMedia.fiberLabel' : 'questionMedia.cableLabel',
        { count: wires.length },
    );
    return (
        <div
            className="flex w-full flex-col items-center rounded-2xl border-3 border-[#1f2a44] bg-[#f1f5f9] px-3 pt-3 pb-2 shadow-[3px_3px_0px_#1f2a44]"
            role="img"
            aria-label={label}
        >
            {!fiber && (
                <div
                    className="h-3 w-[92%] rounded-t-lg border-2 border-b-0 border-[#1f2a44] bg-[#cbd5e1]"
                    aria-hidden
                />
            )}
            <div
                className={cn(
                    'flex w-full items-end justify-center gap-1',
                    fiber && 'gap-2',
                )}
            >
                {wires.map((wire, index) => (
                    <div
                        key={index}
                        className="flex min-w-0 flex-1 flex-col items-center gap-1"
                        style={{ maxWidth: fiber ? 40 : 34 }}
                    >
                        <span
                            className={cn(
                                'block w-full border-2 border-[#1f2a44]',
                                fiber
                                    ? 'aspect-square rounded-full'
                                    : 'rounded-b-md',
                                !fiber &&
                                    (size === 'sm'
                                        ? 'h-12'
                                        : size === 'lg'
                                          ? 'h-24'
                                          : 'h-16'),
                            )}
                            style={{
                                background: wire.stripe
                                    ? `repeating-linear-gradient(135deg, ${wire.color} 0 6px, ${wire.stripe} 6px 11px)`
                                    : wire.color,
                            }}
                            data-testid="question-media-wire"
                        />
                        <span className="text-[10px] font-black text-[#1f2a44] tabular-nums">
                            {index + 1}
                        </span>
                    </div>
                ))}
            </div>
        </div>
    );
}

function TopologyVisual({
    shape,
    className,
}: {
    shape: TopologyShape;
    className?: string;
}) {
    const { t } = useTranslations();
    const { nodes, edges } = TOPOLOGIES[shape];
    return (
        <div className="w-full rounded-2xl border-3 border-[#1f2a44] bg-[#ecfdf5] p-2 shadow-[3px_3px_0px_#1f2a44]">
            <svg
                viewBox="0 0 240 140"
                className={cn('mx-auto h-auto w-full', className)}
                role="img"
                aria-label={t('questionMedia.topologyLabel')}
                data-testid="question-media-topology"
            >
                {edges.map(([a, b], i) => (
                    <line
                        key={i}
                        x1={nodes[a][0]}
                        y1={nodes[a][1]}
                        x2={nodes[b][0]}
                        y2={nodes[b][1]}
                        stroke={INK}
                        strokeWidth={shape === 'bus' && i === 0 ? 5 : 2.5}
                        strokeLinecap="round"
                    />
                ))}
                {nodes.map(([x, y, type], i) =>
                    type === 'tap' ? null : (
                        <TopologyNode key={i} x={x} y={y} type={type} />
                    ),
                )}
            </svg>
        </div>
    );
}

function TopologyNode({
    x,
    y,
    type,
}: {
    x: number;
    y: number;
    type: NodeType;
}) {
    const fill =
        type === 'switch' ? '#0f766e' : type === 'router' ? '#6c5ce7' : '#fff';
    const Icon =
        type === 'switch' ? Server : type === 'router' ? Router : Laptop;
    return (
        <g>
            <rect
                x={x - 13}
                y={y - 11}
                width={26}
                height={22}
                rx={6}
                fill={fill}
                stroke={INK}
                strokeWidth={2.5}
            />
            <Icon
                x={x - 8}
                y={y - 8}
                width={16}
                height={16}
                color={type === 'pc' ? INK : '#fff'}
                strokeWidth={2.5}
                aria-hidden
            />
        </g>
    );
}

function TerminalVisual({
    lines,
    size,
}: {
    lines: string[];
    size: 'sm' | 'md' | 'lg';
}) {
    const { t } = useTranslations();
    return (
        <div className="w-full overflow-hidden rounded-2xl border-3 border-[#1f2a44] bg-[#0f172a] text-left shadow-[3px_3px_0px_#1f2a44]">
            <div className="flex items-center gap-1.5 border-b-2 border-[#1f2a44] bg-[#1e293b] px-3 py-1.5">
                <TerminalSquare
                    className="size-3.5 text-[#5eead4]"
                    aria-hidden
                />
                <span className="text-[10px] font-black tracking-widest text-slate-300 uppercase">
                    {t('questionMedia.terminal')}
                </span>
            </div>
            <pre
                className={cn(
                    'overflow-x-auto px-3 py-2 font-mono leading-snug whitespace-pre text-[#d1fae5]',
                    size === 'sm'
                        ? 'text-[10px]'
                        : size === 'lg'
                          ? 'text-sm sm:text-base'
                          : 'text-[11px] sm:text-xs',
                )}
                data-testid="question-media-terminal"
            >
                {lines.join('\n')}
            </pre>
        </div>
    );
}
