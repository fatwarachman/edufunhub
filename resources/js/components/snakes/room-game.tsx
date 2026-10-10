import AdSlot from '@/components/ads/ad-slot';
import { GameFinale, rankStandings } from '@/components/game-finale';
import { IllustratedSnakesBoard } from '@/components/illustrated-snakes-board';
import {
    AnswerTimePicker,
    HostExitDialog,
} from '@/components/multiplayer/host-controls';
import {
    ConnectionBadge,
    RoomEntry,
    RoomError,
    RoomLobby,
    type RoomPayload,
    useRoomPin,
} from '@/components/multiplayer/room';
import {
    isGameSubject,
    SubjectFallbackNote,
    SubjectPicker,
} from '@/components/multiplayer/subject-picker';
import { avatarTint, PlayerAvatar } from '@/components/player-avatar';
import { NavButton } from '@/components/site-nav';
import {
    BoardLegend,
    DiceDialog,
    DiceFace,
    DurationPicker,
    formatClock,
    LeaveGameDialog,
    MoveLog,
    PlayerList,
    QuestionDialog,
} from '@/components/snakes/shared';
import { Button } from '@/components/ui/button';
import {
    type SnakesState,
    useSnakesConnection,
} from '@/hooks/use-snakes-connection';
import { useTranslations } from '@/hooks/use-translations';
import { AdMoment } from '@/lib/ads';
import { walkPath } from '@/lib/snakes-board';
import { useSubjectName } from '@/lib/subjects';
import {
    Clock,
    Coins,
    DoorOpen,
    Flag,
    GraduationCap,
    Info,
    Shuffle,
    Sparkles,
    Trophy,
} from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';

type Sound = 'dice' | 'correct' | 'step' | 'wrong';

/** Dice animation: spins, then holds the result before the question opens. */
const DICE_SPINS = 12;
const DICE_SPIN_MS = 85;
const DICE_HOLD_MS = 700;

interface Received extends SnakesState {
    receivedAt: number;
}

/** Re-renders every `interval` ms while active and returns the current time. */
function useNow(active: boolean, interval = 250): number {
    const [now, setNow] = useState(() => Date.now());
    useEffect(() => {
        if (!active) {
            return;
        }
        const id = setInterval(() => setNow(Date.now()), interval);
        return () => clearInterval(id);
    }, [active, interval]);
    return now;
}

/**
 * Ular Tangga refereed by Go, using the standard room flow: play solo, add
 * players on this device, or invite friends with a PIN or link. Every
 * finished game adds points to each player's account.
 */
