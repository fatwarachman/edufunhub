import AdSlot from '@/components/ads/ad-slot';
import {
    ConnectionBadge,
    inviteLink,
    RoomError,
} from '@/components/multiplayer/room';
import {
    ACCENT,
    clock,
    FeedItem,
    formatScore,
    Panel,
    Podium,
    POWER_STYLE,
    useNow,
    useRemaining,
} from '@/components/order-rush/shared';
import { PlayerAvatar } from '@/components/player-avatar';
import { Button } from '@/components/ui/button';
import {
    type PowerUp,
    type RushAction,
    type RushBoardEntry,
    type RushMode,
    type RushState,
    type useOrderRush,
} from '@/hooks/use-order-rush';
import { useTranslations } from '@/hooks/use-translations';
import { cn } from '@/lib/utils';
import { router } from '@inertiajs/react';
import {
    Cable,
    Copy,
    DoorOpen,
    Flag,
    Flame,
    Link2,
    MonitorPlay,
    Network,
    Play,
    Timer,
    UsersRound,
} from 'lucide-react';
import { type CSSProperties, type ReactNode, useEffect, useState } from 'react';

type Status = ReturnType<typeof useOrderRush>['status'];
type Act = (msg: Record<string, unknown>) => boolean;

/** Lanes shown on the projector; the rest are listed below the track. */
const TRACK_LANES = 12;
/** How long a sabotaged avatar flashes on the track. */
const HIT_MS = 3000;

/** Teacher / projector screen: lobby, race track, marquee and podium. */
export function HostScreen({
    state,
    status,
    error,
    online,
    act,
}: {
    state: RushState;
    status: Status;
    error: string | null;
    online: boolean;
    act: Act;
}) {
    const { t } = useTranslations();

    if (state.phase === 'NONE' || !state.pin) {
        return (
            <Panel className="mx-auto flex w-full max-w-xl flex-col items-center gap-4 text-center">
                <ConnectionBadge status={status} />
                <p className="text-sm font-bold text-slate-700">
                    {t('orderRush.hostIntro')}
                </p>
                <p className="rounded-2xl border-2 border-dashed border-[#1f2a44] px-3 py-2 text-xs font-bold text-slate-600">
                    {t('orderRush.rules')}
                </p>
                <Button
                    onClick={() => act({ t: 'create_room' })}
                    disabled={status !== 'online'}
                    data-testid="or-create"
                    className="min-h-12 rounded-2xl border-3 border-[#1f2a44] bg-[#0f766e] px-6 font-display text-lg font-black text-white shadow-[4px_4px_0px_#1f2a44] hover:bg-[#115e59] disabled:opacity-50"
                >
                    <MonitorPlay className="size-5" />
                    {t('orderRush.createRoom')}
                </Button>
                {state.closed && state.closed !== 'idle' && (
                    <p className="text-xs font-bold text-slate-600">
                        {t('orderRush.roomClosed')}
                    </p>
                )}
                {error && <RoomError code={error} />}
                <button
                    type="button"
                    onClick={() => router.visit('/games/order-rush')}
                    className="min-h-11 rounded-xl px-3 text-xs font-black text-slate-600 underline-offset-4 hover:underline"
                >
                    {t('orderRush.switchRole')}
                </button>
            </Panel>
        );
    }

    if (state.phase === 'LOBBY') {
        return (
            <HostLobby
                state={state}
                status={status}
                error={error}
                online={online}
                act={act}
            />
        );
    }

    if (state.phase === 'GAME_OVER') {
        return (
            <Panel className="flex flex-col gap-5">
                <HostHeader state={state} status={status} />
                <Podium state={state} />
                <div className="flex flex-wrap justify-center gap-2">
                    <Button
                        onClick={() => act({ t: 'start_game' })}
                        disabled={!online}
                        data-testid="or-again"
                        className="min-h-12 rounded-2xl border-3 border-[#1f2a44] bg-[#1f2a44] px-6 font-display font-black text-white shadow-[3px_3px_0px_#14b8a6]"
                    >
                        <Play className="size-5" />
                        {t('orderRush.again')}
                    </Button>
                    <Button
                        variant="outline"
                        onClick={() => act({ t: 'leave_room' })}
                        className="min-h-12 rounded-2xl border-2 border-[#1f2a44] bg-white px-4 font-black text-[#1f2a44]"
                    >
                        <DoorOpen className="size-4" />
                        {t('orderRush.closeRoom')}
                    </Button>
                </div>
                {error && <RoomError code={error} />}
                <AdSlot
                    placement="arena.result"
                    className="mx-auto w-full max-w-md"
                />
            </Panel>
        );
    }

    return (
        <div className="flex flex-col gap-4" data-testid="or-host-arena">
            <Panel className="!p-4 sm:!p-5">
                <HostHeader state={state} status={status} />
            </Panel>
            <Marquee feed={state.feed} />
            <div className="grid gap-4 xl:grid-cols-12">
                <Panel className="flex flex-col gap-3 xl:col-span-9">
                    <h2 className="flex items-center justify-between gap-2 font-display text-xl font-black">
                        {t('orderRush.track')}
                        <span className="inline-flex items-center gap-1.5 text-sm">
                            <UsersRound className="size-4" aria-hidden="true" />
                            {t('orderRush.playersCount', {
                                count: state.leaderboard.filter((r) => !r.left)
                                    .length,
                            })}
                        </span>
                    </h2>
                    <RaceTrack state={state} />
                </Panel>
                <div className="flex flex-col gap-4 xl:col-span-3">
                    <Panel className="flex flex-col gap-2 !p-4">
                        <h2 className="font-display text-lg font-black">
                            {t('orderRush.feedTitle')}
                        </h2>
                        {state.feed.length === 0 ? (
                            <p className="rounded-2xl border-2 border-dashed border-[#1f2a44]/40 px-3 py-6 text-center text-sm font-bold text-slate-600">
                                {t('orderRush.feedEmpty')}
                            </p>
                        ) : (
                            <ul
                                className="flex flex-col gap-1.5"
                                aria-live="polite"
                                data-testid="or-feed"
                            >
                                {state.feed
                                    .slice(-8)
                                    .reverse()
                                    .map((action) => (
                                        <FeedItem
                                            key={action.id}
                                            action={action}
                                        />
                                    ))}
                            </ul>
                        )}
                    </Panel>
                    <AdSlot placement="arena.sidebar" className="w-full" />
                </div>
            </div>
            {error && <RoomError code={error} />}
            <EndGameButton onConfirm={() => act({ t: 'end_game' })} />
        </div>
    );
}

