import { IllustratedSnakesBoard } from '@/components/illustrated-snakes-board';
import { MiniBlockAvatar } from '@/components/mini-block-avatar';
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
import { NavButton } from '@/components/site-nav';
import {
    BoardLegend,
    DiceDialog,
    DiceFace,
    MoveLog,
    PlayerList,
    QuestionDialog,
    skinOf,
} from '@/components/snakes/shared';
import { Button } from '@/components/ui/button';
import {
    type SnakesState,
    useSnakesConnection,
} from '@/hooks/use-snakes-connection';
import { useTranslations } from '@/hooks/use-translations';
import { walkPath } from '@/lib/snakes-board';
import { Coins, DoorOpen, GraduationCap, Shuffle, Trophy } from 'lucide-react';
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
}: {
    wsUrl: string | null;
    initialPin: string | null;
    hasGrade: boolean;
    play: (sound: Sound) => void;
}) {
    const { t, i18n } = useTranslations();
    const [state, setState] = useState<Received | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [log, setLog] = useState<string[]>([]);
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
        if (next.phase === 'playing' && next.step === 'question' && next.dice) {
            sound('dice');
            say(
                translate('snakes.log.rolled', {
                    name: name(next.turn),
                    value: next.dice,
                }),
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
        if (next.phase === 'done') {
            sound('correct');
        }
    }, []);
    const onError = useCallback((code: string) => setError(code), []);

    const connection = useSnakesConnection(
        hasGrade ? wsUrl : null,
        i18n.language,
        { onState, onError },
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
    const now = useNow(step === 'roll' || step === 'question');

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
        };
    }, [rollKey, state?.dice]);
    const diceVisible = rolling !== null && rolling === rollKey;

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

    if (!state || state.phase === 'none' || !state.pin) {
        return (
            <RoomEntry
                status={connection.status}
                error={error}
                intro={t('snakes.online.intro', {
                    min: state?.min_players ?? 1,
                    max: state?.max_players ?? 4,
                })}
                onCreate={() => send({ t: 'create' })}
                onJoin={(pin) => send({ t: 'join', pin })}
            />
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
                    <SubjectPicker
                        value={
                            isGameSubject(state.subject) ? state.subject : 'mix'
                        }
                        disabled={!isHost}
                        onChange={(subject) => send({ t: 'subject', subject })}
                    />
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

    const boardPlayers = active.map((p) => ({
        id: p.seat,
        name: p.name,
        skinIndex: p.seat,
        position:
            move && walk && walk.id === move.id && walk.seat === p.seat
                ? walk.position
                : move && move.seat === p.seat
                  ? move.from
                  : p.position,
    }));
    const listPlayers = players.map((p) => ({
        id: p.seat,
        name: p.name,
        skinIndex: p.seat,
        position:
            boardPlayers.find((b) => b.id === p.seat)?.position ?? p.position,
        score: p.score,
        muted: p.left || !p.online,
        badges: [
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
    const skin = skinOf(turn);
    const turnLabel = !current
        ? ''
        : current.seat === you
          ? t('snakes.turn.yours')
          : t('snakes.turn.of', { name: current.name });

    return (
        <>
            <div className="mb-6 flex flex-wrap items-center justify-between gap-3 rounded-3xl border-3 border-[#1f2a44] bg-white p-4 shadow-[4px_4px_0px_#1f2a44]">
                <div className="flex flex-wrap items-center gap-2">
                    <ConnectionBadge status={connection.status} />
                    <span className="rounded-xl border-2 border-[#1f2a44] bg-[#FFFDE6] px-3 py-1.5 font-display text-sm font-black tracking-widest">
                        PIN {state.pin}
                    </span>
                </div>
                {current && state.phase === 'playing' && (
                    <div
                        className="flex items-center gap-2 rounded-2xl border-3 border-[#1f2a44] px-3.5 py-1.5 font-display text-xs font-black text-[#1f2a44] shadow-[3px_3px_0px_#1f2a44]"
                        style={{ backgroundColor: skin.color }}
                        data-testid="snakes-turn"
                        data-mine={myTurn}
                    >
                        <div className="h-6 w-6">
                            <MiniBlockAvatar skinIndex={turn} />
                        </div>
                        <span>{turnLabel}</span>
                    </div>
                )}
            </div>

            {state.phase === 'playing' && state.subject_fallback && (
                <SubjectFallbackNote subject={state.subject} className="mb-4" />
            )}
            <div className="grid gap-8 lg:grid-cols-12">
                <div className="lg:col-span-8">
                    <div className="relative mx-auto w-full max-w-[min(100%,calc(100dvh-240px))] rounded-3xl border-3 border-[#1f2a44] bg-white p-2 shadow-[5px_5px_0px_#1f2a44]">
                        <IllustratedSnakesBoard
                            players={boardPlayers}
                            moving={Boolean(move)}
                            activeId={turn}
                        />
                        <BoardLegend />
                    </div>
                </div>

                <div className="flex flex-col gap-4 lg:col-span-4 lg:max-h-[calc(100dvh-200px)] lg:overflow-y-auto lg:pr-2">
                    <div className="rounded-3xl border-3 border-[#1f2a44] bg-white p-6 shadow-[5px_5px_0px_#1f2a44]">
                        {state.phase === 'playing' && (
                            <>
                                <Button
                                    onClick={() => send({ t: 'roll' })}
                                    disabled={
                                        !myTurn || step !== 'roll' || !online
                                    }
                                    data-testid="snakes-roll"
                                    className="min-h-14 w-full rounded-2xl border-3 border-[#1f2a44] bg-[#FF9E44] font-display text-lg font-black text-white shadow-[4px_4px_0px_#1f2a44] hover:bg-[#ff8f29] disabled:opacity-50"
                                >
                                    {step === 'move' ? (
                                        <DiceFace
                                            value={state.dice ?? 1}
                                            className="mr-2 size-6"
                                        />
                                    ) : (
                                        <Shuffle className="mr-2 size-5" />
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
                                    <p
                                        className="mt-2 text-center text-[11px] font-bold text-slate-500"
                                        data-testid="snakes-auto-roll"
                                    >
                                        {t('snakes.dice.autoRoll', {
                                            seconds: secondsLeft(
                                                state.remaining_ms,
                                            ),
                                        })}
                                    </p>
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
                                {winner && (
                                    <p className="mt-1 text-xs font-bold text-slate-700">
                                        {t(
                                            state.reason === 'forfeit'
                                                ? 'snakes.winner.forfeit'
                                                : 'snakes.winner.summary',
                                            { score: winner.score },
                                        )}
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
                                        <DoorOpen className="mr-1.5 size-4" />
                                        {t('room.leave')}
                                    </Button>
                                </div>
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
                        {state.phase === 'playing' && (
                            <Button
                                variant="ghost"
                                onClick={() => send({ t: 'leave' })}
                                data-testid="snakes-leave"
                                className="mt-3 min-h-11 w-full text-xs font-bold text-slate-600"
                            >
                                <DoorOpen className="mr-1.5 size-4" />
                                {t('room.leave')}
                            </Button>
                        )}
                    </div>
                    <MoveLog entries={log} />
                </div>
            </div>

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
                        question={{
                            subject: t(
                                `flagQuest.subjects.${state.question.subject}`,
                                { defaultValue: state.question.subject },
                            ),
                            text: state.question.text,
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
        </>
    );
}
