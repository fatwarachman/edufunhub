import { PlayerAvatar } from '@/components/player-avatar';
import {
    type PowerUp,
    type RushAction,
    type RushRanking,
    type RushState,
    type SequenceItem,
    type SequenceKind,
} from '@/hooks/use-order-rush';
import { useTranslations } from '@/hooks/use-translations';
import { cn } from '@/lib/utils';
import {
    Cable,
    Crown,
    type LucideIcon,
    Shield,
    Snowflake,
    Zap,
} from 'lucide-react';
import { type CSSProperties, type ReactNode, useEffect, useState } from 'react';

export const ACCENT = '#0f766e';
export const BG = '#ecfdf5';
export const INK = '#1f2a44';

/** Icon and tone per power-up (white text passes AA on each tone). */
export const POWER_STYLE: Record<PowerUp, { icon: LucideIcon; tone: string }> =
    {
        TANGLE: { icon: Cable, tone: '#c2410c' },
        FREEZE: { icon: Snowflake, tone: '#0369a1' },
        SHIELD: { icon: Shield, tone: '#4338ca' },
    };

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
export function useRemaining(state: RushState): number {
    const active = state.phase === 'RACE_ACTIVE';
    const now = useNow(active, 250);
    if (!active) {
        return 0;
    }
    return Math.max(0, (state.remaining_ms ?? 0) - (now - state.receivedAt));
}