export function RoomGame({
    wsUrl,
    initialPin,
    hasGrade,
    play,
    muted = false,
}: {
    wsUrl: string | null;
    initialPin: string | null;
    hasGrade: boolean;
    play: (sound: Sound) => void;
    muted?: boolean;
}) {
    const { t, i18n } = useTranslations();
    const subjectName = useSubjectName();
    const [state, setState] = useState<Received | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [log, setLog] = useState<string[]>([]);
    const [notice, setNotice] = useState<string | null>(null);
    const [leaving, setLeaving] = useState(false);
    const lastHost = useRef<{ pin?: string; host?: number }>({});
    const leftNotice = useRef<string | null>(null);
    const [walk, setWalk] = useState<{
        id: number;
        seat: number;
        position: number;
    } | null>(null);
    const lastEvent = useRef('');
    const playRef = useRef(play);
    const tRef = useRef(t);
    useEffect(() => {
        playRef.current = play;
        tRef.current = t;
    }, [play, t]);

    const onState = useCallback((next: SnakesState) => {
        setError(null);
        if (next.pin !== lastHost.current.pin) {
            setNotice((current) =>
                current && current === leftNotice.current ? current : null,
            );
        }
        setState({ ...next, receivedAt: Date.now() });
        const players = next.players ?? [];
        const name = (seat?: number) =>
            seat === undefined ? '' : (players[seat]?.name ?? '');
        const say = (message: string) =>
            setLog((previous) => [message, ...previous.slice(0, 5)]);
        const event = `${next.pin}-${next.seq}-${next.step}-${next.phase}`;
        if (event === lastEvent.current) {
            return;
        }
        lastEvent.current = event;
        const translate = tRef.current;
        const sound = playRef.current;
        const previousHost = lastHost.current;
        lastHost.current = { pin: next.pin, host: next.host };
        if (
            next.phase === 'playing' &&
            previousHost.pin === next.pin &&
            previousHost.host !== undefined &&
            next.host !== undefined &&
            next.host >= 0 &&
            previousHost.host !== next.host &&
            players[previousHost.host]?.left !== true
        ) {
            setNotice(
                translate('snakes.host.handedOver', { name: name(next.host) }),
            );
        }
        if (next.phase === 'playing' && next.step === 'question' && next.dice) {
            sound('dice');
            say(
                translate(
                    next.auto_roll
                        ? 'snakes.dice.autoRolled'
                        : 'snakes.log.rolled',
                    { name: name(next.turn), value: next.dice },
                ),
            );
        }
        if (next.phase === 'playing' && next.step === 'reveal' && next.reveal) {
            sound(next.reveal.correct ? 'correct' : 'wrong');
            say(
                translate(
                    next.reveal.correct
                        ? 'snakes.log.correct'
                        : 'snakes.log.wrong',
                    { name: name(next.turn) },
                ),
            );
        }
        if (
            next.phase === 'playing' &&
            next.step === 'move' &&
            next.move?.kind
        ) {
            const move = next.move;
            say(
                translate(
                    move.kind === 'ladder'
                        ? 'snakes.log.ladder'
                        : 'snakes.log.snake',
                    {
                        name: name(move.seat),
                        from: move.landing,
                        to: move.final,
                    },
                ),
            );
        }
        if (next.phase === 'playing' && next.step === 'roll') {
            const finisher = players.find(
                (p) =>
                    p.finished &&
                    p.finished ===
                        next.players?.filter((q) => q.finished).length,
            );
            if (finisher && finisher.finished) {
                const key = `finish-${next.pin}-${finisher.seat}`;
                if (lastFinish.current !== key) {
                    lastFinish.current = key;
                    say(
                        translate('snakes.finishBonus.log', {
                            name: finisher.name,
                            rank: finisher.finished,
                        }),
                    );
                }
            }
        }
        if (next.phase === 'done') {
            sound('correct');
        }
    }, []);
    const lastFinish = useRef('');
    const onError = useCallback((code: string) => setError(code), []);
    const onMessage = useCallback((msg: Record<string, unknown>) => {
        if (msg.t !== 'left') {
            return;
        }
        const points = typeof msg.points === 'number' ? msg.points : 0;
        leftNotice.current =
            points > 0
                ? tRef.current('snakes.leave.done', { points })
                : tRef.current('snakes.leave.doneNone');
        setNotice(leftNotice.current);
    }, []);

    const connection = useSnakesConnection(
        hasGrade ? wsUrl : null,
        i18n.language,
        { onState, onError, onMessage },
    );
    const online = connection.status === 'online';
    const send = (msg: Record<string, unknown>) => {
        setError(null);
        if (!connection.send(msg)) {
            setError('unknown');
        }
    };
    const join = useCallback(
        (pin: string) => connection.send({ t: 'join', pin }),
        [connection],
    );
    useRoomPin(online, state?.pin, initialPin, join);

    const move =
        state?.phase === 'playing' && state.step === 'move'
            ? state.move
            : undefined;
    useEffect(() => {
        if (!move) {
            return;
        }
        const path = walkPath(move.from, move.dice);
        const timers: ReturnType<typeof setTimeout>[] = [];
        path.forEach((position, index) => {
            timers.push(
                setTimeout(
                    () => {
                        setWalk({ id: move.id, seat: move.seat, position });
                        playRef.current('step');
                    },
                    300 * (index + 1),
                ),
            );
        });
        if (move.final !== move.landing) {
            timers.push(
                setTimeout(
                    () =>
                        setWalk({
                            id: move.id,
                            seat: move.seat,
                            position: move.final,
                        }),
                    300 * (path.length + 1),
                ),
            );
        }
        return () => timers.forEach(clearTimeout);
    }, [move]);

    const step = state?.phase === 'playing' ? state.step : undefined;
    const timed = state?.phase === 'playing' && (state.minutes ?? 0) > 0;
    const now = useNow(step === 'roll' || step === 'question' || timed);

    // Dice animation: when a roll arrives the dice spins for a moment before
    // the question opens, for every player in the room.
    const rollKey =
        state?.phase === 'playing' && step === 'question' && state.dice
            ? `${state.pin}-${state.turn}-${state.question?.id ?? ''}`
            : null;
    const [diceFace, setDiceFace] = useState(1);
    const [rolling, setRolling] = useState<string | null>(null);
    const [spinning, setSpinning] = useState(false);
    const shownRoll = useRef<string | null>(null);
    useEffect(() => {
        if (!rollKey || shownRoll.current === rollKey) {
            return;
        }
        shownRoll.current = rollKey;
        const final = state?.dice ?? 1;
        const timers: ReturnType<typeof setTimeout>[] = [];
        let spins = 0;
        const spin = () => {
            setDiceFace(1 + Math.floor(Math.random() * 6));
            playRef.current('dice');
            if (++spins < DICE_SPINS) {
                timers.push(setTimeout(spin, DICE_SPIN_MS));
                return;
            }
            setDiceFace(final);
            setSpinning(false);
            timers.push(setTimeout(() => setRolling(null), DICE_HOLD_MS));
        };
        setRolling(rollKey);
        setSpinning(true);
        spin();
        return () => {
            timers.forEach(clearTimeout);
            setRolling(null);
            setSpinning(false);
        };
    }, [rollKey, state?.dice]);
    const diceVisible = rolling !== null && rolling === rollKey;

    // Safety net against a frozen dice/question dialog: every playing step
    // has a server deadline. If no new state arrived a few seconds after it,
    // ask the referee for the current state (the watchdog in useGameSocket
    // reconnects when even that gets no answer).
    const deadlineMs =
        state?.phase !== 'playing'
            ? null
            : step === 'roll'
              ? (state.remaining_ms ?? 0)
              : step === 'question'
                ? (state.question?.remaining_ms ?? 0)
                : step === 'reveal'
                  ? 2500
                  : step === 'move'
                    ? 300 * ((state.move?.dice ?? 6) + 1) + 700
                    : null;
    const sendRef = useRef(connection.send);
    useEffect(() => {
        sendRef.current = connection.send;
    }, [connection.send]);
    useEffect(() => {
        if (deadlineMs === null || !state) {
            return;
        }
        const wait = deadlineMs + 4000 - (Date.now() - state.receivedAt);
        const id = setTimeout(
            () => sendRef.current({ t: 'sync' }),
            Math.max(1000, wait),
        );
        return () => clearTimeout(id);
    }, [deadlineMs, state]);

    if (!hasGrade || connection.status === 'grade_required') {
        return (
            <div className="mx-auto max-w-xl rounded-3xl border-3 border-[#1f2a44] bg-white p-8 text-center shadow-[5px_5px_0px_#1f2a44]">
                <GraduationCap className="mx-auto size-12 text-[#FF9E44]" />
                <p className="mt-3 font-bold text-slate-700">
                    {t('snakes.online.needGrade')}
                </p>
                <div className="mt-4 flex justify-center">
                    <NavButton
                        href="/portal"
                        icon={GraduationCap}
                        label={t('snakes.online.setGrade')}
                        variant="primary"
                    />
                </div>
            </div>
        );
    }

    const noticeBanner = notice && (
        <p
            role="status"
            className="mx-auto mb-4 flex max-w-2xl items-start gap-2 rounded-2xl border-2 border-[#1f2a44] bg-[#E8FAF6] px-4 py-2.5 text-sm font-bold text-[#00695C]"
            data-testid="snakes-notice"
        >
            <Info className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
            <span className="min-w-0 flex-1">{notice}</span>
            <button
                type="button"
                onClick={() => setNotice(null)}
                className="shrink-0 text-xs font-black underline"
            >
                OK
            </button>
        </p>
    );

    if (!state || state.phase === 'none' || !state.pin) {
        return (
            <>
                {noticeBanner}
                <RoomEntry
                    game="snakes-and-ladders"
                    status={connection.status}
                    error={error}
                    intro={t('snakes.online.intro', {
                        min: state?.min_players ?? 1,
                        max: state?.max_players ?? 4,
                    })}
                    onCreate={() => send({ t: 'create' })}
                    onJoin={(pin) => send({ t: 'join', pin })}
                />
            </>
        );
    }

    const room = state as unknown as RoomPayload;
    const players = state.players ?? [];
    const you = state.you;
    const isHost = state.host === you;

    if (state.phase === 'lobby') {
        return (
            <RoomLobby
                game="snakes-and-ladders"
                title={t('snakes.title')}
                room={room}
                status={connection.status}
                error={error}
                onStart={() => send({ t: 'start' })}
                onLeave={() => send({ t: 'leave' })}
                onAddLocal={(name) => send({ t: 'add_local', name })}
                onRemoveLocal={(seat) => send({ t: 'remove_local', seat })}
                soloHint={t('snakes.online.soloHint')}
                settings={
                    <div className="flex flex-col gap-5">
                        <SubjectPicker
                            value={
                                isGameSubject(state.subject)
                                    ? state.subject
                                    : 'mix'
                            }
                            disabled={!isHost}
                            onChange={(subject) =>
                                send({ t: 'subject', subject })
                            }
                        />
                        <AnswerTimePicker
                            value={state.answer_seconds ?? 0}
                            options={
                                state.answer_times ?? [
                                    0, 10, 15, 20, 30, 45, 60,
                                ]
                            }
                            defaultHint={t('room.answerTime.default', {
                                seconds: 30,
                            })}
                            disabled={!isHost}
                            onChange={(seconds) =>
                                send({ t: 'answer_time', seconds })
                            }
                        />
                        <DurationPicker
                            value={state.minutes ?? 0}
                            options={state.durations ?? [0, 5, 10, 15, 20, 30]}
                            finishBonus={state.finish_bonus ?? 100}
                            disabled={!isHost}
                            onChange={(minutes) =>
                                send({ t: 'duration', minutes })
                            }
                        />
                    </div>
                }
            />
        );
    }

    const active = players.filter((p) => !p.left);
    const turn = state.turn ?? 0;
    const current = players[turn];
    const myTurn = state.phase === 'playing' && Boolean(current?.controlled);
    const elapsed = now - state.receivedAt;
    const secondsLeft = (ms?: number) =>
        Math.max(0, Math.ceil(((ms ?? 0) - Math.max(0, elapsed)) / 1000));
    const gameLeftMs = Math.max(
        0,
        (state.time_left_ms ?? 0) - Math.max(0, elapsed),
    );

    const boardPlayers = active.map((p) => ({
        id: p.seat,
        name: p.name,
        skinIndex: p.seat,
        character: p.character,
        position:
            move && walk && walk.id === move.id && walk.seat === p.seat
                ? walk.position
                : move && move.seat === p.seat
                  ? move.from
                  : p.position,
    }));
    const listPlayers = players.map((p) => ({
        id: p.seat,
        userId: p.user_id,
        name: p.name,
        skinIndex: p.seat,
        character: p.character,
        position:
            boardPlayers.find((b) => b.id === p.seat)?.position ?? p.position,
        score: p.score,
        muted: p.left || !p.online,
        badges: [
            ...(p.finished
                ? [t('snakes.finishBonus.finished', { rank: p.finished })]
                : []),
            ...(p.seat === you ? [t('room.you')] : []),
            ...(p.seat === state.host ? [t('room.host')] : []),
            ...(p.local ? [t('room.local')] : []),
            ...(p.left
                ? [t('room.left')]
                : !p.online
                  ? [t('room.offline')]
                  : []),
        ],
    }));
    const winner =
        state.phase === 'done' ? players[state.winner ?? -1] : undefined;
    const turnLabel = !current
        ? ''
        : current.seat === you
          ? t('snakes.turn.yours')
          : t('snakes.turn.of', { name: current.name });

    return (
        <>
            {noticeBanner}
            <div className="mb-6 flex flex-wrap items-center justify-between gap-3 rounded-3xl border-3 border-[#1f2a44] bg-white p-4 shadow-[4px_4px_0px_#1f2a44]">
                <div className="flex min-w-0 flex-wrap items-center gap-2">
                    <ConnectionBadge status={connection.status} />
                    <span className="rounded-xl border-2 border-[#1f2a44] bg-[#FFFDE6] px-3 py-1.5 font-display text-sm font-black tracking-widest">
                        PIN {state.pin}
                    </span>
                    {state.phase === 'playing' && (
                        <span
                            className="inline-flex min-h-9 items-center gap-1.5 rounded-xl border-2 border-[#1f2a44] bg-[#E8F1FF] px-3 text-xs font-black tabular-nums"
                            data-testid="snakes-time-left"
                            data-minutes={state.minutes ?? 0}
                        >
                            {timed ? (
                                <>
                                    <Clock
                                        className="size-4"
                                        aria-hidden="true"
                                    />
                                    {t('snakes.duration.timeLeft', {
                                        time: formatClock(gameLeftMs),
                                    })}
                                </>
                            ) : (
                                <>
                                    <Flag
                                        className="size-4"
                                        aria-hidden="true"
                                    />
                                    {t('snakes.duration.untilFinishBadge')}
                                </>
                            )}
                        </span>
                    )}
                </div>
                {current && state.phase === 'playing' && (
                    <div
                        className="flex items-center gap-2 rounded-2xl border-3 border-[#1f2a44] px-3.5 py-1.5 font-display text-xs font-black text-[#1f2a44] shadow-[3px_3px_0px_#1f2a44]"
                        style={{
                            backgroundColor: avatarTint(
                                current.character,
                                turn,
                            ),
                        }}
                        data-testid="snakes-turn"
                        data-mine={myTurn}
                    >
                        <div className="size-8">
                            <PlayerAvatar
                                character={current.character}
                                seat={turn}
                                userId={current.user_id}
                            />
                        </div>
                        <span>{turnLabel}</span>
                    </div>
                )}
            </div>

            {state.phase === 'playing' && state.subject_fallback && (
                <SubjectFallbackNote subject={state.subject} className="mb-4" />
            )}
            <div className="grid min-w-0 grid-cols-1 gap-8 lg:grid-cols-12">
                <div className="min-w-0 lg:col-span-8">
                    <div className="relative mx-auto w-full max-w-[min(100%,calc(100svh-240px))] overflow-hidden rounded-3xl border-3 border-[#1f2a44] bg-white p-2 shadow-[5px_5px_0px_#1f2a44]">
                        <IllustratedSnakesBoard
                            players={boardPlayers}
                            moving={Boolean(move)}
                            activeId={turn}
                        />
                        <BoardLegend />
                    </div>
                </div>

                <div className="flex min-w-0 flex-col gap-4 lg:col-span-4 lg:max-h-[calc(100svh-200px)] lg:overflow-y-auto lg:pr-2">
                    <div className="rounded-3xl border-3 border-[#1f2a44] bg-white p-4 shadow-[5px_5px_0px_#1f2a44] sm:p-5">
                        {state.phase === 'playing' && (
                            <>
                                <AdMoment moment="start" muted={muted} />
                                <Button
                                    onClick={() => send({ t: 'roll' })}
                                    disabled={
                                        !myTurn || step !== 'roll' || !online
                                    }
                                    data-testid="snakes-roll"
                                    className="mx-auto flex min-h-12 rounded-2xl border-3 border-[#1f2a44] bg-[#FF9E44] px-6 font-display text-lg font-black text-white shadow-[4px_4px_0px_#1f2a44] hover:bg-[#ff8f29] disabled:opacity-50"
                                >
                                    {step === 'move' ? (
                                        <DiceFace
                                            value={state.dice ?? 1}
                                            className="size-6"
                                        />
                                    ) : (
                                        <Shuffle className="size-5" />
                                    )}
                                    {step === 'move'
                                        ? t('snakes.dice.moving')
                                        : myTurn && step === 'roll'
                                          ? current?.local
                                              ? t('snakes.dice.rollFor', {
                                                    name: current.name,
                                                })
                                              : t('snakes.dice.roll')
                                          : t('snakes.dice.waiting', {
                                                name: current?.name ?? '',
                                            })}
                                </Button>
                                {step === 'roll' && (
                                    <TurnTimer
                                        seconds={secondsLeft(
                                            state.remaining_ms,
                                        )}
                                        total={Math.round(
                                            (state.roll_ms ?? 10000) / 1000,
                                        )}
                                        label={t('snakes.dice.autoRoll', {
                                            seconds: secondsLeft(
                                                state.remaining_ms,
                                            ),
                                        })}
                                    />
                                )}
                            </>
                        )}
                        {state.phase === 'done' && (
                            <div
                                className="text-center"
                                data-testid="snakes-winner"
                            >
                                <Trophy className="mx-auto h-16 w-16 text-[#FF9E44]" />
                                {winner && (
                                    <h2 className="mt-2 font-display text-2xl font-black text-[#1f2a44]">
                                        {winner.seat === you
                                            ? t('snakes.winner.you')
                                            : t('snakes.winner.title', {
                                                  name: winner.name,
                                              })}
                                    </h2>
                                )}
                                {state.reason === 'stopped' && (
                                    <p
                                        className="mx-auto mt-2 w-fit rounded-full border-2 border-[#1f2a44] bg-white px-3 py-1 text-xs font-black text-[#1f2a44]"
                                        data-testid="room-stopped"
                                    >
                                        {t('room.hostExit.stopped')}
                                    </p>
                                )}
                                {!winner && state.reason === 'time' && (
                                    <h2 className="mt-2 font-display text-2xl font-black text-[#1f2a44]">
                                        {t('snakes.winner.timeNoWinner')}
                                    </h2>
                                )}
                                {winner && (
                                    <p className="mt-1 text-xs font-bold text-slate-700">
                                        {t(
                                            state.reason === 'forfeit'
                                                ? 'snakes.winner.forfeit'
                                                : state.reason === 'time'
                                                  ? 'snakes.winner.time'
                                                  : 'snakes.winner.summary',
                                            { score: winner.score },
                                        )}
                                    </p>
                                )}
                                {state.finish_bonus_won && (
                                    <p
                                        className="mx-auto mt-3 flex w-fit items-center gap-1.5 rounded-full border-2 border-[#1f2a44] bg-[#c9f5e5] px-3 py-1 text-xs font-black text-[#1f2a44]"
                                        data-testid="snakes-finish-bonus"
                                    >
                                        <Sparkles className="size-4" />
                                        {t('snakes.finishBonus.won', {
                                            points: state.finish_bonus ?? 100,
                                        })}
                                    </p>
                                )}
                                {state.points !== undefined && (
                                    <p
                                        className="mt-3 inline-flex items-center gap-1.5 rounded-full border-2 border-[#1f2a44] bg-[#ffd93d] px-3 py-1 text-sm font-black text-[#1f2a44]"
                                        data-testid="snakes-points"
                                    >
                                        <Coins className="size-4" />
                                        {t('room.points', {
                                            points: state.points,
                                        })}
                                    </p>
                                )}
                                <div className="mt-4 flex flex-col gap-2">
                                    {isHost ? (
                                        <Button
                                            onClick={() => send({ t: 'start' })}
                                            data-testid="snakes-again"
                                            className="min-h-11 rounded-xl border-2 border-[#1f2a44] bg-[#1f2a44] font-display font-black text-white shadow-[3px_3px_0px_#FF9E44]"
                                        >
                                            {t('snakes.winner.again')}
                                        </Button>
                                    ) : (
                                        <p className="text-xs font-bold text-slate-600">
                                            {t('snakes.winner.waitingHost')}
                                        </p>
                                    )}
                                    <Button
                                        variant="outline"
                                        onClick={() => send({ t: 'leave' })}
                                        className="min-h-11 rounded-xl border-2 border-[#1f2a44] bg-white font-black"
                                    >
                                        <DoorOpen className="size-4" />
                                        {t('room.leave')}
                                    </Button>
                                </div>
                                {winner?.seat === you && (
                                    <AdMoment moment="win" muted={muted} />
                                )}
                                <AdSlot
                                    placement="arena.result"
                                    className="mt-4"
                                />
                            </div>
                        )}
                        {error && (
                            <div className="mt-4">
                                <RoomError code={error} />
                            </div>
                        )}
                        <div className="mt-6 border-t-2 border-[#1f2a44]/10 pt-4">
                            <PlayerList
                                players={listPlayers}
                                turnId={state.phase === 'playing' ? turn : null}
                            />
                        </div>
                        {state.phase === 'playing' && you >= 0 && (
                            <Button
                                variant="outline"
                                onClick={() => setLeaving(true)}
                                data-testid="snakes-leave"
                                className="mx-auto mt-3 flex min-h-11 rounded-xl border-2 border-[#1f2a44] bg-white text-xs font-black text-[#1f2a44]"
                            >
                                <DoorOpen className="size-4" />
                                {isHost
                                    ? t('room.hostExit.button')
                                    : t('snakes.leave.button')}
                            </Button>
                        )}
                    </div>
                    <AdSlot placement="arena.sidebar" />
                    <MoveLog entries={log} />
                </div>
            </div>

            {leaving && state.phase === 'playing' && isHost && (
                <HostExitDialog
                    onClose={() => setLeaving(false)}
                    onLeave={() => {
                        setLeaving(false);
                        send({ t: 'leave' });
                    }}
                    onStop={() => {
                        setLeaving(false);
                        send({ t: 'stop' });
                    }}
                />
            )}
            <LeaveGameDialog
                open={leaving && state.phase === 'playing' && !isHost}
                onCancel={() => setLeaving(false)}
                onConfirm={() => {
                    setLeaving(false);
                    send({ t: 'leave' });
                }}
            />
            {diceVisible && current && (
                <DiceDialog
                    name={current.name}
                    value={diceFace}
                    rolling={spinning}
                />
            )}
            {!diceVisible &&
                state.phase === 'playing' &&
                (step === 'question' || step === 'reveal') &&
                state.question &&
                current && (
                    <QuestionDialog
                        name={current.name}
                        skinIndex={turn}
                        character={current.character}
                        question={{
                            subject: subjectName(state.question.subject),
                            text: state.question.text,
                            media: state.question.media,
                            options: state.question.options,
                        }}
                        dice={state.dice ?? 0}
                        target={state.question.target}
                        choice={state.reveal ? state.reveal.choice : null}
                        answer={state.reveal ? state.reveal.answer : null}
                        outcome={
                            state.reveal
                                ? state.reveal.correct
                                    ? 'correct'
                                    : state.reveal.choice < 0
                                      ? 'timeout'
                                      : 'wrong'
                                : null
                        }
                        hint={state.reveal?.hint}
                        secondsLeft={
                            step === 'question'
                                ? secondsLeft(state.question.remaining_ms)
                                : undefined
                        }
                        canAnswer={myTurn && step === 'question'}
                        onAnswer={(option) => send({ t: 'answer', option })}
                    />
                )}
            <GameFinale
                game="snakes-and-ladders"
                done={state.phase === 'done'}
                matchKey={state.pin}
                won={state.phase === 'done' && state.winner === you}
                points={state.points}
                title={
                    winner && winner.seat !== you
                        ? t('finale.winner', { name: winner.name })
                        : undefined
                }
                standings={rankStandings(
                    players.filter((p) => !p.left),
                    (p) =>
                        p.finished
                            ? 1_000_000 - p.finished
                            : p.position * 1000 + p.score / 1000,
                    (p, rank) => ({
                        key: p.seat,
                        name: p.name,
                        rank,
                        score: p.finished
                            ? t('snakes.finishBonus.finished', {
                                  rank: p.finished,
                              })
                            : `${p.position}/100`,
                        character: p.character,
                        seat: p.seat,
                        userId: p.user_id,
                        isYou: p.seat === you,
                    }),
                )}
                onPlayAgain={isHost ? () => send({ t: 'start' }) : undefined}
            />
        </>
    );
}

/** Turn wait: a shrinking bar and seconds until the dice rolls by itself. */
function TurnTimer({
    seconds,
    total,
    label,
}: {
    seconds: number;
    total: number;
    label: string;
}) {
    const percent = Math.max(
        0,
        Math.min(100, (seconds / Math.max(1, total)) * 100),
    );
    return (
        <div
            className="mt-2"
            data-testid="snakes-auto-roll"
            data-seconds={seconds}
        >
            <div
                className="h-2 overflow-hidden rounded-full border border-[#1f2a44] bg-white"
                role="progressbar"
                aria-valuemin={0}
                aria-valuemax={total}
                aria-valuenow={seconds}
                aria-label={label}
            >
                <div
                    className={
                        seconds <= 3
                            ? 'h-full bg-[#FF6584] transition-[width] duration-300 ease-linear'
                            : 'h-full bg-[#00C9A7] transition-[width] duration-300 ease-linear'
                    }
                    style={{ width: `${percent}%` }}
                />
            </div>
            <p className="mt-1 text-center text-[11px] font-bold text-slate-600">
                {label}
            </p>
        </div>
    );
}
