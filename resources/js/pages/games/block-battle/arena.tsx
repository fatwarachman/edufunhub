import AdSlot from '@/components/ads/ad-slot';
import GameAdStrip from '@/components/ads/game-ad-strip';
import { BoardCanvas } from '@/components/block-battle/board';
import { HowToPlay } from '@/components/block-battle/how-to-play';
import {
    ACCENT,
    BlockShell,
    eventText,
    finaleScore,
    FortressBoard,
    gameClock,
    MODE_STYLE,
    MonsterBar,
    Panel,
    Podium,
    StrengthMeter,
    useBlockAudio,
    useNow,
    usePrefersReducedMotion,
    useRemaining,
    useRoster,
} from '@/components/block-battle/shared';
import { GameFinale, podiumStandings } from '@/components/game-finale';
import { HostExitDialog } from '@/components/multiplayer/host-controls';
import { ConnectionBadge, RoomError } from '@/components/multiplayer/room';
import { SubjectPicker } from '@/components/multiplayer/subject-picker';
import { PlayerAvatar } from '@/components/player-avatar';
import { Button } from '@/components/ui/button';
import {
    type BBEvent,
    type BBMiniBoard,
    type BBRef,
    type BBRosterEntry,
    type BBState,
    deadline,
    useBlockBattle,
} from '@/hooks/use-block-battle';
import { useClipboard } from '@/hooks/use-clipboard';
import { useTranslations } from '@/hooks/use-translations';
import { useAdMoments } from '@/lib/ads';
import { type CharacterLook } from '@/lib/character/draw-character';
import { cn } from '@/lib/utils';
import { router } from '@inertiajs/react';
import {
    Castle,
    Check,
    Copy,
    DoorOpen,
    Flag,
    Hammer,
    Maximize,
    Minimize,
    MonitorPlay,
    Play,
    Skull,
    Timer,
    UsersRound,
    WifiOff,
} from 'lucide-react';
import {
    useCallback,
    useEffect,
    useLayoutEffect,
    useMemo,
    useRef,
    useState,
} from 'react';
import '../../../../css/block-battle.css';

interface ArenaProps {
    player: { id: number; name: string; character: CharacterLook | null };
    serviceReady: boolean;
    wsUrl: string | null;
    pin: string | null;
}

type Act = (msg: Record<string, unknown>) => boolean;

/** Fly-in request for the attack overlay. */
type Flight = { from: number; to: number; lines: number };

