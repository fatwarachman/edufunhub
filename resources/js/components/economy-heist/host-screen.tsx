import AdSlot from '@/components/ads/ad-slot';
import {
    ACCENT,
    clock,
    Feed,
    formatGold,
    Leaderboard,
    Panel,
    Podium,
    useRemaining,
} from '@/components/economy-heist/shared';
import {
    ConnectionBadge,
    inviteLink,
    RoomError,
} from '@/components/multiplayer/room';
import {
    type GameSubject,
    isGameSubject,
    SubjectPicker,
} from '@/components/multiplayer/subject-picker';
import { PlayerAvatar } from '@/components/player-avatar';
import { Button } from '@/components/ui/button';
import {
    type HeistState,
    type HeistWin,
    type useEconomyHeist,
} from '@/hooks/use-economy-heist';
import { useTranslations } from '@/hooks/use-translations';
import { cn } from '@/lib/utils';
import { router } from '@inertiajs/react';
import {
    Coins,
    Copy,
    DoorOpen,
    Link2,
    MonitorPlay,
    Play,
    Target,
    Timer,
    UsersRound,
} from 'lucide-react';
import { type ReactNode, useEffect, useState } from 'react';

type Status = ReturnType<typeof useEconomyHeist>['status'];
type Act = (msg: Record<string, unknown>) => void;