export function clock(ms: number): string {
    const total = Math.max(0, Math.ceil(ms / 1000));
    return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`;
}

export function formatScore(value: number, locale: string): string {
    return new Intl.NumberFormat(locale === 'en' ? 'en-US' : 'id-ID').format(
        value,
    );
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

/** Light text on dark cores, dark text on light ones. */
function readableOn(hex?: string): string {
    if (!hex || hex.length !== 7) {
        return INK;
    }
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);
    return 0.299 * r + 0.587 * g + 0.114 * b > 150 ? INK : '#ffffff';
}

/**
 * One sequence piece: a realistic cable core (solid, or white with a
 * coloured stripe for UTP pairs) or a protocol label card.
 */
export function Piece({
    item,
    kind,
    size = 'md',
}: {
    item: SequenceItem;
    kind: SequenceKind;
    size?: 'sm' | 'md';
}) {
    if (kind === 'cable' && item.color) {
        const label = item.stripe ? INK : readableOn(item.color);
        return (
            <span
                className={cn(
                    'or-cable flex w-full items-center justify-center rounded-xl border-2 border-[#1f2a44] px-1 text-center leading-tight font-black',
                    size === 'sm'
                        ? 'min-h-9 text-[10px]'
                        : 'min-h-12 text-xs sm:text-sm',
                )}
                data-striped={item.stripe ? 'true' : 'false'}
                style={
                    {
                        '--or-core': item.color,
                        '--or-stripe': item.stripe ?? item.color,
                        color: label,
                    } as CSSProperties
                }
            >
                <span
                    className={cn(
                        'rounded-md px-1',
                        item.stripe && 'bg-white/85',
                    )}
                >
                    {item.label}
                </span>
            </span>
        );
    }
    return (
        <span
            className={cn(
                'flex w-full items-center justify-center rounded-xl border-2 border-[#1f2a44] bg-[#e0f2fe] px-1.5 text-center leading-tight font-black text-[#0c4a6e]',
                size === 'sm'
                    ? 'min-h-9 text-[10px]'
                    : 'min-h-12 text-xs sm:text-sm',
            )}
        >
            {item.label}
        </span>
    );
}

export type TesterResult = 'idle' | 'running' | 'ok' | 'bad';

/**
 * Virtual LAN tester: LEDs light up one by one, then all turn green on a
 * correct order, or stop red at the first wrong pin.
 */
export function LanTester({
    slots,
    result,
    errorSlot,
    startedAt,
    stepMs = 70,
    ends = 1,
}: {
    slots: number;
    result: TesterResult;
    errorSlot: number;
    startedAt: number;
    stepMs?: number;
    /** 2 = master and remote unit of a cable crimped on both ends. */
    ends?: number;
}) {
    const { t } = useTranslations();
    const running = result !== 'idle';
    const now = useNow(running, 40);
    const elapsed = running ? now - startedAt : 0;
    const lit = Math.floor(elapsed / stepMs);
    const stopAt = result === 'bad' ? errorSlot : slots;
    const done = lit >= stopAt;
    return (
        <div
            className="or-tester flex flex-col items-center gap-1.5 rounded-2xl border-3 border-[#1f2a44] bg-[#1e293b] px-3 py-2 text-white"
            data-result={done && result !== 'running' ? result : 'running'}
            data-testid="or-lan-tester"
            role="status"
            aria-live="polite"
        >
            <span className="text-[10px] font-black tracking-widest text-slate-300 uppercase">
                {t('orderRush.lanTester')}
            </span>
            <div className="flex flex-col items-center gap-1">
                {Array.from({ length: Math.max(1, ends) }, (_, end) => {
                    const per = Math.ceil(slots / Math.max(1, ends));
                    return (
                        <div
                            key={end}
                            className="flex flex-wrap items-center justify-center gap-1"
                            data-testid={`or-tester-end-${end}`}
                        >
                            {ends > 1 && (
                                <span className="w-5 text-center text-[10px] font-black text-slate-300">
                                    {String.fromCharCode(65 + end)}
                                </span>
                            )}
                            {Array.from({ length: per }, (_, k) => {
                                const i = end * per + k;
                                let state = 'off';
                                if (result === 'running') {
                                    state =
                                        i < lit % (slots + 1) ? 'run' : 'off';
                                } else if (running) {
                                    if (done && result === 'ok') {
                                        state = 'ok';
                                    } else if (done && result === 'bad') {
                                        state =
                                            i < errorSlot
                                                ? 'ok'
                                                : i === errorSlot
                                                  ? 'bad'
                                                  : 'off';
                                    } else if (i < lit) {
                                        state = 'run';
                                    }
                                }
                                return (
                                    <span
                                        key={i}
                                        className="or-led grid size-6 place-items-center rounded-full border border-black/40 text-[10px] font-black text-[#1f2a44]"
                                        data-state={state}
                                        data-testid={`or-led-${i}`}
                                    >
                                        {ends > 1 ? k + 1 : i + 1}
                                    </span>
                                );
                            })}
                        </div>
                    );
                })}
            </div>
            <span className="text-xs font-bold">
                {!running
                    ? t('orderRush.testerReady')
                    : result === 'running' || !done
                      ? t('orderRush.testing')
                      : result === 'ok'
                        ? t('orderRush.testerOk')
                        : ends > 1
                          ? t('orderRush.testerBadEnd', {
                                end: String.fromCharCode(
                                    65 +
                                        Math.floor(
                                            errorSlot / Math.ceil(slots / ends),
                                        ),
                                ),
                                pin: (errorSlot % Math.ceil(slots / ends)) + 1,
                            })
                          : t('orderRush.testerBad', { pin: errorSlot + 1 })}
            </span>
        </div>
    );
}

/**
 * Protocol validator: a packet travels through the layers (slots) and
 * stops at the first wrong one.
 */
export function PacketValidator({
    labels,
    result,
    errorSlot,
    startedAt,
}: {
    labels: string[];
    result: TesterResult;
    errorSlot: number;
    startedAt: number;
}) {
    const { t } = useTranslations();
    const running = result !== 'idle';
    const n = Math.max(1, labels.length);
    const stop =
        result === 'bad' ? `${((errorSlot + 0.5) / n) * 100}%` : undefined;
    return (
        <div
            className="or-tester relative flex flex-col gap-0.5 overflow-hidden rounded-2xl border-3 border-[#1f2a44] bg-[#0f172a] p-1.5 text-white"
            data-result={result}
            data-testid="or-packet-validator"
            role="status"
            aria-live="polite"
        >
            {labels.map((label, i) => (
                <span
                    key={i}
                    className={cn(
                        'truncate rounded-md px-2 py-0.5 text-[10px] font-black',
                        result === 'bad' && i === errorSlot
                            ? 'bg-[#be123c]'
                            : result === 'ok'
                              ? 'bg-[#15803d]'
                              : 'bg-slate-700',
                    )}
                >
                    {i + 1}. {label || '—'}
                </span>
            ))}
            {running && (
                <span
                    key={startedAt}
                    className="or-packet absolute right-2 grid size-7 place-items-center rounded-lg border-2 border-white bg-[#facc15] text-[10px] font-black text-[#1f2a44]"
                    data-result={result}
                    style={
                        {
                            '--or-dive': `${Math.min(1.2, 0.12 * n + 0.3)}s`,
                            '--or-stop': stop,
                        } as CSSProperties
                    }
                    aria-hidden="true"
                >
                    PDU
                </span>
            )}
            <span className="sr-only">
                {result === 'ok'
                    ? t('orderRush.testerOk')
                    : result === 'bad'
                      ? t('orderRush.layerBad', { slot: errorSlot + 1 })
                      : ''}
            </span>
        </div>
    );
}

export function FeedItem({ action }: { action: RushAction }) {
    const { t } = useTranslations();
    const style = POWER_STYLE[action.type] ?? POWER_STYLE.TANGLE;
    const Icon = style.icon;
    const text = action.blocked
        ? t('orderRush.feed.blocked', {
              source: action.source_player.name,
              target: action.target_player?.name ?? '',
          })
        : t(`orderRush.feed.${action.type}`, {
              source: action.source_player.name,
              target: action.target_player?.name ?? '',
          });
    return (
        <li className="flex items-center gap-2 rounded-xl border-2 border-[#1f2a44]/15 bg-white px-2 py-1.5">
            <span className="size-10 shrink-0">
                <PlayerAvatar
                    character={action.source_player.character}
                    seat={action.source_player.user_id}
                />
            </span>
            <span
                className="grid size-7 shrink-0 place-items-center rounded-lg text-white"
                style={{
                    background: action.blocked
                        ? POWER_STYLE.SHIELD.tone
                        : style.tone,
                }}
            >
                {action.blocked ? (
                    <Shield className="size-4" aria-hidden="true" />
                ) : (
                    <Icon className="size-4" aria-hidden="true" />
                )}
            </span>
            {action.target_player && (
                <span className="size-10 shrink-0">
                    <PlayerAvatar
                        character={action.target_player.character}
                        seat={action.target_player.user_id}
                    />
                </span>
            )}
            <span className="min-w-0 flex-1 text-xs leading-snug font-bold sm:text-sm">
                {text}
            </span>
        </li>
    );
}

/** Final podium (1-2-3) with the winners' portal avatars and ranking table. */
export function Podium({ state }: { state: RushState }) {
    const { t, i18n } = useTranslations();
    const podium = state.podium ?? [];
    const order = [podium[1], podium[0], podium[2]].filter(
        (p): p is RushRanking => Boolean(p),
    );
    const heights: Record<number, string> = { 1: 'h-28', 2: 'h-20', 3: 'h-14' };
    const winner = podium[0];
    const ranking = state.ranking ?? [];

    return (
        <div className="flex flex-col gap-5" data-testid="or-podium">
            <h2 className="text-center font-display text-2xl font-black sm:text-3xl">
                {winner
                    ? t('orderRush.winner', { name: winner.name })
                    : t('orderRush.podium')}
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
                        <span className="inline-flex items-center gap-1 rounded-full border-2 border-[#1f2a44] bg-[#99f6e4] px-2 py-0.5 text-xs font-black tabular-nums sm:text-sm">
                            <Zap className="size-3.5" aria-hidden="true" />
                            {formatScore(p.score, i18n.language)}
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
                <div className="mx-auto w-full max-w-3xl overflow-x-auto rounded-2xl border-2 border-[#1f2a44] bg-white">
                    <table
                        className="w-full min-w-[480px] text-sm"
                        data-testid="or-ranking"
                    >
                        <thead>
                            <tr className="border-b-2 border-[#1f2a44]/15 text-left text-xs font-black text-slate-600 uppercase">
                                <th className="px-3 py-2">#</th>
                                <th className="px-3 py-2">
                                    {t('orderRush.player')}
                                </th>
                                <th className="px-3 py-2 text-right">
                                    {t('orderRush.score')}
                                </th>
                                <th className="px-3 py-2 text-right">
                                    {t('orderRush.modules')}
                                </th>
                                <th className="px-3 py-2 text-right">
                                    {t('orderRush.accuracy')}
                                </th>
                                <th className="px-3 py-2 text-right">
                                    {t('orderRush.avgTime')}
                                </th>
                            </tr>
                        </thead>
                        <tbody>
                            {ranking.map((p) => (
                                <tr
                                    key={p.user_id}
                                    className={cn(
                                        'border-b border-[#1f2a44]/10 last:border-0',
                                        p.user_id === state.result?.user_id &&
                                            'bg-[#ccfbf1]',
                                    )}
                                >
                                    <td className="px-3 py-1.5 font-display font-black tabular-nums">
                                        {p.rank}
                                    </td>
                                    <td className="px-3 py-1.5">
                                        <span className="flex min-w-0 items-center gap-2">
                                            <span className="size-7 shrink-0">
                                                <PlayerAvatar
                                                    character={p.character}
                                                    seat={p.user_id}
                                                />
                                            </span>
                                            <span className="truncate font-bold">
                                                {p.name}
                                            </span>
                                        </span>
                                    </td>
                                    <td className="px-3 py-1.5 text-right font-black tabular-nums">
                                        {formatScore(p.score, i18n.language)}
                                    </td>
                                    <td className="px-3 py-1.5 text-right tabular-nums">
                                        {p.step}
                                    </td>
                                    <td className="px-3 py-1.5 text-right tabular-nums">
                                        {p.accuracy}%
                                    </td>
                                    <td className="px-3 py-1.5 text-right tabular-nums">
                                        {p.avg_ms > 0
                                            ? `${(p.avg_ms / 1000).toFixed(1)} s`
                                            : '–'}
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}
        </div>
    );
}