/** Projector / smart TV arena: lobby with PIN + QR, live boards, podium. */
export default function BlockBattleArena({ serviceReady, wsUrl }: ArenaProps) {
    const { t, i18n } = useTranslations();
    const { play, muted, toggleMuted } = useBlockAudio();
    const [error, setError] = useState<string | null>(null);
    const [monsterHit, setMonsterHit] = useState(0);
    const flights = useRef<((flight: Flight) => void) | null>(null);
    const playRef = useRef(play);
    useEffect(() => {
        playRef.current = play;
    }, [play]);

    const onEvent = useCallback((msg: Record<string, unknown>) => {
        const sound = playRef.current;
        switch (msg.t) {
            case 'attack': {
                const from = msg.from as BBRef | undefined;
                const to = msg.to as BBRef | undefined;
                sound('attack');
                if (from && to) {
                    flights.current?.({
                        from: from.id,
                        to: to.id,
                        lines: (msg.lines as number) ?? 1,
                    });
                }
                break;
            }
            case 'ko':
                sound('ko');
                break;
            case 'word':
                sound('explode');
                break;
            case 'monster_hit':
                sound('monster');
                setMonsterHit(Date.now());
                break;
        }
    }, []);
    const onError = useCallback((code: string) => setError(code), []);
    const { state, status, send } = useBlockBattle(
        serviceReady ? wsUrl : null,
        'host',
        i18n.language,
        onError,
        onEvent,
    );
    const online = status === 'online';
    const act: Act = (msg) => {
        setError(null);
        const ok = send(msg);
        if (!ok) {
            setError('unknown');
        }
        return ok;
    };

    // Keep the room PIN in the address bar so a reload reopens the arena.
    useEffect(() => {
        const path = state.pin
            ? `/arena/block-battle/${state.pin}`
            : '/arena/block-battle';
        if (window.location.pathname !== path) {
            window.history.replaceState(window.history.state, '', path);
        }
    }, [state.pin]);

    // Cannon: the monster lost HP since the last snapshot.
    const hp = state.fortress?.monster.hp;
    const lastHp = useRef(hp);
    useEffect(() => {
        if (
            hp !== undefined &&
            lastHp.current !== undefined &&
            hp < lastHp.current
        ) {
            playRef.current('cannon');
        }
        lastHp.current = hp;
    }, [hp]);

    useAdMoments(
        state.phase === 'PLAYING'
            ? 'playing'
            : state.phase === 'GAME_OVER'
              ? 'done'
              : 'idle',
        {
            muted,
            won: state.mode === 'FORTRESS' ? (state.team?.won ?? false) : true,
        },
    );

    let body;
    if (!serviceReady || status === 'offline') {
        body = (
            <Panel className="mx-auto flex max-w-xl flex-col items-center gap-3 text-center font-bold">
                <WifiOff className="size-10" aria-hidden="true" />
                {t('mini.unavailable')}
            </Panel>
        );
    } else if (state.phase === 'NONE' || !state.pin) {
        body = (
            <Panel className="mx-auto flex w-full max-w-xl flex-col items-center gap-4 text-center">
                <ConnectionBadge status={status} />
                <p className="text-sm font-bold text-slate-700">
                    {t('blockBattle.arena.hostIntro')}
                </p>
                <p className="rounded-2xl border-2 border-dashed border-[#1f2a44] px-3 py-2 text-xs font-bold text-slate-600">
                    {t('blockBattle.rules')}
                </p>
                <Button
                    onClick={() => act({ t: 'create_room' })}
                    disabled={!online}
                    data-testid="bb-create"
                    className="min-h-12 rounded-2xl border-3 border-[#1f2a44] px-6 font-display text-lg font-black text-white shadow-[4px_4px_0px_#1f2a44] hover:brightness-95 disabled:opacity-50"
                    style={{ background: ACCENT }}
                >
                    <MonitorPlay className="size-5" />
                    {t('blockBattle.arena.createRoom')}
                </Button>
                {state.closed && state.closed !== 'idle' && (
                    <p className="text-xs font-bold text-slate-600">
                        {t('blockBattle.arena.roomClosed')}
                    </p>
                )}
                <RoomError code={error} />
                <button
                    type="button"
                    onClick={() => router.visit('/games/block-battle')}
                    className="min-h-11 rounded-xl px-3 text-xs font-black text-slate-600 underline-offset-4 hover:underline"
                >
                    {t('blockBattle.switchRole')}
                </button>
            </Panel>
        );
    } else if (state.phase === 'LOBBY') {
        body = (
            <ArenaLobby
                state={state}
                status={status}
                error={error}
                online={online}
                act={act}
            />
        );
    } else if (state.phase === 'GAME_OVER') {
        body = (
            <Panel className="mx-auto flex w-full max-w-5xl flex-col gap-5">
                <Podium state={state} />
                <div className="flex flex-wrap justify-center gap-2">
                    <Button
                        onClick={() => act({ t: 'start_game' })}
                        disabled={!online}
                        data-testid="bb-again"
                        className="min-h-12 rounded-2xl border-3 border-[#1f2a44] bg-[#1f2a44] px-6 font-display font-black text-white shadow-[3px_3px_0px_#ca8a04]"
                    >
                        <Play className="size-5" />
                        {t('blockBattle.arena.again')}
                    </Button>
                    <Button
                        variant="outline"
                        onClick={() => act({ t: 'leave_room' })}
                        className="min-h-12 rounded-2xl border-2 border-[#1f2a44] bg-white px-4 font-black text-[#1f2a44]"
                    >
                        <DoorOpen className="size-4" />
                        {t('blockBattle.arena.closeRoom')}
                    </Button>
                </div>
                <RoomError code={error} />
                <AdSlot
                    placement="arena.result"
                    className="mx-auto w-full max-w-md"
                />
            </Panel>
        );
    } else if (state.mode === 'FORTRESS') {
        body = (
            <ArenaFortress
                state={state}
                error={error}
                act={act}
                monsterHit={monsterHit}
            />
        );
    } else {
        body = (
            <ArenaBattle
                state={state}
                error={error}
                act={act}
                flights={flights}
            />
        );
    }

    const playing = state.phase === 'PLAYING' || state.phase === 'COUNTDOWN';
    return (
        <BlockShell
            title={t('blockBattle.title')}
            testId="bb-arena"
            role="host"
            phase={state.phase}
            muted={muted}
            onToggleMuted={toggleMuted}
            extra={<FullscreenButton />}
            wide
            compact={playing}
        >
            <GameAdStrip />
            {body}
            {(state.phase === 'NONE' || state.phase === 'LOBBY') && (
                <HowToPlay className="mx-auto w-full max-w-3xl" />
            )}
            <GameFinale
                game="block-battle"
                done={state.phase === 'GAME_OVER'}
                matchKey={state.pin}
                won={state.team?.won ?? false}
                title={
                    state.mode === 'FORTRESS' && state.team
                        ? t(
                              state.team.won
                                  ? 'blockBattle.result.teamWon'
                                  : 'blockBattle.result.teamLost',
                          )
                        : state.podium?.[0]
                          ? t('blockBattle.result.winner', {
                                name: state.podium[0].name,
                            })
                          : undefined
                }
                standings={podiumStandings(
                    state.ranking,
                    undefined,
                    (row) => finaleScore(t, state.mode, row),
                    (row) =>
                        `${t('blockBattle.result.correct')} ${row.correct} · ${t('blockBattle.result.accuracy')} ${row.accuracy}%`,
                )}
                onPlayAgain={() => act({ t: 'start_game' })}
                playAgainLabel={t('blockBattle.arena.again')}
            />
        </BlockShell>
    );
}

/** Projector mode: fills the screen and hides the browser chrome. */
function FullscreenButton() {
    const { t } = useTranslations();
    const [full, setFull] = useState(false);
    useEffect(() => {
        const sync = () => setFull(Boolean(document.fullscreenElement));
        document.addEventListener('fullscreenchange', sync);
        return () => document.removeEventListener('fullscreenchange', sync);
    }, []);
    if (typeof document !== 'undefined' && !document.fullscreenEnabled) {
        return null;
    }
    const label = full
        ? t('blockBattle.arena.exitFullscreen')
        : t('blockBattle.arena.fullscreen');
    return (
        <button
            type="button"
            onClick={() =>
                full
                    ? void document.exitFullscreen().catch(() => {})
                    : void document.documentElement
                          .requestFullscreen()
                          .catch(() => {})
            }
            aria-pressed={full}
            aria-label={label}
            title={label}
            className="edu-nav-btn edu-nav-btn--icon"
            data-testid="bb-fullscreen"
        >
            {full ? (
                <Minimize aria-hidden="true" />
            ) : (
                <Maximize aria-hidden="true" />
            )}
        </button>
    );
}

