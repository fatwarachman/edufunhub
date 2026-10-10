import AdSlot from '@/components/ads/ad-slot';
import GameAdStrip from '@/components/ads/game-ad-strip';
import { GameFinale, podiumStandings } from '@/components/game-finale';
import { ConnectionBadge, RoomError } from '@/components/multiplayer/room';
import { SubjectPicker } from '@/components/multiplayer/subject-picker';
import { PlayerAvatar } from '@/components/player-avatar';
import { QuestionMedia } from '@/components/question-media';
import { HowToPlay } from '@/components/turbo-trivia/how-to-play';
import {
    ACCENT,
    feedIcon,
    feedText,
    ITEM_STYLE,
    kartColor,
    MiniMap,
    Panel,
    Podium,
    raceClock,
    RaceTrack,
    TurboShell,
    useNow,
    useQuestionLeft,
    useRoster,
    useTurboAudio,
} from '@/components/turbo-trivia/shared';
import { Button } from '@/components/ui/button';
import { useClipboard } from '@/hooks/use-clipboard';
import { useTranslations } from '@/hooks/use-translations';
import {
    type TurboEvent,
    type TurboRosterEntry,
    type TurboState,
    useTurboTrivia,
} from '@/hooks/use-turbo-trivia';
import { useAdMoments } from '@/lib/ads';
import { type CharacterLook } from '@/lib/character/draw-character';
import { cn } from '@/lib/utils';
import { router } from '@inertiajs/react';
import {
    Check,
    Copy,
    DoorOpen,
    Flag,
    Gauge,
    Maximize,
    Minimize,
    MonitorPlay,
    Play,
    Timer,
    UsersRound,
    WifiOff,
} from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import '../../../../css/turbo-trivia.css';

interface ArenaProps {
    player: { id: number; name: string; character: CharacterLook | null };
    serviceReady: boolean;
    wsUrl: string | null;
    pin: string | null;
}

const LETTERS = ['A', 'B', 'C', 'D'];

