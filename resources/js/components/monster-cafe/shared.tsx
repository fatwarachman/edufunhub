import { PlayerAvatar } from '@/components/player-avatar';
import {
    type Dish,
    type FeedKind,
    type Ingredient,
    type MonsterCafeAction,
    type MonsterCafeBoardEntry,
    type MonsterCafeRanking,
    type MonsterCafeState,
    type Mood,
} from '@/hooks/use-monster-cafe';
import { useTranslations } from '@/hooks/use-translations';
import { soundSettings } from '@/lib/game-sounds';
import { type CafeSound, playCafeSound } from '@/lib/monster-cafe-sounds';
import { cn } from '@/lib/utils';
import { usePage } from '@inertiajs/react';
import {
    CakeSlice,
    Coins,
    Crown,
    Flame,
    HandPlatter,
    type LucideIcon,
    Rat,
    Skull,
    WifiOff,
} from 'lucide-react';
import {
    type ReactNode,
    useCallback,
    useEffect,
    useLayoutEffect,
    useRef,
    useState,
} from 'react';

export const ACCENT = '#ea580c';
export const BG = '#fff4e6';
export const INK = '#1f2a44';

/** Patience bar colour per mood (white text passes AA on each). */
export const MOOD_TONE: Record<Mood, string> = {
    HAPPY: '#15803d',
    IMPATIENT: '#b45309',
    ANGRY: '#be123c',
};

/** Icon and tone per feed entry kind. */
export const FEED_STYLE: Record<FeedKind, { icon: LucideIcon; tone: string }> =
    {
        SERVED: { icon: HandPlatter, tone: '#15803d' },
        ANGRY: { icon: Skull, tone: '#be123c' },
        BURNT: { icon: Flame, tone: '#111827' },
        RAT: { icon: Rat, tone: '#7e22ce' },
        PIE: { icon: CakeSlice, tone: '#1d4ed8' },
    };

export function formatCoins(value: number, locale: string): string {
    return new Intl.NumberFormat(locale === 'en' ? 'en-US' : 'id-ID').format(
        value,
    );
}

export function seconds(ms: number): number {
    return Math.max(0, Math.ceil(ms / 1000));
}

export function clock(ms: number): string {
    const total = seconds(ms);
    const m = Math.floor(total / 60);
    const s = total % 60;
    return `${m}:${String(s).padStart(2, '0')}`;
}

/** Mood from the remaining patience fraction (same thresholds as Go). */
export function moodOf(fraction: number): Mood {
    if (fraction > 0.5) {
        return 'HAPPY';
    }
    return fraction >= 0.2 ? 'IMPATIENT' : 'ANGRY';
}

