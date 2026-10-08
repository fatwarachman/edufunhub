import { BrandLink } from '@/components/brand-link';
import { DigitalClock } from '@/components/digital-clock';
import { PlayerAvatar } from '@/components/player-avatar';
import { ResponsiveTable } from '@/components/responsive-table';
import { BackButton, SiteNav, useGameBackHref } from '@/components/site-nav';
import { useTranslations } from '@/hooks/use-translations';
import {
    type TurboBanana,
    type TurboEffect,
    type TurboEvent,
    type TurboItem,
    type TurboKart,
    type TurboMissile,
    type TurboRanking,
    type TurboRosterEntry,
    type TurboState,
} from '@/hooks/use-turbo-trivia';
import { type CharacterLook } from '@/lib/character/draw-character';
import { soundSettings } from '@/lib/game-sounds';
import {
    playTurboSound,
    startEngine,
    type TurboSound,
} from '@/lib/turbo-sounds';
import { cn } from '@/lib/utils';
import { Head, usePage } from '@inertiajs/react';
import {
    Banana,
    CarFront,
    Crown,
    Flag,
    type LucideIcon,
    Rocket,
    Shield,
    Volume2,
    VolumeX,
    Zap,
} from 'lucide-react';
import {
    type HTMLAttributes,
    type ReactNode,
    useCallback,
    useEffect,
    useMemo,
    useRef,
    useState,
} from 'react';

export const ACCENT = '#e11d48';
export const BG = '#fff1f2';
export const INK = '#1f2a44';

/** Icon and tone per item (white text passes AA on each tone). */
export const ITEM_STYLE: Record<TurboItem, { icon: LucideIcon; tone: string }> =
    {
        BANANA: { icon: Banana, tone: '#a16207' },
        MISSILE: { icon: Rocket, tone: '#b91c1c' },
        LIGHTNING: { icon: Zap, tone: '#6d28d9' },
        SHIELD: { icon: Shield, tone: '#0369a1' },
    };

/** Kart body colours, assigned by join order. */
const KART_COLORS = [
    '#e11d48',
    '#2563eb',
    '#16a34a',
    '#f59e0b',
    '#7c3aed',
    '#0891b2',
    '#db2777',
    '#65a30d',
    '#ea580c',
    '#4f46e5',
];

export function kartColor(order: number): string {
    return KART_COLORS[Math.abs(order - 1) % KART_COLORS.length];
}

export function useNow(active: boolean, every = 200): number {
    const [now, setNow] = useState(() => Date.now());
    useEffect(() => {
        if (!active) {
            return;
        }
        const id = setInterval(() => setNow(Date.now()), every);
        return () => clearInterval(id);
    }, [active, every]);
    return now;
}

/** Answer time left, from the last server snapshot. */
export function useQuestionLeft(state: TurboState): number {
    const open = state.quiz?.stage === 'QUESTION';
    const now = useNow(open, 200);
    if (!open || !state.quiz) {
        return 0;
    }
    return Math.max(0, state.quiz.remaining_ms - (now - state.receivedAt));
}