/** Projector / smart TV arena: lobby with PIN + QR, live circuit, podium. */
export default function TurboTriviaArena({ serviceReady, wsUrl }: ArenaProps) {
    const { t, i18n } = useTranslations();
    const { play, engineSpeed, muted, toggleMuted } = useTurboAudio();
    const [error, setError] = useState<string | null>(null);
    const playRef = useRef(play);
    useEffect(() => {
        playRef.current = play;
    }, [play]);

    const onEvent = useCallback((msg: Record<string, unknown>) => {
        const sound = playRef.current;
        if (msg.t === 'race_event' || msg.t === 'item_triggered') {
            const event = msg.event as TurboEvent;
            if (event.kind === 'nitro') {
                sound('nitro');
            } else if (event.kind === 'finish') {
                sound('finish');
            } else if (event.blocked) {
                sound('shield');
            } else if (event.kind === 'missile_hit') {
                sound('explode');
            } else if (event.kind === 'banana_hit') {
                sound('slip');
            } else if (event.item === 'LIGHTNING') {
                sound('zap');
            } else if (event.item === 'SHIELD') {
                sound('shield');
            } else if (event.item) {
                sound('item');
            }
        }
    }, []);
    const onError = useCallback((code: string) => setError(code), []);
    const { state, status, send } = useTurboTrivia(
        serviceReady ? wsUrl : null,
        'host',
        i18n.language,
        onError,
        onEvent,
    );
    const online = status === 'online';
    const act = (msg: Record<string, unknown>): boolean => {
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
            ? `/arena/turbo-trivia/${state.pin}`
            : '/arena/turbo-trivia';
        if (window.location.pathname !== path) {
            window.history.replaceState(window.history.state, '', path);
        }
    }, [state.pin]);

    // Engine drone follows the field's average speed during the race.
    const racing = state.phase === 'RACE';
    const average =
        state.karts.length > 0
            ? state.karts.reduce((sum, k) => sum + k.v, 0) / state.karts.length
            : 0;
    useEffect(() => {
        engineSpeed(racing ? average : null);
    }, [racing, average, engineSpeed]);

    useAdMoments(
        state.phase === 'RACE'
            ? 'playing'
            : state.phase === 'GAME_OVER'
              ? 'done'
              : 'idle',
        { muted },
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
                    {t('turboTrivia.arena.hostIntro')}
                </p>
                <p className="rounded-2xl border-2 border-dashed border-[#1f2a44] px-3 py-2 text-xs font-bold text-slate-600">
                    {t('turboTrivia.rules')}
                </p>
                <Button
                    onClick={() => act({ t: 'create_room' })}
                    disabled={!online}
                    data-testid="tt-create"
                    className="min-h-12 rounded-2xl border-3 border-[#1f2a44] px-6 font-display text-lg font-black text-white shadow-[4px_4px_0px_#1f2a44] hover:brightness-95 disabled:opacity-50"
                    style={{ background: ACCENT }}
                >
                    <MonitorPlay className="size-5" />
                    {t('turboTrivia.arena.createRoom')}
                </Button>
                {state.closed && state.closed !== 'idle' && (
                    <p className="text-xs font-bold text-slate-600">
                        {t('turboTrivia.arena.roomClosed')}
                    </p>
                )}
                <RoomError code={error} />
                <button
                    type="button"
                    onClick={() => router.visit('/games/turbo-trivia')}
                    className="min-h-11 rounded-xl px-3 text-xs font-black text-slate-600 underline-offset-4 hover:underline"
                >
                    {t('turboTrivia.switchRole')}
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
                        data-testid="tt-again"
                        className="min-h-12 rounded-2xl border-3 border-[#1f2a44] bg-[#1f2a44] px-6 font-display font-black text-white shadow-[3px_3px_0px_#e11d48]"
                    >
                        <Play className="size-5" />
                        {t('turboTrivia.arena.again')}
                    </Button>
                    <Button
                        variant="outline"
                        onClick={() => act({ t: 'leave_room' })}
                        className="min-h-12 rounded-2xl border-2 border-[#1f2a44] bg-white px-4 font-black text-[#1f2a44]"
                    >
                        <DoorOpen className="size-4" />
                        {t('turboTrivia.arena.closeRoom')}
                    </Button>
                </div>
                <RoomError code={error} />
                <AdSlot
                    placement="arena.result"
                    className="mx-auto w-full max-w-md"
                />
            </Panel>
        );
    } else {
        body = <ArenaRace state={state} error={error} act={act} />;
    }

    return (
        <TurboShell
            title={t('turboTrivia.title')}
            testId="turbo-trivia-arena"
            role="host"
            phase={state.phase}
            muted={muted}
            onToggleMuted={toggleMuted}
            extra={<FullscreenButton />}
            wide
        >
            <GameAdStrip />
            {body}
            {(state.phase === 'NONE' || state.phase === 'LOBBY') && (
                <HowToPlay className="mx-auto w-full max-w-3xl" />
            )}
            <GameFinale
                game="turbo-trivia"
                done={state.phase === 'GAME_OVER'}
                matchKey={state.pin}
                won={state.result?.won ?? false}
                points={state.result?.points}
                title={
                    state.podium?.[0] && !state.result?.won
                        ? t('turboTrivia.result.winner', {
                              name: state.podium[0].name,
                          })
                        : undefined
                }
                standings={podiumStandings(
                    state.ranking,
                    state.you?.user_id ?? state.result?.user_id,
                    (row) =>
                        row.finished
                            ? raceClock(row.race_ms)
                            : t('turboTrivia.result.dnf', {
                                  percent: Math.round(
                                      (row.progress / state.laps) * 100,
                                  ),
                              }),
                    (row) =>
                        `${t('turboTrivia.result.correct')} ${row.correct} · ${t('turboTrivia.result.accuracy')} ${row.accuracy}%`,
                )}
                onPlayAgain={() => act({ t: 'start_game' })}
                playAgainLabel={t('turboTrivia.arena.again')}
            />
        </TurboShell>
    );
}

