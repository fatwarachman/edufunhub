import {
    ConfirmDialog,
    EmptyBox,
    StatusPill,
    actionButtonClass,
    primaryButtonClass,
    useClassroomFormat,
    useCountdownText,
    useGameCatalog,
    useNow,
} from '@/components/classroom/classroom-ui';
import type { ClassroomDetail } from '@/components/classroom/types';
import { useTranslations } from '@/hooks/use-translations';
import PlayerLayout from '@/layouts/player-layout';
import { router } from '@inertiajs/react';
import {
    Check,
    Clock,
    DoorOpen,
    Gamepad2,
    LogOut,
    School,
    ShieldX,
    Users,
} from 'lucide-react';
import { useCallback, useState } from 'react';

interface Props {
    pin: string;
    classroom: ClassroomDetail | null;
    member: { id: number; removed: boolean } | null;
    games: { game_key: string; question_count: number }[];
}

export default function PortalClassroomRoom({
    pin,
    classroom,
    member,
    games,
}: Props) {
    const { t } = useTranslations();
    const catalog = useGameCatalog();
    const format = useClassroomFormat();
    const countdown = useCountdownText();
    const now = useNow(Boolean(classroom && classroom.status !== 'ended'));
    const [copiedVal, setCopiedVal] = useState<string | null>(null);
    const [showLeave, setShowLeave] = useState(false);
    const [joining, setJoining] = useState(false);

    const copy = useCallback(async (text: string) => {
        if (!navigator?.clipboard) return;
        try {
            await navigator.clipboard.writeText(text);
            setCopiedVal(text);
            window.setTimeout(() => setCopiedVal(null), 1600);
        } catch {
            /* silent */
        }
    }, []);

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
        const reportUrl = `/portal/classroom-report/${pin}`;
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
        const join = async () => {
            setJoining(true);
            try {
                await router.visit(`/portal/classrooms/join`, {
                    method: 'post',
                    data: { pin },
                });
                router.reload({ only: ['member'] });
            } catch {
                /* silent */
            }
            setJoining(false);
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
                        {classroom.games.map((g) => {
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
        router.visit(`/portal/classrooms/leave`, {
            method: 'post',
            data: { pin },
        });
        setShowLeave(false);
    };

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
                </div>

                {games.length > 0 && (
                    <section className="auth-card flex w-full flex-col gap-3 !p-5">
                        <h2 className="flex items-center gap-2 text-lg font-bold">
                            <Gamepad2 className="size-5" aria-hidden="true" />
                            {t('classroom.portal.games')}
                        </h2>
                        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                            {games.map((g) => {
                                const Icon = catalog.icon(g.game_key);
                                const url = catalog.url(g.game_key);
                                return (
                                    <a
                                        key={g.game_key}
                                        href={
                                            url
                                                ? `${url}?classroom=${classroom.id}`
                                                : '#'
                                        }
                                        className="flex items-center gap-3 rounded-xl border-2 border-[#1f2a44] bg-white p-3 text-left hover:bg-[#FFFDE6]"
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
                                        <div className="min-w-0">
                                            <p className="truncate text-sm font-bold">
                                                {catalog.title(g.game_key)}
                                            </p>
                                            <p className="text-xs text-muted-foreground">
                                                {g.question_count}{' '}
                                                {t(
                                                    'classroom.portal.questions',
                                                )}
                                            </p>
                                        </div>
                                    </a>
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