export function raceClock(ms: number): string {
    const total = Math.max(0, Math.floor(ms / 1000));
    return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`;
}

/** Roster lookup by user id. */
export function useRoster(players: TurboRosterEntry[]) {
    return useMemo(() => {
        const map = new Map<number, TurboRosterEntry>();
        players.forEach((p) => map.set(p.user_id, p));
        return map;
    }, [players]);
}

/** Racing sound effects and the projector engine drone. */
export function useTurboAudio() {
    const { gameSounds } = usePage<{ gameSounds?: unknown }>().props;
    const settings = useRef(soundSettings(gameSounds));
    const context = useRef<AudioContext | null>(null);
    const engine = useRef<ReturnType<typeof startEngine> | null>(null);
    const mutedRef = useRef(false);
    const [muted, setMuted] = useState(false);

    useEffect(() => {
        settings.current = soundSettings(gameSounds);
    }, [gameSounds]);

    const audio = useCallback((): AudioContext | null => {
        if (mutedRef.current || typeof window.AudioContext === 'undefined') {
            return null;
        }
        try {
            context.current ??= new AudioContext();
            if (context.current.state === 'suspended') {
                void context.current.resume().catch(() => {});
            }
            return context.current;
        } catch {
            return null;
        }
    }, []);

    const play = useCallback(
        (sound: TurboSound) => {
            const ctx = audio();
            if (ctx) {
                try {
                    playTurboSound(ctx, sound, settings.current);
                } catch {
                    /* Audio is optional. */
                }
            }
        },
        [audio],
    );

    const engineSpeed = useCallback(
        (kmh: number | null) => {
            if (kmh === null) {
                engine.current?.stop();
                engine.current = null;
                return;
            }
            const ctx = audio();
            if (!ctx) {
                return;
            }
            engine.current ??= startEngine(ctx, settings.current);
            engine.current.setSpeed(kmh);
        },
        [audio],
    );

    const toggleMuted = () => {
        mutedRef.current = !mutedRef.current;
        setMuted(mutedRef.current);
        if (mutedRef.current) {
            engine.current?.stop();
            engine.current = null;
        } else {
            play('beep');
        }
    };

    useEffect(
        () => () => {
            engine.current?.stop();
            void context.current?.close().catch(() => {});
        },
        [],
    );
    return { play, engineSpeed, muted, toggleMuted };
}

/** Common header + layout of the three Turbo Trivia pages. */
export function TurboShell({
    title,
    testId,
    role,
    phase,
    muted,
    onToggleMuted,
    extra,
    wide,
    children,
}: {
    title: string;
    testId: string;
    role: string;
    phase: string;
    muted: boolean;
    onToggleMuted: () => void;
    extra?: ReactNode;
    wide?: boolean;
    children: ReactNode;
}) {
    const { t } = useTranslations();
    const backHref = useGameBackHref();
    return (
        <div
            className="min-h-dvh text-[#1f2a44]"
            style={{ background: BG }}
            data-testid={testId}
            data-role={role}
            data-phase={phase}
        >
            <Head title={`${title} — EduFunHub`} />
            <header
                className="sticky top-0 z-30 border-b-4 border-[#1f2a44]"
                style={{ background: BG }}
            >
                <div className="mx-auto flex min-h-16 items-center justify-between gap-2 px-3 py-2 sm:px-6 lg:px-8">
                    <div className="edu-game-brand flex min-w-0 flex-1 items-center gap-2 sm:gap-3">
                        <BackButton
                            href={backHref}
                            label={t('nav.backToPortal')}
                            iconOnly
                        />
                        <BrandLink variant="mark" />
                        <span
                            className="hidden size-10 shrink-0 place-items-center rounded-xl border-2 border-[#1f2a44] text-white shadow-[2px_2px_0px_#1f2a44] sm:grid"
                            style={{ background: ACCENT }}
                        >
                            <CarFront className="size-5" aria-hidden="true" />
                        </span>
                        <div className="flex min-w-0 flex-col">
                            <h1 className="truncate font-display text-lg font-black sm:text-2xl">
                                {title}
                            </h1>
                            <span className="hidden truncate text-xs font-bold text-slate-600 sm:block">
                                {t('turboTrivia.tagline')}
                            </span>
                        </div>
                        <DigitalClock className="edu-clock--game" />
                    </div>
                    <div className="flex shrink-0 items-center gap-1.5">
                        {extra}
                        <button
                            type="button"
                            onClick={onToggleMuted}
                            aria-pressed={!muted}
                            aria-label={
                                muted
                                    ? t('snakes.sound.off')
                                    : t('snakes.sound.on')
                            }
                            className="edu-nav-btn edu-nav-btn--icon"
                            data-testid="tt-mute"
                        >
                            {muted ? (
                                <VolumeX aria-hidden="true" />
                            ) : (
                                <Volume2 aria-hidden="true" />
                            )}
                        </button>
                        <SiteNav compact />
                    </div>
                </div>
            </header>
            <main
                className={cn(
                    'mx-auto flex w-full flex-col gap-4 px-3 py-4 sm:px-6 lg:px-8',
                    !wide && 'max-w-xl',
                )}
            >
                {children}
            </main>
        </div>
    );
}

export function Panel({
    children,
    className,
    ...rest
}: {
    children: ReactNode;
    className?: string;
} & HTMLAttributes<HTMLElement> & {
        [data: `data-${string}`]: string | undefined;
    }) {
    return (
        <section
            {...rest}
            className={cn(
                'rounded-3xl border-3 border-[#1f2a44] bg-white p-5 shadow-[5px_5px_0px_#1f2a44] sm:p-6',
                className,
            )}
        >
            {children}
        </section>
    );
}

/** One line of the race ticker. */
export function feedText(
    t: (key: string, opts?: Record<string, unknown>) => string,
    event: TurboEvent,
): string {
    const by = event.by?.name ?? '';
    const target = event.target?.name ?? '';
    switch (event.kind) {
        case 'item':
            return t(`turboTrivia.feed.${event.item}`, {
                by,
                target,
                count: event.struck?.length ?? 0,
            });
        case 'banana_hit':
            return t(
                event.blocked
                    ? 'turboTrivia.feed.bananaBlocked'
                    : 'turboTrivia.feed.bananaHit',
                { by, target },
            );
        case 'missile_hit':
            return t(
                event.blocked
                    ? 'turboTrivia.feed.missileBlocked'
                    : 'turboTrivia.feed.missileHit',
                { by, target },
            );
        case 'finish':
            return t('turboTrivia.feed.finish', { by, place: event.place });
        case 'left':
            return t('turboTrivia.feed.left', { by });
        default:
            return '';
    }
}

export function feedIcon(event: TurboEvent): LucideIcon {
    if (event.kind === 'finish') {
        return Flag;
    }
    if (event.kind === 'banana_hit') {
        return event.blocked ? Shield : Banana;
    }
    if (event.kind === 'missile_hit') {
        return event.blocked ? Shield : Rocket;
    }
    if (event.item) {
        return ITEM_STYLE[event.item].icon;
    }
    return CarFront;
}

// --- track ----------------------------------------------------------------

/**
 * Stadium-shaped circuit in a 1000 x 680 view box (room around the track
 * for the name labels, which sit on the grass beside each kart).
 */
const TRACK = { cx: 500, cy: 340, straight: 420, radius: 168 };
const TRACK_LENGTH = 2 * TRACK.straight + 2 * Math.PI * TRACK.radius;

/**
 * Point on the circuit centre line for track coordinate x (0..1 of a lap),
 * offset sideways by `lane` (negative = inside). Start/finish line is at
 * the middle of the bottom straight, karts drive clockwise on screen.
 */
export function trackPoint(
    x: number,
    lane = 0,
): { x: number; y: number; angle: number; nx: number; ny: number } {
    const { cx, cy, straight, radius } = TRACK;
    const half = straight / 2;
    const arc = Math.PI * radius;
    let d = (((x % 1) + 1) % 1) * TRACK_LENGTH;
    const r = radius + lane;
    // 1. bottom straight, start (centre) to the left end.
    if (d < half) {
        return { x: cx - d, y: cy + r, angle: 180, nx: 0, ny: 1 };
    }
    d -= half;
    // 2. left arc, bottom to top.
    if (d < arc) {
        const a = Math.PI / 2 + d / radius;
        return {
            x: cx - half + r * Math.cos(a),
            y: cy + r * Math.sin(a),
            angle: (a * 180) / Math.PI + 90,
            nx: Math.cos(a),
            ny: Math.sin(a),
        };
    }
    d -= arc;
    // 3. top straight, left to right.
    if (d < straight) {
        return { x: cx - half + d, y: cy - r, angle: 0, nx: 0, ny: -1 };
    }
    d -= straight;
    // 4. right arc, top to bottom.
    if (d < arc) {
        const a = -Math.PI / 2 + d / radius;
        return {
            x: cx + half + r * Math.cos(a),
            y: cy + r * Math.sin(a),
            angle: (a * 180) / Math.PI + 90,
            nx: Math.cos(a),
            ny: Math.sin(a),
        };
    }
    d -= arc;
    // 5. bottom straight, right end back to the start.
    return { x: cx + half - d, y: cy + r, angle: 180, nx: 0, ny: 1 };
}

const TRACK_PATH = (() => {
    const { cx, cy, straight, radius } = TRACK;
    const half = straight / 2;
    return [
        `M ${cx} ${cy + radius}`,
        `L ${cx - half} ${cy + radius}`,
        `A ${radius} ${radius} 0 0 1 ${cx - half} ${cy - radius}`,
        `L ${cx + half} ${cy - radius}`,
        `A ${radius} ${radius} 0 0 1 ${cx + half} ${cy + radius}`,
        'Z',
    ].join(' ');
})();

interface DrawnKart {
    kart: TurboKart;
    roster?: TurboRosterEntry;
    order: number;
}

/**
 * Projector circuit: asphalt, kerbs, start/finish line, bananas, homing
 * missiles and every kart (avatar, colour, status effects). Positions are
 * interpolated between the 20 Hz ticks so motion stays smooth at 60 fps.
 */
export function RaceTrack({
    state,
    roster,
    highlight,
    showAvatars = true,
}: {
    state: TurboState;
    roster: Map<number, TurboRosterEntry>;
    highlight?: number;
    showAvatars?: boolean;
}) {
    const { t } = useTranslations();
    const smooth = useSmoothKarts(state);
    const lanes = Math.min(6, Math.max(1, state.karts.length));
    const lightning = useFlash(state.feed, 'LIGHTNING');
    const drawn: DrawnKart[] = state.karts.map((kart) => ({
        kart,
        roster: roster.get(kart.id),
        order: roster.get(kart.id)?.order ?? kart.id,
    }));
    // Leader on top.
    const paint = [...drawn].sort((a, b) => b.kart.rank - a.kart.rank);
    const lifts = labelLifts(drawn, smooth);

    return (
        <div
            className="relative w-full overflow-hidden rounded-2xl border-3 border-[#1f2a44]"
            style={{
                backgroundColor: '#4ade80',
                backgroundImage:
                    'linear-gradient(45deg, #22c55e 25%, transparent 25%, transparent 75%, #22c55e 75%), linear-gradient(45deg, #22c55e 25%, transparent 25%, transparent 75%, #22c55e 75%)',
                backgroundSize: '40px 40px',
                backgroundPosition: '0 0, 20px 20px',
            }}
            data-testid="tt-track"
        >
            <svg
                viewBox="0 0 1000 680"
                className="mx-auto block h-auto max-h-[calc(100dvh-26rem)] min-h-64 w-full"
                role="img"
                aria-label={t('turboTrivia.race.track')}
            >
                <defs>
                    <pattern
                        id="tt-checker"
                        width="12"
                        height="12"
                        patternUnits="userSpaceOnUse"
                    >
                        <rect width="12" height="12" fill="#fff" />
                        <rect width="6" height="6" fill="#1f2a44" />
                        <rect x="6" y="6" width="6" height="6" fill="#1f2a44" />
                    </pattern>
                </defs>
                <path
                    d={TRACK_PATH}
                    fill="none"
                    stroke="#ffffff"
                    strokeWidth="132"
                    strokeDasharray="24 24"
                />
                <path
                    d={TRACK_PATH}
                    fill="none"
                    stroke="#e11d48"
                    strokeWidth="132"
                    strokeDasharray="24 24"
                    strokeDashoffset="24"
                />
                <path
                    d={TRACK_PATH}
                    fill="none"
                    stroke="#334155"
                    strokeWidth="118"
                />
                <path
                    d={TRACK_PATH}
                    fill="none"
                    stroke="#f8fafc"
                    strokeOpacity="0.55"
                    strokeWidth="3"
                    strokeDasharray="22 26"
                />
                <rect
                    x={TRACK.cx - 8}
                    y={TRACK.cy + TRACK.radius - 59}
                    width="16"
                    height="118"
                    fill="url(#tt-checker)"
                />
                {state.bananas.map((b) => (
                    <BananaMark key={b.id} banana={b} />
                ))}
                {paint.map(({ kart, roster: r, order }) => (
                    <KartMark
                        key={kart.id}
                        kart={kart}
                        p={smooth.get(kart.id) ?? kart.p}
                        lane={laneOffset(order, lanes)}
                        color={kartColor(order)}
                        name={r?.name ?? ''}
                        character={r?.character}
                        highlight={highlight === kart.id}
                        showAvatar={showAvatars}
                        labelLift={lifts.get(kart.id) ?? 0}
                    />
                ))}
                {state.missiles.map((m) => (
                    <MissileMark key={m.id} missile={m} />
                ))}
            </svg>
            {lightning && (
                <div
                    className="tt-lightning pointer-events-none absolute inset-0"
                    aria-hidden="true"
                />
            )}
        </div>
    );
}

/**
 * Stacks the name labels of karts driving close together (within ~4% of a
 * lap): each next kart in a cluster lifts its label one row higher.
 */
function labelLifts(
    drawn: DrawnKart[],
    smooth: Map<number, number>,
): Map<number, number> {
    const pos = drawn
        .map((d) => ({
            id: d.kart.id,
            x: (((smooth.get(d.kart.id) ?? d.kart.p) % 1) + 1) % 1,
        }))
        .sort((a, b) => a.x - b.x);
    const out = new Map<number, number>();
    let row = 0;
    pos.forEach((k, i) => {
        const prev = pos[i - 1];
        row = prev && k.x - prev.x < 0.04 ? row + 1 : 0;
        out.set(k.id, (row % 3) * 30);
    });
    return out;
}

function laneOffset(order: number, lanes: number): number {
    if (lanes <= 1) {
        return 0;
    }
    const lane = (order - 1) % lanes;
    return -26 + (52 * lane) / (lanes - 1);
}

/** Server tick interval (20 Hz). */
const TICK_MS = 50;

/**
 * Interpolates kart positions between the previous and the latest tick
 * (one tick behind the server) on every animation frame.
 */
function useSmoothKarts(state: TurboState): Map<number, number> {
    const [now, setNow] = useState(() => Date.now());
    const racing = state.phase === 'RACE';
    useEffect(() => {
        if (!racing) {
            return;
        }
        let frame = 0;
        const loop = () => {
            setNow(Date.now());
            frame = requestAnimationFrame(loop);
        };
        frame = requestAnimationFrame(loop);
        return () => cancelAnimationFrame(frame);
    }, [racing]);
    const { karts, prevKarts, tickAt } = state;
    return useMemo(() => {
        const out = new Map<number, number>();
        const prev = new Map(prevKarts.map((k) => [k.id, k.p]));
        const f = racing
            ? Math.min(1, Math.max(0, (now - tickAt) / TICK_MS))
            : 1;
        for (const k of karts) {
            const from = prev.get(k.id) ?? k.p;
            // A banana stop moves a kart back: snap instead of sliding.
            out.set(k.id, k.p < from ? k.p : from + (k.p - from) * f);
        }
        return out;
    }, [now, karts, prevKarts, tickAt, racing]);
}

/** True for ~700 ms after an item of `kind` fired. */
function useFlash(feed: TurboEvent[], kind: TurboItem): boolean {
    const last = [...feed]
        .reverse()
        .find((e) => e.kind === 'item' && e.item === kind);
    const [flashUid, setFlashUid] = useState<number | null>(null);
    const seen = useRef<number | undefined>(last?.uid);
    useEffect(() => {
        if (!last?.uid || last.uid === seen.current) {
            return;
        }
        seen.current = last.uid;
        setFlashUid(last.uid);
        const id = setTimeout(() => setFlashUid(null), 700);
        return () => clearTimeout(id);
    }, [last?.uid]);
    return flashUid !== null;
}

function BananaMark({ banana }: { banana: TurboBanana }) {
    const pt = trackPoint(banana.x);
    return (
        <g transform={`translate(${pt.x} ${pt.y})`} data-testid="tt-banana">
            <circle r="15" fill="#1f2a44" opacity="0.25" cy="3" />
            <path
                d="M -12 -2 Q 0 16 12 -2 Q 0 6 -12 -2 Z"
                fill="#facc15"
                stroke="#1f2a44"
                strokeWidth="2.5"
            />
            <path d="M 10 -3 l 4 -5" stroke="#1f2a44" strokeWidth="3" />
        </g>
    );
}

function MissileMark({ missile }: { missile: TurboMissile }) {
    const pt = trackPoint(missile.p, -60);
    return (
        <g
            transform={`translate(${pt.x} ${pt.y - 24}) rotate(${pt.angle})`}
            data-testid="tt-missile"
        >
            <path
                d="M -18 0 L -26 -7 L -26 7 Z"
                fill="#f97316"
                className="tt-flame"
            />
            <rect
                x="-18"
                y="-6"
                width="28"
                height="12"
                rx="6"
                fill="#b91c1c"
                stroke="#1f2a44"
                strokeWidth="2.5"
            />
            <path d="M 10 -6 L 20 0 L 10 6 Z" fill="#1f2a44" />
        </g>
    );
}

function KartMark({
    kart,
    p,
    lane,
    color,
    name,
    character,
    highlight,
    showAvatar,
    labelLift,
}: {
    kart: TurboKart;
    p: number;
    lane: number;
    /** Extra label height so labels of nearby karts do not overlap. */
    labelLift: number;
    color: string;
    name: string;
    character?: CharacterLook | null;
    highlight: boolean;
    showAvatar: boolean;
}) {
    const { t } = useTranslations();
    const pt = trackPoint(p, lane);
    const has = (fx: TurboEffect) => kart.fx.includes(fx);
    const scale = has('SHRINK') ? 0.75 : 1.25;
    const flip = pt.angle > 90 && pt.angle < 270;
    // Label on the grass beside the kart: outer lanes outside the track,
    // inner lanes on the infield, so it never covers a neighbouring kart.
    const side = lane >= 0 ? 1 : -1;
    const reach = 92 + labelLift - Math.abs(lane);
    // Clamped inside the view box (labels are 132 x 32).
    const labelAt = {
        x: Math.min(930, Math.max(70, pt.x + pt.nx * side * reach)) - pt.x,
        y: Math.min(660, Math.max(20, pt.y + pt.ny * side * reach)) - pt.y,
    };
    return (
        <g
            transform={`translate(${pt.x} ${pt.y})`}
            opacity={kart.left ? 0.35 : kart.on ? 1 : 0.6}
            data-testid="tt-kart"
            data-kart={kart.id}
            data-fx={kart.fx.join(' ')}
            aria-label={t('turboTrivia.race.kartLabel', {
                name,
                rank: kart.rank,
                speed: kart.v,
            })}
        >
            <g transform={`scale(${scale})`}>
                <g
                    className={cn(
                        has('SPIN') && 'tt-spin',
                        has('STAGGER') && 'tt-shake',
                    )}
                >
                    {has('NITRO') && (
                        <g transform={`rotate(${pt.angle})`}>
                            <path
                                d="M -30 -8 L -62 0 L -30 8 Z"
                                fill="#f97316"
                                className="tt-flame"
                            />
                            <path
                                d="M -30 -4 L -48 0 L -30 4 Z"
                                fill="#fde047"
                                className="tt-flame"
                            />
                        </g>
                    )}
                    <g transform={`rotate(${pt.angle})`}>
                        <rect
                            x="-28"
                            y="-15"
                            width="56"
                            height="30"
                            rx="10"
                            fill={color}
                            stroke={highlight ? '#facc15' : '#1f2a44'}
                            strokeWidth={highlight ? 5 : 3}
                        />
                        <rect
                            x="-22"
                            y="-20"
                            width="12"
                            height="7"
                            rx="2"
                            fill="#1f2a44"
                        />
                        <rect
                            x="10"
                            y="-20"
                            width="12"
                            height="7"
                            rx="2"
                            fill="#1f2a44"
                        />
                        <rect
                            x="-22"
                            y="13"
                            width="12"
                            height="7"
                            rx="2"
                            fill="#1f2a44"
                        />
                        <rect
                            x="10"
                            y="13"
                            width="12"
                            height="7"
                            rx="2"
                            fill="#1f2a44"
                        />
                    </g>
                    {showAvatar && (
                        <foreignObject
                            x="-22"
                            y="-48"
                            width="44"
                            height="44"
                            style={{ overflow: 'visible' }}
                        >
                            <div
                                style={{
                                    width: 44,
                                    height: 44,
                                    transform: flip ? 'scaleX(-1)' : undefined,
                                }}
                            >
                                <PlayerAvatar
                                    character={character}
                                    seat={kart.id}
                                />
                            </div>
                        </foreignObject>
                    )}
                    {has('STAGGER') && (
                        <g className="tt-flame">
                            <circle
                                cx="-8"
                                cy="-8"
                                r="9"
                                fill="#f97316"
                                opacity="0.85"
                            />
                            <circle
                                cx="6"
                                cy="-14"
                                r="7"
                                fill="#fde047"
                                opacity="0.85"
                            />
                        </g>
                    )}
                    {has('SHIELD') && (
                        <circle
                            r="44"
                            cy="-8"
                            fill="#38bdf8"
                            fillOpacity="0.18"
                            stroke="#0ea5e9"
                            strokeWidth="3"
                            className="tt-shield"
                        />
                    )}
                </g>
            </g>
            <g
                transform={`translate(${labelAt.x} ${labelAt.y})`}
                data-testid="tt-kart-label"
            >
                <rect
                    x="-66"
                    y="-16"
                    width="132"
                    height="32"
                    rx="16"
                    fill={kart.fin ? '#facc15' : '#ffffff'}
                    stroke={color}
                    strokeWidth="3"
                />
                <text
                    textAnchor="middle"
                    dominantBaseline="central"
                    fontSize="21"
                    fontWeight="800"
                    fill="#1f2a44"
                >
                    {`${kart.rank}. ${name.length > 9 ? `${name.slice(0, 8)}…` : name}`}
                </text>
            </g>
        </g>
    );
}

/** Small strip with every kart's progress over the full race (3 laps). */
export function MiniMap({
    state,
    roster,
}: {
    state: TurboState;
    roster: Map<number, TurboRosterEntry>;
}) {
    const { t } = useTranslations();
    return (
        <div className="flex flex-col gap-1.5" data-testid="tt-minimap">
            <h3 className="text-xs font-black text-slate-500 uppercase">
                {t('turboTrivia.race.minimap')}
            </h3>
            <div className="relative h-10 rounded-xl border-2 border-[#1f2a44] bg-slate-100">
                {Array.from({ length: state.laps - 1 }, (_, i) => (
                    <span
                        key={i}
                        className="absolute inset-y-0 w-0.5 bg-[#1f2a44]/25"
                        style={{ left: `${((i + 1) * 100) / state.laps}%` }}
                    />
                ))}
                <Flag
                    className="absolute top-1/2 right-1 size-4 -translate-y-1/2"
                    aria-hidden="true"
                />
                {state.karts.map((k) => {
                    const r = roster.get(k.id);
                    return (
                        <span
                            key={k.id}
                            title={r?.name}
                            className="absolute top-1/2 size-3.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-[#1f2a44] transition-[left] duration-200 ease-linear"
                            style={{
                                left: `${Math.min(97, (k.p / state.laps) * 100)}%`,
                                background: kartColor(r?.order ?? k.id),
                            }}
                        />
                    );
                })}
            </div>
        </div>
    );
}

/** Final podium (1-2-3) and the result table. */
export function Podium({
    state,
    youId,
}: {
    state: TurboState;
    youId?: number;
}) {
    const { t } = useTranslations();
    const podium = state.podium ?? [];
    const order = [podium[1], podium[0], podium[2]].filter(
        (p): p is TurboRanking => Boolean(p),
    );
    const heights: Record<number, string> = { 1: 'h-28', 2: 'h-20', 3: 'h-14' };
    const winner = podium[0];
    const ranking = state.ranking ?? [];
    return (
        <div className="flex flex-col gap-5" data-testid="tt-podium">
            <h2 className="text-center font-display text-2xl font-black sm:text-3xl">
                {winner
                    ? t('turboTrivia.result.winner', { name: winner.name })
                    : t('turboTrivia.result.podium')}
            </h2>
            <ol className="mx-auto flex w-full max-w-2xl items-end justify-center gap-2 border-b-4 border-[#1f2a44] px-1 sm:gap-4 sm:px-4">
                {order.map((p) => (
                    <li
                        key={p.user_id}
                        className="flex min-w-0 flex-1 basis-0 flex-col items-center gap-1.5 sm:max-w-48"
                    >
                        <span
                            className={cn(
                                'relative',
                                p.rank === 1
                                    ? 'size-20 sm:size-32'
                                    : 'size-14 sm:size-24',
                            )}
                        >
                            <PlayerAvatar
                                character={p.character}
                                seat={p.user_id}
                                userId={p.user_id}
                            />
                            {p.rank === 1 && (
                                <Crown
                                    className="absolute -top-5 left-1/2 size-9 -translate-x-1/2 fill-[#ffd93d] text-[#b45309]"
                                    aria-hidden="true"
                                />
                            )}
                        </span>
                        <span className="w-full truncate text-center text-sm font-black sm:text-base">
                            {p.name}
                        </span>
                        <span className="inline-flex items-center gap-1 rounded-full border-2 border-[#1f2a44] bg-[#fecdd3] px-2 py-0.5 text-xs font-black tabular-nums sm:text-sm">
                            <Flag className="size-3.5" aria-hidden="true" />
                            {p.finished
                                ? raceClock(p.race_ms)
                                : `${Math.round((p.progress / state.laps) * 100)}%`}
                        </span>
                        <span
                            className={cn(
                                'flex w-full items-start justify-center rounded-t-2xl border-3 border-[#1f2a44] pt-2 font-display text-2xl font-black',
                                heights[p.rank] ?? 'h-14',
                                p.rank === 1
                                    ? 'bg-[#ffd93d]'
                                    : p.rank === 2
                                      ? 'bg-[#e2e8f0]'
                                      : 'bg-[#f6b98a]',
                            )}
                        >
                            {p.rank}
                        </span>
                    </li>
                ))}
            </ol>
            {ranking.length > 0 && (
                <ResponsiveTable
                    variant="player"
                    testId="tt-ranking"
                    caption={t('turboTrivia.result.ranking')}
                    className="mx-auto max-w-3xl data-[layout=table]:overflow-hidden data-[layout=table]:rounded-2xl data-[layout=table]:border-2 data-[layout=table]:border-[#1f2a44] data-[layout=table]:bg-white"
                    rows={ranking}
                    rowKey={(p) => p.user_id}
                    rowClassName={(p) =>
                        p.user_id === youId ? 'bg-[#ffe4e6]' : undefined
                    }
                    columns={[
                        {
                            key: 'rank',
                            header: '#',
                            primary: true,
                            cellClassName:
                                'font-display font-black tabular-nums',
                            cell: (p) => p.rank,
                        },
                        {
                            key: 'player',
                            header: t('turboTrivia.result.player'),
                            primary: true,
                            cell: (p) => (
                                <span className="flex min-w-0 items-center gap-2">
                                    <span className="size-7 shrink-0">
                                        <PlayerAvatar
                                            character={p.character}
                                            seat={p.user_id}
                                            userId={p.user_id}
                                        />
                                    </span>
                                    <span className="min-w-0 font-bold [overflow-wrap:anywhere]">
                                        {p.name}
                                    </span>
                                </span>
                            ),
                        },
                        {
                            key: 'time',
                            header: t('turboTrivia.result.time'),
                            align: 'right',
                            summary: true,
                            cellClassName: 'font-black tabular-nums',
                            cell: (p) =>
                                p.finished
                                    ? raceClock(p.race_ms)
                                    : t('turboTrivia.result.dnf', {
                                          percent: Math.round(
                                              (p.progress / state.laps) * 100,
                                          ),
                                      }),
                        },
                        {
                            key: 'correct',
                            header: t('turboTrivia.result.correct'),
                            align: 'right',
                            cellClassName: 'tabular-nums',
                            cell: (p) => p.correct,
                        },
                        {
                            key: 'accuracy',
                            header: t('turboTrivia.result.accuracy'),
                            align: 'right',
                            cellClassName: 'tabular-nums',
                            cell: (p) => `${p.accuracy}%`,
                        },
                        {
                            key: 'items',
                            header: t('turboTrivia.result.items'),
                            align: 'right',
                            cellClassName: 'tabular-nums',
                            cell: (p) => p.items_used,
                        },
                    ]}
                />
            )}
        </div>
    );
}
