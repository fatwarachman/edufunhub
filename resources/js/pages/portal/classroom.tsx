import {
    ClassroomAnnouncementGate,
    type ClassroomAnnouncementPayload,
} from '@/components/classroom/classroom-announcement';
import {
    ClassroomDialog,
    ConfirmDialog,
    EmptyBox,
    StatusPill,
    actionButtonClass,
    primaryButtonClass,
    useCountdownText,
    useGameCatalog,
    useNow,
} from '@/components/classroom/classroom-ui';
import { ClassroomWorld } from '@/components/classroom/classroom-world';
import type {
    ClassroomDetail,
    ClassroomPlayUsage,
} from '@/components/classroom/types';
import { playerCountLabel } from '@/components/player-count-badge';
import { useTranslations } from '@/hooks/use-translations';
import PlayerLayout from '@/layouts/player-layout';
import { type WorldProps } from '@/lib/classroom-world/protocol';
import { gradeShortLabel } from '@/lib/grade';
import { type SharedData } from '@/types';
import { router, usePage } from '@inertiajs/react';
import {
    Ban,
    Box,
    Check,
    Clock,
    DoorOpen,
    Gamepad2,
    Info,
    LogOut,
    School,
    ShieldX,
    Users,
} from 'lucide-react';
import { createElement, useCallback, useEffect, useState } from 'react';

type ClassroomGame = {
    game_key: string;
    question_count: number;
    /** Plays allowed per student; null = unlimited. */
    max_plays?: number | null;
};

interface Props {
    pin: string;
    classroom: ClassroomDetail | null;
    member: { id: number; removed: boolean } | null;
    games: ClassroomGame[];
    /** My classroom play count per game (members only). */
    usage?: Record<string, ClassroomPlayUsage>;
    /** Present only for an active member of an active classroom. */
    world?: WorldProps | null;
    /** Teacher announcement on screen right now (active members only). */
    announcement?: ClassroomAnnouncementPayload | null;
}

/** Remembers that the student was inside the 3D room (back from a booth game). */
const worldKey = (pin: string) => `classroom-world:${pin}`;

