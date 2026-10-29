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
import { BackButton, SiteNav, useGameBack } from '@/components/site-nav';
import {
    ACCENT,
    BG,
    OptionPads,
    QuestionCard,
    RopeField,
    type RopePuller,
    StageTimer,
    TeamBar,
} from '@/components/tug-of-war/arena';
import HowToPlay from '@/components/tug-of-war/how-to-play';
import {
    QuestionCountPicker,
    TeamBoard,
} from '@/components/tug-of-war/team-board';
import { useTranslations } from '@/hooks/use-translations';
import { type TugState, useTugOfWar } from '@/hooks/use-tug-of-war';
import { useAdMoments } from '@/lib/ads';
import { useSubjectName } from '@/lib/subjects';
import { TEAM_BLUE, TEAM_RED, TEAM_WATCH } from '@/lib/tug-of-war';
import { Head } from '@inertiajs/react';
import { Crown, HandGrab, Trophy, Volume2, VolumeX } from 'lucide-react';
import { useCallback, useState } from 'react';

interface Props {
    player: { name: string; grade: number | null };
    serviceReady: boolean;
    wsUrl: string | null;
    pin: string | null;
}

const MVP_BONUS = 20;

function pullersOf(state: TugState): RopePuller[] {
    return state.players
        .filter((p) => !p.left && p.team !== TEAM_WATCH)
        .map((p) => ({
            key: p.bot ? 'bot' : p.seat,
            name: p.name,
            team: p.team,
            seat: p.seat,
            character: p.character,
            userId: p.user_id,
            pulls: p.pulls,
            answered: state.stage === 'question' && p.answered,
            you: p.seat === state.you,
        }));
}

