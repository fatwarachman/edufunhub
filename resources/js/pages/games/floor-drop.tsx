import AdSlot from '@/components/ads/ad-slot';
import GameAdStrip from '@/components/ads/game-ad-strip';
import {
    ConnectionBadge,
    inviteLink,
    RoomEntry,
    RoomError,
    useRoomPin,
} from '@/components/multiplayer/room';
import {
    type GameSubject,
    isGameSubject,
    SubjectPicker,
} from '@/components/multiplayer/subject-picker';
import { PlayerAvatar } from '@/components/player-avatar';
import { BackButton, SiteNav, useGameBackHref } from '@/components/site-nav';
import { Button } from '@/components/ui/button';
import {
    type FloorPlayer,
    type FloorRanking,
    type FloorRole,
    type FloorState,
    useFloorDrop,
} from '@/hooks/use-floor-drop';
import { useGameAudio } from '@/hooks/use-game-audio';
import { useTranslations } from '@/hooks/use-translations';
import { useAdMoments } from '@/lib/ads';
import { cn } from '@/lib/utils';
import { Head, router } from '@inertiajs/react';
import {
    Check,
    Coins,
    Copy,
    Crown,
    DoorOpen,
    Eye,
    Layers,
    Link2,
    MonitorPlay,
    Play,
    Smartphone,
    Timer,
    Trophy,
    UsersRound,
    Volume2,
    VolumeX,
    WifiOff,
    X,
} from 'lucide-react';
import {
    type ReactNode,
    useCallback,
    useEffect,
    useMemo,
    useRef,
    useState,
} from 'react';
import '../../../css/floor-drop.css';

interface FloorDropProps {
    player: { name: string; grade: number | null };
    points: number;
    serviceReady: boolean;
    wsUrl: string | null;
    pin: string | null;
    /** Chosen role from `?role=`; invite links open as a player. */
    role: FloorRole | null;
}

const LETTERS = ['A', 'B', 'C', 'D'];
/** High-contrast tile colours (white text passes AA on each). */
const TILE_COLORS = ['#c2185b', '#1565c0', '#b45309', '#2e7d32'];
const ACCENT = '#2563eb';
const BG = '#eef4ff';
/** Avatars drawn per tile on the host screen before collapsing into "+N". */
const TILE_AVATARS = 24;

function useNow(active: boolean): number {
    const [now, setNow] = useState(() => Date.now());
    useEffect(() => {
        if (!active) {
            return;
        }
        const id = setInterval(() => setNow(Date.now()), 100);
        return () => clearInterval(id);
    }, [active]);
    return now;
}

/** Remaining answer time derived from the last server snapshot. */
function useRemaining(state: FloorState): number {
    const active = state.phase === 'QUESTION_ACTIVE';
    const now = useNow(active);
    if (!active) {
        return 0;
    }
    return Math.max(0, (state.remaining_ms ?? 0) - (now - state.receivedAt));
}

function seconds(ms: number): number {
    return Math.max(0, Math.ceil(ms / 1000));
}