export default function PortalClassroomRoom({
    pin,
    classroom,
    member,
    games,
    usage = {},
    world = null,
    announcement = null,
}: Props) {
    const { t } = useTranslations();
    const flashError = usePage<SharedData>().props.flash?.error ?? null;
    const catalog = useGameCatalog();
    const countdown = useCountdownText();
    const now = useNow(Boolean(classroom && classroom.status !== 'ended'));
    const [showLeave, setShowLeave] = useState(false);
    const [joining, setJoining] = useState(false);
    const [inWorld, setInWorld] = useState(false);
    const [detailGame, setDetailGame] = useState<ClassroomGame | null>(null);

    useEffect(() => {
        if (world && sessionStorage.getItem(worldKey(pin)) === '1') {
            // eslint-disable-next-line react-hooks/set-state-in-effect
            setInWorld(true);
        }
    }, [world, pin]);

    const enterWorld = useCallback(() => {
        sessionStorage.setItem(worldKey(pin), '1');
        setInWorld(true);
    }, [pin]);
    const exitWorld = useCallback(() => {
        sessionStorage.removeItem(worldKey(pin));
        setInWorld(false);
    }, [pin]);

    if (!classroom) {
        return (
            <PlayerLayout title={t('classroom.portal.title')}>
                <EmptyBox
                    icon={School}
                    title={t('classroom.portal.notFound')}
                    hint={t('classroom.portal.notFoundHint')}
                />
            </PlayerLayout>
        );
    }

    const endsAtMs = new Date(classroom.ends_at).getTime();
    const remainingMs = endsAtMs - now;
    const ended =
        classroom.status === 'ended' ||
        (classroom.status === 'active' && remainingMs <= 0);

    if (classroom.status === 'scheduled') {
        return (
            <PlayerLayout title={classroom.name}>
                <div className="flex flex-col items-center gap-4 py-8 text-center">
                    <StatusPill status="scheduled" />
                    <h1 className="text-2xl font-bold">{classroom.name}</h1>
                    <p className="text-muted-foreground">
                        {t('classroom.portal.notYet')}
                    </p>
                    {remainingMs > 0 && (
                        <span className="flex items-center gap-1.5 rounded-full border-2 border-[#1f2a44] bg-[#fff4cc] px-3 py-1 text-sm font-bold tabular-nums">
                            <Clock className="size-4" aria-hidden="true" />
                            {countdown(remainingMs)}
                        </span>
                    )}
                </div>
            </PlayerLayout>
        );
    }

    if (member?.removed) {
        return (
            <PlayerLayout title={classroom.name}>
                <EmptyBox
                    icon={ShieldX}
                    title={t('classroom.portal.removed')}
                    hint={t('classroom.portal.removedHint')}
                />
            </PlayerLayout>
        );
    }

    if (ended) {
        const reportUrl = member
            ? `/my-classrooms/${member.id}`
            : '/my-classrooms';
        return (
            <PlayerLayout title={classroom.name}>
                <EmptyBox
                    icon={School}
                    title={t('classroom.portal.ended')}
                    hint={t('classroom.portal.endedHint')}
                >
                    <a
                        href={reportUrl}
                        className={`${actionButtonClass} mt-2`}
                        data-testid="classroom-go-report"
                    >
                        {t('classroom.portal.viewReport')}
                    </a>
                </EmptyBox>
            </PlayerLayout>
        );
    }

    if (!member) {
        const join = () => {
            router.post(
                `/portal/classrooms/${pin}/join`,
                {},
                {
                    preserveScroll: true,
                    onStart: () => setJoining(true),
                    onFinish: () => setJoining(false),
                },
            );
        };

        return (
            <PlayerLayout title={classroom.name}>
                <div className="auth-card flex flex-col items-center gap-4 !p-6 text-center">
                    <span className="grid size-16 place-items-center rounded-2xl border-3 border-[#1f2a44] bg-[#ffd93d]">
                        <School className="size-8" aria-hidden="true" />
                    </span>
                    <h1 className="text-2xl font-bold">{classroom.name}</h1>
                    {classroom.description && (
                        <p className="text-sm text-muted-foreground">
                            {classroom.description}
                        </p>
                    )}
                    <div className="flex flex-wrap items-center justify-center gap-3 text-sm">
                        <span className="flex items-center gap-1">
                            <Users className="size-4" aria-hidden="true" />
                            {classroom.max_members}{' '}
                            {t('classroom.common.members')}
                        </span>
                        <StatusPill status={classroom.status} />
                    </div>
                    <div className="flex flex-wrap justify-center gap-2">
                        {games.map((g) => {
                            const Icon = catalog.icon(g.game_key);
                            return (
                                <span
                                    key={g.game_key}
                                    className="inline-flex items-center gap-1.5 rounded-full border-2 border-[#1f2a44] bg-white px-2.5 py-1 text-xs font-bold"
                                >
                                    <Icon
                                        className="size-3.5"
                                        aria-hidden="true"
                                    />
                                    {catalog.title(g.game_key)}
                                </span>
                            );
                        })}
                    </div>
                    <button
                        type="button"
                        disabled={joining}
                        onClick={join}
                        className={primaryButtonClass}
                        data-testid="classroom-join-btn"
                    >
                        <DoorOpen className="size-4" />
                        {joining
                            ? t('classroom.portal.joining')
                            : t('classroom.portal.join')}
                    </button>
                </div>
            </PlayerLayout>
        );
    }

    const leave = () => {
        sessionStorage.removeItem(worldKey(pin));
        router.post(`/portal/classrooms/${pin}/leave`);
        setShowLeave(false);
    };

    if (inWorld && world) {
        return (
            <PlayerLayout title={classroom.name} fill>
                <ClassroomAnnouncementGate
                    pin={pin}
                    classroomId={classroom.id}
                    initial={announcement}
                />
                <ClassroomWorld
                    classroomId={classroom.id}
                    classroomName={classroom.name}
                    world={world}
                    onExit={exitWorld}
                    onLeaveClass={() => setShowLeave(true)}
                />
                <ConfirmDialog
                    open={showLeave}
                    onClose={() => setShowLeave(false)}
                    onConfirm={leave}
                    title={t('classroom.portal.leaveConfirmTitle')}
                    description={t('classroom.portal.leaveConfirmBody')}
                    confirmLabel={t('classroom.portal.leave')}
                    testId="classroom-leave-confirm"
                />
            </PlayerLayout>
        );
    }

    return (
        <PlayerLayout title={classroom.name}>
            <div className="flex flex-col items-center gap-4">
                <div className="auth-card flex w-full flex-col items-center gap-4 !p-6 text-center">
                    <span className="grid size-16 place-items-center rounded-2xl border-3 border-[#1f2a44] bg-[#dff7ea]">
                        <Check className="size-8" aria-hidden="true" />
                    </span>
                    <h1 className="text-2xl font-bold">{classroom.name}</h1>
                    <p className="text-sm text-muted-foreground">
                        {t('classroom.portal.joined')}
                    </p>
                    <StatusPill status={classroom.status} />
                    {remainingMs > 0 && (
                        <span className="flex items-center gap-1.5 rounded-full border-2 border-[#1f2a44] bg-[#ffd93d] px-3 py-1 text-sm font-bold tabular-nums">
                            <Clock className="size-4" aria-hidden="true" />
                            {countdown(remainingMs)}
                        </span>
                    )}
                    {world && (
                        <button
                            type="button"
                            onClick={enterWorld}
                            className={primaryButtonClass}
                            data-testid="classroom-enter-world"
                        >
                            <Box className="size-4" aria-hidden="true" />
                            {t('classroom.world.enter')}
                        </button>
                    )}
                    {world && (
                        <p className="max-w-md text-xs text-muted-foreground">
                            {t('classroom.world.enterHint')}
                        </p>
                    )}
                </div>

                {flashError && (
                    <p
                        role="alert"
                        className="flex w-full items-center gap-2 rounded-2xl border-[3px] border-[#151b2e] bg-[#ffe1e6] px-4 py-3 text-sm font-semibold text-[#8a1c32]"
                        data-testid="classroom-flash-error"
                    >
                        <Ban className="size-5 shrink-0" aria-hidden="true" />
                        {flashError}
                    </p>
                )}

                {games.length > 0 && (
                    <section className="auth-card flex w-full flex-col gap-3 !p-5">
                        <h2 className="flex items-center gap-2 text-lg font-bold">
                            <Gamepad2 className="size-5" aria-hidden="true" />
                            {t('classroom.portal.games')}
                        </h2>
                        <p className="text-xs text-muted-foreground">
                            {t('classroom.portal.gamesHint')}
                        </p>
                        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                            {games.map((g) => {
                                const Icon = catalog.icon(g.game_key);
                                return (
                                    <button
                                        key={g.game_key}
                                        type="button"
                                        onClick={() => setDetailGame(g)}
                                        aria-haspopup="dialog"
                                        className="flex items-center gap-3 rounded-xl border-2 border-[#1f2a44] bg-white p-3 text-left hover:bg-[#FFFDE6] focus-visible:ring-2 focus-visible:ring-[#1f2a44] focus-visible:outline-none"
                                        data-testid={`classroom-game-${g.game_key}`}
                                    >
                                        <span
                                            className="grid size-10 shrink-0 place-items-center rounded-xl border-2 border-[#1f2a44]"
                                            style={{
                                                background: catalog.accent(
                                                    g.game_key,
                                                ),
                                            }}
                                        >
                                            <Icon
                                                className="size-5 text-white"
                                                aria-hidden="true"
                                            />
                                        </span>
                                        <div className="min-w-0 flex-1">
                                            <p className="truncate text-sm font-bold">
                                                {catalog.title(g.game_key)}
                                            </p>
                                            <p className="text-xs text-muted-foreground">
                                                {g.question_count}{' '}
                                                {t(
                                                    'classroom.portal.questions',
                                                )}
                                            </p>
                                            <PlayLimitChip
                                                max={g.max_plays}
                                                usage={usage[g.game_key]}
                                                gameKey={g.game_key}
                                            />
                                        </div>
                                        <Info
                                            className="size-4 shrink-0 text-muted-foreground"
                                            aria-hidden="true"
                                        />
                                    </button>
                                );
                            })}
                        </div>
                    </section>
                )}

                <button
                    type="button"
                    onClick={() => setShowLeave(true)}
                    className={actionButtonClass}
                    data-testid="classroom-leave-btn"
                >
                    <LogOut className="size-4" />
                    {t('classroom.portal.leave')}
                </button>
            </div>

            {world && (
                <ClassroomAnnouncementGate
                    pin={pin}
                    classroomId={classroom.id}
                    initial={announcement}
                />
            )}
            <ClassroomGameDetail
                game={detailGame}
                usage={detailGame ? usage[detailGame.game_key] : undefined}
                onClose={() => setDetailGame(null)}
                onEnterWorld={
                    world
                        ? () => {
                              setDetailGame(null);
                              enterWorld();
                          }
                        : null
                }
            />
            <ConfirmDialog
                open={showLeave}
                onClose={() => setShowLeave(false)}
                onConfirm={leave}
                title={t('classroom.portal.leaveConfirmTitle')}
                description={t('classroom.portal.leaveConfirmBody')}
                confirmLabel={t('classroom.portal.leave')}
                testId="classroom-leave-confirm"
            />
        </PlayerLayout>
    );
}