function HostHeader({ state, status }: { state: RushState; status: Status }) {
    const { t } = useTranslations();
    const remaining = useRemaining(state);
    const race = state.mode === 'RACE';
    const leader = state.leaderboard[0]?.step ?? 0;
    return (
        <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex flex-wrap items-center gap-2">
                <ConnectionBadge status={status} />
                <span
                    className="rounded-xl border-2 border-[#1f2a44] bg-[#FFFDE6] px-3 py-1.5 font-display text-sm font-black tracking-widest"
                    data-testid="or-pin"
                >
                    PIN {state.pin}
                </span>
                <span className="rounded-xl border-2 border-[#1f2a44] bg-[#ccfbf1] px-3 py-1.5 text-sm font-black">
                    {race
                        ? t('orderRush.raceLabel', { count: state.modules })
                        : t('orderRush.timeLabel', { count: state.minutes })}
                </span>
            </div>
            {state.phase === 'RACE_ACTIVE' && (
                <span
                    className="inline-flex min-h-11 items-center gap-2 rounded-xl border-2 border-[#1f2a44] bg-white px-3 font-display text-lg font-black tabular-nums"
                    data-testid="or-clock"
                >
                    {race ? (
                        <>
                            <Flag className="size-5" aria-hidden="true" />
                            {t('orderRush.leaderProgress', {
                                step: leader,
                                total: state.modules,
                            })}
                        </>
                    ) : (
                        <>
                            <Timer className="size-5" aria-hidden="true" />
                            <span className="sr-only">
                                {t('orderRush.timeLeft')}
                            </span>
                            {clock(remaining)}
                        </>
                    )}
                </span>
            )}
        </div>
    );
}

/**
 * Race track styled as fibre backbone lanes with router nodes. Each
 * student's portal avatar slides forward with every validated module (race)
 * or along the score of the leader (time attack).
 */
