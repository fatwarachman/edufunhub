import AdSlot from '@/components/ads/ad-slot';
import GameAdStrip from '@/components/ads/game-ad-strip';
import { BrandLink } from '@/components/brand-link';
import { DigitalClock } from '@/components/digital-clock';
import { GameFinale } from '@/components/game-finale';
import { AnswerTimePicker } from '@/components/multiplayer/host-controls';
import {
    RoomEntry,
    RoomLobby,
    useRoomPin,
} from '@/components/multiplayer/room';
import {
    type GameSubject,
    isGameSubject,
    rememberedSubject,
    SubjectFallbackNote,
    SubjectPicker,
} from '@/components/multiplayer/subject-picker';
import { PlayerAvatar } from '@/components/player-avatar';
import { BackButton, NavButton, SiteNav } from '@/components/site-nav';
import { useMyUserId } from '@/hooks/use-chat-socket';
import { type DuelState, useDuelConnection } from '@/hooks/use-duel-connection';
import { useGameAudio } from '@/hooks/use-game-audio';
import { useTranslations } from '@/hooks/use-translations';
import { useAdMoments } from '@/lib/ads';
import { type CharacterLook } from '@/lib/character/draw-character';
import { hasGrade, KINDERGARTEN } from '@/lib/grade';
import { cn } from '@/lib/utils';
import { Head } from '@inertiajs/react';
import {
    Bot,
    Check,
    Coins,
    GraduationCap,
    Loader2,
    RotateCcw,
    Swords,
    Trophy,
    Volume2,
    VolumeX,
    Wifi,
    WifiOff,
    X,
} from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

interface DuelPlayer {
    name: string;
    grade: number | null;
    color: string;
    accessory: string;
    character?: CharacterLook;
}

interface QuizDuelProps {
    player: DuelPlayer;
    points: number;
    serviceReady: boolean;
    wsUrl: string | null;
    pin: string | null;
}

const LETTERS = ['A', 'B', 'C', 'D'];
const OPTION_COLORS = [
    'bg-[#bceaf2]',
    'bg-[#ffd93d]',
    'bg-[#c9f5e5]',
    'bg-[#ffd6e0]',
];