function ArenaLobby({
    state,
    status,
    error,
    online,
    act,
}: {
    state: BBState;
    status: ReturnType<typeof useBlockBattle>['status'];
    error: string | null;
    online: boolean;
    act: Act;
}) {
    const { t } = useTranslations();
    const [, copy] = useClipboard();
    const [copied, setCopied] = useState(false);
    const joinUrl = `${window.location.origin}/play/block-battle/${state.pin}`;
    const players = state.players.filter((p) => !p.left);
    const min =
        state.mode === 'BATTLE'
            ? Math.max(2, state.min_players)
            : Math.max(1, state.min_players);
    const enough = players.filter((p) => p.online).length >= min;

    return (
        <div className="flex flex-col gap-4">
            <div
                className="grid grid-cols-1 gap-4 lg:grid-cols-12"
                data-testid="bb-lobby"
            >
                <Panel className="flex min-w-0 flex-col items-center gap-4 text-center lg:col-span-4">
                    <ConnectionBadge status={status} />
                    <h2 className="font-display text-2xl font-black">
                        {t('blockBattle.arena.scanToJoin')}
                    </h2>
                    <img
                        src={`/games/block-battle/qr/${state.pin}`}
                        alt={t('blockBattle.arena.qrAlt', { pin: state.pin })}
                        width={256}
                        height={256}
                        className="size-56 rounded-2xl border-3 border-[#1f2a44] bg-white p-2 sm:size-64"
                        data-testid="bb-qr"
                    />
                    <div className="flex flex-col items-center gap-1">
                        <span className="text-xs font-black text-slate-500 uppercase">
                            {t('blockBattle.arena.pin')}
                        </span>
                        <span
                            className="font-display text-5xl font-black tracking-[0.2em] tabular-nums sm:text-6xl"
                            data-testid="bb-pin"
                        >
                            {state.pin}
                        </span>
                    </div>
                    <p className="text-sm font-bold break-all text-slate-600">
                        {t('blockBattle.arena.orOpen', {
                            url: `${window.location.host}/play/block-battle`,
                        })}
                    </p>
                    <button
                        type="button"
                        onClick={async () => {
                            if (await copy(joinUrl)) {
                                setCopied(true);
                                setTimeout(() => setCopied(false), 1500);
                            }
                        }}
                        className="inline-flex min-h-11 items-center gap-1.5 rounded-xl border-2 border-[#1f2a44] bg-white px-3 text-sm font-black shadow-[2px_2px_0px_#1f2a44] hover:bg-[#fefce8]"
                        data-testid="bb-copy-link"
                    >
                        {copied ? (
                            <Check className="size-4" aria-hidden="true" />
                        ) : (
                            <Copy className="size-4" aria-hidden="true" />
                        )}
                        {copied
                            ? t('blockBattle.arena.copied')
                            : t('blockBattle.arena.copyLink')}
                    </button>
                </Panel>
                <Panel className="flex min-w-0 flex-col gap-4 lg:col-span-8">
                    <fieldset className="flex flex-col gap-2">
                        <legend className="mb-2 text-xs font-black text-slate-500 uppercase">
                            {t('blockBattle.arena.mode')}
                        </legend>
                        <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                            {state.modes.map((mode) => {
                                const { icon: Icon, tone } = MODE_STYLE[mode];
                                const selected = state.mode === mode;
                                return (
                                    <button
                                        key={mode}
                                        type="button"
                                        aria-pressed={selected}
                                        disabled={!online}
                                        onClick={() =>
                                            act({ t: 'configure', mode })
                                        }
                                        data-testid={`bb-mode-${mode}`}
                                        className={cn(
                                            'flex min-w-0 items-start gap-3 rounded-2xl border-2 border-[#1f2a44] p-3 text-left transition-colors',
                                            selected
                                                ? 'bg-[#fef9c3] shadow-[3px_3px_0px_#1f2a44]'
                                                : 'bg-white hover:bg-[#fefce8]',
                                        )}
                                    >
                                        <span
                                            className="grid size-11 shrink-0 place-items-center rounded-xl border-2 border-[#1f2a44] text-white"
                                            style={{ background: tone }}
                                        >
                                            <Icon
                                                className="size-6"
                                                aria-hidden="true"
                                            />
                                        </span>
                                        <span className="flex min-w-0 flex-col gap-0.5">
                                            <span className="flex items-center gap-1 font-display text-base font-black">
                                                {t(
                                                    `blockBattle.modes.${mode}.title`,
                                                )}
                                                {selected && (
                                                    <Check
                                                        className="size-4 shrink-0"
                                                        aria-hidden="true"
                                                    />
                                                )}
                                            </span>
                                            <span className="text-xs font-bold text-slate-600">
                                                {t(
                                                    `blockBattle.modes.${mode}.desc`,
                                                )}
                                            </span>
                                        </span>
                                    </button>
                                );
                            })}
                        </div>
                    </fieldset>
                    <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                        <fieldset className="flex min-w-0 flex-col gap-2">
                            <legend className="mb-2 text-xs font-black text-slate-500 uppercase">
                                {t('blockBattle.arena.duration')}
                            </legend>
                            <div className="grid grid-cols-4 gap-2">
                                {state.durations.map((n) => (
                                    <button
                                        key={n}
                                        type="button"
                                        aria-pressed={state.minutes === n}
                                        disabled={!online}
                                        onClick={() =>
                                            act({ t: 'configure', minutes: n })
                                        }
                                        data-testid={`bb-minutes-${n}`}
                                        className={cn(
                                            'flex min-h-14 min-w-0 flex-col items-center justify-center rounded-2xl border-2 border-[#1f2a44] font-display font-black transition-colors',
                                            state.minutes === n
                                                ? 'bg-[#1f2a44] text-white shadow-[3px_3px_0px_#ca8a04]'
                                                : 'bg-white text-[#1f2a44] hover:bg-[#fefce8]',
                                        )}
                                    >
                                        <span className="text-xl leading-none">
                                            {n}
                                        </span>
                                        <span className="text-[11px] font-bold opacity-80">
                                            {t('blockBattle.arena.minutesUnit')}
                                        </span>
                                    </button>
                                ))}
                            </div>
                        </fieldset>
                        {state.mode === 'WORDS' && (
                            <fieldset
                                className="flex min-w-0 flex-col gap-2"
                                data-testid="bb-content"
                            >
                                <legend className="mb-2 text-xs font-black text-slate-500 uppercase">
                                    {t('blockBattle.arena.content')}
                                </legend>
                                <div className="grid grid-cols-3 gap-2">
                                    {state.contents.map((content) => (
                                        <button
                                            key={content}
                                            type="button"
                                            aria-pressed={
                                                state.content === content
                                            }
                                            disabled={!online}
                                            onClick={() =>
                                                act({
                                                    t: 'configure',
                                                    content,
                                                })
                                            }
                                            data-testid={`bb-content-${content}`}
                                            className={cn(
                                                'min-h-14 min-w-0 rounded-2xl border-2 border-[#1f2a44] px-1 text-center font-display text-sm leading-tight font-black transition-colors',
                                                state.content === content
                                                    ? 'bg-[#6d28d9] text-white shadow-[3px_3px_0px_#1f2a44]'
                                                    : 'bg-white text-[#1f2a44] hover:bg-[#fefce8]',
                                            )}
                                        >
                                            {t(
                                                `blockBattle.contents.${content}`,
                                            )}
                                        </button>
                                    ))}
                                </div>
                            </fieldset>
                        )}
                    </div>
                    <SubjectPicker
                        value={state.subject ?? 'mix'}
                        onChange={(value) =>
                            act({ t: 'set_subject', subject: value })
                        }
                        disabled={!online}
                        compact
                    />
                    <div className="flex flex-wrap items-center justify-between gap-2">
                        <h2 className="font-display text-xl font-black">
                            {t('blockBattle.arena.joined')}
                        </h2>
                        <span
                            className="inline-flex items-center gap-1.5 rounded-xl border-2 border-[#1f2a44] bg-[#fefce8] px-3 py-1 text-sm font-black"
                            data-testid="bb-player-count"
                        >
                            <UsersRound className="size-4" aria-hidden="true" />
                            {t('blockBattle.arena.playersCount', {
                                count: players.length,
                                max: state.max_players,
                            })}
                        </span>
                    </div>
                    {players.length === 0 ? (
                        <p className="rounded-2xl border-2 border-dashed border-[#1f2a44]/40 px-3 py-8 text-center text-sm font-bold text-slate-600">
                            {t('blockBattle.arena.waitingPlayers')}
                        </p>
                    ) : (
                        <ul
                            className="grid max-h-80 grid-cols-2 gap-2 overflow-y-auto sm:grid-cols-3 xl:grid-cols-5"
                            data-testid="bb-roster"
                        >
                            {players.map((p) => (
                                <RosterCard key={p.user_id} player={p} />
                            ))}
                        </ul>
                    )}
                    <RoomError code={error} />
                    <div className="sticky bottom-0 -mx-5 -mb-5 flex flex-wrap items-center gap-2 rounded-b-3xl border-t-2 border-[#1f2a44]/10 bg-white px-5 py-3 sm:-mx-6 sm:-mb-6 sm:px-6 lg:static lg:mx-0 lg:mb-0 lg:border-0 lg:p-0">
                        <Button
                            onClick={() => act({ t: 'start_game' })}
                            disabled={!online || !enough}
                            data-testid="bb-start"
                            className="h-auto min-h-12 max-w-full min-w-0 flex-1 rounded-2xl border-3 border-[#1f2a44] font-display text-lg font-black whitespace-normal text-white shadow-[4px_4px_0px_#1f2a44] hover:brightness-95 disabled:bg-[#fef08a] disabled:text-[#1f2a44] disabled:opacity-100"
                            style={enough ? { background: ACCENT } : undefined}
                        >
                            <Flag className="size-5 shrink-0" />
                            <span className="truncate">
                                {enough
                                    ? t('blockBattle.arena.start')
                                    : t('blockBattle.arena.needPlayers', {
                                          min,
                                      })}
                            </span>
                        </Button>
                        <Button
                            variant="outline"
                            onClick={() => act({ t: 'leave_room' })}
                            aria-label={t('blockBattle.arena.closeRoom')}
                            title={t('blockBattle.arena.closeRoom')}
                            className="min-h-12 rounded-2xl border-2 border-[#1f2a44] bg-white px-4 font-black text-[#1f2a44]"
                        >
                            <DoorOpen className="size-4" />
                            <span className="hidden sm:inline">
                                {t('blockBattle.arena.closeRoom')}
                            </span>
                        </Button>
                    </div>
                </Panel>
            </div>
            <AdSlot
                placement="arena.sidebar"
                className="mx-auto w-full max-w-md"
            />
        </div>
    );
}