function RaceTrack({ state }: { state: RushState }) {
    const { t, i18n } = useTranslations();
    const race = state.mode === 'RACE';
    const rows = state.leaderboard.filter((row) => !row.left);
    const lanes = rows.slice(0, TRACK_LANES);
    const rest = rows.slice(TRACK_LANES);
    const topScore = Math.max(1, ...rows.map((row) => row.score));
    const nodes = race ? state.modules : 10;
    const hits = useHits(state.feed);

    const progress = (row: RushBoardEntry) =>
        race
            ? Math.min(1, row.step / Math.max(1, state.modules))
            : Math.min(1, row.score / topScore);

    if (rows.length === 0) {
        return (
            <p className="rounded-2xl border-2 border-dashed border-[#1f2a44]/40 px-4 py-10 text-center text-sm font-bold text-slate-600">
                {t('orderRush.waitingPlayers')}
            </p>
        );
    }

    return (
        <div className="flex flex-col gap-2" data-testid="or-track">
            <ol className="flex flex-col gap-1.5">
                {lanes.map((row) => (
                    <li
                        key={row.user_id}
                        className="grid grid-cols-[2rem_minmax(0,1fr)_5.5rem] items-center gap-2"
                        data-testid={`or-lane-${row.user_id}`}
                    >
                        <span className="text-center font-display text-lg font-black tabular-nums">
                            {row.rank}
                        </span>
                        <div
                            className="relative h-14 rounded-full border-2 border-[#1f2a44] bg-[#0f172a]"
                            aria-label={t('orderRush.laneLabel', {
                                name: row.username,
                                step: row.step,
                                score: row.score,
                            })}
                        >
                            <div
                                className="or-fiber absolute inset-x-2 top-1/2 h-2.5 -translate-y-1/2 overflow-hidden rounded-full"
                                style={{ '--or-nodes': nodes } as CSSProperties}
                            >
                                <span className="or-fiber-pulse absolute inset-y-0 w-1/4" />
                            </div>
                            <div
                                aria-hidden="true"
                                className="absolute top-1/2 left-2 h-2.5 -translate-y-1/2 rounded-full bg-[#4ade80] shadow-[0_0_10px_#4ade80] transition-[width] duration-500"
                                style={{
                                    width: `calc((100% - 1rem) * ${progress(row)})`,
                                }}
                            />
                            {race && (
                                <Flag
                                    aria-hidden="true"
                                    className="absolute top-1/2 right-1 z-[5] size-4 -translate-y-1/2 fill-white text-white"
                                />
                            )}
                            {race &&
                                Array.from({ length: nodes }, (_, i) => (
                                    <span
                                        key={i}
                                        aria-hidden="true"
                                        className={cn(
                                            'absolute top-1/2 size-2.5 -translate-1/2 rounded-sm border border-[#1f2a44]',
                                            i < row.step
                                                ? 'bg-[#22c55e]'
                                                : 'bg-slate-500',
                                        )}
                                        style={{
                                            left: `calc(0.75rem + (100% - 2.75rem) * ${(i + 1) / nodes})`,
                                        }}
                                    />
                                ))}
                            <span
                                className="or-track-avatar absolute top-1/2 z-10 size-14 -translate-1/2"
                                data-hit={
                                    hits.has(row.user_id) ? 'true' : 'false'
                                }
                                style={{
                                    left: `calc(1.75rem + (100% - 3.5rem) * ${progress(row)})`,
                                }}
                            >
                                <PlayerAvatar
                                    character={row.avatar ?? row.character}
                                    seat={row.user_id}
                                    walking
                                />
                                {hits.has(row.user_id) && (
                                    <HitBadge
                                        type={hits.get(row.user_id)!}
                                        label={t('orderRush.hit')}
                                    />
                                )}
                            </span>
                        </div>
                        <span className="flex flex-col items-end leading-tight">
                            <span className="max-w-full truncate text-sm font-black">
                                {row.username}
                            </span>
                            <span className="font-display text-base font-black tabular-nums">
                                {formatScore(row.score, i18n.language)}
                            </span>
                            {row.streak >= 2 && (
                                <span className="inline-flex items-center gap-0.5 text-xs font-black text-[#9a3412]">
                                    <Flame
                                        className="size-3"
                                        aria-hidden="true"
                                    />
                                    {row.streak}
                                </span>
                            )}
                        </span>
                    </li>
                ))}
            </ol>
            {rest.length > 0 && (
                <p className="text-xs font-bold text-slate-600">
                    {t('orderRush.morePlayers', { count: rest.length })}
                    {': '}
                    {rest
                        .map(
                            (row) =>
                                `${row.rank}. ${row.username} (${row.step})`,
                        )
                        .join(' · ')}
                </p>
            )}
            <p className="flex flex-wrap items-center gap-3 text-xs font-bold text-slate-600">
                <span className="inline-flex items-center gap-1">
                    <Cable className="size-3.5" aria-hidden="true" />
                    {t('orderRush.trackHintCable')}
                </span>
                <span className="inline-flex items-center gap-1">
                    <Network className="size-3.5" aria-hidden="true" />
                    {race
                        ? t('orderRush.trackHintRace', { count: state.modules })
                        : t('orderRush.trackHintTime')}
                </span>
            </p>
        </div>
    );
}