type Act = (msg: Record<string, unknown>) => boolean;

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
        ? t('turboTrivia.arena.exitFullscreen')
        : t('turboTrivia.arena.fullscreen');
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
            data-testid="tt-fullscreen"
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
    state: TurboState;
    status: ReturnType<typeof useTurboTrivia>['status'];
    error: string | null;
    online: boolean;
    act: Act;
}) {
    const { t } = useTranslations();
    const [, copy] = useClipboard();
    const [copied, setCopied] = useState(false);
    const joinUrl = `${window.location.origin}/play/turbo-trivia/${state.pin}`;
    const players = state.players.filter((p) => !p.left);
    const enough = players.filter((p) => p.online).length >= state.min_players;

    return (
        <div
            className="grid grid-cols-1 gap-4 lg:grid-cols-12"
            data-testid="tt-lobby"
        >
            <Panel className="flex min-w-0 flex-col items-center gap-4 text-center lg:col-span-5">
                <ConnectionBadge status={status} />
                <h2 className="font-display text-2xl font-black">
                    {t('turboTrivia.arena.scanToJoin')}
                </h2>
                <img
                    src={`/games/turbo-trivia/qr/${state.pin}`}
                    alt={t('turboTrivia.arena.qrAlt', { pin: state.pin })}
                    width={256}
                    height={256}
                    className="size-56 rounded-2xl border-3 border-[#1f2a44] bg-white p-2 sm:size-64"
                    data-testid="tt-qr"
                />
                <div className="flex flex-col items-center gap-1">
                    <span className="text-xs font-black text-slate-500 uppercase">
                        {t('turboTrivia.arena.pin')}
                    </span>
                    <span
                        className="font-display text-5xl font-black tracking-[0.2em] tabular-nums sm:text-6xl"
                        data-testid="tt-pin"
                    >
                        {state.pin}
                    </span>
                </div>
                <p className="text-sm font-bold break-all text-slate-600">
                    {t('turboTrivia.arena.orOpen', {
                        url: `${window.location.host}/play/turbo-trivia`,
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
                    className="inline-flex min-h-11 items-center gap-1.5 rounded-xl border-2 border-[#1f2a44] bg-white px-3 text-sm font-black shadow-[2px_2px_0px_#1f2a44] hover:bg-[#fff1f2]"
                    data-testid="tt-copy-link"
                >
                    {copied ? (
                        <Check className="size-4" aria-hidden="true" />
                    ) : (
                        <Copy className="size-4" aria-hidden="true" />
                    )}
                    {copied
                        ? t('turboTrivia.arena.copied')
                        : t('turboTrivia.arena.copyLink')}
                </button>
            </Panel>
            <Panel className="flex min-w-0 flex-col gap-4 lg:col-span-7">
                <div className="flex flex-wrap items-center justify-between gap-2">
                    <h2 className="font-display text-xl font-black">
                        {t('turboTrivia.arena.joined')}
                    </h2>
                    <span className="inline-flex items-center gap-1.5 rounded-xl border-2 border-[#1f2a44] bg-[#fff1f2] px-3 py-1 text-sm font-black">
                        <UsersRound className="size-4" aria-hidden="true" />
                        {t('turboTrivia.arena.playersCount', {
                            count: players.length,
                        })}
                    </span>
                </div>
                {players.length === 0 ? (
                    <p className="rounded-2xl border-2 border-dashed border-[#1f2a44]/40 px-3 py-8 text-center text-sm font-bold text-slate-600">
                        {t('turboTrivia.arena.waitingPlayers')}
                    </p>
                ) : (
                    <ul
                        className="grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-4"
                        data-testid="tt-roster"
                    >
                        {players.map((p) => (
                            <RosterCard key={p.user_id} player={p} />
                        ))}
                    </ul>
                )}
                <fieldset className="flex flex-col gap-2">
                    <legend className="mb-2 text-xs font-black text-slate-500 uppercase">
                        {t('turboTrivia.arena.questions')}
                    </legend>
                    <div className="grid grid-cols-3 gap-2">
                        {state.question_counts.map((n) => (
                            <button
                                key={n}
                                type="button"
                                aria-pressed={state.total === n}
                                disabled={!online}
                                onClick={() =>
                                    act({ t: 'configure', questions: n })
                                }
                                data-testid={`tt-count-${n}`}
                                className={cn(
                                    'flex min-h-14 flex-col items-center justify-center rounded-2xl border-2 border-[#1f2a44] font-display font-black transition-colors',
                                    state.total === n
                                        ? 'bg-[#1f2a44] text-white shadow-[3px_3px_0px_#e11d48]'
                                        : 'bg-white text-[#1f2a44] hover:bg-[#fff1f2]',
                                )}
                            >
                                <span className="text-xl leading-none">
                                    {n}
                                </span>
                                <span className="text-[11px] font-bold opacity-80">
                                    {t('turboTrivia.arena.questionsUnit')}
                                </span>
                            </button>
                        ))}
                    </div>
                </fieldset>
                <SubjectPicker
                    value={state.subject ?? 'mix'}
                    onChange={(value) =>
                        act({ t: 'set_subject', subject: value })
                    }
                    disabled={!online}
                    compact
                />
                <RoomError code={error} />
                <div className="sticky bottom-0 -mx-5 -mb-5 flex flex-wrap items-center gap-2 rounded-b-3xl border-t-2 border-[#1f2a44]/10 bg-white px-5 py-3 sm:-mx-6 sm:-mb-6 sm:px-6 lg:static lg:mx-0 lg:mb-0 lg:border-0 lg:p-0">
                    <Button
                        onClick={() => act({ t: 'start_game' })}
                        disabled={!online || !enough}
                        data-testid="tt-start"
                        className="min-h-12 min-w-0 flex-1 rounded-2xl border-3 border-[#1f2a44] font-display text-lg font-black text-white shadow-[4px_4px_0px_#1f2a44] hover:brightness-95 disabled:bg-[#fecdd3] disabled:text-[#1f2a44] disabled:opacity-100"
                        style={enough ? { background: ACCENT } : undefined}
                    >
                        <Flag className="size-5 shrink-0" />
                        <span className="truncate">
                            {enough
                                ? t('turboTrivia.arena.start')
                                : t('turboTrivia.arena.needPlayers', {
                                      min: state.min_players,
                                  })}
                        </span>
                    </Button>
                    <Button
                        variant="outline"
                        onClick={() => act({ t: 'leave_room' })}
                        aria-label={t('turboTrivia.arena.closeRoom')}
                        title={t('turboTrivia.arena.closeRoom')}
                        className="min-h-12 rounded-2xl border-2 border-[#1f2a44] bg-white px-4 font-black text-[#1f2a44]"
                    >
                        <DoorOpen className="size-4" />
                        <span className="hidden sm:inline">
                            {t('turboTrivia.arena.closeRoom')}
                        </span>
                    </Button>
                </div>
            </Panel>
        </div>
    );
}

function RosterCard({ player }: { player: TurboRosterEntry }) {
    return (
        <li
            className={cn(
                'flex min-w-0 items-center gap-2 rounded-2xl border-2 border-[#1f2a44] bg-white p-2',
                !player.online && 'opacity-50',
            )}
        >
            <span
                className="grid size-11 shrink-0 place-items-center rounded-xl border-2 border-[#1f2a44]"
                style={{ background: `${kartColor(player.order)}33` }}
            >
                <span className="size-10">
                    <PlayerAvatar
                        character={player.character}
                        seat={player.user_id}
                        userId={player.user_id}
                    />
                </span>
            </span>
            <span className="min-w-0 truncate text-sm font-black">
                {player.name}
            </span>
        </li>
    );
}

function ArenaRace({
    state,
    error,
    act,
}: {
    state: TurboState;
    error: string | null;
    act: Act;
}) {
    const { t } = useTranslations();
    const roster = useRoster(state.players);
    const left = useQuestionLeft(state);
    const quiz = state.quiz;
    const leader = state.karts[0];
    const leaderLap = leader
        ? Math.min(state.laps, Math.floor(leader.p) + 1)
        : 1;
    const counting = state.phase === 'COUNTDOWN';
    const racers = state.karts.filter((k) => !k.left).length;

    return (
        <div className="flex flex-col gap-4" data-testid="tt-race">
            <Panel className="flex flex-col gap-2 !p-3 sm:!p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex flex-wrap items-center gap-2">
                        <span className="rounded-xl border-2 border-[#1f2a44] bg-[#FFFDE6] px-3 py-1.5 font-display text-base font-black tracking-widest">
                            PIN {state.pin}
                        </span>
                        <span
                            className="inline-flex items-center gap-1.5 rounded-xl border-2 border-[#1f2a44] bg-[#fff1f2] px-3 py-1.5 text-sm font-black"
                            data-testid="tt-lap"
                        >
                            <Flag className="size-4" aria-hidden="true" />
                            {t('turboTrivia.race.lap', {
                                lap: leaderLap,
                                laps: state.laps,
                            })}
                        </span>
                        {quiz && (
                            <span className="rounded-xl border-2 border-[#1f2a44] bg-white px-3 py-1.5 text-sm font-black">
                                {t('turboTrivia.race.question', {
                                    number: quiz.number,
                                    total: state.total,
                                })}
                            </span>
                        )}
                    </div>
                    <span
                        className="inline-flex min-h-11 items-center gap-2 rounded-xl border-2 border-[#1f2a44] bg-white px-3 font-display text-lg font-black tabular-nums"
                        title={t('turboTrivia.race.raceTime')}
                        data-testid="tt-race-clock"
                    >
                        <Flag className="size-5" aria-hidden="true" />
                        <span className="sr-only">
                            {t('turboTrivia.race.raceTime')}
                        </span>
                        {raceClock(state.race_ms ?? 0)}
                    </span>
                </div>
                {quiz && quiz.stage !== 'DONE' ? (
                    <QuestionBanner state={state} left={left} racers={racers} />
                ) : (
                    !counting && (
                        <p className="rounded-2xl border-2 border-[#1f2a44] bg-[#fef9c3] px-4 py-3 text-center font-display text-lg font-black">
                            {t('turboTrivia.race.sprint')}
                        </p>
                    )
                )}
            </Panel>
            <div className="grid grid-cols-1 gap-4 xl:grid-cols-12">
                <Panel className="relative flex min-w-0 flex-col gap-3 !p-3 sm:!p-4 xl:col-span-9">
                    <RaceTrack state={state} roster={roster} />
                    {counting && <CountdownOverlay state={state} />}
                    <MiniMap state={state} roster={roster} />
                </Panel>
                <div className="flex min-w-0 flex-col gap-4 xl:col-span-3">
                    <Standings state={state} roster={roster} />
                    <AdSlot placement="arena.sidebar" className="w-full" />
                </div>
            </div>
            <Ticker feed={state.feed} />
            <RoomError code={error} />
            <EndRaceButton onConfirm={() => act({ t: 'end_game' })} />
        </div>
    );
}

function QuestionBanner({
    state,
    left,
    racers,
}: {
    state: TurboState;
    left: number;
    racers: number;
}) {
    const { t } = useTranslations();
    const quiz = state.quiz!;
    const reveal = quiz.stage === 'REVEAL';
    const share = quiz.time_limit > 0 ? left / quiz.time_limit : 0;
    return (
        <div
            className="flex flex-col gap-2 rounded-2xl border-2 border-[#1f2a44] bg-[#1f2a44] p-3 text-white"
            data-testid="tt-question"
            data-stage={quiz.stage}
        >
            <div className="flex flex-wrap items-start justify-between gap-3">
                <p className="min-w-0 flex-1 font-display text-xl leading-snug font-black sm:text-2xl xl:text-3xl">
                    {quiz.question.text}
                </p>
                <span
                    className="inline-flex shrink-0 items-center gap-1.5 rounded-xl bg-[#facc15] px-3 py-1.5 font-display text-lg font-black text-[#1f2a44] tabular-nums"
                    data-testid="tt-question-timer"
                >
                    <Timer className="size-5" aria-hidden="true" />
                    {reveal
                        ? t('turboTrivia.race.correctAnswer')
                        : t('turboTrivia.race.secondsLeft', {
                              seconds: Math.ceil(left / 1000),
                          })}
                </span>
                <span className="inline-flex shrink-0 items-center gap-1.5 rounded-xl bg-white px-3 py-1.5 text-sm font-black text-[#1f2a44] tabular-nums">
                    <UsersRound className="size-4" aria-hidden="true" />
                    {t('turboTrivia.race.answered', {
                        answered: state.answered ?? 0,
                        total: racers,
                    })}
                </span>
            </div>
            <QuestionMedia media={quiz.question.media} size="lg" tone="dark" />
            <div className="h-2 overflow-hidden rounded-full bg-white/20">
                <div
                    className="h-full rounded-full bg-[#facc15] transition-[width] duration-200 ease-linear"
                    style={{ width: `${reveal ? 0 : share * 100}%` }}
                />
            </div>
            <ol className="grid grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-4">
                {quiz.options.map((option, i) => {
                    const correct = reveal && quiz.correct_index === i;
                    return (
                        <li
                            key={i}
                            className={cn(
                                'flex min-w-0 items-center gap-2 rounded-xl border-2 px-3 py-2 text-lg font-bold xl:text-xl',
                                correct
                                    ? 'border-[#86efac] bg-[#16a34a] text-white'
                                    : reveal
                                      ? 'border-white/20 bg-white/5 text-white/60'
                                      : 'border-white/30 bg-white/10',
                            )}
                            data-correct={correct ? 'true' : undefined}
                        >
                            <span className="grid size-7 shrink-0 place-items-center rounded-lg bg-white font-display text-sm font-black text-[#1f2a44]">
                                {LETTERS[i]}
                            </span>
                            <span className="min-w-0 break-words">
                                {option}
                            </span>
                        </li>
                    );
                })}
            </ol>
            {reveal && quiz.hint && (
                <p className="text-sm font-bold text-white/80">{quiz.hint}</p>
            )}
        </div>
    );
}

function CountdownOverlay({ state }: { state: TurboState }) {
    const { t } = useTranslations();
    const now = useNow(true, 100);
    const left = Math.max(
        0,
        (state.countdown_ms ?? 0) - (now - state.receivedAt),
    );
    const n = Math.ceil(left / 1000);
    return (
        <div
            className="absolute inset-0 grid place-items-center rounded-3xl bg-[#1f2a44]/60"
            data-testid="tt-countdown"
        >
            <div className="flex flex-col items-center gap-3">
                <span
                    key={n}
                    className="tt-countdown font-display text-8xl font-black text-white drop-shadow-[4px_4px_0_#e11d48]"
                >
                    {n > 0 ? n : t('turboTrivia.go')}
                </span>
                <AdSlot placement="arena.loading" className="w-full max-w-xs" />
            </div>
        </div>
    );
}

function Standings({
    state,
    roster,
}: {
    state: TurboState;
    roster: Map<number, TurboRosterEntry>;
}) {
    const { t } = useTranslations();
    return (
        <Panel className="flex flex-col gap-2 !p-4">
            <h2 className="flex items-center gap-2 font-display text-lg font-black">
                <Gauge className="size-5" aria-hidden="true" />
                {t('turboTrivia.race.standings')}
            </h2>
            <ol className="flex flex-col gap-1.5" data-testid="tt-standings">
                {state.karts.map((k) => {
                    const r = roster.get(k.id);
                    return (
                        <li
                            key={k.id}
                            className={cn(
                                'flex min-w-0 items-center gap-2 rounded-xl border-2 border-[#1f2a44] px-2 py-1.5 transition-colors',
                                k.fin ? 'bg-[#fef9c3]' : 'bg-white',
                                k.left && 'opacity-40',
                            )}
                        >
                            <span className="w-6 shrink-0 text-center font-display font-black tabular-nums">
                                {k.rank}
                            </span>
                            <span
                                className="size-3 shrink-0 rounded-full border-2 border-[#1f2a44]"
                                style={{
                                    background: kartColor(r?.order ?? k.id),
                                }}
                            />
                            <span className="size-9 shrink-0">
                                <PlayerAvatar
                                    character={r?.character}
                                    seat={k.id}
                                />
                            </span>
                            <span className="min-w-0 flex-1 truncate font-black">
                                {r?.name}
                            </span>
                            {k.fin ? (
                                <Flag
                                    className="size-4 shrink-0"
                                    aria-label={t('turboTrivia.race.finished')}
                                />
                            ) : (
                                <span className="shrink-0 text-sm font-black text-slate-700 tabular-nums">
                                    {t('turboTrivia.controller.speedValue', {
                                        speed: k.v,
                                    })}
                                </span>
                            )}
                        </li>
                    );
                })}
            </ol>
        </Panel>
    );
}

function Ticker({ feed }: { feed: TurboEvent[] }) {
    const { t } = useTranslations();
    const recent = feed.slice(-5).reverse();
    return (
        <Panel className="flex flex-col gap-2 !p-4">
            <h2 className="font-display text-lg font-black">
                {t('turboTrivia.race.feedTitle')}
            </h2>
            {recent.length === 0 ? (
                <p className="text-sm font-bold text-slate-600">
                    {t('turboTrivia.race.feedEmpty')}
                </p>
            ) : (
                <ul
                    className="flex flex-col gap-1.5"
                    aria-live="polite"
                    data-testid="tt-feed"
                >
                    {recent.map((event) => {
                        const Icon = feedIcon(event);
                        const tone = event.item
                            ? ITEM_STYLE[event.item].tone
                            : event.kind === 'missile_hit'
                              ? ITEM_STYLE.MISSILE.tone
                              : event.kind === 'banana_hit'
                                ? ITEM_STYLE.BANANA.tone
                                : '#1f2a44';
                        return (
                            <li
                                key={event.uid}
                                className="flex min-w-0 items-center gap-2 text-sm font-bold"
                            >
                                <span
                                    className="grid size-7 shrink-0 place-items-center rounded-lg text-white"
                                    style={{
                                        background: event.blocked
                                            ? ITEM_STYLE.SHIELD.tone
                                            : tone,
                                    }}
                                >
                                    <Icon
                                        className="size-4"
                                        aria-hidden="true"
                                    />
                                </span>
                                <span className="min-w-0 break-words">
                                    {feedText(t, event)}
                                </span>
                            </li>
                        );
                    })}
                </ul>
            )}
        </Panel>
    );
}

function EndRaceButton({ onConfirm }: { onConfirm: () => void }) {
    const { t } = useTranslations();
    const [armed, setArmed] = useState(false);
    useEffect(() => {
        if (!armed) {
            return;
        }
        const id = setTimeout(() => setArmed(false), 4000);
        return () => clearTimeout(id);
    }, [armed]);
    return (
        <div className="flex flex-col items-center gap-1">
            <Button
                variant="outline"
                onClick={() => (armed ? onConfirm() : setArmed(true))}
                data-testid="tt-end"
                className={cn(
                    'min-h-11 rounded-2xl border-2 border-[#1f2a44] px-4 font-black',
                    armed
                        ? 'bg-[#e11d48] text-white'
                        : 'bg-white text-[#1f2a44]',
                )}
            >
                <Flag className="size-4" />
                {armed
                    ? t('turboTrivia.arena.endNow')
                    : t('turboTrivia.arena.endGame')}
            </Button>
            {armed && (
                <p className="text-xs font-bold text-slate-600">
                    {t('turboTrivia.arena.endConfirm')}
                </p>
            )}
        </div>
    );
}