export default function TugOfWar({ player, serviceReady, wsUrl, pin }: Props) {
    const { t, i18n } = useTranslations();
    const back = useGameBack();
    const [muted, setMuted] = useState(false);
    const game = useTugOfWar(serviceReady ? wsUrl : null, i18n.language);
    const { state, send, status } = game;
    const online = status === 'online';
    const join = useCallback(
        (code: string) => {
            send({ t: 'join', pin: code });
        },
        [send],
    );
    useRoomPin(online, state?.pin, pin, join, {
        game: 'tug-of-war',
        classroom: state?.classroom,
    });
    const playing = state?.phase === 'playing';
    const done = state?.phase === 'done';
    const isHost = Boolean(state && state.host === state.you);
    const me = state?.players.find((p) => p.seat === state.you);
    const myTeam = me?.team ?? -1;
    const watching = myTeam === TEAM_WATCH;
    const won = Boolean(done && state?.result?.won);
    useAdMoments(playing ? 'playing' : done ? 'done' : 'idle', {
        muted,
        won,
    });
    const leave = () => send({ t: 'leave' });
    const playAgain = () => send({ t: 'start' });
    const seconds = Math.ceil(Math.max(0, state?.remaining_ms ?? 0) / 1000);
    const lastPull =
        state?.stage === 'reveal' && state.reveal ? state.reveal.team : -1;
    const answeredCount =
        state?.players.filter(
            (p) => !p.left && p.team !== TEAM_WATCH && p.answered,
        ).length ?? 0;
    const answering =
        state?.players.filter((p) => !p.left && p.team !== TEAM_WATCH).length ??
        0;

    return (
        <div
            className="tw-page min-h-dvh"
            style={{ background: BG }}
            data-testid="tug-of-war"
            data-phase={state?.phase}
            data-stage={state?.stage ?? undefined}
        >
            <Head title={`${t('tugOfWar.title')} — EduFunHub`} />
            <header
                className="sticky top-0 z-30 border-b-4 border-[#1f2a44]"
                style={{ background: BG }}
            >
                <div className="mx-auto flex min-h-16 items-center justify-between gap-2 px-3 py-2 sm:px-6 lg:px-8">
                    <div className="edu-game-brand flex min-w-0 flex-1 items-center gap-2 sm:gap-3">
                        <BackButton
                            href={back.href}
                            label={back.label}
                            iconOnly
                        />
                        <BrandLink variant="mark" />
                        <span
                            className="hidden size-10 shrink-0 place-items-center rounded-xl border-2 border-[#1f2a44] text-white shadow-[2px_2px_0px_#1f2a44] sm:grid"
                            style={{ background: ACCENT }}
                        >
                            <HandGrab className="size-5" aria-hidden="true" />
                        </span>
                        <div className="flex min-w-0 flex-col">
                            <h1 className="truncate font-display text-lg font-black text-[#1f2a44] sm:text-2xl">
                                {t('tugOfWar.title')}
                            </h1>
                            <span className="hidden truncate text-xs font-bold text-slate-600 sm:block">
                                {t('tugOfWar.subtitle')}
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
                                muted ? 'tugOfWar.unmute' : 'tugOfWar.mute',
                            )}
                            aria-pressed={muted}
                            data-testid="tw-mute"
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
            <main className="tw-main">
                <GameAdStrip />
                <div className="tw-topline">
                    <p className="tw-eyebrow">{t('tugOfWar.eyebrow')}</p>
                    {state && state.phase !== 'lobby' && (
                        <ConnectionBadge status={status} />
                    )}
                </div>
                {!serviceReady ? (
                    <div className="tw-notice" role="status">
                        {t('tugOfWar.unavailable')}
                    </div>
                ) : !state ? (
                    <RoomEntry
                        game="tug-of-war"
                        status={status}
                        error={game.error}
                        intro={t('tugOfWar.intro', { name: player.name })}
                        onCreate={() => send({ t: 'create' })}
                        onJoin={join}
                        onClassroom={() => send({ t: 'classroom' })}
                    >
                        <p>{t('tugOfWar.rules', { steps: 5 })}</p>
                    </RoomEntry>
                ) : state.phase === 'lobby' ? (
                    <RoomLobby
                        game="tug-of-war"
                        title={t('tugOfWar.title')}
                        room={state}
                        status={status}
                        error={game.error}
                        onStart={() => send({ t: 'start' })}
                        onLeave={leave}
                        soloHint={t('tugOfWar.soloHint')}
                        settings={
                            <div className="flex flex-col gap-5">
                                <TeamBoard
                                    players={state.players}
                                    you={state.you}
                                    host={state.host}
                                    isHost={isHost}
                                    disabled={!isHost || !online}
                                    onMove={(seat, team) =>
                                        send({ t: 'team', seat, team })
                                    }
                                    onShuffle={() =>
                                        send({ t: 'shuffle_teams' })
                                    }
                                />
                                <QuestionCountPicker
                                    value={state.question_count}
                                    options={state.question_counts}
                                    winSteps={state.win_steps}
                                    disabled={!isHost || !online}
                                    onChange={(count) =>
                                        send({ t: 'questions', count })
                                    }
                                />
                                <SubjectPicker
                                    value={
                                        isGameSubject(state.subject)
                                            ? state.subject
                                            : MIX_SUBJECT
                                    }
                                    disabled={!isHost || !online}
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
                                    disabled={!isHost || !online}
                                    onChange={(seconds) =>
                                        send({ t: 'answer_time', seconds })
                                    }
                                />
                            </div>
                        }
                    />
                ) : (
                    <div className="tw-grid" data-watch={watching}>
                        <section
                            className="tw-panel"
                            aria-label={t('tugOfWar.rope')}
                        >
                            <TeamBar
                                teams={state.teams}
                                rope={state.rope}
                                winSteps={state.win_steps}
                                you={myTeam}
                            />
                            <RopeField
                                pullers={pullersOf(state)}
                                rope={state.rope}
                                winSteps={state.win_steps}
                                pull={lastPull}
                                winner={done ? (state.winner ?? null) : null}
                                pullKey={`${state.round}-${state.stage}`}
                                big={watching}
                            />
                            {watching && playing && (
                                <ArenaQuestion
                                    state={state}
                                    seconds={seconds}
                                    answered={answeredCount}
                                    total={answering}
                                    big
                                />
                            )}
                            <AdSlot placement="arena.board" />
                        </section>
                        <section className="tw-panel">
                            <RoomError code={game.error} />
                            {playing ? (
                                watching ? (
                                    <p className="tw-status-text" role="status">
                                        {t('tugOfWar.watching')}
                                    </p>
                                ) : (
                                    <ArenaQuestion
                                        state={state}
                                        seconds={seconds}
                                        answered={answeredCount}
                                        total={answering}
                                        canAnswer={game.canAnswer}
                                        onAnswer={game.answer}
                                    />
                                )
                            ) : (
                                <ResultPanel
                                    state={state}
                                    isHost={isHost}
                                    online={online}
                                    onPlayAgain={playAgain}
                                />
                            )}
                            {state.subject_fallback && (
                                <SubjectFallbackNote
                                    subject={state.subject}
                                    className="mt-3"
                                />
                            )}
                            <div className="tw-leave">
                                <RoomLeaveControl
                                    isHost={isHost && playing}
                                    onLeave={leave}
                                    onStop={() => send({ t: 'stop' })}
                                    disabled={!online}
                                />
                            </div>
                        </section>
                    </div>
                )}
                {!playing && <HowToPlay />}
                <GameFinale
                    game="tug-of-war"
                    done={Boolean(done)}
                    matchKey={
                        state?.match?.key ??
                        (state ? `${state.pin}-${state.seq}` : null)
                    }
                    standings={rankStandings(
                        state?.players.filter(
                            (p) => !p.left && p.team !== TEAM_WATCH,
                        ) ?? [],
                        (p) => p.pulls + (state?.winner === p.team ? 1000 : 0),
                        (p, rank) => ({
                            key: p.bot ? 'bot' : p.seat,
                            name: p.name,
                            rank,
                            character: p.character,
                            seat: p.seat,
                            userId: p.user_id,
                            isYou: p.seat === state?.you,
                            score: p.pulls,
                            detail: t(`tugOfWar.team.${p.team}`),
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

/** Question, answers and the last reveal for one stage of a round. */
function ArenaQuestion({
    state,
    seconds,
    answered,
    total,
    canAnswer = false,
    onAnswer,
    big = false,
}: {
    state: TugState;
    seconds: number;
    answered: number;
    total: number;
    canAnswer?: boolean;
    onAnswer?: (option: number) => void;
    big?: boolean;
}) {
    const { t } = useTranslations();
    const subjectName = useSubjectName();
    const me = state.players.find((p) => p.seat === state.you);
    const revealing = state.stage === 'reveal' && state.reveal;
    const choice = state.your_choice;
    const lockedWrong =
        state.stage === 'question' && choice !== null && !canAnswer;
    if (state.stage === 'countdown') {
        return (
            <div className="tw-countdown" role="status">
                {t('tugOfWar.countdown', { count: seconds })}
            </div>
        );
    }
    return (
        <div data-testid="tw-question-panel">
            <div className="tw-status">
                <span className="tw-status-text" role="status">
                    {revealing
                        ? state.reveal!.team >= 0
                            ? t('tugOfWar.pulled', {
                                  name: state.reveal!.name,
                                  team: t(
                                      `tugOfWar.team.${state.reveal!.team}`,
                                  ),
                              })
                            : t('tugOfWar.nobody')
                        : big || !me
                          ? t('tugOfWar.answeredCount', {
                                count: answered,
                                total,
                            })
                          : lockedWrong
                            ? t('tugOfWar.lockedWrong')
                            : t('tugOfWar.answerHint')}
                </span>
                {state.stage === 'question' && (
                    <StageTimer
                        seconds={seconds}
                        label={t('tugOfWar.seconds', { count: seconds })}
                    />
                )}
            </div>
            {state.question && (
                <>
                    <QuestionCard
                        label={t('tugOfWar.question', {
                            number: state.number,
                            total: state.question_count,
                        })}
                        text={state.question.text}
                        subject={subjectName(state.question.subject)}
                        media={state.question.media}
                        big={big}
                    />
                    <OptionPads
                        key={state.question.id}
                        options={state.question.options}
                        optionMedia={state.question.option_media}
                        disabled={!canAnswer}
                        selected={choice}
                        correct={revealing ? state.reveal!.correct_index : null}
                        onChoose={onAnswer}
                        big={big}
                    />
                </>
            )}
            {revealing && (
                <div
                    className="tw-reveal"
                    data-team={state.reveal!.team}
                    data-testid="tw-reveal"
                >
                    <p>
                        {t('tugOfWar.answer', { answer: state.reveal!.answer })}
                    </p>
                    {state.reveal!.hint && (
                        <p>
                            {t('tugOfWar.hint', { hint: state.reveal!.hint })}
                        </p>
                    )}
                </div>
            )}
        </div>
    );
}

function ResultPanel({
    state,
    isHost,
    online,
    onPlayAgain,
}: {
    state: TugState;
    isHost: boolean;
    online: boolean;
    onPlayAgain: () => void;
}) {
    const { t } = useTranslations();
    const winner = state.winner ?? null;
    const title = state.stopped
        ? t('tugOfWar.stopped')
        : winner === null
          ? t('tugOfWar.draw')
          : state.result && !state.result.watching
            ? t(state.result.won ? 'tugOfWar.youWon' : 'tugOfWar.youLost')
            : t('tugOfWar.won', { team: t(`tugOfWar.team.${winner}`) });
    return (
        <div className="tw-result" data-testid="tw-result">
            <Trophy size={36} aria-hidden="true" />
            <h2>{title}</h2>
            {winner !== null && (
                <p>
                    {state.forfeit
                        ? t('tugOfWar.forfeit')
                        : t('tugOfWar.won', {
                              team: t(`tugOfWar.team.${winner}`),
                          })}
                </p>
            )}
            {state.result && !state.result.watching && (
                <>
                    <p data-testid="tw-points">
                        {t('tugOfWar.points', { points: state.result.points })}
                    </p>
                    {state.result.mvp && (
                        <span className="tw-mvp" data-testid="tw-mvp">
                            <Crown className="size-4" aria-hidden="true" />
                            {t('tugOfWar.mvp', { bonus: MVP_BONUS })}
                        </span>
                    )}
                </>
            )}
            <div className="tw-standings" aria-label={t('tugOfWar.standings')}>
                {[TEAM_RED, TEAM_BLUE].map((team) => (
                    <div key={team}>
                        <p className="tw-legend">
                            {t(`tugOfWar.team.${team}`)}
                        </p>
                        <ol>
                            {state.players
                                .filter((p) => !p.left && p.team === team)
                                .sort((a, b) => b.pulls - a.pulls)
                                .map((p) => (
                                    <li key={p.bot ? 'bot' : p.seat}>
                                        <span>{p.name}</span>
                                        {p.mvp && (
                                            <Crown
                                                className="size-4 shrink-0 text-[#b45309]"
                                                aria-label={t(
                                                    'tugOfWar.mvpBadge',
                                                )}
                                            />
                                        )}
                                        <span className="tw-pulls">
                                            {p.pulls}
                                        </span>
                                    </li>
                                ))}
                        </ol>
                    </div>
                ))}
            </div>
            {isHost ? (
                <button
                    type="button"
                    className="tw-action"
                    onClick={onPlayAgain}
                    disabled={!online}
                    data-testid="tw-play-again"
                >
                    {t('tugOfWar.playAgain')}
                </button>
            ) : (
                <p data-testid="tw-wait-host">{t('room.waitingHost')}</p>
            )}
            <AdSlot placement="arena.result" />
        </div>
    );
}
