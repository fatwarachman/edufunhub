import AdSlot from '@/components/ads/ad-slot';
import GameAdStrip from '@/components/ads/game-ad-strip';
import { BrandLink } from '@/components/brand-link';
import { DigitalClock } from '@/components/digital-clock';
import '@/components/edu-kart/edu-kart.css';
import HowToPlay from '@/components/edu-kart/how-to-play';
import {
    RaceSettings,
    VehiclePicker,
} from '@/components/edu-kart/lobby-settings';
import { formatRaceTime, RaceArena } from '@/components/edu-kart/race-arena';
import { GameFinale } from '@/components/game-finale';
import { RoomLeaveControl } from '@/components/multiplayer/host-controls';
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
import { useEduKart } from '@/hooks/use-edu-kart';
import { useGameAudio } from '@/hooks/use-game-audio';
import { useTranslations } from '@/hooks/use-translations';
import { useAdMoments } from '@/lib/ads';
import { type RaceEvent } from '@/lib/edu-kart/protocol';
import { Head } from '@inertiajs/react';
import { CarFront, Trophy, Volume2, VolumeX } from 'lucide-react';
import { useCallback } from 'react';

interface Props {
    player: { id: number; name: string; grade: number | null };
    serviceReady: boolean;
    wsUrl: string | null;
    pin: string | null;
}