/**
 * Read-only game details for a classroom game. Classroom games are only
 * started from their booth inside the 3D room, so this has no play button.
 */
/**
 * "Max 2 plays · 1 left" chip of a limited classroom game; nothing when the
 * game is unlimited. Counts come from the server (`usage`).
 */
function PlayLimitChip({
    max,
    usage,
    gameKey,
}: {
    max?: number | null;
    usage?: ClassroomPlayUsage;
    gameKey: string;
}) {
    const { t } = useTranslations();
    const limit = usage?.max ?? max ?? null;
    if (limit === null) {
        return null;
    }
    const remaining = usage?.remaining ?? limit;
    const done = remaining <= 0;
    return (
        <span
            className={`mt-1 inline-flex items-center gap-1 rounded-full border-2 border-[#1f2a44] px-2 py-0.5 text-[11px] font-bold tabular-nums ${done ? 'bg-[#ffe1e6] text-[#8a1c32]' : 'bg-[#fff0cf]'}`}
            data-testid={`classroom-play-limit-${gameKey}`}
        >
            {done
                ? t('classroom.portal.playLimitDone', {
                      plays: usage?.plays ?? limit,
                      max: limit,
                  })
                : t('classroom.portal.playLimit', {
                      max: limit,
                      remaining,
                  })}
        </span>
    );
}