/** Players hit by a sabotage in the last HIT_MS, with the latest effect. */
function useHits(feed: RushAction[]): Map<number, PowerUp> {
    const recent = feed.filter((a) => !a.blocked && a.target_player);
    const now = useNow(recent.length > 0, 500);
    const hits = new Map<number, PowerUp>();
    for (const action of recent) {
        if (now - action.at < HIT_MS) {
            hits.set(action.target_player!.user_id, action.type);
        }
    }
    return hits;
}

function HitBadge({ type, label }: { type: PowerUp; label: string }) {
    const style = POWER_STYLE[type];
    const Icon = style.icon;
    return (
        <span
            className="absolute top-0 -right-2 grid size-6 place-items-center rounded-full border-2 border-white text-white shadow"
            style={{ background: style.tone }}
            role="img"
            aria-label={label}
        >
            <Icon className="size-3.5" aria-hidden="true" />
        </span>
    );
}

/** Live ticker of sabotage actions across the projector. */
function Marquee({ feed }: { feed: RushAction[] }) {
    const { t } = useTranslations();
    const latest = feed.slice(-4);
    if (latest.length === 0) {
        return null;
    }
    const text = latest
        .map((a) =>
            a.blocked
                ? t('orderRush.feed.blocked', {
                      source: a.source_player.name,
                      target: a.target_player?.name ?? '',
                  })
                : t(`orderRush.feed.${a.type}`, {
                      source: a.source_player.name,
                      target: a.target_player?.name ?? '',
                  }),
        )
        .join('   •   ');
    return (
        <div
            className="overflow-hidden rounded-2xl border-3 border-[#1f2a44] bg-[#1f2a44] py-2 text-white"
            data-testid="or-marquee"
        >
            <p className="sr-only" aria-live="polite">
                {text}
            </p>
            <div
                key={latest.at(-1)?.id}
                className="or-marquee flex w-max font-display text-lg font-black whitespace-nowrap sm:text-2xl"
                aria-hidden="true"
            >
                <span className="px-6">{text}</span>
                <span className="px-6">{text}</span>
            </div>
        </div>
    );
}

