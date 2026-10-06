import { PlayerAvatar } from '@/components/player-avatar';
import {
    type ChestType,
    type HeistAction,
    type HeistBoardEntry,
    type HeistChest,
    type HeistRanking,
    type HeistState,
} from '@/hooks/use-economy-heist';
import { useTranslations } from '@/hooks/use-translations';
import { cn } from '@/lib/utils';
import {
    ArrowLeftRight,
    Bomb,
    Coins,
    Crown,
    HandCoins,
    type LucideIcon,
    Shield,
    ShieldCheck,
    TrendingDown,
    WifiOff,
} from 'lucide-react';
import {
    type ReactNode,
    useEffect,
    useLayoutEffect,
    useRef,
    useState,
} from 'react';

export const ACCENT = '#b45309';
export const BG = '#fff8e6';
export const INK = '#1f2a44';

/** Icon and tone per chest outcome (white text passes AA on each tone). */
export const OUTCOME_STYLE: Record<
    ChestType | 'BLOCKED',
    { icon: LucideIcon; tone: string }
> = {
    ADD_GOLD: { icon: Coins, tone: '#15803d' },
    LOSE_GOLD: { icon: TrendingDown, tone: '#be123c' },
    SHIELD: { icon: Shield, tone: '#1d4ed8' },
    STEAL_PERCENT: { icon: HandCoins, tone: '#7e22ce' },
    SWAP_GOLD: { icon: ArrowLeftRight, tone: '#0f766e' },
    BANKRUPT_BOMB: { icon: Bomb, tone: '#111827' },
    BLOCKED: { icon: ShieldCheck, tone: '#1d4ed8' },
};

export function formatGold(value: number, locale: string): string {
    return new Intl.NumberFormat(locale === 'en' ? 'en-US' : 'id-ID').format(
        value,
    );
}

export function seconds(ms: number): number {
    return Math.max(0, Math.ceil(ms / 1000));
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
export function useRemaining(state: HeistState): number {
    const active = state.phase === 'PLAYING';
    const now = useNow(active, 250);
    if (!active) {
        return 0;
    }
    return Math.max(0, (state.remaining_ms ?? 0) - (now - state.receivedAt));
}

export function clock(ms: number): string {
    const total = seconds(ms);
    const m = Math.floor(total / 60);
    const s = total % 60;
    return `${m}:${String(s).padStart(2, '0')}`;
}

export function Panel({
    children,
    className,
}: {
    children: ReactNode;
    className?: string;
}) {
    return (
        <section
            className={cn(
                'rounded-3xl border-3 border-[#1f2a44] bg-white p-5 shadow-[5px_5px_0px_#1f2a44] sm:p-6',
                className,
            )}
        >
            {children}
        </section>
    );
}

/** Short value label of a chest outcome ("+250", "-15%", "25%"). */
export function useOutcomeValue() {
    const { t } = useTranslations();
    return (chest: Pick<HeistChest, 'type' | 'value' | 'unit'>): string => {
        switch (chest.type) {
            case 'ADD_GOLD':
                return t(
                    chest.unit === 'percent'
                        ? 'economyHeist.outcomeValue.percent'
                        : 'economyHeist.outcomeValue.flat',
                    { value: chest.value },
                );
            case 'LOSE_GOLD':
            case 'BANKRUPT_BOMB':
                return t('economyHeist.outcomeValue.lose', {
                    value: chest.value,
                });
            case 'STEAL_PERCENT':
                return t('economyHeist.outcomeValue.steal', {
                    value: chest.value,
                });
            case 'SWAP_GOLD':
                return t('economyHeist.outcomeValue.swap');
            default:
                return t('economyHeist.outcomeValue.shield');
        }
    };
}

/** Gold amount that flashes green/red when it changes. */
export function GoldValue({
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
            className={cn('eh-gold inline-block', className)}
            data-flash={flash ?? undefined}
        >
            {formatGold(value, i18n.language)}
        </span>
    );
}

/**
 * Live gold leaderboard. Rows keep their DOM node per player and animate to
 * their new position (FLIP), so overtakes are visible on the projector.
 */
export function Leaderboard({
    rows,
    you,
    limit,
    size = 'md',
}: {
    rows: HeistBoardEntry[];
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
            data-testid="eh-leaderboard"
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
                        'eh-board-row flex items-center gap-2 rounded-2xl border-2 border-[#1f2a44] bg-white px-2 py-1.5 sm:gap-3',
                        row.user_id === you && 'bg-[#fff1c2]',
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
                                aria-label={t('economyHeist.rank', {
                                    rank: 1,
                                })}
                            />
                        ) : (
                            t('economyHeist.rank', { rank: row.rank })
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
                        {row.user_id === you && ` (${t('economyHeist.you')})`}
                    </span>
                    {!row.online && !row.left && (
                        <WifiOff
                            className="size-4 shrink-0 text-[#AD1457]"
                            aria-label={t('economyHeist.offline')}
                        />
                    )}
                    <span
                        className={cn(
                            'inline-flex shrink-0 items-center gap-1 rounded-full border-2 border-[#1f2a44] bg-[#ffd93d] px-2.5 py-0.5 font-display font-black',
                            lg ? 'text-lg' : 'text-sm',
                        )}
                    >
                        <Coins className="size-4" aria-hidden="true" />
                        <GoldValue value={row.gold} />
                    </span>
                </li>
            ))}
        </ol>
    );
}