function ClassroomGameDetail({
    game,
    usage,
    onClose,
    onEnterWorld,
}: {
    game: ClassroomGame | null;
    usage?: ClassroomPlayUsage;
    onClose: () => void;
    onEnterWorld: (() => void) | null;
}) {
    const { t } = useTranslations();
    const catalog = useGameCatalog();
    const info = game ? catalog.get(game.game_key) : undefined;
    const grades = info
        ? info.minGrade === info.maxGrade
            ? gradeShortLabel(t, info.minGrade)
            : `${gradeShortLabel(t, info.minGrade)}–${gradeShortLabel(t, info.maxGrade)}`
        : null;
    const pill =
        'inline-flex items-center gap-1 rounded-full border-2 border-[#1f2a44] bg-white px-2.5 py-0.5 text-xs font-bold';

    return (
        <ClassroomDialog
            open={game !== null}
            onClose={onClose}
            title={game ? catalog.title(game.game_key) : ''}
            testId="classroom-game-detail"
            footer={
                <>
                    <button
                        type="button"
                        onClick={onClose}
                        className={actionButtonClass}
                    >
                        {t('classroom.common.close')}
                    </button>
                    {onEnterWorld && (
                        <button
                            type="button"
                            onClick={onEnterWorld}
                            className={primaryButtonClass}
                            data-testid="classroom-game-detail-enter"
                        >
                            <Box className="size-4" aria-hidden="true" />
                            {t('classroom.world.enter')}
                        </button>
                    )}
                </>
            }
        >
            {game && (
                <div className="flex flex-col gap-4">
                    <div className="flex items-start gap-3">
                        <span
                            className="grid size-14 shrink-0 place-items-center rounded-2xl border-2 border-[#1f2a44]"
                            style={{
                                background: catalog.accent(game.game_key),
                            }}
                        >
                            {createElement(catalog.icon(game.game_key), {
                                className: 'size-7 text-white',
                                'aria-hidden': true,
                            })}
                        </span>
                        <p className="text-sm leading-relaxed text-[#1f2a44]/80">
                            {info?.descriptionKey
                                ? t(info.descriptionKey)
                                : t('classroom.portal.gameNoDescription')}
                        </p>
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                        {game.question_count > 0 && (
                            <span className={pill}>
                                {game.question_count}{' '}
                                {t('classroom.portal.questions')}
                            </span>
                        )}
                        <PlayLimitChip
                            max={game.max_plays}
                            usage={usage}
                            gameKey={game.game_key}
                        />
                        {grades && (
                            <span className={pill}>
                                {t('nav.gradeRange', { range: grades })}
                            </span>
                        )}
                        {info && (
                            <span className={pill}>
                                <Users className="size-3" aria-hidden="true" />
                                {playerCountLabel(
                                    t,
                                    info.minPlayers,
                                    info.maxPlayers,
                                )}
                            </span>
                        )}
                        {info && (
                            <span
                                className={`${pill} ${info.awardsPoints ? 'bg-[#ffd93d]' : ''}`}
                            >
                                {info.awardsPoints
                                    ? t('portal.earnsPoints')
                                    : t('portal.practice')}
                            </span>
                        )}
                    </div>
                    <p
                        className="flex items-start gap-2 rounded-xl border-2 border-dashed border-[#1f2a44]/30 bg-[#FFFDE6] p-3 text-sm leading-relaxed font-semibold text-[#1f2a44]"
                        data-testid="classroom-game-detail-howto"
                    >
                        <DoorOpen
                            className="mt-0.5 size-4 shrink-0"
                            aria-hidden="true"
                        />
                        {onEnterWorld
                            ? t('classroom.portal.gamePlayHint')
                            : t('classroom.portal.gamePlayClosed')}
                    </p>
                </div>
            )}
        </ClassroomDialog>
    );
}