/** Dish the oven will produce from a stack (BUN → burger, DOUGH → pizza). */
export function dishOf(items: Ingredient[]): Dish {
    if (items.includes('BUN')) {
        return 'BURGER';
    }
    return items.includes('DOUGH') ? 'PIZZA' : 'MESS';
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

/** Game clock derived from the last server snapshot. */
export function useRemaining(state: MonsterCafeState): number {
    const active = state.phase === 'PLAYING';
    const now = useNow(active, 250);
    if (!active) {
        return 0;
    }
    return Math.max(0, (state.remaining_ms ?? 0) - (now - state.receivedAt));
}

/** Monster Café effects with a mute toggle; follows admin sound settings. */
export function useCafeAudio() {
    const { gameSounds } = usePage<{ gameSounds?: unknown }>().props;
    const settings = useRef(soundSettings(gameSounds));
    const context = useRef<AudioContext | null>(null);
    const mutedRef = useRef(false);
    const [muted, setMuted] = useState(false);

    useEffect(() => {
        settings.current = soundSettings(gameSounds);
    }, [gameSounds]);

    const play = useCallback((sound: CafeSound) => {
        if (mutedRef.current || typeof window.AudioContext === 'undefined') {
            return;
        }
        try {
            context.current ??= new AudioContext();
            if (context.current.state === 'suspended') {
                void context.current.resume().catch(() => {});
            }
            playCafeSound(context.current, sound, settings.current);
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

export function Panel({
    children,
    className,
    testId,
    dataState,
}: {
    children: ReactNode;
    className?: string;
    testId?: string;
    /** Exposed as `data-state` (e.g. oven state for QA). */
    dataState?: string;
}) {
    return (
        <section
            data-testid={testId}
            data-state={dataState}
            className={cn(
                'rounded-3xl border-3 border-[#1f2a44] bg-white p-4 text-[#1f2a44] shadow-[5px_5px_0px_#1f2a44] sm:p-5',
                className,
            )}
        >
            {children}
        </section>
    );
}

/** Coin amount that flashes green/red when it changes. */
export function CoinValue({
    value,
    className,
}: {
    value: number;
    className?: string;
}) {
    const { i18n } = useTranslations();
    const prev = useRef(value);
    const [flash, setFlash] = useState<'up' | 'down' | null>(null);
    useEffect(() => {
        if (value === prev.current) {
            return;
        }
        setFlash(value > prev.current ? 'up' : 'down');
        prev.current = value;
        const id = setTimeout(() => setFlash(null), 800);
        return () => clearTimeout(id);
    }, [value]);
    return (
        <span
            className={cn('mc-coins inline-block', className)}
            data-flash={flash ?? undefined}
        >
            {formatCoins(value, i18n.language)}
        </span>
    );
}

/** Horizontal patience bar; width and colour follow the absolute deadline. */
export function PatienceBar({
    deadlineAt,
    total,
    now,
    className,
}: {
    deadlineAt: number;
    total: number;
    now: number;
    className?: string;
}) {
    const { t } = useTranslations();
    const left = Math.max(0, deadlineAt - now);
    const fraction = Math.min(1, left / Math.max(1, total));
    const mood = moodOf(fraction);
    return (
        <div
            className={cn(
                'h-3 w-full overflow-hidden rounded-full border-2 border-[#1f2a44] bg-white',
                className,
            )}
            role="progressbar"
            aria-label={t('monsterCafe.common.patience')}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={Math.round(fraction * 100)}
            data-mood={mood}
        >
            <div
                className="mc-bar h-full"
                style={{
                    width: `${fraction * 100}%`,
                    background: MOOD_TONE[mood],
                }}
            />
        </div>
    );
}

/** Live coin leaderboard with FLIP row animation. */
export function Leaderboard({
    rows,
    you,
    limit,
    size = 'md',
}: {
    rows: MonsterCafeBoardEntry[];
    you?: number;
    limit?: number;
    size?: 'md' | 'lg';
}) {
    const { t } = useTranslations();
    const shown = limit ? rows.slice(0, limit) : rows;
    const refs = useRef(new Map<number, HTMLLIElement>());
    const tops = useRef(new Map<number, number>());

    useLayoutEffect(() => {
        const next = new Map<number, number>();
        refs.current.forEach((el, id) => {
            const top = el.offsetTop;
            next.set(id, top);
            const before = tops.current.get(id);
            if (before !== undefined && before !== top) {
                el.style.transition = 'none';
                el.style.transform = `translateY(${before - top}px)`;
                requestAnimationFrame(() => {
                    el.style.transition = '';
                    el.style.transform = '';
                });
            }
        });
        tops.current = next;
    }, [shown]);

    if (shown.length === 0) {
        return null;
    }
    const lg = size === 'lg';
    return (
        <ol
            className="relative flex flex-col gap-1.5"
            data-testid="mc-leaderboard"
        >
            {shown.map((row) => (
                <li
                    key={row.user_id}
                    ref={(el) => {
                        if (el) {
                            refs.current.set(row.user_id, el);
                        } else {
                            refs.current.delete(row.user_id);
                        }
                    }}
                    className={cn(
                        'mc-board-row flex items-center gap-2 rounded-2xl border-2 border-[#1f2a44] bg-white px-2 py-1.5 sm:gap-3',
                        row.user_id === you && 'bg-[#ffedd5]',
                        row.rank === 1 && 'bg-[#ffe08a]',
                        row.left && 'opacity-50',
                    )}
                    data-user={row.user_id}
                >
                    <span
                        className={cn(
                            'w-8 shrink-0 text-center font-display font-black tabular-nums',
                            lg ? 'text-xl' : 'text-sm',
                        )}
                    >
                        {row.rank === 1 ? (
                            <Crown
                                className="mx-auto size-5 fill-[#ffd93d] text-[#b45309]"
                                aria-label={t('monsterCafe.common.rank', {
                                    rank: 1,
                                })}
                            />
                        ) : (
                            t('monsterCafe.common.rank', { rank: row.rank })
                        )}
                    </span>
                    <span className={cn('shrink-0', lg ? 'size-11' : 'size-8')}>
                        <PlayerAvatar
                            character={row.character}
                            seat={row.user_id}
                            userId={row.user_id}
                        />
                    </span>
                    <span
                        className={cn(
                            'min-w-0 flex-1 truncate font-black',
                            lg ? 'text-lg' : 'text-sm',
                        )}
                    >
                        {row.name}
                        {row.user_id === you &&
                            ` (${t('monsterCafe.common.you')})`}
                    </span>
                    {!row.online && !row.left && (
                        <WifiOff
                            className="size-4 shrink-0 text-[#AD1457]"
                            aria-label={t('monsterCafe.common.offline')}
                        />
                    )}
                    <span
                        className={cn(
                            'hidden shrink-0 text-xs font-bold text-slate-700 sm:inline',
                            lg && 'text-sm',
                        )}
                    >
                        {t('monsterCafe.common.servedCount', {
                            count: row.served,
                        })}
                    </span>
                    <span
                        className={cn(
                            'inline-flex shrink-0 items-center gap-1 rounded-full border-2 border-[#1f2a44] bg-[#ffd93d] px-2.5 py-0.5 font-display font-black',
                            lg ? 'text-lg' : 'text-sm',
                        )}
                    >
                        <Coins className="size-4" aria-hidden="true" />
                        <CoinValue value={row.coins} />
                    </span>
                </li>
            ))}
        </ol>
    );
}

/** One feed line (served, angry monster, burnt, rat, pie). */
export function FeedItem({ action }: { action: MonsterCafeAction }) {
    const { t } = useTranslations();
    const style = FEED_STYLE[action.kind] ?? FEED_STYLE.SERVED;
    const Icon = style.icon;
    const text = t(`monsterCafe.common.feedActions.${action.kind}`, {
        name: action.player.name,
        target: action.target?.name ?? '',
        dish: action.dish
            ? t(`monsterCafe.common.dishes.${action.dish}`)
            : t('monsterCafe.common.dishes.MESS'),
        coins: action.coins ?? 0,
    });
    return (
        <li
            className="mc-feed-item flex items-center gap-2 rounded-2xl border-2 border-[#1f2a44] bg-white px-2 py-1.5"
            data-kind={action.kind}
        >
            <span className="size-8 shrink-0">
                <PlayerAvatar
                    character={action.player.character}
                    seat={action.player.user_id}
                    userId={action.player.user_id}
                />
            </span>
            <span
                className="grid size-7 shrink-0 place-items-center rounded-lg text-white"
                style={{ background: style.tone }}
            >
                <Icon className="size-4" aria-hidden="true" />
            </span>
            {action.target && (
                <span className="size-8 shrink-0">
                    <PlayerAvatar
                        character={action.target.character}
                        seat={action.target.user_id}
                        userId={action.target.user_id}
                    />
                </span>
            )}
            <span className="min-w-0 flex-1 text-xs leading-snug font-bold sm:text-sm">
                {text}
            </span>
        </li>
    );
}

export function Feed({
    feed,
    limit = 8,
}: {
    feed: MonsterCafeAction[];
    limit?: number;
}) {
    const { t } = useTranslations();
    const items = feed.slice(-limit).reverse();
    return (
        <div className="flex flex-col gap-2" data-testid="mc-feed">
            <h2 className="font-display text-lg font-black">
                {t('monsterCafe.common.feed')}
            </h2>
            {items.length === 0 ? (
                <p className="rounded-2xl border-2 border-dashed border-[#1f2a44]/40 px-3 py-6 text-center text-sm font-bold text-slate-600">
                    {t('monsterCafe.common.feedEmpty')}
                </p>
            ) : (
                <ul className="flex flex-col gap-1.5" aria-live="polite">
                    {items.map((action) => (
                        <FeedItem key={action.id} action={action} />
                    ))}
                </ul>
            )}
        </div>
    );
}

/** Final podium (1-2-3) with portal avatars and coins, plus full ranking. */
export function Podium({
    state,
    you,
}: {
    state: MonsterCafeState;
    you?: number;
}) {
    const { t, i18n } = useTranslations();
    const podium = state.podium ?? [];
    const order = [podium[1], podium[0], podium[2]].filter(
        (p): p is MonsterCafeRanking => Boolean(p),
    );
    const heights: Record<number, string> = { 1: 'h-28', 2: 'h-20', 3: 'h-14' };
    const winner = podium[0];

    return (
        <div className="flex flex-col gap-5" data-testid="mc-podium">
            <h2 className="text-center font-display text-2xl font-black sm:text-3xl">
                {winner
                    ? t('monsterCafe.common.winner', {
                          name: winner.name,
                          coins: formatCoins(winner.coins, i18n.language),
                      })
                    : t('monsterCafe.common.podium')}
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
                        <span className="inline-flex items-center gap-1 rounded-full border-2 border-[#1f2a44] bg-[#ffd93d] px-2 py-0.5 text-xs font-black sm:text-sm">
                            <Coins className="size-3.5" aria-hidden="true" />
                            {formatCoins(p.coins, i18n.language)}
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
            <Ranking
                ranking={state.ranking ?? []}
                you={you ?? state.result?.user_id}
            />
        </div>
    );
}

function Ranking({
    ranking,
    you,
}: {
    ranking: MonsterCafeRanking[];
    you?: number;
}) {
    const { t, i18n } = useTranslations();
    if (ranking.length === 0) {
        return null;
    }
    return (
        <div className="mx-auto flex w-full max-w-3xl flex-col gap-2">
            <h3 className="text-sm font-black text-slate-600 uppercase">
                {t('monsterCafe.common.ranking')}
            </h3>
            <ol
                className="flex max-h-80 flex-col divide-y divide-[#1f2a44]/10 overflow-y-auto rounded-2xl border-2 border-[#1f2a44] bg-white"
                data-testid="mc-ranking"
            >
                {ranking.map((p) => (
                    <li
                        key={p.user_id}
                        className={cn(
                            'flex items-center gap-2 px-3 py-2 text-sm sm:gap-3',
                            p.user_id === you && 'bg-[#ffedd5]',
                        )}
                        data-user={p.user_id}
                    >
                        <span className="w-8 shrink-0 font-display font-black tabular-nums">
                            {t('monsterCafe.common.rank', { rank: p.rank })}
                        </span>
                        <span className="size-8 shrink-0">
                            <PlayerAvatar
                                character={p.character}
                                seat={p.user_id}
                                userId={p.user_id}
                            />
                        </span>
                        <span className="min-w-0 flex-1 truncate font-black">
                            {p.name}
                            {p.user_id === you &&
                                ` (${t('monsterCafe.common.you')})`}
                            {p.left && ` · ${t('monsterCafe.common.leftGame')}`}
                        </span>
                        <span className="hidden shrink-0 text-xs font-bold text-slate-700 sm:inline">
                            {t('monsterCafe.common.stats', {
                                served: p.served,
                                correct: p.correct,
                                answered: p.answered,
                            })}
                        </span>
                        <span className="inline-flex shrink-0 items-center gap-1 font-display font-black tabular-nums">
                            <Coins
                                className="size-4 text-[#b45309]"
                                aria-hidden="true"
                            />
                            {formatCoins(p.coins, i18n.language)}
                        </span>
                    </li>
                ))}
            </ol>
        </div>
    );
}

/** Translated ingredient / dish / monster names. */
export function useCafeNames() {
    const { t } = useTranslations();
    return {
        ingredient: (i: Ingredient) => t(`monsterCafe.common.ingredients.${i}`),
        dish: (d: Dish | '') =>
            t(`monsterCafe.common.dishes.${d === '' ? 'MESS' : d}`),
        monster: (m: string) => t(`monsterCafe.common.monsters.${m}`),
    };
}