export default function FloorDrop({
    player,
    points,
    serviceReady,
    wsUrl,
    pin,
    role,
}: FloorDropProps) {
    const { t, i18n } = useTranslations();
    const backHref = useGameBackHref();
    const { play, muted, toggleMuted } = useGameAudio();
    const [error, setError] = useState<string | null>(null);
    const playRef = useRef(play);
    useEffect(() => {
        playRef.current = play;
    }, [play]);
    const youRef = useRef<number | null>(null);

    const onEvent = useCallback((msg: Record<string, unknown>) => {
        if (msg.t === 'tile_drop') {
            const out = (msg.eliminated_user_ids ?? []) as number[];
            const you = youRef.current;
            playRef.current(
                you !== null && out.includes(you) ? 'wrong' : 'correct',
            );
        }
        if (msg.t === 'question_start') {
            playRef.current('step');
        }
    }, []);
    const onError = useCallback((code: string) => setError(code), []);
    const chosenRole: FloorRole | null = role ?? (pin ? 'player' : null);
    const { state, status, send } = useFloorDrop(
        serviceReady && chosenRole ? wsUrl : null,
        chosenRole ?? 'player',
        i18n.language,
        onError,
        onEvent,
    );
    useEffect(() => {
        youRef.current = state.you?.user_id ?? null;
    }, [state.you?.user_id]);

    const online = status === 'online';
    const act = (msg: Record<string, unknown>) => {
        setError(null);
        if (!send(msg)) {
            setError('unknown');
        }
    };
    const join = useCallback(
        (code: string) => send({ t: 'join_room', pin: code }),
        [send],
    );
    useRoomPin(
        online && chosenRole === 'player',
        state.pin,
        chosenRole === 'player' ? pin : null,
        join,
    );

    const playing = !['NONE', 'LOBBY', 'GAME_OVER'].includes(state.phase);
    useAdMoments(
        playing ? 'playing' : state.phase === 'GAME_OVER' ? 'done' : 'idle',
        { muted, won: state.result?.won ?? false },
    );

    const title = t('floorDrop.title');
    let body: ReactNode;
    if (!serviceReady || status === 'offline') {
        body = (
            <Notice icon={<WifiOff className="size-10" />}>
                {t('mini.unavailable')}
            </Notice>
        );
    } else if (!chosenRole) {
        body = <RolePicker />;
    } else if (chosenRole === 'host') {
        body = (
            <HostScreen
                state={state}
                status={status}
                error={error}
                online={online}
                act={act}
            />
        );
    } else {
        body = (
            <PlayerScreen
                state={state}
                status={status}
                error={error}
                online={online}
                name={player.name}
                act={act}
            />
        );
    }

    return (
        <div
            className="min-h-dvh text-[#1f2a44]"
            style={{ background: BG }}
            data-testid="floor-drop"
            data-role={chosenRole ?? 'none'}
            data-phase={state.phase}
        >
            <Head title={`${title} — EduFunHub`} />
            <header
                className="sticky top-0 z-30 border-b-4 border-[#1f2a44] backdrop-blur-md"
                style={{ background: `${BG}f2` }}
            >
                <div className="mx-auto flex min-h-16 items-center justify-between gap-2 px-3 py-2 sm:px-6 lg:px-8">
                    <div className="flex min-w-0 flex-1 items-center gap-2 sm:gap-3">
                        <BackButton
                            href={backHref}
                            label={t('nav.backToPortal')}
                            iconOnly
                        />
                        <span
                            className="hidden size-10 shrink-0 place-items-center rounded-xl border-2 border-[#1f2a44] text-white shadow-[2px_2px_0px_#1f2a44] sm:grid"
                            style={{ background: ACCENT }}
                        >
                            <Layers className="size-5" aria-hidden="true" />
                        </span>
                        <div className="flex min-w-0 flex-col">
                            <h1 className="truncate font-display text-lg font-black sm:text-2xl">
                                {title}
                            </h1>
                            <span className="hidden truncate text-xs font-bold text-slate-600 sm:block">
                                {t('floorDrop.tagline')}
                            </span>
                        </div>
                    </div>
                    <div className="flex shrink-0 items-center gap-1.5">
                        {chosenRole === 'player' && (
                            <span
                                className="hidden min-h-11 items-center gap-1.5 rounded-xl border-2 border-[#1f2a44] bg-[#ffd93d] px-3 text-sm font-black sm:inline-flex"
                                data-testid="fd-total-points"
                            >
                                <Coins className="size-4" />
                                {t('mini.points', {
                                    count:
                                        points +
                                        (state.phase === 'GAME_OVER'
                                            ? (state.result?.points ?? 0)
                                            : 0),
                                })}
                            </span>
                        )}
                        <button
                            type="button"
                            onClick={toggleMuted}
                            aria-pressed={!muted}
                            aria-label={
                                muted
                                    ? t('snakes.sound.off')
                                    : t('snakes.sound.on')
                            }
                            className="edu-nav-btn edu-nav-btn--icon"
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
            <main className="mx-auto flex flex-col gap-4 px-3 py-5 sm:px-6 lg:px-8">
                <GameAdStrip />
                {body}
            </main>
        </div>
    );
}

function chooseRole(role: FloorRole) {
    router.visit(`/games/floor-drop?role=${role}`, { preserveScroll: true });
}

