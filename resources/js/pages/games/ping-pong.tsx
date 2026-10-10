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
import { Court, OptionPads, QuestionCard } from '@/components/ping-pong/court';
import HowToPlay from '@/components/ping-pong/how-to-play';
import { BackButton, SiteNav, useGameBackHref } from '@/components/site-nav';
import { usePingPong } from '@/hooks/use-ping-pong';
import { useTranslations } from '@/hooks/use-translations';
import { useAdMoments } from '@/lib/ads';
import { useSubjectName } from '@/lib/subjects';
import { Head } from '@inertiajs/react';
import { Timer, Trophy, Volume2, VolumeX, Zap } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';

interface Props {
    player: { name: string; grade: number | null };
    serviceReady: boolean;
    wsUrl: string | null;
    pin: string | null;
}
export default function PingPong({ player, serviceReady, wsUrl, pin }: Props) {
    const { t, i18n } = useTranslations();
    const backHref = useGameBackHref();
    const subjectName = useSubjectName();
    const [muted, setMuted] = useState(false);
    const game = usePingPong(serviceReady ? wsUrl : null, i18n.language);
    const { state, send, status } = game;
    const join = useCallback(
        (code: string) => {
            send({ t: 'join', pin: code });
        },
        [send],
    );
    useRoomPin(status === 'online', state?.pin, pin, join);
    const playing = state?.phase === 'playing';
    const done = state?.phase === 'done';
    const won = done && state.winner === state.you;
    const isHost = Boolean(state && state.host === state.you);
    useAdMoments(playing ? 'playing' : done ? 'done' : 'idle', { muted, won });
    const canAnswer = Boolean(
        playing &&
        status === 'online' &&
        state.players.some(
            (p) => p.seat === state.turn && p.controlled && !p.bot,
        ) &&
        !game.submitted &&
        state.remaining_ms > 0,
    );
    const turnPlayer = state?.players.find((p) => p.seat === state.turn);
    const gridRef = useRef<HTMLDivElement>(null);
    const matchKey =
        playing && state
            ? `${state.pin}-${state.round - (state.turn_number ?? 1)}`
            : null;
    useEffect(() => {
        if (!matchKey || !window.matchMedia('(max-width: 760px)').matches) {
            return;
        }
        gridRef.current?.scrollIntoView({ block: 'start', behavior: 'smooth' });
    }, [matchKey]);
    const leave = () => {
        send({ t: 'leave' });
    };
    const playAgain = () => {
        send({ t: 'start' });
    };
    return (
        <div className="pp-page min-h-dvh">
            <Head title={t('pingPong.title')} />
            <header className="pp-header sticky top-0 z-30 border-b-4 border-[#1f2a44] bg-[#f6f3e9]">
                <div className="mx-auto flex min-h-16 items-center justify-between gap-2 px-3 py-2 sm:px-6 lg:px-8">
                    <div className="edu-game-brand flex min-w-0 flex-1 items-center gap-2 sm:gap-3">
                        <BackButton
                            href={backHref}
                            label={t('pingPong.back')}
                            iconOnly
                        />
                        <BrandLink variant="mark" />
                        <span className="hidden size-10 shrink-0 place-items-center rounded-xl border-2 border-[#1f2a44] bg-[#0f766e] text-white shadow-[2px_2px_0px_#1f2a44] sm:grid">
                            <Zap className="size-5" aria-hidden="true" />
                        </span>
                        <div className="flex min-w-0 flex-col">
                            <h1 className="truncate font-display text-lg font-black text-[#1f2a44] sm:text-2xl">
                                {t('pingPong.title')}
                            </h1>
                            <span className="hidden truncate text-xs font-bold text-slate-600 sm:block">
                                {t('pingPong.subtitle')}
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
                                muted ? 'pingPong.unmute' : 'pingPong.mute',
                            )}
                            aria-pressed={muted}
                            data-testid="pp-mute"
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
            <main className="pp-main">
                <div className="pp-topline">
                    <p className="pp-eyebrow">{t('pingPong.eyebrow')}</p>
                    {state && state.phase !== 'lobby' && (
                        <ConnectionBadge status={status} />
                    )}
                </div>
                <GameAdStrip />
                {!serviceReady ? (
                    <div className="pp-notice" role="status">
                        {t('pingPong.unavailable')}
                    </div>
                ) : !state ? (
                    <RoomEntry
                        game="ping-pong"
                        status={status}
                        error={game.error}
                        intro={t('pingPong.intro', { name: player.name })}
                        onCreate={() => send({ t: 'create' })}
                        onJoin={join}
                    >
                        <p>{t('pingPong.rules')}</p>
                    </RoomEntry>
                ) : state.phase === 'lobby' ? (
                    <RoomLobby
                        game="ping-pong"
                        title={t('pingPong.title')}
                        room={state}
                        status={status}
                        error={game.error}
                        onStart={() => send({ t: 'start' })}
                        onLeave={leave}
                        soloHint={t('pingPong.soloHint')}
                        settings={
                            <div className="flex flex-col gap-5">
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
                                    onChange={(seconds) =>
                                        send({ t: 'answer_time', seconds })
                                    }
                                />
                            </div>
                        }
                    />
                ) : (
                    <div className="pp-game-grid" ref={gridRef}>
                        <section
                            className="pp-arena"
                            aria-label={t('pingPong.scoreboard')}
                        >
                            <div className="pp-match-meta">
                                <span>
                                    {t('pingPong.target', {
                                        target: state.target,
                                    })}
                                </span>
                                <span>
                                    {t('pingPong.round', {
                                        round: state.turn_number ?? state.round,
                                        total: state.max_rounds,
                                    })}
                                </span>
                            </div>
                            <Court
                                players={state.players}
                                goals={state.goals}
                                turn={state.turn}
                                round={state.round}
                                goal={Boolean(state.feedback?.goal)}
                            />
                            <div className="pp-rally">
                                <Trophy size={18} />
                                {t('pingPong.rally', { count: state.rally })}
                            </div>
                        </section>
                        <section className="pp-answer-panel">
                            <RoomError code={game.error} />
                            {playing ? (
                                <>
                                    <div className="pp-status">
                                        <div className="pp-turn" role="status">
                                            {t(
                                                game.submitted
                                                    ? 'pingPong.submitted'
                                                    : canAnswer
                                                      ? 'pingPong.yourTurn'
                                                      : 'pingPong.waitTurn',
                                                {
                                                    name:
                                                        turnPlayer?.name ??
                                                        t('pingPong.bot'),
                                                },
                                            )}
                                        </div>
                                        <div className="pp-clock">
                                            <Timer size={18} />
                                            <span>
                                                {t('pingPong.seconds', {
                                                    count: Math.ceil(
                                                        Math.max(
                                                            0,
                                                            state.remaining_ms,
                                                        ) / 1000,
                                                    ),
                                                })}
                                            </span>
                                        </div>
                                    </div>
                                    <QuestionCard
                                        text={
                                            state.question?.text ??
                                            t('pingPong.preparing')
                                        }
                                        subject={
                                            state.question
                                                ? subjectName(
                                                      state.question.subject,
                                                  )
                                                : undefined
                                        }
                                    />
                                    {state.question && (
                                        <OptionPads
                                            key={state.question.id}
                                            options={state.question.options}
                                            disabled={!canAnswer}
                                            selected={game.choice ?? undefined}
                                            onChoose={game.answer}
                                        />
                                    )}
                                    <p className="pp-help">
                                        {t('pingPong.answerHint')}
                                    </p>
                                    {state.subject_fallback && (
                                        <SubjectFallbackNote
                                            subject={state.subject}
                                            className="pp-fallback"
                                        />
                                    )}
                                </>
                            ) : (
                                <div className="pp-result">
                                    <Trophy size={36} />
                                    <h2>
                                        {t(
                                            state.stopped
                                                ? 'pingPong.stopped'
                                                : state.winner === null
                                                  ? 'pingPong.draw'
                                                  : won
                                                    ? 'pingPong.won'
                                                    : 'pingPong.finished',
                                        )}
                                    </h2>
                                    {state.result && (
                                        <p>
                                            {t('pingPong.points', {
                                                points: state.result.points,
                                            })}
                                        </p>
                                    )}
                                    {isHost ? (
                                        <button
                                            type="button"
                                            className="pp-action"
                                            data-testid="pp-play-again"
                                            onClick={playAgain}
                                            disabled={status !== 'online'}
                                        >
                                            {t('pingPong.playAgain')}
                                        </button>
                                    ) : (
                                        <p data-testid="pp-wait-host">
                                            {t('room.waitingHost')}
                                        </p>
                                    )}
                                    <AdSlot placement="arena.result" />
                                </div>
                            )}
                            {state.feedback && (
                                <div
                                    className="pp-feedback"
                                    data-correct={state.feedback.correct}
                                    role="status"
                                >
                                    <strong>
                                        {t(
                                            state.feedback.correct
                                                ? 'pingPong.returned'
                                                : 'pingPong.goal',
                                        )}
                                    </strong>
                                    {state.feedback.prompt && (
                                        <span className="pp-feedback-term">
                                            {t('pingPong.previousQuestion', {
                                                prompt: state.feedback.prompt,
                                            })}
                                        </span>
                                    )}
                                    {state.feedback.answer && (
                                        <p data-testid="pp-feedback-answer">
                                            {t('pingPong.answer', {
                                                answer: state.feedback.answer,
                                            })}
                                        </p>
                                    )}
                                    {state.feedback.hint && (
                                        <p className="pp-feedback-hint">
                                            {t('pingPong.hint', {
                                                hint: state.feedback.hint,
                                            })}
                                        </p>
                                    )}
                                </div>
                            )}
                            <div className="pp-leave">
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
                {!playing && <HowToPlay />}
                <GameFinale
                    game="ping-pong"
                    done={Boolean(done)}
                    matchKey={
                        state?.match?.key ??
                        (state ? `${state.pin}-${state.seq}` : null)
                    }
                    standings={rankStandings(
                        state?.players ?? [],
                        (p) => state?.goals[p.seat] ?? 0,
                        (p, rank) => ({
                            key: p.seat,
                            name: p.name,
                            rank,
                            character: p.character,
                            seat: p.seat,
                            userId: p.user_id,
                            isYou: p.seat === state?.you,
                            score: state?.goals[p.seat] ?? 0,
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