function HostLobby({
    state,
    status,
    error,
    online,
    act,
}: {
    state: RushState;
    status: Status;
    error: string | null;
    online: boolean;
    act: Act;
}) {
    const { t } = useTranslations();
    const [copied, setCopied] = useState<string | null>(null);
    const link = inviteLink('order-rush', state.pin ?? '');
    const active = state.players.filter((p) => !p.left);
    const enough = active.length >= state.min_players;
    const selected = state.sets;

    const copy = async (kind: string, text: string) => {
        try {
            await navigator.clipboard.writeText(text);
            setCopied(kind);
            setTimeout(() => setCopied(null), 1600);
        } catch {
            setCopied(null);
        }
    };
    const configure = (mode: RushMode, value: number, sets = selected) =>
        act({ t: 'configure', mode, value, sets });
    const value = state.mode === 'RACE' ? state.modules : state.minutes;
    const toggleSet = (key: string) =>
        configure(
            state.mode,
            value,
            selected.includes(key)
                ? selected.filter((k) => k !== key)
                : [...selected, key],
        );

    return (
        <div className="grid gap-5 lg:grid-cols-12" data-testid="or-host-lobby">
            <Panel className="flex flex-col gap-4 lg:col-span-5">
                <HostHeader state={state} status={status} />
                <div className="rounded-2xl border-3 border-dashed border-[#1f2a44] bg-[#FFFDE6] p-4 text-center">
                    <p className="text-sm font-black">{t('room.shareTitle')}</p>
                    <p className="mt-2 font-display text-5xl font-black tracking-[0.25em]">
                        {state.pin}
                    </p>
                    <p className="mt-1 text-xs font-bold [overflow-wrap:anywhere] text-slate-600">
                        {link}
                    </p>
                    <div className="mt-3 flex flex-wrap justify-center gap-2">
                        <CopyButton
                            onClick={() => copy('pin', state.pin ?? '')}
                            icon={Copy}
                            label={t('room.copyPinLabel')}
                        >
                            {copied === 'pin'
                                ? t('room.copied')
                                : t('room.copyPin')}
                        </CopyButton>
                        <CopyButton
                            onClick={() => copy('link', link)}
                            icon={Link2}
                            label={t('room.copyLinkLabel')}
                        >
                            {copied === 'link'
                                ? t('room.copied')
                                : t('room.copyLink')}
                        </CopyButton>
                    </div>
                </div>

                <fieldset className="flex flex-col gap-2" disabled={!online}>
                    <legend className="mb-1 text-sm font-black">
                        {t('orderRush.mode')}
                    </legend>
                    <div className="grid grid-cols-2 gap-2">
                        {(
                            [
                                ['RACE', Flag, t('orderRush.modeRace')],
                                ['TIME_ATTACK', Timer, t('orderRush.modeTime')],
                            ] as const
                        ).map(([mode, Icon, label]) => (
                            <button
                                key={mode}
                                type="button"
                                aria-pressed={state.mode === mode}
                                data-testid={`or-mode-${mode}`}
                                onClick={() =>
                                    configure(
                                        mode,
                                        mode === 'RACE'
                                            ? state.modules
                                            : state.minutes,
                                    )
                                }
                                className={cn(
                                    'inline-flex min-h-11 items-center justify-center gap-1.5 rounded-xl border-2 border-[#1f2a44] px-3 text-sm font-black transition-colors',
                                    state.mode === mode
                                        ? 'bg-[#1f2a44] text-white'
                                        : 'bg-white hover:bg-[#ccfbf1]',
                                )}
                            >
                                <Icon className="size-4" aria-hidden="true" />
                                {label}
                            </button>
                        ))}
                    </div>
                    <div className="flex flex-wrap gap-1.5" role="group">
                        {(state.mode === 'RACE'
                            ? state.race_targets
                            : state.time_limits
                        ).map((n) => (
                            <Chip
                                key={n}
                                active={value === n}
                                onClick={() => configure(state.mode, n)}
                            >
                                {state.mode === 'RACE'
                                    ? t('orderRush.modulesCount', { count: n })
                                    : t('orderRush.minutes', { count: n })}
                            </Chip>
                        ))}
                    </div>
                </fieldset>

                <fieldset
                    className="flex flex-col gap-2"
                    disabled={!online}
                    data-testid="or-set-picker"
                >
                    <legend className="mb-1 text-sm font-black">
                        {t('orderRush.categories')}
                    </legend>
                    <p className="text-xs font-bold text-slate-600">
                        {selected.length === 0
                            ? t('orderRush.allCategories')
                            : t('orderRush.someCategories', {
                                  count: selected.length,
                              })}
                    </p>
                    <div className="flex flex-wrap gap-1.5">
                        {state.catalog.map((entry) => (
                            <Chip
                                key={entry.key}
                                active={selected.includes(entry.key)}
                                onClick={() => toggleSet(entry.key)}
                            >
                                {entry.kind === 'cable' ? (
                                    <Cable
                                        className="mr-1 size-3.5"
                                        aria-hidden="true"
                                    />
                                ) : (
                                    <Network
                                        className="mr-1 size-3.5"
                                        aria-hidden="true"
                                    />
                                )}
                                {entry.title}
                            </Chip>
                        ))}
                    </div>
                </fieldset>

                {error && <RoomError code={error} />}
                <div className="flex flex-wrap justify-center gap-2">
                    <Button
                        onClick={() => act({ t: 'start_game' })}
                        disabled={!online || !enough}
                        data-testid="or-start"
                        className="min-h-12 rounded-2xl border-3 border-[#1f2a44] bg-[#0f766e] px-6 font-display text-lg font-black text-white shadow-[4px_4px_0px_#1f2a44] hover:bg-[#115e59] disabled:opacity-50"
                    >
                        <Play className="size-5" />
                        {enough
                            ? t('orderRush.start')
                            : t('orderRush.needPlayers', {
                                  min: state.min_players,
                              })}
                    </Button>
                    <Button
                        variant="outline"
                        onClick={() => act({ t: 'leave_room' })}
                        className="min-h-12 rounded-2xl border-2 border-[#1f2a44] bg-white px-4 font-black text-[#1f2a44]"
                    >
                        <DoorOpen className="size-4" />
                        {t('orderRush.closeRoom')}
                    </Button>
                </div>
            </Panel>
            <Panel className="flex flex-col gap-3 lg:col-span-7">
                <h2 className="flex items-center justify-between gap-2 font-display text-lg font-black">
                    {t('orderRush.joined')}
                    <span className="text-sm tabular-nums">
                        {active.length}/{state.max_players}
                    </span>
                </h2>
                {active.length === 0 ? (
                    <p className="rounded-2xl border-2 border-dashed border-[#1f2a44]/40 px-4 py-10 text-center text-sm font-bold text-slate-600">
                        {t('orderRush.waitingPlayers')}
                    </p>
                ) : (
                    <ul
                        className="grid grid-cols-3 gap-2 sm:grid-cols-5 xl:grid-cols-6"
                        data-testid="or-lobby-players"
                    >
                        {active.map((p) => (
                            <li
                                key={p.user_id}
                                className={cn(
                                    'flex min-w-0 flex-col items-center gap-1 rounded-2xl border-2 border-[#1f2a44] bg-white p-1.5',
                                    !p.online && 'opacity-50',
                                )}
                            >
                                <span className="size-12">
                                    <PlayerAvatar
                                        character={p.character}
                                        seat={p.user_id}
                                    />
                                </span>
                                <span className="w-full truncate text-center text-xs font-black">
                                    {p.name}
                                </span>
                            </li>
                        ))}
                    </ul>
                )}
            </Panel>
        </div>
    );
}