/** Re-renders every `interval` ms while active and returns the current time. */
function useNow(active: boolean, interval = 100): number {
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
 * Converts a server "remaining ms" into a local deadline when the state
 * arrives, so the countdown keeps ticking between server pushes.
 */
function withDeadline(state: DuelState): DuelState & { receivedAt: number } {
    return { ...state, receivedAt: Date.now() };
}

export default function QuizDuel({
    player,
    points,
    serviceReady,
    wsUrl,
    pin,
}: QuizDuelProps) {
    const { t, i18n } = useTranslations();
    const myId = useMyUserId();
    const [subject, setSubject] = useState<GameSubject>(() =>
        typeof window === 'undefined' ? 'mix' : rememberedSubject(),
    );
    const { play, muted, toggleMuted } = useGameAudio();
    const [state, setState] = useState<
        (DuelState & { receivedAt: number }) | null
    >(null);
    const [message, setMessage] = useState('');
    const [roomError, setRoomError] = useState<string | null>(null);
    const [earned, setEarned] = useState(0);
    const lastReveal = useRef<string | null>(null);
    const lastResult = useRef<string | null>(null);

    const handlers = useMemo(
        () => ({
            onState: (next: DuelState) => {
                setState(withDeadline(next));
                setMessage('');
                setRoomError(null);
            },
            onError: (code: string) => {
                setRoomError(code);
                setMessage(t('duel.errors.generic'));
            },
        }),
        [t],
    );
    const connection = useDuelConnection(
        serviceReady && hasGrade(player.grade) ? wsUrl : null,
        i18n.language,
        handlers,
    );

    const phase = state?.phase ?? 'idle';
    useAdMoments(
        phase === 'done'
            ? 'done'
            : phase === 'countdown' ||
                phase === 'question' ||
                phase === 'reveal'
              ? 'playing'
              : 'idle',
        { muted, won: state?.result?.outcome !== 'lose' },
    );
    const question = state?.question;
    const reveal = state?.reveal;
    const you = state?.you;
    const opponent = state?.opponent;
    const total = state?.total ?? 5;
    const roundMs = state?.round_ms ?? 15000;

    const now = useNow(
        phase === 'question' || phase === 'countdown' || phase === 'queue',
        phase === 'queue' ? 250 : 100,
    );
    const elapsed = state ? Math.max(0, now - state.receivedAt) : 0;
    const questionLeft =
        phase === 'question'
            ? Math.max(0, (question?.remaining_ms ?? 0) - elapsed)
            : 0;
    const countdownLeft =
        phase === 'countdown'
            ? Math.max(0, (state?.countdown_ms ?? 0) - elapsed)
            : 0;
    const queueLeft =
        phase === 'queue'
            ? Math.max(
                  0,
                  Math.ceil(
                      ((state?.bot_after_ms ?? 12000) -
                          (state?.waited_ms ?? 0) -
                          elapsed) /
                          1000,
                  ),
              )
            : 0;

    useEffect(() => {
        if (phase !== 'reveal' || !reveal || !question) {
            return;
        }
        const key = `${question.id}`;
        if (lastReveal.current === key) {
            return;
        }
        lastReveal.current = key;
        play(reveal.yours === reveal.answer ? 'correct' : 'wrong');
    }, [phase, reveal, question, play]);

    useEffect(() => {
        if (phase !== 'done' || !state?.result || !state.match_id) {
            return;
        }
        if (lastResult.current === state.match_id) {
            return;
        }
        lastResult.current = state.match_id;
        setEarned((value) => value + state.result!.points);
        if (state.result.outcome !== 'lose') {
            play('correct');
        }
    }, [phase, state?.result, state?.match_id, play]);

    const gradeLabel = hasGrade(player.grade)
        ? player.grade === KINDERGARTEN
            ? t('player.kindergarten')
            : t('duel.grade', { grade: player.grade })
        : t('duel.noGrade');

    const answer = (option: number) => {
        if (phase !== 'question' || (question?.choice ?? -1) >= 0) {
            return;
        }
        play('step');
        setState((current) =>
            current?.question
                ? {
                      ...current,
                      question: { ...current.question, choice: option },
                  }
                : current,
        );
        connection.send({ t: 'answer', option });
    };

    const online = connection.status === 'online';
    const joinRoom = useCallback(
        (code: string) => connection.send({ t: 'join', pin: code }),
        [connection],
    );
    useRoomPin(online, state?.room?.pin, pin, joinRoom);
    const roomSend = (msg: Record<string, unknown>) => {
        setRoomError(null);
        connection.send(msg);
    };
    const roundNumber =
        phase === 'question' ? (state?.round ?? 0) + 1 : (state?.round ?? 0);

    return (
        <div className="min-h-dvh bg-[#fff4ec] text-[#20364a]">
            <Head title={`${t('duel.title')} — EduFunHub`} />
            <header className="sticky top-0 z-50 flex items-center justify-between gap-2 border-b-2 border-[#20364a] bg-white px-3 py-3 sm:gap-3 sm:px-4">
                <div className="edu-game-brand flex min-w-0 flex-1 items-center gap-2 sm:gap-3">
                    <BackButton
                        href="/portal"
                        label={t('nav.backToPortal')}
                        iconOnly
                    />
                    <BrandLink variant="mark" />
                    <h1 className="flex min-w-0 items-center gap-2 font-display text-lg font-bold sm:text-xl">
                        <Swords className="size-6 shrink-0" />
                        <span className="truncate">{t('duel.title')}</span>
                    </h1>
                    <DigitalClock className="edu-clock--game" />
                </div>
                <SiteNav compact className="shrink-0" />
            </header>

            <main className="flex w-full flex-col gap-3 p-3 sm:gap-4 sm:p-5 lg:px-8">
                <GameAdStrip />
                <div className="flex flex-wrap items-center gap-2 text-sm font-bold">
                    <span
                        className="inline-flex min-h-11 min-w-0 items-center gap-2 rounded-xl border-2 border-[#20364a] bg-white px-3"
                        data-testid="duel-player"
                    >
                        <span className="-my-1 size-9 shrink-0">
                            <PlayerAvatar
                                character={player.character}
                                userId={myId}
                            />
                        </span>
                        <span className="truncate">
                            {player.name} • {gradeLabel}
                        </span>
                    </span>
                    <span
                        className="inline-flex min-h-11 items-center gap-2 rounded-xl border-2 border-[#20364a] bg-[#ffd93d] px-3"
                        data-testid="duel-points"
                    >
                        <Coins className="size-4" />
                        {t('duel.points', { count: points + earned })}
                    </span>
                    {connection.status && (
                        <span
                            className={cn(
                                'inline-flex min-h-11 items-center gap-1.5 rounded-xl border-2 border-[#20364a] px-3 text-xs',
                                online ? 'bg-[#c9f5e5]' : 'bg-[#ffe1e1]',
                            )}
                            data-testid="duel-connection"
                            data-status={connection.status}
                        >
                            {online ? (
                                <Wifi className="size-4" />
                            ) : (
                                <WifiOff className="size-4" />
                            )}
                            <span className="sr-only sm:not-sr-only">
                                {t(`duel.connection.${connection.status}`)}
                            </span>
                        </span>
                    )}
                    <button
                        type="button"
                        onClick={toggleMuted}
                        className="ml-auto inline-flex size-11 items-center justify-center rounded-xl border-2 border-[#20364a] bg-white"
                        aria-label={t(muted ? 'sky.unmute' : 'sky.mute')}
                    >
                        {muted ? (
                            <VolumeX className="size-5" />
                        ) : (
                            <Volume2 className="size-5" />
                        )}
                    </button>
                </div>

                {(phase === 'countdown' ||
                    phase === 'question' ||
                    phase === 'reveal' ||
                    phase === 'done') &&
                    you &&
                    opponent && (
                        <Scoreboard
                            you={you}
                            opponent={opponent}
                            total={total}
                            youLabel={t('duel.you')}
                            botLabel={t('duel.bot')}
                            vsLabel={t('duel.vs')}
                        />
                    )}

                <section
                    className="flex min-h-[22rem] flex-col gap-4 rounded-3xl border-2 border-[#20364a] bg-white p-4 shadow-[4px_4px_0_#20364a] sm:p-6"
                    data-testid="duel-arena"
                    data-phase={phase}
                >
                    {!hasGrade(player.grade) ? (
                        <Centered>
                            <p className="max-w-md text-center font-bold">
                                {t('duel.idle.needGrade')}
                            </p>
                            <NavButton
                                href="/portal"
                                icon={GraduationCap}
                                label={t('duel.idle.setGrade')}
                            />
                        </Centered>
                    ) : !serviceReady || connection.status === 'offline' ? (
                        <Centered>
                            <WifiOff className="size-10" />
                            <p className="max-w-md text-center font-bold">
                                {t('duel.idle.unavailable')}
                            </p>
                        </Centered>
                    ) : phase === 'idle' && state?.room ? (
                        <RoomLobby
                            game="quiz-duel"
                            title={t('duel.title')}
                            room={state.room}
                            status={connection.status}
                            error={roomError}
                            onStart={() => roomSend({ t: 'start' })}
                            onLeave={() => roomSend({ t: 'leave' })}
                            settings={
                                <div className="flex flex-col gap-5">
                                    <SubjectPicker
                                        value={
                                            isGameSubject(state.room.subject)
                                                ? state.room.subject
                                                : 'mix'
                                        }
                                        disabled={
                                            state.room.host !== state.room.you
                                        }
                                        onChange={(value) =>
                                            roomSend({
                                                t: 'subject',
                                                subject: value,
                                            })
                                        }
                                    />
                                    <AnswerTimePicker
                                        value={state.room.answer_seconds ?? 0}
                                        options={
                                            state.room.answer_times ?? [
                                                0, 10, 15, 20, 30, 45, 60,
                                            ]
                                        }
                                        defaultHint={t(
                                            'room.answerTime.default',
                                            { seconds: 15 },
                                        )}
                                        disabled={
                                            state.room.host !== state.room.you
                                        }
                                        onChange={(seconds) =>
                                            roomSend({
                                                t: 'answer_time',
                                                seconds,
                                            })
                                        }
                                    />
                                </div>
                            }
                        />
                    ) : phase === 'idle' ? (
                        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
                            <Centered>
                                <Swords className="size-14 text-[#ff6584]" />
                                <h2 className="text-center font-display text-2xl font-bold">
                                    {t('duel.idle.title', {
                                        name: player.name,
                                    })}
                                </h2>
                                <p className="max-w-md text-center text-sm">
                                    {t('duel.idle.rules', { rounds: total })}
                                </p>
                                <SubjectPicker
                                    value={subject}
                                    onChange={setSubject}
                                    className="w-full max-w-md"
                                />
                                <BigButton
                                    onClick={() =>
                                        connection.send({ t: 'queue', subject })
                                    }
                                    disabled={!online}
                                    testId="duel-start"
                                >
                                    {online ? (
                                        <Swords className="size-5" />
                                    ) : (
                                        <Loader2 className="size-5 animate-spin" />
                                    )}
                                    {t('duel.idle.start')}
                                </BigButton>
                            </Centered>
                            <div data-testid="duel-invite">
                                <h3 className="mb-3 text-center font-display text-xl font-bold">
                                    {t('duel.inviteTitle')}
                                </h3>
                                <RoomEntry
                                    status={connection.status}
                                    error={roomError}
                                    intro={t('duel.inviteIntro')}
                                    createLabel={t('duel.invite')}
                                    onCreate={() => roomSend({ t: 'create' })}
                                    onJoin={(code) =>
                                        roomSend({ t: 'join', pin: code })
                                    }
                                />
                            </div>
                        </div>
                    ) : phase === 'queue' ? (
                        <Centered>
                            <Loader2 className="size-12 animate-spin text-[#ff6584]" />
                            <h2 className="font-display text-2xl font-bold">
                                {t('duel.queue.title')}
                            </h2>
                            <p className="max-w-md text-center text-sm">
                                {t('duel.queue.hint', { seconds: queueLeft })}
                            </p>
                            <button
                                type="button"
                                onClick={() => connection.send({ t: 'cancel' })}
                                className="min-h-11 rounded-xl border-2 border-[#20364a] bg-white px-4 font-bold"
                            >
                                {t('duel.queue.cancel')}
                            </button>
                        </Centered>
                    ) : phase === 'countdown' ? (
                        <Centered>
                            <p className="text-center font-bold">
                                {t('duel.countdown.title', {
                                    name: opponent?.name ?? '',
                                })}
                            </p>
                            <span
                                className="font-display text-7xl font-bold tabular-nums"
                                aria-live="polite"
                            >
                                {Math.max(1, Math.ceil(countdownLeft / 1000))}
                            </span>
                            <p className="text-sm">
                                {t('duel.countdown.ready')}
                            </p>
                            <AdSlot
                                placement="arena.loading"
                                className="w-full max-w-sm"
                            />
                        </Centered>
                    ) : phase === 'done' && state?.result ? (
                        <Result
                            result={state.result}
                            total={total}
                            onAgain={() =>
                                connection.send({ t: 'queue', subject })
                            }
                        />
                    ) : question ? (
                        <>
                            {state?.subject_fallback && (
                                <SubjectFallbackNote subject={state.subject} />
                            )}
                            <div className="flex items-center justify-between gap-3 text-sm font-bold">
                                <span>
                                    {t('duel.round', {
                                        round: Math.min(roundNumber, total),
                                        total,
                                    })}
                                </span>
                                {phase === 'question' && (
                                    <span className="tabular-nums">
                                        {t('duel.question.timeLeft', {
                                            seconds: Math.ceil(
                                                questionLeft / 1000,
                                            ),
                                        })}
                                    </span>
                                )}
                            </div>
                            <div
                                className="h-2.5 overflow-hidden rounded-full border-2 border-[#20364a] bg-[#eef5f7]"
                                aria-hidden="true"
                            >
                                <div
                                    className={cn(
                                        'h-full transition-[width] duration-100 ease-linear',
                                        questionLeft < 5000
                                            ? 'bg-[#ff6584]'
                                            : 'bg-[#00c9a7]',
                                    )}
                                    style={{
                                        width: `${phase === 'question' ? (questionLeft / roundMs) * 100 : 0}%`,
                                    }}
                                />
                            </div>
                            <h2
                                className="text-center font-display text-xl leading-snug font-bold sm:text-2xl"
                                data-testid="duel-question"
                            >
                                {question.text}
                            </h2>
                            <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 sm:gap-3">
                                {question.options.map((text, index) => {
                                    const chosen = question.choice === index;
                                    const isAnswer =
                                        phase === 'reveal' &&
                                        reveal?.answer === index;
                                    const wrongPick =
                                        phase === 'reveal' &&
                                        chosen &&
                                        !isAnswer;
                                    const locked =
                                        phase !== 'question' ||
                                        question.choice >= 0;
                                    return (
                                        <button
                                            key={`${question.id}-${index}`}
                                            type="button"
                                            onClick={() => answer(index)}
                                            disabled={locked}
                                            data-testid={`duel-option-${index}`}
                                            aria-label={t('duel.answerLabel', {
                                                letter: LETTERS[index],
                                                text,
                                            })}
                                            className={cn(
                                                'flex min-h-14 items-center gap-3 rounded-2xl border-2 border-[#20364a] px-4 py-3 text-left font-bold transition-transform',
                                                OPTION_COLORS[index],
                                                !locked &&
                                                    'hover:-translate-y-0.5 active:translate-y-0',
                                                chosen &&
                                                    phase === 'question' &&
                                                    'ring-4 ring-[#20364a]/30',
                                                isAnswer &&
                                                    'bg-[#00c9a7] text-white',
                                                wrongPick &&
                                                    'bg-[#ff6584] text-white',
                                                locked &&
                                                    !chosen &&
                                                    !isAnswer &&
                                                    'opacity-60',
                                            )}
                                        >
                                            <span className="flex size-8 shrink-0 items-center justify-center rounded-lg border-2 border-current bg-white/70 text-sm text-[#20364a]">
                                                {isAnswer ? (
                                                    <Check className="size-4" />
                                                ) : wrongPick ? (
                                                    <X className="size-4" />
                                                ) : (
                                                    LETTERS[index]
                                                )}
                                            </span>
                                            <span className="min-w-0 break-words">
                                                {text}
                                            </span>
                                        </button>
                                    );
                                })}
                            </div>
                            <RoundStatus state={state!} message={message} />
                        </>
                    ) : null}
                </section>
            </main>
            <GameFinale
                game="quiz-duel"
                done={phase === 'done' && Boolean(state?.result)}
                matchKey={state?.match_id}
                won={state?.result?.outcome === 'win'}
                points={state?.result?.points}
                title={
                    state?.result
                        ? t(`duel.result.${state.result.outcome}`)
                        : undefined
                }
                standings={
                    state?.result && you && opponent
                        ? [
                              {
                                  key: 'you',
                                  name: you.name,
                                  score: state.result.score,
                                  character: you.character,
                                  seat: 0,
                                  userId: myId,
                                  isYou: true,
                              },
                              {
                                  key: 'opponent',
                                  name: opponent.name,
                                  score: state.result.opponent_score,
                                  character: opponent.character,
                                  seat: 1,
                                  userId: opponent.user_id,
                              },
                          ]
                              .sort((a, b) => b.score - a.score)
                              .map((row, _, rows) => ({
                                  ...row,
                                  rank:
                                      rows.filter((o) => o.score > row.score)
                                          .length + 1,
                              }))
                        : []
                }
                onPlayAgain={() => connection.send({ t: 'queue', subject })}
                playAgainLabel={t('duel.result.again')}
            />
        </div>
    );
}

function RoundStatus({
    state,
    message,
}: {
    state: DuelState;
    message: string;
}) {
    const { t } = useTranslations();
    const { phase, question, reveal, opponent } = state;
    let text = message;

    if (!text && phase === 'reveal' && reveal && question) {
        const mine =
            reveal.yours < 0
                ? t('duel.reveal.timeout')
                : reveal.yours === reveal.answer
                  ? t('duel.reveal.correct', { score: reveal.gained })
                  : t('duel.reveal.wrong');
        const theirs =
            reveal.theirs === reveal.answer
                ? t('duel.reveal.opponentCorrect', {
                      score: reveal.opponent_gained,
                  })
                : t('duel.reveal.opponentWrong');
        text = `${mine} ${t('duel.reveal.answer', { answer: question.options[reveal.answer] })} • ${theirs}`;
    } else if (!text && phase === 'question' && opponent) {
        text = !opponent.online
            ? t('duel.question.opponentOffline')
            : (question?.choice ?? -1) >= 0
              ? t('duel.question.waiting')
              : opponent.answered
                ? t('duel.question.opponentAnswered')
                : t('duel.question.opponentThinking');
    }

    return (
        <p
            className="min-h-10 rounded-xl bg-[#eef5f7] px-3 py-2 text-center text-sm font-bold"
            aria-live="polite"
            data-testid="duel-status"
        >
            {text}
        </p>
    );
}

function Scoreboard({
    you,
    opponent,
    total,
    youLabel,
    botLabel,
    vsLabel,
}: {
    you: NonNullable<DuelState['you']>;
    opponent: NonNullable<DuelState['opponent']>;
    total: number;
    youLabel: string;
    botLabel: string;
    vsLabel: string;
}) {
    const myId = useMyUserId();
    return (
        <div
            className="grid grid-cols-[1fr_auto_1fr] items-stretch gap-2"
            data-testid="duel-scoreboard"
        >
            <SideCard
                label={youLabel}
                name={you.name}
                character={you.character}
                userId={myId}
                score={you.score ?? 0}
                history={you.history ?? []}
                total={total}
                accent="bg-[#bceaf2]"
            />
            <span className="flex items-center font-display text-lg font-bold">
                {vsLabel}
            </span>
            <SideCard
                label={opponent.bot ? botLabel : undefined}
                name={opponent.name}
                character={opponent.character}
                seat={1}
                userId={opponent.user_id}
                score={opponent.score ?? 0}
                history={opponent.history ?? []}
                total={total}
                accent="bg-[#ffd6e0]"
                bot={opponent.bot}
                offline={!opponent.online}
                alignEnd
            />
        </div>
    );
}

function SideCard({
    label,
    name,
    character,
    seat = 0,
    userId,
    score,
    history,
    total,
    accent,
    bot,
    offline,
    alignEnd,
}: {
    label?: string;
    name: string;
    character?: CharacterLook | null;
    seat?: number;
    userId?: number | null;
    score: number;
    history: boolean[];
    total: number;
    accent: string;
    bot?: boolean;
    offline?: boolean;
    alignEnd?: boolean;
}) {
    return (
        <div
            className={cn(
                'flex min-w-0 flex-col gap-1 rounded-2xl border-2 border-[#20364a] px-3 py-2',
                accent,
                alignEnd && 'items-end text-right',
                offline && 'opacity-60',
            )}
        >
            <span
                className={cn(
                    'flex max-w-full items-center gap-2',
                    alignEnd && 'flex-row-reverse',
                )}
            >
                <span className="size-10 shrink-0">
                    <PlayerAvatar
                        character={character}
                        seat={seat}
                        userId={userId}
                    />
                </span>
                <span
                    className={cn(
                        'flex min-w-0 flex-col',
                        alignEnd && 'items-end',
                    )}
                >
                    <span className="flex max-w-full items-center gap-1 text-xs font-bold">
                        {bot && <Bot className="size-3.5 shrink-0" />}
                        <span className="truncate">
                            {label ? `${label} · ${name}` : name}
                        </span>
                    </span>
                    <span className="font-display text-2xl leading-none font-bold tabular-nums">
                        {score}
                    </span>
                </span>
            </span>
            <span className="flex gap-1" aria-hidden="true">
                {Array.from({ length: total }, (_, i) => (
                    <span
                        key={i}
                        className={cn(
                            'size-2.5 rounded-full border border-[#20364a]',
                            history[i] === true && 'bg-[#00c9a7]',
                            history[i] === false && 'bg-[#ff6584]',
                            history[i] === undefined && 'bg-white',
                        )}
                    />
                ))}
            </span>
        </div>
    );
}

function Result({
    result,
    total,
    onAgain,
}: {
    result: NonNullable<DuelState['result']>;
    total: number;
    onAgain: () => void;
}) {
    const { t } = useTranslations();
    return (
        <Centered>
            <Trophy
                className={cn(
                    'size-14',
                    result.outcome === 'win'
                        ? 'text-[#f5a623]'
                        : 'text-[#20364a]/40',
                )}
            />
            <h2
                className="text-center font-display text-3xl font-bold"
                data-testid="duel-outcome"
                data-outcome={result.outcome}
            >
                {t(`duel.result.${result.outcome}`)}
            </h2>
            <p className="text-center font-bold">
                {t('duel.result.summary', {
                    correct: result.correct,
                    total,
                    score: result.score,
                    opponent: result.opponent_score,
                })}
            </p>
            <p className="rounded-xl bg-[#ffd93d] px-3 py-1.5 text-sm font-bold">
                {result.points > 0
                    ? t('duel.result.earned', { points: result.points })
                    : t('duel.result.noPoints')}
            </p>
            <div className="flex flex-wrap justify-center gap-2">
                <BigButton onClick={onAgain} testId="duel-again">
                    <RotateCcw className="size-5" />
                    {t('duel.result.again')}
                </BigButton>
                <NavButton href="/portal" label={t('duel.result.back')} />
            </div>
            <AdSlot placement="arena.result" className="w-full max-w-md" />
        </Centered>
    );
}

function Centered({ children }: { children: React.ReactNode }) {
    return (
        <div className="flex flex-1 flex-col items-center justify-center gap-4 py-6">
            {children}
        </div>
    );
}

function BigButton({
    children,
    onClick,
    disabled,
    testId,
}: {
    children: React.ReactNode;
    onClick: () => void;
    disabled?: boolean;
    testId?: string;
}) {
    return (
        <button
            type="button"
            onClick={onClick}
            disabled={disabled}
            data-testid={testId}
            className="inline-flex min-h-12 items-center gap-2 rounded-2xl border-2 border-[#20364a] bg-[#ff6584] px-6 font-display text-lg font-bold text-white shadow-[3px_3px_0_#20364a] transition-transform hover:-translate-y-0.5 active:translate-y-0 disabled:opacity-60"
        >
            {children}
        </button>
    );
}