function RosterCard({ player }: { player: BBRosterEntry }) {
    return (
        <li
            className={cn(
                'flex min-w-0 items-center gap-2 rounded-2xl border-2 border-[#1f2a44] bg-white p-2',
                !player.online && 'opacity-50',
            )}
            data-testid={`bb-roster-${player.user_id}`}
        >
            <span className="size-10 shrink-0">
                <PlayerAvatar
                    character={player.character}
                    seat={player.user_id}
                    userId={player.user_id}
                />
            </span>
            <span className="min-w-0 truncate text-sm font-black">
                {player.name}
            </span>
        </li>
    );
}

/** Top bar of the running game: PIN, mode, alive counter, clock, end. */
function LiveBar({
    state,
    act,
    children,
}: {
    state: BBState;
    act: Act;
    children?: React.ReactNode;
}) {
    const { t } = useTranslations();
    const remaining = useRemaining(state);
    const [confirm, setConfirm] = useState(false);
    const { icon: ModeIcon, tone } = MODE_STYLE[state.mode];
    return (
        <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex min-w-0 flex-wrap items-center gap-2">
                <span className="rounded-xl border-2 border-[#1f2a44] bg-[#FFFDE6] px-3 py-1 font-display text-base font-black tracking-widest">
                    PIN {state.pin}
                </span>
                <span
                    className="inline-flex items-center gap-1.5 rounded-xl border-2 border-[#1f2a44] px-3 py-1 text-sm font-black text-white"
                    style={{ background: tone }}
                >
                    <ModeIcon className="size-4" aria-hidden="true" />
                    {t(`blockBattle.modes.${state.mode}.title`)}
                </span>
                {children}
            </div>
            <div className="flex items-center gap-2">
                <span
                    className="inline-flex min-h-10 items-center gap-2 rounded-xl border-2 border-[#1f2a44] bg-white px-3 font-display text-xl font-black tabular-nums"
                    data-testid="bb-timer"
                    title={t('blockBattle.arena.timeLeft')}
                >
                    <Timer className="size-5" aria-hidden="true" />
                    <span className="sr-only">
                        {t('blockBattle.arena.timeLeft')}
                    </span>
                    {gameClock(remaining)}
                </span>
                <Button
                    variant="outline"
                    onClick={() => setConfirm(true)}
                    data-testid="bb-end"
                    className="min-h-10 rounded-xl border-2 border-[#1f2a44] bg-white px-3 font-black text-[#1f2a44]"
                >
                    <Flag className="size-4" />
                    <span className="hidden sm:inline">
                        {t('blockBattle.arena.endGame')}
                    </span>
                </Button>
            </div>
            {confirm && (
                <HostExitDialog
                    onClose={() => setConfirm(false)}
                    onLeave={() => {
                        setConfirm(false);
                        act({ t: 'leave_room' });
                    }}
                    onStop={() => {
                        setConfirm(false);
                        act({ t: 'end_game' });
                    }}
                />
            )}
        </div>
    );
}