function Chip({
    active,
    onClick,
    children,
}: {
    active: boolean;
    onClick: () => void;
    children: ReactNode;
}) {
    return (
        <button
            type="button"
            aria-pressed={active}
            onClick={onClick}
            className={cn(
                'inline-flex min-h-11 items-center rounded-xl border-2 border-[#1f2a44] px-3 text-sm font-black tabular-nums transition-colors',
                active
                    ? 'bg-[#99f6e4] shadow-[2px_2px_0px_#1f2a44]'
                    : 'bg-white hover:bg-[#ccfbf1]',
            )}
            style={active ? { borderColor: ACCENT } : undefined}
        >
            {children}
        </button>
    );
}

function CopyButton({
    onClick,
    icon: Icon,
    label,
    children,
}: {
    onClick: () => void;
    icon: typeof Copy;
    label: string;
    children: ReactNode;
}) {
    return (
        <button
            type="button"
            onClick={onClick}
            aria-label={label}
            title={label}
            className="inline-flex min-h-11 items-center gap-1.5 rounded-xl border-2 border-[#1f2a44] bg-white px-3 text-sm font-black shadow-[2px_2px_0px_#1f2a44] hover:bg-[#ccfbf1]"
        >
            <Icon className="size-4" aria-hidden="true" />
            {children}
        </button>
    );
}

function EndGameButton({ onConfirm }: { onConfirm: () => void }) {
    const { t } = useTranslations();
    const [armed, setArmed] = useState(false);

    useEffect(() => {
        if (!armed) {
            return;
        }
        const timer = window.setTimeout(() => setArmed(false), 4000);
        return () => window.clearTimeout(timer);
    }, [armed]);

    return (
        <div className="flex flex-wrap items-center justify-center gap-2">
            {armed && (
                <p className="text-xs font-bold text-[#AD1457]" role="status">
                    {t('orderRush.endConfirm')}
                </p>
            )}
            <Button
                variant="outline"
                onClick={() => (armed ? onConfirm() : setArmed(true))}
                data-testid="or-end"
                className={cn(
                    'min-h-11 rounded-xl border-2 px-4 text-xs font-black',
                    armed
                        ? 'border-[#AD1457] bg-[#FFEBF0] text-[#AD1457]'
                        : 'border-[#1f2a44]/30 bg-white/70 text-slate-700',
                )}
            >
                <DoorOpen className="size-4" />
                {armed ? t('orderRush.endNow') : t('orderRush.endGame')}
            </Button>
        </div>
    );
}