/** Teacher / projector screen: lobby, live gold board, ticker and podium. */
export function HostScreen({
    state,
    status,
    error,
    online,
    act,
}: {
    state: HeistState;
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
                    {t('economyHeist.hostIntro')}
                </p>
                <p className="rounded-2xl border-2 border-dashed border-[#1f2a44] px-3 py-2 text-xs font-bold text-slate-600">
                    {t('economyHeist.rules')}
                </p>
                <Button
                    onClick={() => act({ t: 'create_room' })}
                    disabled={status !== 'online'}
                    data-testid="eh-create"
                    className="min-h-12 rounded-2xl border-3 border-[#1f2a44] bg-[#FF9E44] px-6 font-display text-lg font-black text-white shadow-[4px_4px_0px_#1f2a44] hover:bg-[#ff8f29] disabled:opacity-50"
                >
                    <MonitorPlay className="size-5" />
                    {t('economyHeist.createRoom')}
                </Button>
                {state.closed && state.closed !== 'idle' && (
                    <p className="text-xs font-bold text-slate-600">
                        {t('economyHeist.roomClosed')}
                    </p>
                )}
                {error && <RoomError code={error} />}
                <button
                    type="button"
                    onClick={() => router.visit('/games/economy-heist')}
                    className="min-h-11 rounded-xl px-3 text-xs font-black text-slate-600 underline-offset-4 hover:underline"
                >
                    {t('economyHeist.switchRole')}
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

    const header = <HostHeader state={state} status={status} />;

    if (state.phase === 'GAME_OVER') {
        return (
            <Panel className="flex flex-col gap-5">
                {header}
                <Podium state={state} />
                <div className="flex flex-wrap justify-center gap-2">
                    <Button
                        onClick={() => act({ t: 'start_game' })}
                        disabled={!online}
                        data-testid="eh-again"
                        className="min-h-12 rounded-2xl border-3 border-[#1f2a44] bg-[#1f2a44] px-6 font-display font-black text-white shadow-[3px_3px_0px_#FF9E44]"
                    >
                        <Play className="size-5" />
                        {t('economyHeist.again')}
                    </Button>
                    <Button
                        variant="outline"
                        onClick={() => act({ t: 'leave_room' })}
                        className="min-h-12 rounded-2xl border-2 border-[#1f2a44] bg-white px-4 font-black text-[#1f2a44]"
                    >
                        <DoorOpen className="size-4" />
                        {t('economyHeist.closeRoom')}
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
        <div className="flex flex-col gap-4" data-testid="eh-host-arena">
            <Panel className="!p-4 sm:!p-5">{header}</Panel>
            <div className="grid gap-4 lg:grid-cols-12">
                <Panel className="flex flex-col gap-3 lg:col-span-8">
                    <h2 className="flex items-center justify-between gap-2 font-display text-xl font-black">
                        {t('economyHeist.leaderboard')}
                        <span className="inline-flex items-center gap-1.5 text-sm">
                            <UsersRound className="size-4" aria-hidden="true" />
                            {t('economyHeist.playersCount', {
                                count: state.leaderboard.filter((r) => !r.left)
                                    .length,
                            })}
                        </span>
                    </h2>
                    <Leaderboard rows={state.leaderboard} size="lg" />
                </Panel>
                <div className="flex flex-col gap-4 lg:col-span-4">
                    <Panel className="!p-4">
                        <Feed feed={state.feed} limit={10} />
                    </Panel>
                    <AdSlot placement="arena.sidebar" className="w-full" />
                </div>
            </div>
            {error && <RoomError code={error} />}
            <EndGameButton onConfirm={() => act({ t: 'end_game' })} />
        </div>
    );
}

function HostHeader({ state, status }: { state: HeistState; status: Status }) {
    const { t, i18n } = useTranslations();
    const remaining = useRemaining(state);
    const leader = state.leaderboard[0]?.gold ?? 0;
    const goal = state.win === 'GOLD_TARGET';
    const progress = goal
        ? Math.min(1, leader / Math.max(1, state.target_gold))
        : Math.min(1, remaining / Math.max(1, state.minutes * 60000));
    return (
        <div className="flex flex-col gap-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex flex-wrap items-center gap-2">
                    <ConnectionBadge status={status} />
                    <span
                        className="rounded-xl border-2 border-[#1f2a44] bg-[#FFFDE6] px-3 py-1.5 font-display text-sm font-black tracking-widest"
                        data-testid="eh-pin"
                    >
                        PIN {state.pin}
                    </span>
                </div>
                {state.phase === 'PLAYING' && (
                    <span
                        className="inline-flex min-h-11 items-center gap-2 rounded-xl border-2 border-[#1f2a44] bg-white px-3 font-display text-lg font-black tabular-nums"
                        data-testid="eh-clock"
                    >
                        {goal ? (
                            <>
                                <Target className="size-5" aria-hidden="true" />
                                {t('economyHeist.goalProgress', {
                                    amount: formatGold(
                                        state.target_gold,
                                        i18n.language,
                                    ),
                                })}
                            </>
                        ) : (
                            <>
                                <Timer className="size-5" aria-hidden="true" />
                                <span className="sr-only">
                                    {t('economyHeist.timeLeft')}
                                </span>
                                {clock(remaining)}
                            </>
                        )}
                    </span>
                )}
            </div>
            {state.phase === 'PLAYING' && (
                <div
                    className="h-3 overflow-hidden rounded-full border-2 border-[#1f2a44] bg-white"
                    role="progressbar"
                    aria-valuemin={0}
                    aria-valuemax={100}
                    aria-valuenow={Math.round(progress * 100)}
                >
                    <div
                        className="eh-countdown h-full"
                        style={{
                            width: `${progress * 100}%`,
                            background:
                                !goal && progress < 0.2 ? '#e11d48' : ACCENT,
                        }}
                    />
                </div>
            )}
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
    state: HeistState;
    status: Status;
    error: string | null;
    online: boolean;
    act: Act;
}) {
    const { t, i18n } = useTranslations();
    const [subject, setSubject] = useState<GameSubject>('mix');
    const [copied, setCopied] = useState<string | null>(null);
    const link = inviteLink('economy-heist', state.pin ?? '');
    const active = state.players.filter((p) => !p.left);
    const enough = active.length >= state.min_players;
    const roomSubject = isGameSubject(state.subject ?? '')
        ? (state.subject as GameSubject)
        : subject;

    const copy = async (kind: string, text: string) => {
        try {
            await navigator.clipboard.writeText(text);
            setCopied(kind);
            setTimeout(() => setCopied(null), 1600);
        } catch {
            setCopied(null);
        }
    };
    const configure = (win: HeistWin, value: number) =>
        act({ t: 'configure', win, value });

    return (
        <div className="grid gap-5 lg:grid-cols-12" data-testid="eh-host-lobby">
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
                        {t('economyHeist.winCondition')}
                    </legend>
                    <div className="grid grid-cols-2 gap-2">
                        {(
                            [
                                [
                                    'TIME_LIMIT',
                                    Timer,
                                    t('economyHeist.winTime'),
                                ],
                                [
                                    'GOLD_TARGET',
                                    Coins,
                                    t('economyHeist.winGold'),
                                ],
                            ] as const
                        ).map(([win, Icon, label]) => (
                            <button
                                key={win}
                                type="button"
                                aria-pressed={state.win === win}
                                data-testid={`eh-win-${win}`}
                                onClick={() =>
                                    configure(
                                        win,
                                        win === 'TIME_LIMIT'
                                            ? state.minutes
                                            : state.target_gold,
                                    )
                                }
                                className={cn(
                                    'inline-flex min-h-11 items-center justify-center gap-1.5 rounded-xl border-2 border-[#1f2a44] px-3 text-sm font-black transition-colors',
                                    state.win === win
                                        ? 'bg-[#1f2a44] text-white'
                                        : 'bg-white hover:bg-[#FFF176]',
                                )}
                            >
                                <Icon className="size-4" aria-hidden="true" />
                                {label}
                            </button>
                        ))}
                    </div>
                    <div className="flex flex-wrap gap-1.5" role="group">
                        {state.win === 'TIME_LIMIT'
                            ? state.time_limits.map((minutes) => (
                                  <Chip
                                      key={minutes}
                                      active={state.minutes === minutes}
                                      onClick={() =>
                                          configure('TIME_LIMIT', minutes)
                                      }
                                  >
                                      {t('economyHeist.minutes', {
                                          count: minutes,
                                      })}
                                  </Chip>
                              ))
                            : state.gold_targets.map((gold) => (
                                  <Chip
                                      key={gold}
                                      active={state.target_gold === gold}
                                      onClick={() =>
                                          configure('GOLD_TARGET', gold)
                                      }
                                  >
                                      {formatGold(gold, i18n.language)}
                                  </Chip>
                              ))}
                    </div>
                    <p
                        className="text-xs font-bold text-slate-600"
                        data-testid="eh-win-label"
                    >
                        {state.win === 'TIME_LIMIT'
                            ? t('economyHeist.timeLabel', {
                                  count: state.minutes,
                              })
                            : t('economyHeist.targetLabel', {
                                  amount: formatGold(
                                      state.target_gold,
                                      i18n.language,
                                  ),
                              })}
                    </p>
                </fieldset>

                <SubjectPicker
                    value={roomSubject}
                    onChange={(value) => {
                        setSubject(value);
                        act({ t: 'set_subject', subject: value });
                    }}
                    disabled={!online}
                    compact
                />
                {error && <RoomError code={error} />}
                <div className="flex flex-wrap justify-center gap-2">
                    <Button
                        onClick={() => act({ t: 'start_game' })}
                        disabled={!online || !enough}
                        data-testid="eh-start"
                        className="min-h-12 rounded-2xl border-3 border-[#1f2a44] bg-[#FF9E44] px-6 font-display text-lg font-black text-white shadow-[4px_4px_0px_#1f2a44] hover:bg-[#ff8f29] disabled:opacity-50"
                    >
                        <Play className="size-5" />
                        {enough
                            ? t('economyHeist.start')
                            : t('economyHeist.needPlayers', {
                                  min: state.min_players,
                              })}
                    </Button>
                    <Button
                        variant="outline"
                        onClick={() => act({ t: 'leave_room' })}
                        className="min-h-12 rounded-2xl border-2 border-[#1f2a44] bg-white px-4 font-black text-[#1f2a44]"
                    >
                        <DoorOpen className="size-4" />
                        {t('economyHeist.closeRoom')}
                    </Button>
                </div>
            </Panel>
            <Panel className="flex flex-col gap-3 lg:col-span-7">
                <h2 className="flex items-center justify-between gap-2 font-display text-lg font-black">
                    {t('economyHeist.joined')}
                    <span className="text-sm tabular-nums">
                        {active.length}/{state.max_players}
                    </span>
                </h2>
                {active.length === 0 ? (
                    <p className="rounded-2xl border-2 border-dashed border-[#1f2a44]/40 px-4 py-10 text-center text-sm font-bold text-slate-600">
                        {t('economyHeist.waitingPlayers')}
                    </p>
                ) : (
                    <ul
                        className="grid grid-cols-3 gap-2 sm:grid-cols-5 xl:grid-cols-6"
                        data-testid="eh-lobby-players"
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
                    ? 'bg-[#ffd93d] shadow-[2px_2px_0px_#1f2a44]'
                    : 'bg-white hover:bg-[#FFF176]',
            )}
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
            className="inline-flex min-h-11 items-center gap-1.5 rounded-xl border-2 border-[#1f2a44] bg-white px-3 text-sm font-black shadow-[2px_2px_0px_#1f2a44] hover:bg-[#FFF176]"
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
                    {t('economyHeist.endConfirm')}
                </p>
            )}
            <Button
                variant="outline"
                onClick={() => (armed ? onConfirm() : setArmed(true))}
                data-testid="eh-end"
                className={cn(
                    'min-h-11 rounded-xl border-2 px-4 text-xs font-black',
                    armed
                        ? 'border-[#AD1457] bg-[#FFEBF0] text-[#AD1457]'
                        : 'border-[#1f2a44]/30 bg-white/70 text-slate-700',
                )}
            >
                <DoorOpen className="size-4" />
                {armed ? t('economyHeist.endNow') : t('economyHeist.endGame')}
            </Button>
        </div>
    );
}
