import AdSlot from '@/components/ads/ad-slot';
import GameAdStrip from '@/components/ads/game-ad-strip';
import { BrandLink } from '@/components/brand-link';
import { DigitalClock } from '@/components/digital-clock';
import { GameFinale, rankStandings } from '@/components/game-finale';
import {
    AnswerTimePicker,
    RoomLeaveControl,
} from '@/components/multiplayer/host-controls';
import {
    ConnectionBadge,
    RoomEntry,
    RoomError,
    RoomLobby,
    useRoomPin,
} from '@/components/multiplayer/room';
import {
    isGameSubject,
    MIX_SUBJECT,
    SubjectFallbackNote,
    SubjectPicker,
} from '@/components/multiplayer/subject-picker';
import { PlayerAvatar } from '@/components/player-avatar';
import { BackButton, SiteNav, useGameBackHref } from '@/components/site-nav';
import {
    DPad,
    QuestionBar,
    SEAT_COLORS,
    SnakeCanvas,
    TailGauge,
    useSnakeControls,
} from '@/components/snake/board';
import HowToPlaySnake from '@/components/snake/how-to-play';
import { type SnakeMode, type SnakeState, useSnake } from '@/hooks/use-snake';
import { useTranslations } from '@/hooks/use-translations';
import { useAdMoments } from '@/lib/ads';
import { useSubjectName } from '@/lib/subjects';
import { Head } from '@inertiajs/react';
import {
    Heart,
    Ruler,
    Timer,
    Trophy,
    Volume2,
    VolumeX,
    Worm,
} from 'lucide-react';
import { useEffect, useRef, useState } from 'react';

interface Props {
    player: { name: string; grade: number | null };
    serviceReady: boolean;
    wsUrl: string | null;
    pin: string | null;
}

const MODES: SnakeMode[] = ['shared', 'split'];

function seconds(ms: number): number {
    return Math.ceil(Math.max(0, ms) / 1000);
}

function feedbackTitle(
    state: SnakeState,
    t: (key: string, options?: Record<string, unknown>) => string,
): string {
    const f = state.feedback;
    if (!f) return '';
    const name = state.players.find((p) => p.seat === f.seat)?.name ?? '';
    const mine = f.seat === state.you;
    if (f.label === 'crash') {
        return t(mine ? 'snake.feedback.crashYou' : 'snake.feedback.crash', {
            name,
        });
    }
    if (f.timeout) {
        return t('snake.feedback.timeout', { grow: state.grow });
    }
    if (f.correct) {
        return t(
            mine ? 'snake.feedback.correctYou' : 'snake.feedback.correct',
            {
                name,
                cut: state.cut,
                label: f.label,
            },
        );
    }
    return t(mine ? 'snake.feedback.wrongYou' : 'snake.feedback.wrong', {
        name,
        grow: state.grow,
        label: f.label,
    });
}