export default function EduKart({ player, serviceReady, wsUrl, pin }: Props) {
    const { t, i18n } = useTranslations();
    const back = useGameBack();
    const audio = useGameAudio();
    const game = useEduKart(serviceReady ? wsUrl : null, i18n.language);
    const { state, send, status, track } = game;
    const join = useCallback(
        (code: string) => {
            send({ t: 'join', pin: code });
        },
        [send],
    );
    useRoomPin(status === 'online', state?.pin, pin, join, {
        game: 'edu-kart',
        classroom: state?.classroom,
    });
    const playing = state?.phase === 'playing';
    const done = state?.phase === 'done';
    const race = state?.race ?? null;
    const me = race?.racers.find((r) => r.seat === state?.you);
    const won = Boolean(
        done && me && me.rank === 1 && (race?.racers.length ?? 0) > 1,
    );
    const isHost = Boolean(state && state.host === state.you);
    const online = status === 'online';
    useAdMoments(playing ? 'playing' : done ? 'done' : 'idle', {
        muted: audio.muted,
        won,
    });
    const leave = () => {
        send({ t: 'leave' });
    };
    const playAgain = () => {
        send({ t: 'start' });
    };
    const myVehicle =
        state?.players.find((p) => p.seat === state.you)?.vehicle ?? 'classic';
    const onEvent = useCallback(
        (event: RaceEvent, you: number) => {
            if (event.k === 'answer' && event.racer === you) {
                audio.play(event.correct ? 'correct' : 'wrong');
            } else if (event.k === 'fire' && event.racer === you) {
                audio.play('shoot');
            } else if (event.k === 'lap' && event.racer === you) {
                audio.play('step');
            }
        },
        [audio],
    );
    const standings = (race?.racers ?? [])
        .slice()
        .sort((a, b) => a.rank - b.rank)
        .map((r) => ({
            key: r.racer,
            name: r.bot ? t('eduKart.botName', { number: r.bot_no }) : r.name,
            rank: r.rank,
            character: r.bot ? null : (r.character as never),
            seat: r.seat >= 0 ? r.seat : undefined,
            userId: r.bot
                ? undefined
                : (state?.players.find((p) => p.seat === r.seat)?.user_id ??
                  undefined),
            isYou: r.seat >= 0 && r.seat === state?.you,
            score:
                r.finish_ms > 0
                    ? formatRaceTime(r.finish_ms)
                    : t('eduKart.dnf'),
            detail: t('eduKart.correctCount', { count: r.correct }),
        }));

    return (
        <div
            className="ek-page min-h-dvh text-[#1f2a44]"
            data-testid="edu-kart"
            data-phase={state?.phase ?? 'entry'}
        >
            <Head title={`${t('eduKart.title')} — EduFunHub`} />
            <header className="sticky top-0 z-30 border-b-4 border-[#1f2a44] bg-[#fff4e6]">
                <div className="mx-auto flex min-h-16 items-center justify-between gap-2 px-3 py-2 sm:px-6 lg:px-8">
                    <div className="edu-game-brand flex min-w-0 flex-1 items-center gap-2 sm:gap-3">
                        <BackButton
                            href={back.href}
                            label={back.label}
                            iconOnly
                        />
                        <BrandLink variant="mark" />
                        <span className="hidden size-10 shrink-0 place-items-center rounded-xl border-2 border-[#1f2a44] bg-[#e11d48] text-white shadow-[2px_2px_0px_#1f2a44] sm:grid">
                            <CarFront className="size-5" aria-hidden="true" />
                        </span>
                        <div className="flex min-w-0 flex-col">
                            <h1 className="truncate font-display text-lg font-black sm:text-2xl">
                                {t('eduKart.title')}
                            </h1>
                            <span className="hidden truncate text-xs font-bold text-slate-600 sm:block">
                                {t('eduKart.subtitle')}
                            </span>
                        </div>
                        <DigitalClock className="edu-clock--game" />
                    </div>
                    <div className="flex shrink-0 items-center gap-1.5">
                        <button
                            type="button"
                            className="edu-nav-btn edu-nav-btn--icon"
                            onClick={audio.toggleMuted}
                            aria-label={t(
                                audio.muted ? 'eduKart.unmute' : 'eduKart.mute',
                            )}
                            aria-pressed={audio.muted}
                            data-testid="ek-mute"
                        >
                            {audio.muted ? (
                                <VolumeX aria-hidden="true" />
                            ) : (
                                <Volume2 aria-hidden="true" />
                            )}
                        </button>
                        <SiteNav compact />
                    </div>
                </div>
            </header>
            <main className="ek-main" data-playing={playing}>
                {!playing && <GameAdStrip />}
                {!serviceReady ? (
                    <div className="ek-notice" role="status">
                        {t('eduKart.unavailable')}
                    </div>
                ) : !state ? (
                    <RoomEntry
                        game="edu-kart"
                        status={status}
                        error={game.error}
                        intro={t('eduKart.intro', { name: player.name })}
                        onCreate={() => send({ t: 'create' })}
                        onJoin={join}
                        onClassroom={() => send({ t: 'classroom' })}
                    >
                        <p>{t('eduKart.rules')}</p>
                        {game.leftPoints !== null && (
                            <p data-testid="ek-left-points">
                                {t('eduKart.points', {
                                    points: game.leftPoints,
                                })}
                            </p>
                        )}
                    </RoomEntry>
                ) : state.phase === 'lobby' ? (
                    <RoomLobby
                        game="edu-kart"
                        title={t('eduKart.title')}
                        room={state}
                        status={status}
                        error={game.error}
                        onStart={() => send({ t: 'start' })}
                        onLeave={leave}
                        soloHint={t('eduKart.soloHint')}
                        settings={
                            <div className="flex flex-col gap-5">
                                <VehiclePicker
                                    value={myVehicle}
                                    disabled={!online}
                                    onChange={(vehicle) =>
                                        send({ t: 'vehicle', vehicle })
                                    }
                                />
                                <RaceSettings
                                    track={state.track}
                                    laps={state.laps}
                                    bots={state.bots}
                                    disabled={!isHost || !online}
                                    onChange={(settings) =>
                                        send({ t: 'settings', ...settings })
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
                            </div>
                        }
                    />
                ) : playing && track && race ? (
                    <div className="ek-race">
                        <RaceArena
                            state={state}
                            track={track}
                            send={send}
                            online={online}
                            onFrame={game.onFrame}
                            onEvent={onEvent}
                            muted={audio.muted}
                        />
                        <div className="ek-race-bar">
                            <ConnectionBadge status={status} />
                            <RoomError code={game.error} />
                            {state.subject_fallback && (
                                <SubjectFallbackNote subject={state.subject} />
                            )}
                            <RoomLeaveControl
                                isHost={isHost}
                                onLeave={leave}
                                onStop={() => send({ t: 'stop' })}
                                disabled={!online}
                            />
                        </div>
                    </div>
                ) : playing ? (
                    <div className="ek-notice" role="status">
                        {t('eduKart.loading')}
                    </div>
                ) : (
                    <section className="ek-result" data-testid="ek-result">
                        <Trophy className="size-10" aria-hidden="true" />
                        <h2 className="font-display text-2xl font-black">
                            {t(
                                race?.stopped
                                    ? 'eduKart.stopped'
                                    : won
                                      ? 'eduKart.won'
                                      : 'eduKart.finished',
                                { rank: me?.rank ?? 0 },
                            )}
                        </h2>
                        {race?.result && (
                            <p className="font-bold" data-testid="ek-points">
                                {t('eduKart.points', {
                                    points: race.result.points,
                                })}
                            </p>
                        )}
                        <ol className="ek-standings">
                            {standings.map((row) => (
                                <li key={row.key} data-you={row.isYou}>
                                    <b>{row.rank}</b>
                                    <span className="min-w-0 truncate">
                                        {row.name}
                                    </span>
                                    <span>{row.score}</span>
                                </li>
                            ))}
                        </ol>
                        <div className="flex flex-wrap items-center justify-center gap-3">
                            {isHost ? (
                                <button
                                    type="button"
                                    className="ek-action"
                                    data-testid="ek-play-again"
                                    onClick={playAgain}
                                    disabled={!online}
                                >
                                    {t('eduKart.playAgain')}
                                </button>
                            ) : (
                                <p data-testid="ek-wait-host">
                                    {t('room.waitingHost')}
                                </p>
                            )}
                            <RoomLeaveControl
                                isHost={false}
                                onLeave={leave}
                                onStop={() => {}}
                                disabled={!online}
                            />
                        </div>
                        <AdSlot placement="arena.result" />
                    </section>
                )}
                {!playing && <HowToPlay />}
                <GameFinale
                    game="edu-kart"
                    done={Boolean(done)}
                    matchKey={
                        race?.match?.key ??
                        (state ? `${state.pin}-${state.seq}` : null)
                    }
                    standings={standings}
                    won={won}
                    points={race?.result?.points}
                    onPlayAgain={isHost ? playAgain : undefined}
                />
            </main>
        </div>
    );
}