function CountdownOverlay({ state }: { state: BBState }) {
    const { t } = useTranslations();
    const now = useNow(true, 100);
    const left = Math.max(
        0,
        (state.countdown_ms ?? 0) - (now - state.receivedAt),
    );
    const n = Math.ceil(left / 1000);
    return (
        <div
            className="absolute inset-0 z-20 grid place-items-center rounded-3xl bg-[#1f2a44]/70"
            data-testid="bb-countdown"
        >
            <div className="flex flex-col items-center gap-3">
                <span
                    key={n}
                    className="bb-countdown font-display text-8xl font-black text-white drop-shadow-[4px_4px_0_#ca8a04]"
                >
                    {n > 0 ? n : t('blockBattle.go')}
                </span>
                <AdSlot placement="arena.loading" className="w-full max-w-xs" />
            </div>
        </div>
    );
}

/** Height of the name/stat line above each mini board, in px. */
const TILE_LABEL = 22;
const TILE_GAP = 8;

/**
 * Picks the column count that gives the biggest tiles while every board
 * (1:2 plus a label line) fits inside the box without scrolling.
 */
function fitColumns(count: number, width: number, height: number): number {
    if (count <= 0 || width <= 0) {
        return 1;
    }
    let best = 1;
    let bestSize = 0;
    for (let cols = 1; cols <= count; cols++) {
        const rows = Math.ceil(count / cols);
        const byWidth = (width - TILE_GAP * (cols - 1)) / cols;
        const byHeight =
            ((height - TILE_GAP * (rows - 1)) / rows - TILE_LABEL) / 2;
        const size = Math.min(byWidth, byHeight);
        if (size > bestSize) {
            bestSize = size;
            best = cols;
        }
    }
    return best;
}