function Panel({
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

function Notice({ icon, children }: { icon: ReactNode; children: ReactNode }) {
    return (
        <Panel className="mx-auto flex max-w-xl flex-col items-center gap-3 text-center font-bold">
            {icon}
            {children}
        </Panel>
    );
}

function RolePicker() {
    const { t } = useTranslations();
    const roles: {
        role: FloorRole;
        icon: typeof MonitorPlay;
        title: string;
        body: string;
        cta: string;
        tone: string;
    }[] = [
        {
            role: 'host',
            icon: MonitorPlay,
            title: t('floorDrop.hostTitle'),
            body: t('floorDrop.hostBody'),
            cta: t('floorDrop.openHost'),
            tone: '#dbeafe',
        },
        {
            role: 'player',
            icon: Smartphone,
            title: t('floorDrop.playerTitle'),
            body: t('floorDrop.playerBody'),
            cta: t('floorDrop.openPlayer'),
            tone: '#fef3c7',
        },
    ];
    return (
        <div
            className="mx-auto flex w-full max-w-3xl flex-col gap-4"
            data-testid="fd-role-picker"
        >
            <h2 className="text-center font-display text-2xl font-black">
                {t('floorDrop.chooseRole')}
            </h2>
            <div className="grid gap-4 sm:grid-cols-2">
                {roles.map(({ role, icon: Icon, title, body, cta, tone }) => (
                    <button
                        key={role}
                        type="button"
                        onClick={() => chooseRole(role)}
                        data-testid={`fd-role-${role}`}
                        className="flex flex-col items-start gap-3 rounded-3xl border-3 border-[#1f2a44] bg-white p-5 text-left shadow-[5px_5px_0px_#1f2a44] transition-transform hover:-translate-y-0.5 focus-visible:ring-4 focus-visible:ring-[#2563eb]/40 focus-visible:outline-none"
                    >
                        <span
                            className="grid size-12 place-items-center rounded-2xl border-2 border-[#1f2a44]"
                            style={{ background: tone }}
                        >
                            <Icon className="size-6" aria-hidden="true" />
                        </span>
                        <span className="font-display text-xl font-black">
                            {title}
                        </span>
                        <span className="text-sm font-bold text-slate-600">
                            {body}
                        </span>
                        <span className="mt-auto inline-flex min-h-11 items-center gap-1.5 rounded-xl border-2 border-[#1f2a44] bg-[#1f2a44] px-4 font-display text-sm font-black text-white">
                            <Play className="size-4" aria-hidden="true" />
                            {cta}
                        </span>
                    </button>
                ))}
            </div>
            <p className="rounded-2xl border-2 border-dashed border-[#1f2a44] bg-white/70 px-4 py-3 text-center text-sm font-bold text-slate-700">
                {t('floorDrop.rules')}
            </p>
        </div>
    );
}

function TimerBar({ state }: { state: FloorState }) {
    const { t } = useTranslations();
    const remaining = useRemaining(state);
    const limit = state.time_limit ?? 1;
    const fraction = state.phase === 'QUESTION_ACTIVE' ? remaining / limit : 0;
    return (
        <div className="flex items-center gap-3" data-testid="fd-timer">
            <span
                className={cn(
                    'inline-flex min-h-10 min-w-20 items-center justify-center gap-1.5 rounded-xl border-2 border-[#1f2a44] px-3 font-display text-lg font-black tabular-nums',
                    fraction < 0.3 ? 'bg-[#ffe1e1]' : 'bg-white',
                )}
                aria-live="off"
            >
                <Timer className="size-4" aria-hidden="true" />
                {t('floorDrop.secondsLeft', { seconds: seconds(remaining) })}
            </span>
            <div
                className="h-3 flex-1 overflow-hidden rounded-full border-2 border-[#1f2a44] bg-white"
                role="progressbar"
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={Math.round(fraction * 100)}
            >
                <div
                    className="fd-countdown h-full"
                    style={{
                        width: `${fraction * 100}%`,
                        background: fraction < 0.3 ? '#e11d48' : ACCENT,
                    }}
                />
            </div>
        </div>
    );
}

function tileState(
    state: FloorState,
    index: number,
): 'open' | 'locked' | 'correct' | 'dropped' {
    if (state.phase === 'LOCK_ANSWERS') {
        return 'locked';
    }
    if (
        (state.phase === 'REVEAL_DROP' || state.phase === 'ROUND_SUMMARY') &&
        state.correct_index !== undefined
    ) {
        return index === state.correct_index ? 'correct' : 'dropped';
    }
    return 'open';
}

function StatusLine({ state }: { state: FloorState }) {
    const { t } = useTranslations();
    let text = '';
    if (state.phase === 'QUESTION_ACTIVE') {
        text = t('floorDrop.answered', {
            answered: state.answered,
            alive: state.alive,
        });
    } else if (state.phase === 'LOCK_ANSWERS') {
        text = t('floorDrop.locked');
    } else if (state.phase === 'REVEAL_DROP') {
        text = state.sudden_death
            ? t('floorDrop.suddenDeath')
            : `${t('floorDrop.eliminatedNow', { count: state.eliminated_user_ids?.length ?? 0 })} · ${t('floorDrop.survivors', { count: state.alive })}`;
    } else if (state.phase === 'ROUND_SUMMARY') {
        text =
            state.round === 0
                ? t('floorDrop.getReady')
                : t('floorDrop.nextFaster', {
                      seconds: seconds(state.next_time_limit ?? 0),
                  });
    }
    return (
        <p
            className="min-h-11 rounded-xl bg-[#eef4ff] px-3 py-2.5 text-center text-sm font-black"
            aria-live="polite"
            data-testid="fd-status"
        >
            {text}
            {state.hint && state.phase === 'REVEAL_DROP' && (
                <span className="block text-xs font-bold text-slate-600">
                    {state.hint}
                </span>
            )}
        </p>
    );
}

/** Teacher / projector screen: everyone standing on the four tiles. */
function HostScreen({
    state,
    status,
    error,
    online,
    act,
}: {
    state: FloorState;
    status: ReturnType<typeof useFloorDrop>['status'];
    error: string | null;
    online: boolean;
    act: (msg: Record<string, unknown>) => void;
}) {
    const { t } = useTranslations();
    const [subject, setSubject] = useState<GameSubject>('mix');
    const [copied, setCopied] = useState<string | null>(null);

    if (state.phase === 'NONE' || !state.pin) {
        return (
            <RoomEntryHost
                status={status}
                error={error}
                closed={state.closed}
                onCreate={() => act({ t: 'create_room' })}
            />
        );
    }

    const copy = async (kind: string, text: string) => {
        try {
            await navigator.clipboard.writeText(text);
            setCopied(kind);
            setTimeout(() => setCopied(null), 1600);
        } catch {
            setCopied(null);
        }
    };

    const roomSubject = isGameSubject(state.subject ?? '')
        ? (state.subject as GameSubject)
        : subject;
    const header = (
        <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex flex-wrap items-center gap-2">
                <ConnectionBadge status={status} />
                <span
                    className="rounded-xl border-2 border-[#1f2a44] bg-[#FFFDE6] px-3 py-1.5 font-display text-sm font-black tracking-widest"
                    data-testid="fd-pin"
                >
                    PIN {state.pin}
                </span>
                <span className="inline-flex min-h-9 items-center gap-1.5 rounded-xl border-2 border-[#1f2a44] bg-white px-3 text-xs font-black">
                    <UsersRound className="size-4" aria-hidden="true" />
                    {t('floorDrop.playersCount', {
                        count: state.players.filter((p) => !p.left).length,
                    })}
                </span>
            </div>
            {state.phase !== 'LOBBY' && state.phase !== 'GAME_OVER' && (
                <span className="font-display text-sm font-black">
                    {t('floorDrop.round', { round: Math.max(1, state.round) })}{' '}
                    · {t('floorDrop.alive', { count: state.alive })}
                </span>
            )}
        </div>
    );

    if (state.phase === 'LOBBY') {
        const link = inviteLink('floor-drop', state.pin);
        const active = state.players.filter((p) => !p.left);
        const enough = active.length >= state.min_players;
        return (
            <div
                className="grid gap-5 lg:grid-cols-12"
                data-testid="fd-host-lobby"
            >
                <Panel className="flex flex-col gap-4 lg:col-span-5">
                    {header}
                    <div className="rounded-2xl border-3 border-dashed border-[#1f2a44] bg-[#FFFDE6] p-4 text-center">
                        <p className="text-sm font-black">
                            {t('room.shareTitle')}
                        </p>
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
                            >
                                {copied === 'pin'
                                    ? t('room.copied')
                                    : t('room.copyPin')}
                            </CopyButton>
                            <CopyButton
                                onClick={() => copy('link', link)}
                                icon={Link2}
                            >
                                {copied === 'link'
                                    ? t('room.copied')
                                    : t('room.copyLink')}
                            </CopyButton>
                        </div>
                    </div>
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
                            data-testid="fd-start"
                            className="min-h-12 rounded-2xl border-3 border-[#1f2a44] bg-[#FF9E44] px-6 font-display text-lg font-black text-white shadow-[4px_4px_0px_#1f2a44] hover:bg-[#ff8f29] disabled:opacity-50"
                        >
                            <Play className="size-5" />
                            {enough
                                ? t('floorDrop.start')
                                : t('floorDrop.needPlayers', {
                                      min: state.min_players,
                                  })}
                        </Button>
                        <Button
                            variant="outline"
                            onClick={() => act({ t: 'leave_room' })}
                            className="min-h-12 rounded-2xl border-2 border-[#1f2a44] bg-white px-4 font-black text-[#1f2a44]"
                        >
                            <DoorOpen className="size-4" />
                            {t('floorDrop.closeRoom')}
                        </Button>
                    </div>
                </Panel>
                <Panel className="flex flex-col gap-3 lg:col-span-7">
                    <h2 className="flex items-center justify-between gap-2 font-display text-lg font-black">
                        {t('floorDrop.joined')}
                        <span className="text-sm tabular-nums">
                            {active.length}/{state.max_players}
                        </span>
                    </h2>
                    {active.length === 0 ? (
                        <p className="rounded-2xl border-2 border-dashed border-[#1f2a44]/40 px-4 py-10 text-center text-sm font-bold text-slate-600">
                            {t('floorDrop.waitingPlayers')}
                        </p>
                    ) : (
                        <ul
                            className="grid grid-cols-3 gap-2 sm:grid-cols-5 xl:grid-cols-6"
                            data-testid="fd-lobby-players"
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

    if (state.phase === 'GAME_OVER') {
        return (
            <Panel className="flex flex-col gap-5">
                {header}
                <Podium state={state} />
                <div className="flex flex-wrap justify-center gap-2">
                    <Button
                        onClick={() => act({ t: 'start_game' })}
                        disabled={!online}
                        data-testid="fd-again"
                        className="min-h-12 rounded-2xl border-3 border-[#1f2a44] bg-[#1f2a44] px-6 font-display font-black text-white shadow-[3px_3px_0px_#FF9E44]"
                    >
                        <Play className="size-5" />
                        {t('floorDrop.again')}
                    </Button>
                    <Button
                        variant="outline"
                        onClick={() => act({ t: 'leave_room' })}
                        className="min-h-12 rounded-2xl border-2 border-[#1f2a44] bg-white px-4 font-black"
                    >
                        <DoorOpen className="size-4" />
                        {t('floorDrop.closeRoom')}
                    </Button>
                </div>
                <AdSlot
                    placement="arena.result"
                    className="mx-auto w-full max-w-md"
                />
            </Panel>
        );
    }

    return (
        <div className="flex flex-col gap-4" data-testid="fd-host-arena">
            <Panel className="flex flex-col gap-4">
                {header}
                {state.round === 0 && state.phase === 'ROUND_SUMMARY' ? (
                    <div className="flex flex-col items-center gap-2 py-10">
                        <p className="font-bold">{t('floorDrop.getReady')}</p>
                        <span
                            className="font-display text-7xl font-black tabular-nums"
                            style={{ color: ACCENT }}
                        >
                            {Math.max(1, seconds(state.ready_ms ?? 0))}
                        </span>
                        <AdSlot
                            placement="arena.loading"
                            className="w-full max-w-md"
                        />
                    </div>
                ) : (
                    <>
                        <TimerBar state={state} />
                        <h2
                            className="text-center font-display text-2xl leading-snug font-black sm:text-3xl"
                            data-testid="fd-question"
                        >
                            {state.question?.text}
                        </h2>
                    </>
                )}
            </Panel>
            {state.options && state.round > 0 && (
                <div
                    className="grid grid-cols-2 gap-2 overflow-hidden px-0.5 pt-1 pr-2 pb-2 sm:gap-3"
                    data-testid="fd-floor"
                >
                    {state.options.map((text, index) => (
                        <HostTile
                            key={`${state.round_id}-${index}`}
                            index={index}
                            text={text}
                            state={state}
                        />
                    ))}
                </div>
            )}
            {state.round > 0 && <StatusLine state={state} />}
            <Undecided state={state} />
            {error && <RoomError code={error} />}
            <EndGameButton onConfirm={() => act({ t: 'leave_room' })} />
        </div>
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
                    {t('floorDrop.endConfirm')}
                </p>
            )}
            <Button
                variant="outline"
                onClick={() => (armed ? onConfirm() : setArmed(true))}
                data-testid="fd-end"
                className={cn(
                    'min-h-11 rounded-xl border-2 px-4 text-xs font-black',
                    armed
                        ? 'border-[#AD1457] bg-[#FFEBF0] text-[#AD1457]'
                        : 'border-[#1f2a44]/30 bg-white/70 text-slate-700',
                )}
            >
                <DoorOpen className="size-4" />
                {armed ? t('floorDrop.endNow') : t('floorDrop.endGame')}
            </Button>
        </div>
    );
}

function CopyButton({
    onClick,
    icon: Icon,
    children,
}: {
    onClick: () => void;
    icon: typeof Copy;
    children: ReactNode;
}) {
    return (
        <button
            type="button"
            onClick={onClick}
            className="inline-flex min-h-11 items-center gap-1.5 rounded-xl border-2 border-[#1f2a44] bg-white px-3 text-sm font-black shadow-[2px_2px_0px_#1f2a44] hover:bg-[#FFF176]"
        >
            <Icon className="size-4" aria-hidden="true" />
            {children}
        </button>
    );
}

function RoomEntryHost({
    status,
    error,
    closed,
    onCreate,
}: {
    status: ReturnType<typeof useFloorDrop>['status'];
    error: string | null;
    closed?: string;
    onCreate: () => void;
}) {
    const { t } = useTranslations();
    return (
        <Panel className="mx-auto flex w-full max-w-xl flex-col items-center gap-4 text-center">
            <ConnectionBadge status={status} />
            <p className="text-sm font-bold text-slate-700">
                {t('floorDrop.hostIntro')}
            </p>
            <p className="rounded-2xl border-2 border-dashed border-[#1f2a44] px-3 py-2 text-xs font-bold text-slate-600">
                {t('floorDrop.rules')}
            </p>
            <Button
                onClick={onCreate}
                disabled={status !== 'online'}
                data-testid="fd-create"
                className="min-h-12 rounded-2xl border-3 border-[#1f2a44] bg-[#FF9E44] px-6 font-display text-lg font-black text-white shadow-[4px_4px_0px_#1f2a44] hover:bg-[#ff8f29] disabled:opacity-50"
            >
                <MonitorPlay className="size-5" />
                {t('floorDrop.createRoom')}
            </Button>
            {closed && closed !== 'idle' && (
                <p className="text-xs font-bold text-slate-600">
                    {t('floorDrop.roomClosed')}
                </p>
            )}
            {error && <RoomError code={error} />}
            <RoleSwitch />
        </Panel>
    );
}

function RoleSwitch() {
    const { t } = useTranslations();
    return (
        <button
            type="button"
            onClick={() => router.visit('/games/floor-drop')}
            className="min-h-11 rounded-xl px-3 text-xs font-black text-slate-600 underline-offset-4 hover:underline"
        >
            {t('floorDrop.switchRole')}
        </button>
    );
}

/** One quadrant of the floor with the avatars standing on it. */
function HostTile({
    index,
    text,
    state,
}: {
    index: number;
    text: string;
    state: FloorState;
}) {
    const { t } = useTranslations();
    const mode = tileState(state, index);
    const standing = state.players.filter(
        (p) =>
            p.choice === index &&
            (p.alive || state.eliminated_user_ids?.includes(p.user_id)),
    );
    const shown = standing.slice(0, TILE_AVATARS);
    const count = state.tiles?.[index] ?? standing.length;

    return (
        <article
            className="fd-tile flex min-h-28 flex-col gap-2 rounded-2xl border-3 border-[#1f2a44] p-2.5 text-white shadow-[4px_4px_0px_#1f2a44] sm:min-h-44 sm:gap-3 sm:rounded-3xl sm:p-4"
            style={{ background: TILE_COLORS[index] }}
            data-state={mode}
            data-testid={`fd-tile-${index}`}
            aria-label={t('floorDrop.tile', { letter: LETTERS[index], text })}
        >
            <header className="flex items-start gap-2 sm:gap-3">
                <span className="grid size-8 shrink-0 place-items-center rounded-lg border-2 border-[#1f2a44] bg-white font-display text-base font-black text-[#1f2a44] sm:size-10 sm:rounded-xl sm:text-xl">
                    {mode === 'correct' ? (
                        <Check
                            className="size-5"
                            aria-label={t('floorDrop.correctTile')}
                        />
                    ) : mode === 'dropped' ? (
                        <X className="size-5" aria-hidden="true" />
                    ) : (
                        LETTERS[index]
                    )}
                </span>
                <span className="min-w-0 flex-1 self-center font-display text-xl leading-snug font-black break-words sm:text-3xl">
                    {text}
                </span>
                {mode !== 'open' && (
                    <span className="shrink-0 rounded-full border-2 border-white bg-white/15 px-2.5 py-0.5 text-sm font-black tabular-nums">
                        {count}
                    </span>
                )}
            </header>
            <ul className="fd-crowd flex flex-wrap gap-1" aria-hidden="true">
                {shown.map((p) => (
                    <li
                        key={p.user_id}
                        className="fd-avatar size-7 rounded-full bg-white/90 p-0.5 sm:size-9"
                        title={p.name}
                    >
                        <PlayerAvatar
                            character={p.character}
                            seat={p.user_id}
                        />
                    </li>
                ))}
                {standing.length > shown.length && (
                    <li className="grid size-7 place-items-center rounded-full border-2 border-white text-[10px] font-black sm:size-9 sm:text-xs">
                        +{standing.length - shown.length}
                    </li>
                )}
            </ul>
        </article>
    );
}

/** Survivors who have not picked a tile yet (host screen, during a round). */
function Undecided({ state }: { state: FloorState }) {
    const { t } = useTranslations();
    const alive = state.players.filter((p) => p.alive && !p.left);
    const out = state.players.filter((p) => !p.alive);
    return (
        <Panel className="flex flex-col gap-3 !p-4">
            <div className="flex flex-wrap items-center justify-between gap-2 text-sm font-black">
                <span>{t('floorDrop.alive', { count: alive.length })}</span>
                <span className="text-slate-600">
                    {t('floorDrop.eliminatedNow', { count: out.length })}
                </span>
            </div>
            <ul className="flex flex-wrap gap-1.5" data-testid="fd-survivors">
                {alive.map((p) => (
                    <SurvivorChip key={p.user_id} player={p} />
                ))}
                {out.map((p) => (
                    <SurvivorChip key={p.user_id} player={p} />
                ))}
            </ul>
        </Panel>
    );
}

function SurvivorChip({ player }: { player: FloorPlayer }) {
    return (
        <li
            className="fd-avatar inline-flex max-w-40 items-center gap-1.5 rounded-full border-2 border-[#1f2a44] bg-white py-0.5 pr-2.5 pl-0.5"
            data-out={!player.alive}
            title={player.name}
        >
            <span className="size-7 shrink-0">
                <PlayerAvatar
                    character={player.character}
                    seat={player.user_id}
                />
            </span>
            <span className="truncate text-xs font-black">{player.name}</span>
            {!player.online && player.alive && (
                <WifiOff
                    className="size-3.5 shrink-0 text-[#AD1457]"
                    aria-hidden="true"
                />
            )}
        </li>
    );
}

function Podium({ state }: { state: FloorState }) {
    const { t } = useTranslations();
    const podium = state.podium ?? [];
    const order = [podium[1], podium[0], podium[2]].filter(
        (p): p is FloorRanking => Boolean(p),
    );
    const heights: Record<number, string> = { 1: 'h-28', 2: 'h-20', 3: 'h-12' };
    const winner = podium[0];

    return (
        <div className="flex flex-col gap-5" data-testid="fd-podium">
            <h2 className="text-center font-display text-2xl font-black">
                {winner
                    ? t('floorDrop.winner', { name: winner.name })
                    : t('floorDrop.podium')}
            </h2>
            <ol className="mx-auto flex w-full max-w-xl items-end justify-center gap-2 border-b-4 border-[#1f2a44] px-1 sm:gap-3 sm:px-4">
                {order.map((p) => (
                    <li
                        key={p.user_id}
                        className="flex min-w-0 flex-1 basis-0 flex-col items-center gap-1.5 sm:max-w-44"
                    >
                        <span className="relative size-14 sm:size-24">
                            <PlayerAvatar
                                character={p.character}
                                seat={p.user_id}
                            />
                            {p.rank === 1 && (
                                <Crown
                                    className="absolute -top-4 left-1/2 size-8 -translate-x-1/2 fill-[#ffd93d] text-[#b45309]"
                                    aria-hidden="true"
                                />
                            )}
                        </span>
                        <span className="w-full truncate text-center text-sm font-black">
                            {p.name}
                        </span>
                        <span
                            className={cn(
                                'flex w-full items-start justify-center rounded-t-2xl border-3 border-[#1f2a44] pt-2 font-display text-2xl font-black',
                                heights[p.rank] ?? 'h-12',
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

function Ranking({ ranking, you }: { ranking: FloorRanking[]; you?: number }) {
    const { t } = useTranslations();
    if (ranking.length === 0) {
        return null;
    }
    return (
        <div className="mx-auto flex w-full max-w-3xl flex-col gap-2">
            <h3 className="text-sm font-black text-slate-600 uppercase">
                {t('floorDrop.ranking')}
            </h3>
            <ol
                className="flex max-h-80 flex-col divide-y divide-[#1f2a44]/10 overflow-y-auto rounded-2xl border-2 border-[#1f2a44]"
                data-testid="fd-ranking"
            >
                {ranking.map((p) => (
                    <li
                        key={p.user_id}
                        className={cn(
                            'flex items-center gap-2 px-3 py-2 text-sm sm:gap-3',
                            p.user_id === you && 'bg-[#fff7d1]',
                        )}
                    >
                        <span className="w-8 shrink-0 font-display font-black tabular-nums">
                            {t('floorDrop.rank', { rank: p.rank })}
                        </span>
                        <span className="size-8 shrink-0">
                            <PlayerAvatar
                                character={p.character}
                                seat={p.user_id}
                            />
                        </span>
                        <span className="min-w-0 flex-1 truncate font-black">
                            {p.name}
                            {p.user_id === you && ` (${t('floorDrop.you')})`}
                        </span>
                        <span className="hidden w-32 shrink-0 text-right text-xs font-bold text-slate-700 tabular-nums sm:inline">
                            {t('floorDrop.survival', {
                                seconds: Math.round(p.survival_ms / 1000),
                            })}
                        </span>
                        <span className="shrink-0 text-right text-xs font-bold text-slate-700 tabular-nums sm:w-28">
                            {t('floorDrop.accuracy', { value: p.accuracy })}
                        </span>
                    </li>
                ))}
            </ol>
        </div>
    );
}

/** Student controller: high-contrast 4-button pad + spectator overlay. */
function PlayerScreen({
    state,
    status,
    error,
    online,
    name,
    act,
}: {
    state: FloorState;
    status: ReturnType<typeof useFloorDrop>['status'];
    error: string | null;
    online: boolean;
    name: string;
    act: (msg: Record<string, unknown>) => void;
}) {
    const { t } = useTranslations();

    if (state.phase === 'NONE' || !state.pin) {
        return (
            <div className="flex flex-col gap-3">
                <RoomEntry
                    status={status}
                    error={error}
                    intro={t('floorDrop.playerIntro', { name })}
                    createLabel={t('floorDrop.openHost')}
                    onCreate={() => chooseRole('host')}
                    onJoin={(code) => act({ t: 'join_room', pin: code })}
                >
                    {state.closed && state.closed !== 'idle' && (
                        <p className="text-xs font-bold text-slate-600">
                            {t('floorDrop.roomClosed')}
                        </p>
                    )}
                </RoomEntry>
            </div>
        );
    }

    const you = state.you;
    const out = you && !you.alive;
    const leave = (
        <Button
            variant="ghost"
            onClick={() => act({ t: 'leave_room' })}
            data-testid="fd-leave"
            className="min-h-11 self-center rounded-xl border-2 border-[#1f2a44]/20 bg-white/70 px-4 text-xs font-bold text-slate-700"
        >
            <DoorOpen className="size-4" />
            {t('floorDrop.leave')}
        </Button>
    );
    const top = (
        <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex flex-wrap items-center gap-2">
                <ConnectionBadge status={status} />
                <span className="rounded-xl border-2 border-[#1f2a44] bg-[#FFFDE6] px-3 py-1.5 font-display text-sm font-black tracking-widest">
                    PIN {state.pin}
                </span>
            </div>
            {state.phase !== 'LOBBY' && state.phase !== 'GAME_OVER' && (
                <span className="font-display text-sm font-black">
                    {t('floorDrop.round', { round: Math.max(1, state.round) })}{' '}
                    · {t('floorDrop.alive', { count: state.alive })}
                </span>
            )}
        </div>
    );

    if (state.phase === 'LOBBY') {
        return (
            <Panel className="mx-auto flex w-full max-w-xl flex-col items-center gap-4 text-center">
                {top}
                <span className="size-24">
                    <PlayerAvatar
                        character={
                            state.players.find(
                                (p) => p.user_id === you?.user_id,
                            )?.character
                        }
                        seat={you?.user_id ?? 0}
                    />
                </span>
                <p
                    className="font-display text-xl font-black"
                    data-testid="fd-waiting"
                >
                    {t('floorDrop.waitingStart')}
                </p>
                <p className="text-sm font-bold text-slate-600">
                    {t('floorDrop.playersCount', {
                        count: state.players.filter((p) => !p.left).length,
                    })}
                    {state.host && !state.host.online && (
                        <> · {t('floorDrop.hostOffline')}</>
                    )}
                </p>
                {error && <RoomError code={error} />}
                {leave}
            </Panel>
        );
    }

    if (state.phase === 'GAME_OVER') {
        const result = state.result;
        return (
            <Panel className="mx-auto flex w-full max-w-2xl flex-col items-center gap-4 text-center">
                {top}
                <Trophy className="size-14" style={{ color: ACCENT }} />
                <h2
                    className="font-display text-2xl font-black"
                    data-testid="fd-result"
                >
                    {result?.won
                        ? t('floorDrop.youWon')
                        : t('floorDrop.yourRank', {
                              rank: result?.rank ?? '–',
                              total: state.ranking?.length ?? 0,
                          })}
                </h2>
                {result && (
                    <div className="flex flex-wrap justify-center gap-2 text-sm font-black">
                        <span className="inline-flex items-center gap-1.5 rounded-full border-2 border-[#1f2a44] bg-[#ffd93d] px-3 py-1">
                            <Coins className="size-4" />
                            {t('floorDrop.earned', { points: result.points })}
                        </span>
                        <span className="rounded-full border-2 border-[#1f2a44] bg-white px-3 py-1">
                            {t('floorDrop.survival', {
                                seconds: Math.round(result.survival_ms / 1000),
                            })}
                        </span>
                        <span className="rounded-full border-2 border-[#1f2a44] bg-white px-3 py-1">
                            {t('floorDrop.accuracy', {
                                value: result.accuracy,
                            })}
                        </span>
                    </div>
                )}
                <div className="w-full text-left">
                    <Podium state={state} />
                </div>
                <p className="text-xs font-bold text-slate-600">
                    {t('floorDrop.waitingHost')}
                </p>
                <AdSlot placement="arena.result" className="w-full max-w-md" />
                {leave}
            </Panel>
        );
    }

    const remainingReady = state.round === 0 && state.phase === 'ROUND_SUMMARY';
    const options = state.options ?? [];
    const locked =
        state.phase !== 'QUESTION_ACTIVE' || Boolean(you?.answered) || !online;

    return (
        <div
            className="relative mx-auto flex w-full max-w-2xl flex-col gap-4"
            data-testid="fd-player-pad"
            data-alive={out ? 'false' : 'true'}
        >
            <Panel className="flex flex-col gap-4">
                {top}
                {remainingReady ? (
                    <div className="flex flex-col items-center gap-2 py-8">
                        <p className="font-bold">{t('floorDrop.getReady')}</p>
                        <span
                            className="font-display text-7xl font-black tabular-nums"
                            style={{ color: ACCENT }}
                        >
                            {Math.max(1, seconds(state.ready_ms ?? 0))}
                        </span>
                    </div>
                ) : (
                    <>
                        <TimerBar state={state} />
                        <h2
                            className="text-center font-display text-xl leading-snug font-black sm:text-2xl"
                            data-testid="fd-question"
                        >
                            {state.question?.text}
                        </h2>
                    </>
                )}
            </Panel>

            {!remainingReady && options.length > 0 && (
                <div
                    className={cn(
                        'grid grid-cols-2 gap-3',
                        out && 'pointer-events-none',
                    )}
                    role="group"
                    aria-label={t('floorDrop.pickAnswer')}
                >
                    {options.map((text, index) => {
                        const mode = tileState(state, index);
                        const chosen = you?.choice === index;
                        return (
                            <button
                                key={`${state.round_id}-${index}`}
                                type="button"
                                disabled={locked || Boolean(out)}
                                onClick={() =>
                                    act({
                                        t: 'submit_answer',
                                        round_id: state.round_id,
                                        choice_index: index,
                                    })
                                }
                                data-testid={`fd-pad-${index}`}
                                data-state={mode}
                                aria-pressed={chosen}
                                aria-label={t('floorDrop.tile', {
                                    letter: LETTERS[index],
                                    text,
                                })}
                                className={cn(
                                    'fd-tile fd-pad-button relative flex min-h-32 flex-col items-start justify-between gap-2 rounded-3xl border-3 border-[#1f2a44] p-3 text-left text-white shadow-[5px_5px_0px_#1f2a44] sm:min-h-32 sm:p-4',
                                    chosen &&
                                        'ring-4 ring-[#ffd93d] ring-offset-2 ring-offset-[#1f2a44]',
                                    you?.answered &&
                                        !chosen &&
                                        mode === 'open' &&
                                        'opacity-60 saturate-50',
                                )}
                                style={{ background: TILE_COLORS[index] }}
                            >
                                <span className="grid size-10 shrink-0 place-items-center rounded-xl border-2 border-[#1f2a44] bg-white font-display text-xl font-black text-[#1f2a44]">
                                    {mode === 'correct' ? (
                                        <Check className="size-5" />
                                    ) : mode === 'dropped' ? (
                                        <X className="size-5" />
                                    ) : (
                                        LETTERS[index]
                                    )}
                                </span>
                                <span className="w-full text-center font-display text-3xl leading-tight font-black break-words sm:text-4xl">
                                    {text}
                                </span>
                                {chosen && (
                                    <span className="absolute top-3 right-3 inline-flex items-center gap-1 rounded-full border-2 border-[#1f2a44] bg-[#ffd93d] px-2 py-0.5 text-[11px] font-black text-[#1f2a44]">
                                        <Check
                                            className="size-3"
                                            aria-hidden="true"
                                        />
                                        {t('floorDrop.you')}
                                    </span>
                                )}
                            </button>
                        );
                    })}
                </div>
            )}

            {!remainingReady && (
                <p
                    className="min-h-11 rounded-xl border-2 border-[#1f2a44] bg-white px-3 py-2.5 text-center text-sm font-black"
                    aria-live="polite"
                    data-testid="fd-player-status"
                >
                    {out
                        ? t('floorDrop.spectatorBody')
                        : state.phase === 'QUESTION_ACTIVE'
                          ? you?.answered
                              ? t('floorDrop.answerSent')
                              : t('floorDrop.pickAnswer')
                          : state.phase === 'REVEAL_DROP'
                            ? state.sudden_death
                                ? t('floorDrop.suddenDeath')
                                : t('floorDrop.youSurvived')
                            : state.phase === 'LOCK_ANSWERS'
                              ? t('floorDrop.locked')
                              : t('floorDrop.nextFaster', {
                                    seconds: seconds(
                                        state.next_time_limit ?? 0,
                                    ),
                                })}
                </p>
            )}

            {out && <EliminatedOverlay state={state} />}
            {status === 'reconnecting' && (
                <p
                    role="alert"
                    className="rounded-2xl border-2 border-[#1f2a44] bg-[#FFEBF0] px-4 py-2.5 text-center text-sm font-bold text-[#AD1457]"
                >
                    {t('floorDrop.connectionLost')}
                </p>
            )}
            {error && <RoomError code={error} />}
            {leave}
        </div>
    );
}

function EliminatedOverlay({ state }: { state: FloorState }) {
    const { t } = useTranslations();
    const reason = state.you?.reason || 'wrong';
    const standing = useMemo(
        () => state.players.filter((p) => p.alive),
        [state.players],
    );
    return (
        <section
            className="flex flex-col gap-3 rounded-3xl border-3 border-[#1f2a44] bg-[#1f2a44] p-4 text-white shadow-[5px_5px_0px_#e11d48]"
            data-testid="fd-eliminated"
            aria-live="assertive"
        >
            <div className="flex items-center gap-3">
                <span className="grid size-11 shrink-0 place-items-center rounded-2xl bg-[#e11d48]">
                    <Eye className="size-5" aria-hidden="true" />
                </span>
                <div className="flex min-w-0 flex-col">
                    <span className="font-display text-xl font-black">
                        {t('floorDrop.youFell')}
                    </span>
                    <span className="text-sm font-bold text-white/80">
                        {t(`floorDrop.reasons.${reason}`)} ·{' '}
                        {t('floorDrop.spectator')}
                    </span>
                </div>
            </div>
            <ul className="flex flex-wrap gap-1.5">
                {standing.slice(0, 30).map((p) => (
                    <li
                        key={p.user_id}
                        className="inline-flex max-w-36 items-center gap-1.5 rounded-full bg-white/10 py-0.5 pr-2.5 pl-0.5"
                    >
                        <span className="size-6 shrink-0">
                            <PlayerAvatar
                                character={p.character}
                                seat={p.user_id}
                            />
                        </span>
                        <span className="truncate text-xs font-bold">
                            {p.name}
                        </span>
                    </li>
                ))}
                {standing.length > 30 && (
                    <li className="rounded-full bg-white/10 px-2.5 py-1 text-xs font-bold">
                        +{standing.length - 30}
                    </li>
                )}
            </ul>
        </section>
    );
}
