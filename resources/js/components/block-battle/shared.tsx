import { DigitalClock } from '@/components/digital-clock';
import { PlayerAvatar } from '@/components/player-avatar';
import { ResponsiveTable } from '@/components/responsive-table';
import { BackButton, SiteNav, useGameBackHref } from '@/components/site-nav';
import {
    type BBEvent,
    type BBFortress,
    type BBMode,
    type BBRanking,
    type BBRosterEntry,
    type BBState,
} from '@/hooks/use-block-battle';
import { useTranslations } from '@/hooks/use-translations';
import { playBlockSound, type BlockSound } from '@/lib/block-battle-sounds';
import { soundSettings } from '@/lib/game-sounds';
import { cn } from '@/lib/utils';
import { Head, usePage } from '@inertiajs/react';
import {
    Blocks,
    Castle,
    Crown,
    Spline,
    Swords,
    Volume2,
    VolumeX,
    type LucideIcon,
} from 'lucide-react';
import {
    useCallback,
    useEffect,
    useMemo,
    useRef,
    useState,
    useSyncExternalStore,
    type HTMLAttributes,
    type ReactNode,
} from 'react';
import { BoardCanvas } from './board';

export const ACCENT = '#ca8a04';
export const BG = '#fefce8';
export const INK = '#1f2a44';

/** Icon and tone per mode (white text passes AA on each tone). */
export const MODE_STYLE: Record<BBMode, { icon: LucideIcon; tone: string }> = {
    BATTLE: { icon: Swords, tone: '#b91c1c' },
    WORDS: { icon: Spline, tone: '#6d28d9' },
    FORTRESS: { icon: Castle, tone: '#0f766e' },
};

/** Answer button colours (same order as the quiz panels of other games). */
export const OPTION_TONES = ['#e11d48', '#2563eb', '#a16207', '#15803d'];
export const LETTERS = ['A', 'B', 'C', 'D'];

const REDUCED_QUERY = '(prefers-reduced-motion: reduce)';

function subscribeReducedMotion(onChange: () => void): () => void {
    const query = window.matchMedia(REDUCED_QUERY);
    query.addEventListener('change', onChange);
    return () => query.removeEventListener('change', onChange);
}