function ArenaBattle({
    state,
    error,
    act,
    flights,
}: {
    state: BBState;
    error: string | null;
    act: Act;
    flights: React.RefObject<((flight: Flight) => void) | null>;
}) {
    const { t } = useTranslations();
    const roster = useRoster(state.players);
    const reduced = usePrefersReducedMotion();
    const box = useRef<HTMLDivElement>(null);
    const overlay = useRef<HTMLDivElement>(null);
    const [area, setArea] = useState({ width: 0, height: 0 });
    const boards = useMemo(() => {
        if (state.boards.length > 0) {
            return state.boards;
        }
        // Before the first snapshot: empty boards for every player.
        return state.players
            .filter((p) => !p.left)
            .map<BBMiniBoard>((p) => ({
                id: p.user_id,
                c: '.'.repeat(200),
                alive: true,
                rank: 0,
                lines: 0,
                score: 0,
                pending: 0,
                fx: [],
                kos: 0,
            }));
    }, [state.boards, state.players]);
    const alive = state.alive ?? boards.filter((b) => b.alive).length;

    // Fill the screen below the box top: no page scroll on the projector.
    useLayoutEffect(() => {
        const el = box.current;
        if (!el) {
            return;
        }
        const measure = () => {
            const top = el.getBoundingClientRect().top + window.scrollY;
            setArea({
                width: el.clientWidth,
                height: Math.max(320, window.innerHeight - top - 12),
            });
        };
        measure();
        const observer =
            typeof ResizeObserver !== 'undefined'
                ? new ResizeObserver(measure)
                : null;
        observer?.observe(el);
        window.addEventListener('resize', measure);
        return () => {
            observer?.disconnect();
            window.removeEventListener('resize', measure);
        };
    }, []);

    const cols = fitColumns(boards.length, area.width, area.height);
    const rows = Math.max(1, Math.ceil(boards.length / cols));
    const tileWidth = Math.max(
        24,
        Math.min(
            (area.width - TILE_GAP * (cols - 1)) / cols,
            ((area.height - TILE_GAP * (rows - 1)) / rows - TILE_LABEL) / 2,
        ),
    );

    // Garbage bars flying from attacker to victim (absolute overlay).
    useEffect(() => {
        flights.current = ({ from, to, lines }) => {
            const root = box.current;
            const layer = overlay.current;
            if (!root || !layer) {
                return;
            }
            const source = root.querySelector<HTMLElement>(
                `[data-testid="bb-mini-${from}"]`,
            );
            const target = root.querySelector<HTMLElement>(
                `[data-testid="bb-mini-${to}"]`,
            );
            if (!target) {
                return;
            }
            const base = root.getBoundingClientRect();
            const end = target.getBoundingClientRect();
            target.classList.remove('bb-mini-hit');
            void target.offsetWidth;
            target.classList.add('bb-mini-hit');
            if (reduced || !source) {
                return;
            }
            const start = source.getBoundingClientRect();
            const bar = document.createElement('div');
            const width = Math.max(18, start.width * 0.9);
            const height = Math.max(6, Math.min(lines, 6) * (start.width / 10));
            bar.className = 'bb-garbage-bar';
            bar.dataset.testid = 'bb-flight';
            bar.style.width = `${width}px`;
            bar.style.height = `${height}px`;
            const x0 = start.left - base.left + start.width / 2 - width / 2;
            const y0 = start.top - base.top + start.height / 2 - height / 2;
            const x1 = end.left - base.left + end.width / 2 - width / 2;
            const y1 = end.bottom - base.top - height - 4;
            bar.style.transform = `translate(${x0}px, ${y0}px)`;
            layer.appendChild(bar);
            const lift = Math.min(160, Math.abs(x1 - x0) * 0.3 + 40);
            const animation = bar.animate(
                [
                    {
                        transform: `translate(${x0}px, ${y0}px) scale(0.6)`,
                        opacity: 0,
                    },
                    {
                        transform: `translate(${(x0 + x1) / 2}px, ${Math.min(y0, y1) - lift}px) scale(1.1)`,
                        opacity: 1,
                        offset: 0.5,
                    },
                    {
                        transform: `translate(${x1}px, ${y1}px) scale(1)`,
                        opacity: 0.9,
                    },
                ],
                { duration: 800, easing: 'cubic-bezier(0.4, 0, 0.2, 1)' },
            );
            animation.onfinish = () => bar.remove();
            animation.oncancel = () => bar.remove();
        };
        return () => {
            flights.current = null;
        };
    }, [flights, reduced]);

    const words = useRecent(state.feed, 'word', 3200);

    return (
        <div className="flex flex-col gap-2" data-testid="bb-battle">
            <LiveBar state={state} act={act}>
                <span
                    className="inline-flex items-center gap-1.5 rounded-xl border-2 border-[#1f2a44] bg-[#dcfce7] px-3 py-1 text-sm font-black tabular-nums"
                    data-testid="bb-alive"
                >
                    <UsersRound className="size-4" aria-hidden="true" />
                    {t('blockBattle.arena.alive', {
                        alive,
                        total: boards.length,
                    })}
                </span>
                {state.mode === 'WORDS' && (
                    <span className="rounded-xl border-2 border-[#1f2a44] bg-white px-3 py-1 text-sm font-black">
                        {t(`blockBattle.contents.${state.content}`)}
                    </span>
                )}
            </LiveBar>
            <RoomError code={error} />
            <div className="relative" ref={box} style={{ height: area.height }}>
                <ul
                    className="grid content-start justify-center"
                    style={{
                        gridTemplateColumns: `repeat(${cols}, ${tileWidth}px)`,
                        gap: TILE_GAP,
                    }}
                    data-testid="bb-boards"
                    data-cols={cols}
                >
                    {boards.map((b) => (
                        <MiniTile
                            key={b.id}
                            board={b}
                            name={roster.get(b.id)?.name ?? ''}
                            width={tileWidth}
                            words={state.mode === 'WORDS'}
                        />
                    ))}
                </ul>
                <div
                    ref={overlay}
                    className="pointer-events-none absolute inset-0 z-10 overflow-visible"
                    aria-hidden="true"
                />
                {words.length > 0 && (
                    <ul
                        className="pointer-events-none absolute inset-x-0 top-2 z-20 flex flex-col items-center gap-1.5"
                        aria-live="polite"
                        data-testid="bb-word-toasts"
                    >
                        {words.map((event) => (
                            <li
                                key={event.uid}
                                className="bb-toast rounded-2xl border-3 border-[#1f2a44] bg-[#ede9fe] px-4 py-1.5 font-display text-lg font-black shadow-[3px_3px_0px_#1f2a44]"
                            >
                                {eventText(t, event)}
                            </li>
                        ))}
                    </ul>
                )}
                {state.phase === 'COUNTDOWN' && (
                    <CountdownOverlay state={state} />
                )}
            </div>
        </div>
    );
}