/** One line of the action ticker with both players' avatars. */
export function FeedItem({ action }: { action: HeistAction }) {
    const { t, i18n } = useTranslations();
    const style = OUTCOME_STYLE[action.action] ?? OUTCOME_STYLE.ADD_GOLD;
    const Icon = style.icon;
    const text = t(`economyHeist.actions.${action.action}`, {
        source: action.source_player.name,
        target: action.target_player?.name ?? '',
        amount: formatGold(Math.abs(action.amount), i18n.language),
    });
    return (
        <li
            className="eh-feed-item flex items-center gap-2 rounded-2xl border-2 border-[#1f2a44] bg-white px-2 py-1.5"
            data-action={action.action}
        >
            <span className="size-8 shrink-0">
                <PlayerAvatar
                    character={action.source_player.character}
                    seat={action.source_player.user_id}
                    userId={action.source_player.user_id}
                />
            </span>
            <span
                className="grid size-7 shrink-0 place-items-center rounded-lg text-white"
                style={{ background: style.tone }}
            >
                <Icon className="size-4" aria-hidden="true" />
            </span>
            {action.target_player && (
                <span className="size-8 shrink-0">
                    <PlayerAvatar
                        character={action.target_player.character}
                        seat={action.target_player.user_id}
                        userId={action.target_player.user_id}
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
    feed: HeistAction[];
    limit?: number;
}) {
    const { t } = useTranslations();
    const items = feed.slice(-limit).reverse();
    return (
        <div className="flex flex-col gap-2" data-testid="eh-feed">
            <h2 className="font-display text-lg font-black">
                {t('economyHeist.feed')}
            </h2>
            {items.length === 0 ? (
                <p className="rounded-2xl border-2 border-dashed border-[#1f2a44]/40 px-3 py-6 text-center text-sm font-bold text-slate-600">
                    {t('economyHeist.feedEmpty')}
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

/** Final podium (1-2-3) with the winners' portal avatars and gold. */
export function Podium({ state }: { state: HeistState }) {
    const { t, i18n } = useTranslations();
    const podium = state.podium ?? [];
    const order = [podium[1], podium[0], podium[2]].filter(
        (p): p is HeistRanking => Boolean(p),
    );
    const heights: Record<number, string> = { 1: 'h-28', 2: 'h-20', 3: 'h-14' };
    const winner = podium[0];

    return (
        <div className="flex flex-col gap-5" data-testid="eh-podium">
            <h2 className="text-center font-display text-2xl font-black sm:text-3xl">
                {winner
                    ? t('economyHeist.winner', {
                          name: winner.name,
                          gold: formatGold(winner.gold, i18n.language),
                      })
                    : t('economyHeist.podium')}
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
                            {formatGold(p.gold, i18n.language)}
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
                you={state.result?.user_id}
            />
        </div>
    );
}

function Ranking({ ranking, you }: { ranking: HeistRanking[]; you?: number }) {
    const { t, i18n } = useTranslations();
    if (ranking.length === 0) {
        return null;
    }
    return (
        <div className="mx-auto flex w-full max-w-3xl flex-col gap-2">
            <h3 className="text-sm font-black text-slate-600 uppercase">
                {t('economyHeist.ranking')}
            </h3>
            <ol
                className="flex max-h-80 flex-col divide-y divide-[#1f2a44]/10 overflow-y-auto rounded-2xl border-2 border-[#1f2a44] bg-white"
                data-testid="eh-ranking"
            >
                {ranking.map((p) => (
                    <li
                        key={p.user_id}
                        className={cn(
                            'flex items-center gap-2 px-3 py-2 text-sm sm:gap-3',
                            p.user_id === you && 'bg-[#fff1c2]',
                        )}
                    >
                        <span className="w-8 shrink-0 font-display font-black tabular-nums">
                            {t('economyHeist.rank', { rank: p.rank })}
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
                            {p.user_id === you && ` (${t('economyHeist.you')})`}
                            {p.left && ` · ${t('economyHeist.leftGame')}`}
                        </span>
                        <span className="hidden shrink-0 text-xs font-bold text-slate-700 sm:inline">
                            {t('economyHeist.stats', {
                                correct: p.correct,
                                steals: p.steals,
                                swaps: p.swaps,
                            })}
                        </span>
                        <span className="inline-flex shrink-0 items-center gap-1 font-display font-black tabular-nums">
                            <Coins
                                className="size-4 text-[#b45309]"
                                aria-hidden="true"
                            />
                            {formatGold(p.gold, i18n.language)}
                        </span>
                    </li>
                ))}
            </ol>
        </div>
    );
}

/** Closed or opened treasure chest drawn in SVG (no emoji, no bitmap). */
export function ChestArt({
    open,
    tone = ACCENT,
}: {
    open: boolean;
    tone?: string;
}) {
    return (
        <svg
            viewBox="0 0 96 80"
            className="h-auto w-full max-w-28"
            aria-hidden="true"
        >
            <rect
                x="8"
                y="34"
                width="80"
                height="40"
                rx="6"
                fill={tone}
                stroke={INK}
                strokeWidth="4"
            />
            <rect
                x="8"
                y="46"
                width="80"
                height="6"
                fill={INK}
                opacity="0.25"
            />
            <g className="eh-chest-lid">
                <path
                    d="M8 36 Q8 10 48 10 Q88 10 88 36 Z"
                    fill={tone}
                    stroke={INK}
                    strokeWidth="4"
                    strokeLinejoin="round"
                />
                <path
                    d="M20 33 Q22 18 48 18 Q74 18 76 33"
                    fill="none"
                    stroke="#ffd93d"
                    strokeWidth="4"
                    strokeLinecap="round"
                />
            </g>
            {open && (
                <g>
                    <circle
                        cx="36"
                        cy="32"
                        r="6"
                        fill="#ffd93d"
                        stroke={INK}
                        strokeWidth="2"
                    />
                    <circle
                        cx="50"
                        cy="28"
                        r="6"
                        fill="#ffd93d"
                        stroke={INK}
                        strokeWidth="2"
                    />
                    <circle
                        cx="62"
                        cy="33"
                        r="6"
                        fill="#ffd93d"
                        stroke={INK}
                        strokeWidth="2"
                    />
                </g>
            )}
            <rect
                x="40"
                y="40"
                width="16"
                height="16"
                rx="3"
                fill="#ffd93d"
                stroke={INK}
                strokeWidth="3"
            />
            <circle cx="48" cy="48" r="2.5" fill={INK} />
        </svg>
    );
}