export function usePrefersReducedMotion(): boolean {
    return useSyncExternalStore(
        subscribeReducedMotion,
        () => window.matchMedia(REDUCED_QUERY).matches,
        () => false,
    );
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

export function gameClock(ms: number): string {
    const total = Math.max(0, Math.ceil(ms / 1000));
    return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`;
}

/** Game time left, counted down locally from the last snapshot. */
export function useRemaining(state: BBState): number {
    const live = state.phase === 'PLAYING';
    const now = useNow(live, 250);
    if (state.remaining_ms === undefined) {
        return 0;
    }
    return Math.max(0, state.remaining_ms - (live ? now - state.clockAt : 0));
}

/** Answer time left of the open question. */
export function useQuestionLeft(state: BBState): number {
    const open = Boolean(state.question) && !state.answer;
    const now = useNow(open, 200);
    if (!open || !state.question) {
        return 0;
    }
    return Math.max(0, state.question.time_limit_ms - (now - state.questionAt));
}

/** Roster lookup by user id. */
export function useRoster(players: BBRosterEntry[]) {
    return useMemo(() => {
        const map = new Map<number, BBRosterEntry>();
        players.forEach((p) => map.set(p.user_id, p));
        return map;
    }, [players]);
}

/** Block Battle sound effects with a mute toggle. */
export function useBlockAudio() {
    const { gameSounds } = usePage<{ gameSounds?: unknown }>().props;
    const settings = useRef(soundSettings(gameSounds));
    const context = useRef<AudioContext | null>(null);
    const mutedRef = useRef(false);
    const [muted, setMuted] = useState(false);

    useEffect(() => {
        settings.current = soundSettings(gameSounds);
    }, [gameSounds]);

    const play = useCallback((sound: BlockSound) => {
        if (mutedRef.current || typeof window.AudioContext === 'undefined') {
            return;
        }
        try {
            context.current ??= new AudioContext();
            if (context.current.state === 'suspended') {
                void context.current.resume().catch(() => {});
            }
            playBlockSound(context.current, sound, settings.current);
        } catch {
            /* Audio is optional. */
        }
    }, []);

    const toggleMuted = () => {
        mutedRef.current = !mutedRef.current;
        setMuted(mutedRef.current);
        if (!mutedRef.current) {
            play('beep');
        }
    };

    useEffect(
        () => () => {
            void context.current?.close().catch(() => {});
        },
        [],
    );
    return { play, muted, toggleMuted };
}

export function vibrate(pattern: number | number[]) {
    if ('vibrate' in navigator) {
        navigator.vibrate?.(pattern);
    }
}

/** Common header + layout of the three Block Battle pages. */
export function BlockShell({
    title,
    testId,
    role,
    phase,
    muted,
    onToggleMuted,
    extra,
    wide,
    compact,
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
    /** Tighter main padding (phone play view). */
    compact?: boolean;
    children: ReactNode;
}) {
    const { t } = useTranslations();
    const backHref = useGameBackHref();
    return (
        <div
            className="min-h-dvh overflow-x-clip text-[#1f2a44]"
            style={{ background: BG }}
            data-testid={testId}
            data-role={role}
            data-phase={phase}
        >
            <Head title={`${title} — EduFunHub`} />
            <header
                className="sticky top-0 z-30 border-b-4 border-[#1f2a44] backdrop-blur-md"
                style={{ background: `${BG}f2` }}
            >
                <div
                    className={cn(
                        'mx-auto flex items-center justify-between gap-2 px-3 sm:px-6 lg:px-8',
                        compact ? 'min-h-12 py-1' : 'min-h-16 py-2',
                    )}
                >
                    <div className="edu-game-brand flex min-w-0 flex-1 items-center gap-2 sm:gap-3">
                        <BackButton
                            href={backHref}
                            label={t('nav.backToPortal')}
                            iconOnly
                        />
                        <span
                            className="hidden size-10 shrink-0 place-items-center rounded-xl border-2 border-[#1f2a44] text-white shadow-[2px_2px_0px_#1f2a44] sm:grid"
                            style={{ background: ACCENT }}
                        >
                            <Blocks className="size-5" aria-hidden="true" />
                        </span>
                        <div className="flex min-w-0 flex-col">
                            <h1 className="truncate font-display text-lg font-black sm:text-2xl">
                                {title}
                            </h1>
                            <span className="hidden truncate text-xs font-bold text-slate-600 sm:block">
                                {t('blockBattle.tagline')}
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
                            data-testid="bb-mute"
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
                    'mx-auto flex w-full flex-col px-3 sm:px-6 lg:px-8',
                    compact ? 'gap-2 py-2' : 'gap-4 py-4',
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
        [data: `data-${string}`]: string | number | undefined;
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

/** One line of the live event feed. */
export function eventText(
    t: (key: string, opts?: Record<string, unknown>) => string,
    event: BBEvent,
): string {
    switch (event.t) {
        case 'attack':
            return t(
                event.kind === 'quiz'
                    ? 'blockBattle.events.attackQuiz'
                    : 'blockBattle.events.attack',
                {
                    name: event.from?.name ?? '',
                    target: event.to?.name ?? '',
                    lines: event.lines ?? 0,
                },
            );
        case 'ko':
            return event.by
                ? t('blockBattle.events.koBy', {
                      name: event.user?.name ?? '',
                      by: event.by.name,
                      rank: event.rank,
                  })
                : t('blockBattle.events.ko', {
                      name: event.user?.name ?? '',
                      rank: event.rank,
                  });
        case 'word':
            return t('blockBattle.events.word', {
                name: event.user?.name ?? '',
                word: event.word ?? '',
                points: event.points ?? 0,
                combo: event.combo ?? 1,
            });
        case 'monster_hit':
            return t('blockBattle.events.monsterHit', {
                count: event.destroyed ?? 0,
            });
        default:
            return '';
    }
}

/** Monster health bar of FORTRESS (arena + phones). */
export function MonsterBar({
    fortress,
    hit,
    big,
}: {
    fortress: BBFortress;
    hit?: number;
    big?: boolean;
}) {
    const { t } = useTranslations();
    const share =
        fortress.monster.max > 0
            ? fortress.monster.hp / fortress.monster.max
            : 0;
    return (
        <div
            className="flex min-w-0 items-center gap-3"
            data-testid="bb-monster"
            data-hp={fortress.monster.hp}
        >
            <span
                key={hit}
                className={cn(
                    'bb-monster grid shrink-0 place-items-center rounded-2xl border-3 border-[#1f2a44] bg-[#7c3aed] text-white shadow-[3px_3px_0px_#1f2a44]',
                    big ? 'size-24 text-6xl' : 'size-12 text-3xl',
                    hit ? 'bb-monster-hit' : undefined,
                )}
                aria-hidden="true"
            >
                <MonsterFace />
            </span>
            <div className="flex min-w-0 flex-1 flex-col gap-1">
                <span className="flex items-center justify-between gap-2 text-xs font-black uppercase">
                    <span>{t('blockBattle.fortress.monster')}</span>
                    <span className="tabular-nums">
                        {t('blockBattle.fortress.hp', {
                            hp: fortress.monster.hp,
                            max: fortress.monster.max,
                        })}
                    </span>
                </span>
                <div
                    className={cn(
                        'overflow-hidden rounded-full border-2 border-[#1f2a44] bg-slate-100',
                        big ? 'h-5' : 'h-3',
                    )}
                >
                    <div
                        className="h-full bg-[#dc2626] transition-[width] duration-300 ease-out"
                        style={{ width: `${Math.max(0, share) * 100}%` }}
                    />
                </div>
            </div>
        </div>
    );
}

/** Cute block monster (pure SVG). */
export function MonsterFace({ className }: { className?: string }) {
    return (
        <svg
            viewBox="0 0 48 48"
            className={cn('size-4/5', className)}
            aria-hidden="true"
        >
            <path
                d="M8 14 L4 4 L16 10 Z M40 14 L44 4 L32 10 Z"
                fill="#facc15"
            />
            <rect
                x="6"
                y="10"
                width="36"
                height="32"
                rx="8"
                fill="#a855f7"
                stroke="#1f2a44"
                strokeWidth="3"
            />
            <circle cx="17" cy="23" r="5" fill="#fff" />
            <circle cx="31" cy="23" r="5" fill="#fff" />
            <circle cx="18" cy="24" r="2.4" fill="#1f2a44" />
            <circle cx="30" cy="24" r="2.4" fill="#1f2a44" />
            <path
                d="M14 33 L18 36 L22 33 L26 36 L30 33 L34 36"
                fill="none"
                stroke="#fff"
                strokeWidth="2.5"
                strokeLinejoin="round"
            />
        </svg>
    );
}

/** Wall strength meter of FORTRESS. */
export function StrengthMeter({ fortress }: { fortress: BBFortress }) {
    const { t } = useTranslations();
    const max = Math.max(1, fortress.max_strength);
    const share = Math.max(0, Math.min(1, fortress.strength / max));
    const tone = share > 0.5 ? '#16a34a' : share > 0.25 ? '#ca8a04' : '#dc2626';
    return (
        <div
            className="flex flex-col gap-1"
            data-testid="bb-strength"
            data-strength={fortress.strength}
        >
            <span className="flex items-center justify-between gap-2 text-xs font-black uppercase">
                <span className="flex items-center gap-1">
                    <Castle className="size-4" aria-hidden="true" />
                    {t('blockBattle.fortress.strength')}
                </span>
                <span className="tabular-nums">
                    {fortress.strength}/{fortress.max_strength}
                </span>
            </span>
            <div className="h-4 overflow-hidden rounded-full border-2 border-[#1f2a44] bg-slate-100">
                <div
                    className="h-full transition-[width] duration-300 ease-out"
                    style={{ width: `${share * 100}%`, background: tone }}
                />
            </div>
        </div>
    );
}

/** Shared wall board of FORTRESS. */
export function FortressBoard({
    fortress,
    className,
    shake,
}: {
    fortress: BBFortress;
    className?: string;
    shake?: number;
}) {
    const { t } = useTranslations();
    const paint = useMemo(
        () => ({
            cols: fortress.cols,
            rows: fortress.rows,
            cells: fortress.cells,
            piece: fortress.turn?.piece ?? null,
            ghost: fortress.turn?.ghost ?? [],
            armored: fortress.armored,
        }),
        [fortress],
    );
    return (
        <BoardCanvas
            key={shake}
            paint={paint}
            className={cn(
                'rounded-xl border-3 border-[#1f2a44]',
                shake ? 'bb-wall-hit' : undefined,
                className,
            )}
            testId="bb-fortress-board"
            label={t('blockBattle.fortress.wall')}
        />
    );
}

/** Final podium (1-2-3) and the result table. */
export function Podium({ state, youId }: { state: BBState; youId?: number }) {
    const { t } = useTranslations();
    const podium = state.podium ?? [];
    const order = [podium[1], podium[0], podium[2]].filter(
        (p): p is BBRanking => Boolean(p),
    );
    const heights: Record<number, string> = { 1: 'h-28', 2: 'h-20', 3: 'h-14' };
    const winner = podium[0];
    const ranking = state.ranking ?? [];
    const fortress = state.mode === 'FORTRESS';
    return (
        <div className="flex flex-col gap-5" data-testid="bb-podium">
            {fortress && state.team ? (
                <div
                    className={cn(
                        'rounded-2xl border-3 border-[#1f2a44] px-4 py-3 text-center font-display text-2xl font-black sm:text-3xl',
                        state.team.won
                            ? 'bg-[#bbf7d0] text-[#14532d]'
                            : 'bg-[#fecdd3] text-[#7f1d1d]',
                    )}
                    data-testid="bb-team-banner"
                    data-won={state.team.won ? 'true' : 'false'}
                >
                    {t(
                        state.team.won
                            ? 'blockBattle.result.teamWon'
                            : 'blockBattle.result.teamLost',
                    )}
                    <span className="mt-1 block text-sm font-bold">
                        {t(`blockBattle.result.reasons.${state.team.reason}`)}
                    </span>
                </div>
            ) : (
                <h2 className="text-center font-display text-2xl font-black sm:text-3xl">
                    {winner
                        ? t('blockBattle.result.winner', { name: winner.name })
                        : t('blockBattle.result.podium')}
                </h2>
            )}
            {!fortress && (
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
                            <span className="inline-flex items-center gap-1 rounded-full border-2 border-[#1f2a44] bg-[#fef08a] px-2 py-0.5 text-xs font-black tabular-nums sm:text-sm">
                                {state.mode === 'BATTLE'
                                    ? t('blockBattle.result.linesValue', {
                                          count: p.lines,
                                      })
                                    : t('blockBattle.result.scoreValue', {
                                          score: p.score,
                                      })}
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
            )}
            {ranking.length > 0 && (
                <ResponsiveTable
                    variant="player"
                    testId="bb-ranking"
                    caption={t('blockBattle.result.ranking')}
                    className="mx-auto max-w-3xl data-[layout=table]:overflow-hidden data-[layout=table]:rounded-2xl data-[layout=table]:border-2 data-[layout=table]:border-[#1f2a44] data-[layout=table]:bg-white"
                    rows={ranking}
                    rowKey={(p) => p.user_id}
                    rowClassName={(p) =>
                        p.user_id === youId ? 'bg-[#fef9c3]' : undefined
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
                            header: t('blockBattle.result.player'),
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
                            key: 'score',
                            header: t('blockBattle.result.score'),
                            align: 'right',
                            summary: true,
                            cellClassName: 'font-black tabular-nums',
                            cell: (p) => p.score,
                        },
                        {
                            key: 'lines',
                            header: t('blockBattle.result.lines'),
                            align: 'right',
                            cellClassName: 'tabular-nums',
                            cell: (p) => p.lines,
                        },
                        {
                            key: 'kos',
                            header: t('blockBattle.result.kos'),
                            align: 'right',
                            cellClassName: 'tabular-nums',
                            cell: (p) => p.kos,
                        },
                        {
                            key: 'correct',
                            header: t('blockBattle.result.correct'),
                            align: 'right',
                            cellClassName: 'tabular-nums',
                            cell: (p) => p.correct,
                        },
                        {
                            key: 'accuracy',
                            header: t('blockBattle.result.accuracy'),
                            align: 'right',
                            cellClassName: 'tabular-nums',
                            cell: (p) => `${p.accuracy}%`,
                        },
                        {
                            key: 'alive',
                            header: t('blockBattle.result.alive'),
                            align: 'right',
                            cellClassName: 'tabular-nums',
                            cell: (p) => gameClock(p.alive_ms),
                        },
                    ]}
                />
            )}
        </div>
    );
}

/** Score column shown in the finale modal for each mode. */
export function finaleScore(
    t: (key: string, opts?: Record<string, unknown>) => string,
    mode: BBMode,
    row: BBRanking,
): string {
    return mode === 'BATTLE'
        ? t('blockBattle.result.linesValue', { count: row.lines })
        : t('blockBattle.result.scoreValue', { score: row.score });
}