/** Events of one type from the last `ms` (re-renders while they expire). */
function useRecent(feed: BBEvent[], type: BBEvent['t'], ms: number) {
    const [seen] = useState(() => new Map<number, number>());
    const now = useNow(true, 400);
    for (const event of feed) {
        if (event.t === type && !seen.has(event.uid)) {
            seen.set(event.uid, now);
        }
    }
    return feed
        .filter((e) => e.t === type && now - (seen.get(e.uid) ?? 0) < ms)
        .slice(-4);
}

function MiniTile({
    board,
    name,
    width,
    words,
}: {
    board: BBMiniBoard;
    name: string;
    width: number;
    words: boolean;
}) {
    const { t } = useTranslations();
    const paint = useMemo(
        () => ({
            cols: 10,
            rows: 20,
            cells: board.c,
            glyphs: words ? board.g : undefined,
            grid: false,
            glyphMin: 7,
            dim: !board.alive,
        }),
        [board.c, board.g, board.alive, words],
    );
    const exposed = board.fx.includes('EXPOSED');
    const penalty = board.fx.includes('PENALTY');
    const small = width < 70;
    return (
        <li
            className={cn(
                'bb-mini relative flex min-w-0 flex-col',
                exposed && 'bb-mini--exposed',
                penalty && 'bb-mini--penalty',
                !board.alive && 'bb-mini--out',
            )}
            style={{ width }}
            data-testid={`bb-mini-${board.id}`}
            data-alive={board.alive ? 'true' : 'false'}
            data-fx={board.fx.join(' ')}
            data-pending={board.pending}
        >
            <span
                className={cn(
                    'flex items-center gap-1 truncate leading-none font-black',
                    small ? 'text-[10px]' : 'text-xs',
                )}
                style={{ height: TILE_LABEL }}
                title={name}
            >
                {board.rank > 0 && !board.alive && (
                    <span className="shrink-0 tabular-nums">#{board.rank}</span>
                )}
                <span className="min-w-0 truncate">{name}</span>
            </span>
            <div className="relative flex">
                <span
                    className="absolute inset-y-0 -left-1.5 w-1 overflow-hidden rounded-full bg-[#1f2a44]/10"
                    aria-hidden="true"
                >
                    <span
                        className="absolute inset-x-0 bottom-0 bg-[#dc2626] transition-[height] duration-200"
                        style={{
                            height: `${Math.min(1, board.pending / 20) * 100}%`,
                        }}
                    />
                </span>
                <BoardCanvas
                    paint={paint}
                    className="w-full rounded-md border-2 border-[#1f2a44]"
                    label={t('blockBattle.arena.boardOf', { name })}
                >
                    <span
                        className={cn(
                            'absolute right-0.5 bottom-0.5 z-[1] rounded bg-white/90 px-1 leading-tight font-black text-[#1f2a44] tabular-nums',
                            small ? 'text-[9px]' : 'text-[11px]',
                        )}
                        title={
                            words
                                ? t('blockBattle.result.scoreValue', {
                                      score: board.score,
                                  })
                                : t('blockBattle.arena.linesShort', {
                                      count: board.lines,
                                  })
                        }
                        data-testid="bb-mini-stat"
                    >
                        {words ? board.score : board.lines}
                    </span>
                    {!board.alive && (
                        <span
                            className="absolute inset-0 grid place-items-center"
                            data-testid="bb-ko"
                        >
                            <span
                                className={cn(
                                    'flex flex-col items-center rounded-lg bg-[#dc2626] px-1.5 py-0.5 font-display font-black text-white',
                                    small ? 'text-xs' : 'text-lg',
                                )}
                            >
                                <Skull
                                    className={small ? 'size-3' : 'size-5'}
                                    aria-hidden="true"
                                />
                                {t('blockBattle.arena.ko')}
                            </span>
                        </span>
                    )}
                    {board.alive && (exposed || penalty) && !small && (
                        <span className="absolute inset-x-0 top-0 flex justify-center gap-0.5 p-0.5">
                            {board.fx.map((fx) => (
                                <span
                                    key={fx}
                                    className={cn(
                                        'rounded px-1 text-[9px] leading-tight font-black text-white',
                                        fx === 'EXPOSED'
                                            ? 'bg-[#dc2626]'
                                            : 'bg-[#7c3aed]',
                                    )}
                                >
                                    {t(`blockBattle.fx.${fx}`)}
                                </span>
                            ))}
                        </span>
                    )}
                </BoardCanvas>
            </div>
        </li>
    );
}