export default function MainUlar({ player, serviceReady, wsUrl, pin }: Props) {
    const { t, i18n } = useTranslations();
    const backHref = useGameBackHref();
    const subjectName = useSubjectName();
    const [muted, setMuted] = useState(false);
    const game = useSnake(serviceReady ? wsUrl : null, i18n.language);
    const { state, send, status, turn, ready } = game;
    const join = (code: string) => {
        send({ t: 'join', pin: code });
    };
    useRoomPin(status === 'online', state?.pin, pin, join);
    const playing = state?.phase === 'playing';
    const done = state?.phase === 'done';
    const won = Boolean(done && state.winner === state.you);
    const isHost = Boolean(state && state.host === state.you);
    useAdMoments(playing ? 'playing' : done ? 'done' : 'idle', { muted, won });
    const me = state?.players.find((p) => p.seat === state.you);
    const question = state?.board?.question ?? null;
    const reading = Boolean(playing && question?.phase === 'read');
    const meOnBoard = state?.board?.snakes.find((s) => s.seat === state.you);
    const imReady = Boolean(meOnBoard?.ready);
    const canSteer = Boolean(
        playing && status === 'online' && me?.alive && !reading,
    );
    const boardRef = useRef<HTMLDivElement>(null);
    useSnakeControls(canSteer, turn, boardRef);
    const gridRef = useRef<HTMLDivElement>(null);
    const startKey =
        playing && state ? `${state.pin}-${state.match?.key ?? ''}` : null;
    useEffect(() => {
        if (!startKey || !window.matchMedia('(max-width: 760px)').matches) {
            return;
        }
        gridRef.current?.scrollIntoView({ block: 'start', behavior: 'smooth' });
    }, [startKey]);
    const markReady = () => {
        ready();
        if (window.matchMedia('(max-width: 760px)').matches) {
            boardRef.current?.scrollIntoView({
                block: 'center',
                behavior: 'smooth',
            });
        }
    };
    const leave = () => send({ t: 'leave' });
    const playAgain = () => send({ t: 'start' });
    const feedback = state?.feedback ?? null;
    const shownFeedback =
        feedback &&
        playing &&
        (state?.mode === 'shared' ||
            feedback.seat === state?.you ||
            feedback.seat < 0 ||
            feedback.attack?.to === state?.you)
            ? feedback
            : null;

    return (
        <div className="sn-page min-h-dvh">
            <Head title={t('snake.title')} />
            <header className="sticky top-0 z-30 border-b-4 border-[#1f2a44] bg-[#f6f3e9]">
                <div className="mx-auto flex min-h-16 items-center justify-between gap-2 px-3 py-2 sm:px-6 lg:px-8">
                    <div className="edu-game-brand flex min-w-0 flex-1 items-center gap-2 sm:gap-3">
                        <BackButton
                            href={backHref}
                            label={t('snake.back')}
                            iconOnly
                        />
                        <BrandLink variant="mark" />
                        <span className="hidden size-10 shrink-0 place-items-center rounded-xl border-2 border-[#1f2a44] bg-[#16a34a] text-white shadow-[2px_2px_0px_#1f2a44] sm:grid">
                            <Worm className="size-5" aria-hidden="true" />
                        </span>
                        <div className="flex min-w-0 flex-col">
                            <h1 className="truncate font-display text-lg font-black text-[#1f2a44] sm:text-2xl">
                                {t('snake.title')}
                            </h1>
                            <span className="hidden truncate text-xs font-bold text-slate-600 sm:block">
                                {t('snake.subtitle')}
                            </span>
                        </div>
                        <DigitalClock className="edu-clock--game" />
                    </div>
                    <div className="flex shrink-0 items-center gap-1.5">
                        <button
                            type="button"
                            className="edu-nav-btn edu-nav-btn--icon"
                            onClick={() => setMuted((value) => !value)}
                            aria-label={t(
                                muted ? 'snake.unmute' : 'snake.mute',
                            )}
                            aria-pressed={muted}
                            data-testid="sn-mute"
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
            <main className="sn-main">
                <div className="sn-topline">
                    <p className="sn-eyebrow">{t('snake.eyebrow')}</p>
                    {state && state.phase !== 'lobby' && (
                        <ConnectionBadge status={status} />
                    )}
                </div>
                <GameAdStrip />
                {!serviceReady ? (
                    <div className="sn-notice" role="status">
                        {t('snake.unavailable')}
                    </div>
                ) : !state ? (
                    <RoomEntry
                        game="snake"
                        status={status}
                        error={game.error}
                        intro={t('snake.intro', { name: player.name })}
                        onCreate={() => send({ t: 'create' })}
                        onJoin={join}
                    >
                        <p>{t('snake.rules')}</p>
                    </RoomEntry>
                ) : state.phase === 'lobby' ? (
                    <RoomLobby
                        game="snake"
                        title={t('snake.title')}
                        room={state}
                        status={status}
                        error={game.error}
                        onStart={() => send({ t: 'start' })}
                        onLeave={leave}
                        soloHint={t('snake.soloHint')}
                        settings={
                            <div className="flex flex-col gap-5">
                                <div>
                                    <p className="sn-setting-label">
                                        {t('snake.modeLabel')}
                                    </p>
                                    <div className="sn-modes" role="group">
                                        {MODES.map((mode) => (
                                            <button
                                                type="button"
                                                key={mode}
                                                className="sn-mode"
                                                aria-pressed={
                                                    state.mode === mode
                                                }
                                                disabled={
                                                    !isHost ||
                                                    status !== 'online'
                                                }
                                                data-testid={`sn-mode-${mode}`}
                                                onClick={() =>
                                                    send({ t: 'mode', mode })
                                                }
                                            >
                                                <strong>
                                                    {t(
                                                        `snake.modes.${mode}.title`,
                                                    )}
                                                </strong>
                                                <small>
                                                    {t(
                                                        `snake.modes.${mode}.body`,
                                                    )}
                                                </small>
                                            </button>
                                        ))}
                                    </div>
                                </div>
                                <SubjectPicker
                                    value={
                                        isGameSubject(state.subject)
                                            ? state.subject
                                            : MIX_SUBJECT
                                    }
                                    disabled={!isHost || status !== 'online'}
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
                                    disabled={!isHost || status !== 'online'}
                                    onChange={(value) =>
                                        send({
                                            t: 'answer_time',
                                            seconds: value,
                                        })
                                    }
                                />
                            </div>
                        }
                    />
                ) : (
                    <div className="sn-game-grid" ref={gridRef}>
                        <section
                            className="sn-arena"
                            aria-label={t('snake.arena')}
                        >
                            <div className="sn-match-meta">
                                <span>
                                    {t(`snake.modes.${state.mode}.title`)}
                                </span>
                                {playing && (
                                    <span className="inline-flex items-center gap-1">
                                        <Timer size={14} aria-hidden="true" />
                                        {t('snake.gameLeft', {
                                            time: `${Math.floor(seconds(state.remaining_ms) / 60)}:${String(seconds(state.remaining_ms) % 60).padStart(2, '0')}`,
                                        })}
                                    </span>
                                )}
                            </div>
                            <div className="sn-board-wrap" ref={boardRef}>
                                {state.board && (
                                    <SnakeCanvas
                                        board={state.board}
                                        grid={state.grid}
                                        you={state.you}
                                        label={t('snake.boardLabel')}
                                    />
                                )}
                                {playing && me && !me.alive && (
                                    <div className="sn-overlay" role="status">
                                        <small>{t('snake.out')}</small>
                                    </div>
                                )}
                            </div>
                            <DPad disabled={!canSteer} onTurn={turn} />
                            {state.mode === 'split' &&
                                state.boards.length > 0 && (
                                    <div className="sn-minis">
                                        {state.boards.map((board) => (
                                            <div
                                                className="sn-mini"
                                                key={board.seat}
                                            >
                                                <SnakeCanvas
                                                    board={board}
                                                    grid={state.grid}
                                                    you={state.you}
                                                    label={t(
                                                        'snake.opponentBoard',
                                                        {
                                                            name:
                                                                state.players.find(
                                                                    (p) =>
                                                                        p.seat ===
                                                                        board.seat,
                                                                )?.name ?? '',
                                                        },
                                                    )}
                                                    mini
                                                />
                                                <span>
                                                    {
                                                        state.players.find(
                                                            (p) =>
                                                                p.seat ===
                                                                board.seat,
                                                        )?.name
                                                    }
                                                </span>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            <p className="sn-hint">{t('snake.controlsHint')}</p>
                        </section>
                        <section className="sn-panel sn-panel--question">
                            <RoomError code={game.error} />
                            {playing ? (
                                <>
                                    <div className="sn-status">
                                        <div className="sn-turn" role="status">
                                            {reading
                                                ? t('snake.read.status')
                                                : canSteer
                                                  ? t('snake.steer')
                                                  : t('snake.waiting')}
                                        </div>
                                        {question && (
                                            <div
                                                className="sn-clock"
                                                data-phase={question.phase}
                                            >
                                                <Timer
                                                    size={18}
                                                    aria-hidden="true"
                                                />
                                                <span data-testid="sn-question-time">
                                                    {t(
                                                        reading
                                                            ? 'snake.read.left'
                                                            : 'snake.seconds',
                                                        {
                                                            count: seconds(
                                                                reading
                                                                    ? question.read_ms
                                                                    : question.hunt_ms,
                                                            ),
                                                        },
                                                    )}
                                                </span>
                                            </div>
                                        )}
                                    </div>
                                    <QuestionBar
                                        text={
                                            question?.text ??
                                            t('snake.preparing')
                                        }
                                        subject={
                                            question
                                                ? subjectName(question.subject)
                                                : undefined
                                        }
                                        options={question?.options ?? []}
                                        labels={question?.labels ?? []}
                                    />
                                    {reading && question && me?.alive && (
                                        <div
                                            className="sn-read"
                                            role="status"
                                            data-testid="sn-read-overlay"
                                        >
                                            <div className="sn-read-card">
                                                <strong>
                                                    {t('snake.read.title')}
                                                </strong>
                                                <small>
                                                    {t('snake.read.body')}
                                                </small>
                                                <button
                                                    type="button"
                                                    className="sn-read-ready"
                                                    onClick={markReady}
                                                    disabled={
                                                        imReady ||
                                                        status !== 'online'
                                                    }
                                                    data-testid="sn-ready"
                                                >
                                                    {imReady
                                                        ? t(
                                                              'snake.read.waitOthers',
                                                          )
                                                        : t('snake.read.ready')}
                                                </button>
                                            </div>
                                        </div>
                                    )}
                                    {me && (
                                        <TailGauge
                                            tail={me.tail ?? 0}
                                            start={state.initial_tail}
                                        />
                                    )}
                                    {state.subject_fallback && (
                                        <SubjectFallbackNote
                                            subject={state.subject}
                                            className="sn-fallback"
                                        />
                                    )}
                                </>
                            ) : (
                                <div className="sn-result">
                                    <Trophy size={36} aria-hidden="true" />
                                    <h2>
                                        {t(
                                            state.stopped
                                                ? 'snake.stopped'
                                                : won
                                                  ? state.reason === 'cleared'
                                                      ? 'snake.cleared_win'
                                                      : 'snake.won'
                                                  : state.winner === null
                                                    ? state.players.length === 1
                                                        ? 'snake.soloOut'
                                                        : 'snake.noWinner'
                                                    : 'snake.finished',
                                        )}
                                    </h2>
                                    {state.result && (
                                        <p>
                                            {t('snake.points', {
                                                points: state.result.points,
                                            })}
                                        </p>
                                    )}
                                    {isHost ? (
                                        <button
                                            type="button"
                                            className="sn-action"
                                            data-testid="sn-play-again"
                                            onClick={playAgain}
                                            disabled={status !== 'online'}
                                        >
                                            {t('snake.playAgain')}
                                        </button>
                                    ) : (
                                        <p data-testid="sn-wait-host">
                                            {t('room.waitingHost')}
                                        </p>
                                    )}
                                    <AdSlot placement="arena.result" />
                                </div>
                            )}
                        </section>
                        <section className="sn-panel sn-panel--side">
                            <div
                                className="sn-players"
                                aria-label={t('snake.players')}
                            >
                                {state.players.map((p) => (
                                    <div
                                        key={p.seat}
                                        className="sn-player"
                                        data-you={p.seat === state.you}
                                        data-alive={
                                            p.alive !== false && !p.left
                                        }
                                        data-testid={`sn-player-${p.seat}`}
                                    >
                                        <span className="sn-player-avatar">
                                            <PlayerAvatar
                                                character={p.character}
                                                seat={p.seat}
                                                userId={p.user_id}
                                            />
                                            <i
                                                style={{
                                                    background:
                                                        SEAT_COLORS[
                                                            p.seat %
                                                                SEAT_COLORS.length
                                                        ],
                                                }}
                                            />
                                        </span>
                                        <span className="min-w-0">
                                            <span className="sn-player-name block">
                                                {p.name}
                                            </span>
                                            <span className="sn-player-stats">
                                                <span title={t('snake.tail')}>
                                                    <Ruler aria-hidden="true" />
                                                    {p.tail ?? 0}
                                                </span>
                                                <span title={t('snake.lives')}>
                                                    <Heart aria-hidden="true" />
                                                    {p.lives ?? 0}
                                                </span>
                                                <span title={t('snake.score')}>
                                                    <Trophy aria-hidden="true" />
                                                    {p.score ?? 0}
                                                </span>
                                            </span>
                                        </span>
                                    </div>
                                ))}
                            </div>
                            {shownFeedback && (
                                <div
                                    key={shownFeedback.seq}
                                    className="sn-feedback"
                                    data-correct={shownFeedback.correct}
                                    data-attack={Boolean(
                                        shownFeedback.attack &&
                                        shownFeedback.attack.to === state.you,
                                    )}
                                    role="status"
                                    data-testid="sn-feedback"
                                >
                                    <strong>
                                        {feedbackTitle(state, (key, options) =>
                                            t(key, options),
                                        )}
                                    </strong>
                                    {shownFeedback.attack &&
                                        shownFeedback.attack.to ===
                                            state.you && (
                                            <p>
                                                {t(
                                                    `snake.feedback.attack.${shownFeedback.attack.kind}`,
                                                )}
                                            </p>
                                        )}
                                    {shownFeedback.prompt && (
                                        <span className="sn-feedback-term">
                                            {t('snake.previousQuestion', {
                                                prompt: shownFeedback.prompt,
                                            })}
                                        </span>
                                    )}
                                    {shownFeedback.answer && (
                                        <p>
                                            {t('snake.answer', {
                                                answer: shownFeedback.answer,
                                            })}
                                        </p>
                                    )}
                                    {shownFeedback.hint && (
                                        <p>
                                            {t('snake.hint', {
                                                hint: shownFeedback.hint,
                                            })}
                                        </p>
                                    )}
                                </div>
                            )}
                            <div className="sn-leave">
                                <RoomLeaveControl
                                    isHost={isHost && playing}
                                    onLeave={leave}
                                    onStop={() => send({ t: 'stop' })}
                                    disabled={status !== 'online'}
                                />
                            </div>
                        </section>
                    </div>
                )}
                {!playing && <HowToPlaySnake />}
                <GameFinale
                    game="snake"
                    done={Boolean(done)}
                    matchKey={
                        state?.match?.key ??
                        (state ? `${state.pin}-${state.seq}` : null)
                    }
                    standings={rankStandings(
                        state?.players ?? [],
                        (p) =>
                            (state?.winner === p.seat ? 10000 : 0) +
                            (p.alive ? 1000 : 0) -
                            (p.tail ?? 0),
                        (p, rank) => ({
                            key: p.seat,
                            name: p.name,
                            rank,
                            character: p.character,
                            seat: p.seat,
                            userId: p.user_id,
                            isYou: p.seat === state?.you,
                            score: p.score ?? 0,
                        }),
                    )}
                    won={won}
                    points={state?.result?.points}
                    onPlayAgain={isHost ? playAgain : undefined}
                />
            </main>
        </div>
    );
}