function ArenaFortress({
    state,
    error,
    act,
    monsterHit,
}: {
    state: BBState;
    error: string | null;
    act: Act;
    monsterHit: number;
}) {
    const { t } = useTranslations();
    const roster = useRoster(state.players);
    const fortress = state.fortress;
    const now = useNow(state.phase === 'PLAYING', 200);
    const turn = fortress?.turn;
    const turnLeft = turn
        ? Math.max(0, deadline(turn.until_ms, state.fortressAt) - now)
        : 0;
    const nextHit = fortress
        ? Math.max(0, fortress.monster.next_hit_ms - (now - state.fortressAt))
        : 0;
    const builder = turn ? roster.get(turn.user.id) : undefined;
    const hits = state.feed.filter((e) => e.t === 'monster_hit').slice(-4);

    return (
        <div className="flex flex-col gap-3" data-testid="bb-fortress">
            <LiveBar state={state} act={act} />
            <RoomError code={error} />
            <div className="relative grid grid-cols-1 gap-4 lg:grid-cols-12">
                <Panel className="flex min-w-0 justify-center !p-3 lg:col-span-7">
                    {fortress ? (
                        <FortressBoard
                            fortress={fortress}
                            shake={monsterHit}
                            className="h-auto w-full max-w-[min(100%,calc((100dvh-11rem)*0.75))]"
                        />
                    ) : (
                        <p className="py-20 text-center font-bold text-slate-600">
                            {t('blockBattle.fortress.building')}
                        </p>
                    )}
                </Panel>
                <div className="flex min-w-0 flex-col gap-4 lg:col-span-5">
                    {fortress && (
                        <Panel className="flex flex-col gap-4 !p-4">
                            <MonsterBar
                                fortress={fortress}
                                hit={monsterHit}
                                big
                            />
                            <p className="text-sm font-bold text-slate-600 tabular-nums">
                                {t('blockBattle.fortress.nextHit', {
                                    seconds: Math.ceil(nextHit / 1000),
                                })}
                            </p>
                            <StrengthMeter fortress={fortress} />
                        </Panel>
                    )}
                    <Panel
                        className="flex flex-col gap-3 !p-4"
                        data-testid="bb-builder"
                    >
                        <h2 className="flex items-center gap-2 font-display text-lg font-black">
                            <Hammer className="size-5" aria-hidden="true" />
                            {t('blockBattle.fortress.builder')}
                        </h2>
                        {turn ? (
                            <div className="flex items-center gap-3">
                                <span className="size-14 shrink-0">
                                    <PlayerAvatar
                                        character={builder?.character}
                                        seat={turn.user.id}
                                        userId={turn.user.id}
                                    />
                                </span>
                                <span className="min-w-0 flex-1 truncate font-display text-xl font-black">
                                    {turn.user.name}
                                </span>
                                <span className="rounded-xl border-2 border-[#1f2a44] bg-[#fef08a] px-3 py-1 font-display text-lg font-black tabular-nums">
                                    {Math.ceil(turnLeft / 1000)}
                                </span>
                            </div>
                        ) : (
                            <p className="text-sm font-bold text-slate-600">
                                {t('blockBattle.fortress.noBuilder')}
                            </p>
                        )}
                        <h3 className="text-xs font-black text-slate-500 uppercase">
                            {t('blockBattle.fortress.queue')}
                        </h3>
                        {fortress && fortress.queue.length > 0 ? (
                            <ol
                                className="flex flex-col gap-1.5"
                                data-testid="bb-queue"
                            >
                                {fortress.queue.slice(0, 8).map((q, i) => (
                                    <li
                                        key={q.id}
                                        className="flex min-w-0 items-center gap-2 rounded-xl border-2 border-[#1f2a44] bg-white px-2 py-1"
                                    >
                                        <span className="w-5 shrink-0 text-center font-display font-black tabular-nums">
                                            {i + 1}
                                        </span>
                                        <span className="size-7 shrink-0">
                                            <PlayerAvatar
                                                character={
                                                    roster.get(q.id)?.character
                                                }
                                                seat={q.id}
                                            />
                                        </span>
                                        <span className="min-w-0 truncate text-sm font-black">
                                            {q.name}
                                        </span>
                                    </li>
                                ))}
                            </ol>
                        ) : (
                            <p className="text-sm font-bold text-slate-600">
                                {t('blockBattle.fortress.queueEmpty')}
                            </p>
                        )}
                    </Panel>
                    {hits.length > 0 && (
                        <Panel className="flex flex-col gap-1.5 !p-4">
                            <ul
                                className="flex flex-col gap-1"
                                aria-live="polite"
                            >
                                {hits.reverse().map((e) => (
                                    <li
                                        key={e.uid}
                                        className="flex items-center gap-2 text-sm font-bold"
                                    >
                                        <Castle
                                            className="size-4 shrink-0"
                                            aria-hidden="true"
                                        />
                                        {eventText(t, e)}
                                    </li>
                                ))}
                            </ul>
                        </Panel>
                    )}
                </div>
                {state.phase === 'COUNTDOWN' && (
                    <CountdownOverlay state={state} />
                )}
            </div>
        </div>
    );
}
