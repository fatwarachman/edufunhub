import {
    AiPoints,
    STUDENT_SECTIONS,
    SUMMARY_SECTIONS,
} from '@/components/classroom/ai-points';
import {
    ClassroomAnnouncementCard,
    type TeacherAnnouncement,
} from '@/components/classroom/classroom-announcement-card';
import {
    AccuracyBar,
    actionButtonClass,
    ClassroomDialog,
    ConfirmDialog,
    dangerButtonClass,
    DifficultyChip,
    EmptyBox,
    GameChip,
    MasteryBadge,
    primaryButtonClass,
    StatusPill,
    useClassroomFormat,
    useCountdownText,
    useGameCatalog,
    useNow,
} from '@/components/classroom/classroom-ui';
import type {
    ClassroomDetail,
    ClassroomReport,
    Live,
} from '@/components/classroom/types';
import { TeacherTabs } from '@/components/teacher/teacher-tabs';
import { SuccessNotice } from '@/components/teacher/teacher-ui';
import { useTranslations } from '@/hooks/use-translations';
import { useVisibleInterval } from '@/hooks/use-visible-interval';
import PlayerLayout from '@/layouts/player-layout';
import { absoluteUrl, shareWhatsApp } from '@/lib/share';
import { useSubjectName } from '@/lib/subjects';
import { cn } from '@/lib/utils';
import { type SharedData } from '@/types';
import { Link, router, usePage } from '@inertiajs/react';
import {
    Activity,
    AlertTriangle,
    ArrowUpRight,
    Ban,
    BarChart3,
    Box,
    Brain,
    Check,
    CheckCheck,
    ChevronDown,
    ChevronUp,
    CircleCheck,
    Clock,
    Copy,
    Download,
    Gamepad2,
    GraduationCap,
    Link2,
    Loader2,
    MessageSquareShare,
    Pencil,
    Send,
    Share2,
    ShieldCheck,
    Sparkles,
    Swords,
    Trophy,
    Users,
    UserX,
    Wifi,
} from 'lucide-react';
import { useCallback, useState, type FormEvent } from 'react';

interface ClassroomShowProps {
    classroom: ClassroomDetail;
    live: Live | null;
    report: ClassroomReport | null;
    announcements?: TeacherAnnouncement[];
}

export default function ClassroomShow({
    classroom,
    live,
    report,
    announcements = [],
}: ClassroomShowProps) {
    const { t } = useTranslations();
    const { errors } = usePage<
        SharedData & { errors?: Record<string, string> }
    >().props;
    const pageErrors = Object.values(errors ?? {});
    const catalog = useGameCatalog();
    const format = useClassroomFormat();
    const countdown = useCountdownText();
    const now = useNow(classroom.status !== 'ended');

    const endsAtMs = new Date(classroom.ends_at).getTime();
    const remainingMs = endsAtMs - now;
    const ended =
        classroom.status === 'ended' ||
        (classroom.status === 'active' && remainingMs <= 0);

    const [tab, setTab] = useState<'live' | 'analysis' | 'ai'>('live');
    const [showEndDialog, setShowEndDialog] = useState(false);
    const [showShareDialog, setShowShareDialog] = useState(false);
    const [shareNote, setShareNote] = useState('');
    const [copiedVal, setCopiedVal] = useState<string | null>(null);
    const [showKickConfirm, setShowKickConfirm] = useState<number | null>(null);
    const [aiBusy, setAiBusy] = useState(false);

    const copy = useCallback(async (text: string) => {
        if (!navigator?.clipboard) return false;
        try {
            await navigator.clipboard.writeText(text);
            setCopiedVal(text);
            window.setTimeout(() => setCopiedVal(null), 1600);
            return true;
        } catch {
            return false;
        }
    }, []);

    useVisibleInterval(
        () => {
            router.reload({ only: ['live', 'announcements'] });
        },
        classroom.status === 'active' ? 10000 : 30000,
        tab === 'live' && classroom.status !== 'ended',
    );

    const endNow = () => {
        router.post(
            `/teacher/classrooms/${classroom.id}/end`,
            {},
            { preserveScroll: true },
        );
        setShowEndDialog(false);
    };

    const kick = (memberId: number) => {
        router.post(
            `/teacher/classrooms/${classroom.id}/remove-member`,
            { member_id: memberId },
            { preserveScroll: true },
        );
        setShowKickConfirm(null);
    };

    const shareAll = () => {
        router.post(
            `/teacher/classrooms/${classroom.id}/share-all`,
            { note: shareNote.trim() || null },
            { preserveScroll: true },
        );
        setShowShareDialog(false);
        setShareNote('');
    };

    const shareStudent = (memberId: number) => {
        router.post(
            `/teacher/classrooms/${classroom.id}/share`,
            { member_id: memberId },
            { preserveScroll: true },
        );
    };

    const runAi = () => {
        router.post(
            `/teacher/classrooms/${classroom.id}/analyze`,
            {},
            {
                preserveScroll: true,
                onStart: () => setAiBusy(true),
                onFinish: () => setAiBusy(false),
            },
        );
    };

    const aiPolling =
        classroom.ai_status === 'queued' || classroom.ai_status === 'running';
    useVisibleInterval(
        () => {
            router.reload({ only: ['classroom', 'report'] });
        },
        5000,
        aiPolling,
    );

    const shareUrl = absoluteUrl(classroom.join_path);

    return (
        <PlayerLayout title={classroom.name}>
            <TeacherTabs active="classrooms" />

            <div className="flex flex-wrap items-end justify-between gap-4">
                <div className="flex min-w-0 flex-col items-start gap-3">
                    <h1 className="text-3xl font-bold tracking-tight break-words md:text-5xl">
                        {classroom.name}
                    </h1>
                    {classroom.description && (
                        <p className="max-w-2xl text-muted-foreground">
                            {classroom.description}
                        </p>
                    )}
                    <div className="flex flex-wrap items-center gap-2">
                        <StatusPill status={classroom.status} />
                        {classroom.status === 'active' &&
                            !ended &&
                            remainingMs > 0 && (
                                <span className="flex items-center gap-1.5 rounded-full border-2 border-[#1f2a44] bg-[#ffd93d] px-2.5 py-0.5 text-xs font-bold tabular-nums">
                                    <Clock
                                        className="size-3.5"
                                        aria-hidden="true"
                                    />
                                    {countdown(remainingMs)}
                                </span>
                            )}
                    </div>
                    {classroom.games.length > 0 && (
                        <ul
                            className="flex flex-wrap items-center gap-2"
                            data-testid="classroom-show-games"
                        >
                            {classroom.games.map((game) => (
                                <li
                                    key={game.game_key}
                                    className="flex min-w-0 items-center gap-1"
                                >
                                    <GameChip gameKey={game.game_key} />
                                    {game.max_plays != null && (
                                        <span
                                            className="rounded-full border-2 border-[#1f2a44] bg-[#fff0cf] px-2 py-0.5 text-xs font-bold tabular-nums"
                                            data-testid={`classroom-max-plays-${game.game_key}`}
                                        >
                                            {t('classroom.show.maxPlays', {
                                                count: game.max_plays,
                                            })}
                                        </span>
                                    )}
                                </li>
                            ))}
                        </ul>
                    )}
                </div>
            </div>

            <section
                className="auth-card flex flex-col items-center gap-3 !p-5 text-center"
                data-testid="classroom-show-pin"
            >
                <span className="text-sm font-bold tracking-wide text-muted-foreground uppercase">
                    {t('classroom.common.pin')}
                </span>
                <span
                    className="block pl-[0.3em] font-display text-4xl leading-none font-black tracking-[0.3em] tabular-nums md:text-6xl"
                    data-testid="classroom-pin-display"
                >
                    {classroom.pin}
                </span>
                <div className="flex flex-wrap justify-center gap-2">
                    {classroom.status !== 'ended' && (
                        <>
                            <button
                                type="button"
                                onClick={() => copy(classroom.pin)}
                                className={actionButtonClass}
                                aria-label={t('classroom.share.copyPin')}
                                data-testid="classroom-copy-pin"
                            >
                                {copiedVal === classroom.pin ? (
                                    <Check className="size-4" />
                                ) : (
                                    <Copy className="size-4" />
                                )}
                                <span>
                                    {copiedVal === classroom.pin
                                        ? t('classroom.share.copied')
                                        : t('classroom.share.copyPin')}
                                </span>
                            </button>
                            <button
                                type="button"
                                onClick={() => copy(shareUrl)}
                                className={actionButtonClass}
                                aria-label={t('classroom.share.copyLink')}
                                data-testid="classroom-copy-link"
                            >
                                {copiedVal === shareUrl ? (
                                    <Check className="size-4" />
                                ) : (
                                    <Link2 className="size-4" />
                                )}
                                <span>
                                    {copiedVal === shareUrl
                                        ? t('classroom.share.copied')
                                        : t('classroom.share.copyLink')}
                                </span>
                            </button>
                            <button
                                type="button"
                                onClick={() =>
                                    shareWhatsApp(
                                        t('classroom.share.waText', {
                                            name: classroom.name,
                                            pin: classroom.pin,
                                            url: shareUrl,
                                        }),
                                    )
                                }
                                className={actionButtonClass}
                                data-testid="classroom-share-wa"
                            >
                                <MessageSquareShare className="size-4" />
                                <span>{t('classroom.share.whatsapp')}</span>
                            </button>
                            <button
                                type="button"
                                onClick={() => {
                                    if (navigator.share) {
                                        navigator.share({
                                            title: classroom.name,
                                            url: shareUrl,
                                        });
                                    }
                                }}
                                className={actionButtonClass}
                                data-testid="classroom-share-native"
                            >
                                <Share2 className="size-4" />
                                <span>{t('classroom.share.share')}</span>
                            </button>
                        </>
                    )}
                    {classroom.status === 'scheduled' && (
                        <Link
                            href={`/teacher/classrooms/${classroom.id}/edit`}
                            className={actionButtonClass}
                            data-testid="classroom-edit-link"
                        >
                            <Pencil className="size-4" />
                            <span>{t('classroom.teacher.edit')}</span>
                        </Link>
                    )}
                    {classroom.status === 'active' && !ended && (
                        <Link
                            href={`/teacher/classrooms/${classroom.id}/world`}
                            className={primaryButtonClass}
                            data-testid="classroom-teacher-enter-world"
                        >
                            <Box className="size-4" aria-hidden="true" />
                            <span>{t('classroom.teacher.enterWorld')}</span>
                        </Link>
                    )}
                    {classroom.status === 'active' && !ended && (
                        <button
                            type="button"
                            onClick={() => setShowEndDialog(true)}
                            className={dangerButtonClass}
                            data-testid="classroom-end-now"
                        >
                            <Ban className="size-4" />
                            <span>{t('classroom.teacher.endNow')}</span>
                        </button>
                    )}
                </div>
            </section>

            <SuccessNotice />
            {pageErrors.length > 0 && (
                <p
                    role="alert"
                    className="rounded-2xl border-[3px] border-[#151b2e] bg-[#ffe9e6] px-4 py-3 text-sm font-semibold text-[#8e2a1f]"
                    data-testid="classroom-error"
                >
                    {pageErrors.join(' ')}
                </p>
            )}

            <nav
                className="flex w-full gap-1 rounded-[1.25rem] border-2 border-[#1f2a44] bg-white p-1 shadow-[3px_3px_0_#1f2a44]"
                role="tablist"
                aria-label={t('classroom.show.tabsLabel')}
            >
                {(['live', 'analysis', 'ai'] as const).map((key) => {
                    const current = tab === key;
                    const disabled = key === 'analysis' && !report;
                    const icons = {
                        live: Activity,
                        analysis: BarChart3,
                        ai: Brain,
                    };
                    const Icon = icons[key];
                    return (
                        <button
                            key={key}
                            role="tab"
                            aria-selected={current}
                            disabled={disabled}
                            onClick={() => setTab(key)}
                            data-testid={`classroom-tab-${key}`}
                            className={cn(
                                'flex min-h-11 min-w-0 flex-1 basis-0 items-center justify-center gap-1.5 rounded-full px-2 text-xs leading-tight font-bold transition-colors disabled:cursor-not-allowed disabled:opacity-50 sm:px-3 sm:text-sm',
                                current
                                    ? 'bg-[#151b2e] text-white'
                                    : 'text-[#151b2e] hover:bg-[#fff0cf]',
                            )}
                        >
                            <Icon
                                className="size-4 shrink-0"
                                aria-hidden="true"
                            />
                            <span className="truncate">
                                {t(`classroom.show.tab.${key}`)}
                            </span>
                        </button>
                    );
                })}
            </nav>

            {tab === 'live' && (
                <ClassroomAnnouncementCard
                    classroomId={classroom.id}
                    active={classroom.status === 'active' && !ended}
                    announcements={announcements}
                />
            )}
            {tab === 'live' && (
                <LivePanel
                    classroom={classroom}
                    live={live}
                    catalog={catalog}
                    format={format}
                    t={t}
                    onKick={(id) => setShowKickConfirm(id)}
                />
            )}
            {tab === 'analysis' && report && (
                <AnalysisPanel
                    classroom={classroom}
                    report={report}
                    format={format}
                    t={t}
                    onShareStudent={shareStudent}
                    onShareAll={() => setShowShareDialog(true)}
                />
            )}
            {tab === 'ai' && (
                <AiPanel
                    classroom={classroom}
                    report={report}
                    format={format}
                    t={t}
                    runAi={runAi}
                    aiBusy={aiBusy}
                />
            )}

            <ConfirmDialog
                open={showEndDialog}
                onClose={() => setShowEndDialog(false)}
                onConfirm={endNow}
                title={t('classroom.show.endConfirmTitle')}
                description={t('classroom.show.endConfirmBody')}
                confirmLabel={t('classroom.show.endNow')}
                testId="classroom-end-confirm"
            />

            <ConfirmDialog
                open={showKickConfirm !== null}
                onClose={() => setShowKickConfirm(null)}
                onConfirm={() =>
                    showKickConfirm !== null && kick(showKickConfirm)
                }
                title={t('classroom.show.kickConfirmTitle')}
                description={t('classroom.show.kickConfirmBody')}
                confirmLabel={t('classroom.show.kick')}
                testId="classroom-kick-confirm"
            />

            <ClassroomDialog
                open={showShareDialog}
                onClose={() => setShowShareDialog(false)}
                title={t('classroom.show.shareAllDialogTitle')}
                testId="classroom-share-all-dialog"
                footer={
                    <>
                        <button
                            type="button"
                            onClick={() => setShowShareDialog(false)}
                            className={actionButtonClass}
                        >
                            {t('classroom.common.cancel')}
                        </button>
                        <button
                            type="button"
                            onClick={shareAll}
                            className={primaryButtonClass}
                            data-testid="classroom-share-all-confirm"
                        >
                            <Send className="size-4" />
                            {t('classroom.show.shareAll')}
                        </button>
                    </>
                }
            >
                <label className="flex flex-col gap-1.5">
                    <span className="text-sm font-bold">
                        {t('classroom.show.shareNote')}
                    </span>
                    <textarea
                        value={shareNote}
                        onChange={(e: FormEvent<HTMLTextAreaElement>) =>
                            setShareNote(
                                (e.target as HTMLTextAreaElement).value,
                            )
                        }
                        maxLength={500}
                        rows={3}
                        className="min-h-11 w-full rounded-xl border-2 border-[#151b2e] bg-white px-3.5 py-2 text-sm font-semibold"
                        data-testid="classroom-share-note"
                    />
                </label>
            </ClassroomDialog>
        </PlayerLayout>
    );
}

function LivePanel({
    classroom,
    live,
    catalog,
    format,
    t,
    onKick,
}: {
    classroom: ClassroomDetail;
    live: Live | null;
    catalog: ReturnType<typeof useGameCatalog>;
    format: ReturnType<typeof useClassroomFormat>;
    t: (key: string, params?: Record<string, unknown>) => string;
    onKick: (id: number) => void;
}) {
    const ended = classroom.status === 'ended';
    return (
        <div className="flex flex-col gap-6">
            <div
                className="grid grid-cols-3 gap-2 sm:gap-4"
                data-testid="classroom-live-kpis"
            >
                <KpiCard
                    icon={Users}
                    label={t('classroom.show.members')}
                    value={format.number(live?.members_count ?? 0)}
                    accent="#efeaff"
                />
                <KpiCard
                    icon={Wifi}
                    label={t('classroom.show.online')}
                    value={format.number(live?.online_count ?? 0)}
                    accent="#dff7ea"
                />
                <KpiCard
                    icon={Gamepad2}
                    label={t('classroom.show.playing')}
                    value={format.number(live?.playing_count ?? 0)}
                    accent="#fff0cf"
                />
            </div>

            {live && live.members.length > 0 ? (
                <div
                    className="auth-card flex flex-col gap-4 !p-5"
                    data-testid="classroom-members-table"
                >
                    <h2 className="flex items-center gap-2 text-lg font-bold">
                        <Users className="size-5" aria-hidden="true" />
                        {t('classroom.show.memberList')}
                    </h2>
                    <div className="overflow-x-auto">
                        <table className="w-full text-left text-sm">
                            <thead>
                                <tr className="border-b-2 border-[#1f2a44]/10 text-xs font-bold text-muted-foreground">
                                    <th className="p-2">
                                        {t('classroom.show.thMember')}
                                    </th>
                                    <th className="p-2">
                                        {t('classroom.show.thGrade')}
                                    </th>
                                    <th className="p-2">
                                        {t('classroom.show.thGame')}
                                    </th>
                                    <th className="p-2 text-right">
                                        {t('classroom.show.thPlays')}
                                    </th>
                                    <th className="p-2 text-right">
                                        {t('classroom.show.thAnswered')}
                                    </th>
                                    <th className="p-2 text-right">
                                        {t('classroom.show.thAccuracy')}
                                    </th>
                                    <th className="p-2 text-right">
                                        {t('classroom.show.thPoints')}
                                    </th>
                                    <th className="p-2"></th>
                                </tr>
                            </thead>
                            <tbody>
                                {live.members
                                    .filter((m) => !m.removed)
                                    .map((member) => {
                                        const Icon = member.current_game
                                            ? catalog.icon(member.current_game)
                                            : null;
                                        return (
                                            <tr
                                                key={member.member_id}
                                                className="border-b border-[#1f2a44]/5"
                                                data-testid={`classroom-member-${member.member_id}`}
                                            >
                                                <td className="flex items-center gap-2 p-2 font-bold">
                                                    <span className="grid size-8 shrink-0 place-items-center rounded-full border-2 border-[#1f2a44] bg-[#fff0cf] text-xs font-black">
                                                        {member.name
                                                            .charAt(0)
                                                            .toUpperCase()}
                                                    </span>
                                                    <span className="min-w-0 truncate">
                                                        {member.name}
                                                    </span>
                                                    {member.online && (
                                                        <span
                                                            className="size-2 shrink-0 rounded-full bg-[#15803d] motion-safe:animate-pulse"
                                                            title={t(
                                                                'classroom.show.online',
                                                            )}
                                                        />
                                                    )}
                                                </td>
                                                <td className="p-2 text-xs text-muted-foreground">
                                                    {member.grade ?? '—'}
                                                </td>
                                                <td className="p-2">
                                                    {member.current_game &&
                                                    Icon ? (
                                                        <span className="inline-flex items-center gap-1.5 text-xs font-bold">
                                                            <Icon
                                                                className="size-3.5"
                                                                aria-hidden="true"
                                                            />
                                                            {catalog.title(
                                                                member.current_game,
                                                            )}
                                                        </span>
                                                    ) : (
                                                        <span className="text-xs text-muted-foreground">
                                                            —
                                                        </span>
                                                    )}
                                                </td>
                                                <td className="p-2 text-right tabular-nums">
                                                    {format.number(
                                                        member.plays,
                                                    )}
                                                </td>
                                                <td className="p-2 text-right tabular-nums">
                                                    {format.number(
                                                        member.answered,
                                                    )}
                                                </td>
                                                <td
                                                    className={`p-2 text-right font-bold tabular-nums ${member.answered > 0 ? (member.correct / member.answered >= 0.7 ? 'text-[#116a56]' : 'text-[#b23a52]') : ''}`}
                                                >
                                                    {member.answered > 0
                                                        ? format.percent(
                                                              (member.correct /
                                                                  member.answered) *
                                                                  100,
                                                          )
                                                        : '—'}
                                                </td>
                                                <td className="p-2 text-right font-bold tabular-nums">
                                                    {format.number(
                                                        member.points,
                                                    )}
                                                </td>
                                                <td className="p-2">
                                                    {!ended && (
                                                        <button
                                                            type="button"
                                                            onClick={() =>
                                                                onKick(
                                                                    member.member_id,
                                                                )
                                                            }
                                                            className="inline-flex size-8 items-center justify-center rounded-lg border-2 border-[#1f2a44] bg-[#ffe1e6] hover:bg-[#ffc9d3]"
                                                            aria-label={t(
                                                                'classroom.show.kick',
                                                            )}
                                                            title={t(
                                                                'classroom.show.kick',
                                                            )}
                                                            data-testid={`classroom-kick-${member.member_id}`}
                                                        >
                                                            <UserX
                                                                className="size-3.5"
                                                                aria-hidden="true"
                                                            />
                                                        </button>
                                                    )}
                                                </td>
                                            </tr>
                                        );
                                    })}
                            </tbody>
                        </table>
                    </div>
                </div>
            ) : ended ? (
                <p className="text-sm font-bold text-muted-foreground">
                    {t('classroom.show.noMembers')}
                </p>
            ) : (
                <EmptyBox
                    icon={Users}
                    title={t('classroom.show.emptyLive')}
                    hint={t('classroom.show.emptyLiveHint')}
                />
            )}
        </div>
    );
}

function AnalysisPanel({
    classroom,
    report,
    format,
    t,
    onShareStudent,
    onShareAll,
}: {
    classroom: ClassroomDetail;
    report: ClassroomReport;
    format: ReturnType<typeof useClassroomFormat>;
    t: (key: string, params?: Record<string, unknown>) => string;
    onShareStudent: (memberId: number) => void;
    onShareAll: () => void;
}) {
    const { summary } = report;
    const [expandedStudent, setExpandedStudent] = useState<number | null>(null);
    const subjectName = useSubjectName();
    const gameCatalog = useGameCatalog();
    const { i18n } = useTranslations();
    const english = i18n.language?.startsWith('en');
    const insightText = (insight: ClassroomReport['insights'][number]) => {
        const p = insight.params;
        const pick = (id: unknown, en: unknown) =>
            String((english && en) || id || '');
        return t(`classroom.insights.${insight.key}`, {
            ...p,
            subject: subjectName(String(p.subject ?? '')),
            topic: pick(p.topic, p.topic_en),
            prompt: pick(p.prompt, p.prompt_en),
            accuracy: format.percent(
                typeof p.accuracy === 'number' ? p.accuracy : null,
            ),
            interpolation: { escapeValue: false },
        });
    };

    return (
        <div className="flex flex-col gap-6">
            <div
                className="grid grid-cols-2 gap-2 sm:gap-4 lg:grid-cols-4"
                data-testid="classroom-report-kpis"
            >
                <KpiCard
                    icon={Users}
                    label={t('classroom.show.reportMembers')}
                    value={format.number(summary.members)}
                    accent="#efeaff"
                />
                <KpiCard
                    icon={Gamepad2}
                    label={t('classroom.show.reportPlays')}
                    value={format.number(summary.plays)}
                    accent="#fff0cf"
                />
                <KpiCard
                    icon={CircleCheck}
                    label={t('classroom.show.reportCorrect')}
                    value={format.number(summary.correct)}
                    accent="#dff7ea"
                />
                <KpiCard
                    icon={Trophy}
                    label={t('classroom.show.reportAccuracy')}
                    value={format.percent(summary.accuracy)}
                    accent="#ffd93d"
                />
            </div>

            {report.games.length > 0 && (
                <section
                    className="auth-card flex flex-col gap-3 !p-5"
                    data-testid="classroom-report-games"
                >
                    <h2 className="flex items-center gap-2 text-lg font-bold">
                        <Gamepad2 className="size-5" aria-hidden="true" />
                        {t('classroom.show.perGame')}
                    </h2>
                    <div
                        className={cn(
                            'grid gap-2 sm:gap-3',
                            report.games.length > 1 &&
                                'sm:grid-cols-2 lg:grid-cols-3',
                        )}
                    >
                        {report.games.map((g) => {
                            const Icon = classroom.games.find(
                                (cg) => cg.game_key === g.game_key,
                            )
                                ? gameIconLookup(g.game_key)
                                : Gamepad2;
                            return (
                                <div
                                    key={g.game_key}
                                    className="flex min-w-0 flex-col gap-2 rounded-xl border-2 border-[#1f2a44] bg-white p-3"
                                >
                                    <div className="flex items-start gap-2 text-sm leading-snug font-bold">
                                        <Icon
                                            className="mt-0.5 size-4 shrink-0"
                                            aria-hidden="true"
                                        />
                                        <span className="min-w-0 break-words">
                                            {gameCatalog.title(g.game_key)}
                                        </span>
                                    </div>
                                    <div className="grid grid-cols-3 gap-1.5 text-center text-xs">
                                        {(
                                            [
                                                [
                                                    'classroom.show.reportPlays',
                                                    format.number(g.plays),
                                                ],
                                                [
                                                    'classroom.show.reportPlayers',
                                                    format.number(g.players),
                                                ],
                                                [
                                                    'classroom.show.reportAccuracy',
                                                    format.percent(g.accuracy),
                                                ],
                                            ] as const
                                        ).map(([label, value]) => (
                                            <span
                                                key={label}
                                                className="flex min-w-0 flex-col rounded-lg border border-[#1f2a44]/15 bg-[#faf7f0] px-1 py-1.5"
                                            >
                                                <strong className="text-sm tabular-nums">
                                                    {value}
                                                </strong>
                                                <span className="truncate text-[10px] font-semibold text-[#1f2a44]/70 min-[360px]:text-xs">
                                                    {t(label)}
                                                </span>
                                            </span>
                                        ))}
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </section>
            )}

            {report.subjects.length > 0 && (
                <section
                    className="auth-card flex flex-col gap-3 !p-5"
                    data-testid="classroom-report-subjects"
                >
                    <h2 className="flex items-center gap-2 text-lg font-bold">
                        <GraduationCap className="size-5" aria-hidden="true" />
                        {t('classroom.show.perSubject')}
                    </h2>
                    <div className="flex flex-col gap-3">
                        {report.subjects.map((s) => (
                            <div key={s.key} className="flex flex-col gap-1">
                                <div className="flex items-baseline justify-between gap-2 text-sm">
                                    <span className="font-bold">
                                        {subjectName(s.key)}
                                    </span>
                                    <span className="text-xs text-muted-foreground tabular-nums">
                                        {format.percent(s.accuracy)}
                                    </span>
                                </div>
                                <AccuracyBar value={s.accuracy ?? null} />
                            </div>
                        ))}
                    </div>
                </section>
            )}

            {report.topics.length > 0 && (
                <section
                    className="auth-card flex flex-col gap-3 !p-5"
                    data-testid="classroom-report-topics"
                >
                    <h2 className="flex items-center gap-2 text-lg font-bold">
                        <ShieldCheck className="size-5" aria-hidden="true" />
                        {t('classroom.show.perTopic')}
                    </h2>
                    <div className="flex flex-col gap-3">
                        {report.topics.map((topic) => (
                            <div key={topic.id} className="flex flex-col gap-1">
                                <div className="flex items-baseline justify-between gap-2 text-sm">
                                    <span className="font-bold">
                                        {topic.name_id}
                                    </span>
                                    <span className="text-xs text-muted-foreground tabular-nums">
                                        {format.percent(topic.accuracy)}
                                    </span>
                                </div>
                                <AccuracyBar value={topic.accuracy ?? null} />
                            </div>
                        ))}
                    </div>
                </section>
            )}

            {report.questions.length > 0 && (
                <section
                    className="auth-card flex flex-col gap-3 !p-5"
                    data-testid="classroom-report-hardest"
                >
                    <h2 className="flex items-center gap-2 text-lg font-bold">
                        <AlertTriangle className="size-5" aria-hidden="true" />
                        {t('classroom.show.hardestQuestions')}
                    </h2>
                    <div className="flex flex-col gap-3">
                        {report.questions
                            .filter(
                                (q) => q.accuracy !== null && q.accuracy < 70,
                            )
                            .sort(
                                (a, b) =>
                                    (a.accuracy ?? 100) - (b.accuracy ?? 100),
                            )
                            .slice(0, 10)
                            .map((q) => (
                                <div
                                    key={q.id}
                                    className="rounded-xl border-2 border-[#1f2a44] bg-white p-3"
                                >
                                    <div className="flex flex-wrap items-center gap-1.5 text-xs font-bold">
                                        <DifficultyChip
                                            difficulty={q.difficulty}
                                        />
                                    </div>
                                    <p className="mt-1 text-sm font-semibold">
                                        {q.prompt_id}
                                    </p>
                                    <div className="mt-1 flex items-center gap-2 text-xs">
                                        <AccuracyBar
                                            value={q.accuracy ?? null}
                                        />
                                        <span className="shrink-0 font-bold tabular-nums">
                                            {format.percent(q.accuracy)}
                                        </span>
                                    </div>
                                    {q.top_wrong && (
                                        <p className="mt-1 text-xs text-muted-foreground">
                                            {t('classroom.show.topWrong')}:{' '}
                                            <strong>{q.top_wrong.text}</strong>{' '}
                                            ({q.top_wrong.count}x)
                                        </p>
                                    )}
                                </div>
                            ))}
                    </div>
                </section>
            )}

            {report.insights.length > 0 && (
                <section
                    className="auth-card flex flex-col gap-3 !p-5"
                    data-testid="classroom-report-insights"
                >
                    <h2 className="flex items-center gap-2 text-lg font-bold">
                        <Brain className="size-5" aria-hidden="true" />
                        {t('classroom.show.insights')}
                    </h2>
                    <ul className="flex flex-col gap-2">
                        {report.insights.map((insight, i) => (
                            <li
                                key={i}
                                className="flex items-start gap-2 rounded-xl border-2 border-[#1f2a44] bg-[#fff9e6] p-3 text-sm font-semibold"
                            >
                                <ArrowUpRight
                                    className="mt-0.5 size-4 shrink-0"
                                    aria-hidden="true"
                                />
                                <span>{insightText(insight)}</span>
                            </li>
                        ))}
                    </ul>
                </section>
            )}

            <div
                className="auth-card flex flex-col gap-4 !p-5"
                data-testid="classroom-report-students"
            >
                <div className="flex flex-wrap items-center justify-between gap-2">
                    <h2 className="flex items-center gap-2 text-lg font-bold">
                        <Users className="size-5" aria-hidden="true" />
                        {t('classroom.show.studentList')}
                    </h2>
                    <div className="flex flex-wrap gap-2">
                        <Link
                            href={`/teacher/classrooms/${classroom.id}/participants`}
                            className={actionButtonClass}
                            data-testid="classroom-participants-link"
                        >
                            <Users className="size-4" aria-hidden="true" />
                            {t('classroom.participants.open')}
                        </Link>
                        <button
                            type="button"
                            onClick={onShareAll}
                            className={actionButtonClass}
                            data-testid="classroom-share-all-btn"
                        >
                            <Send className="size-4" />
                            {t('classroom.show.shareAll')}
                        </button>
                    </div>
                </div>
                {report.students.map((student) => (
                    <div
                        key={student.member_id}
                        className="rounded-xl border-2 border-[#1f2a44] bg-white p-3"
                        data-testid={`classroom-student-${student.member_id}`}
                    >
                        <button
                            type="button"
                            onClick={() =>
                                setExpandedStudent(
                                    expandedStudent === student.member_id
                                        ? null
                                        : student.member_id,
                                )
                            }
                            aria-expanded={
                                expandedStudent === student.member_id
                            }
                            aria-controls={`classroom-student-panel-${student.member_id}`}
                            data-testid={`classroom-student-toggle-${student.member_id}`}
                            className="flex w-full items-center justify-between gap-2 rounded-lg text-left focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-[#6c5ce7]"
                        >
                            <div className="flex min-w-0 items-center gap-2">
                                <span className="grid size-9 shrink-0 place-items-center rounded-full border-2 border-[#1f2a44] bg-[#fff0cf] text-xs font-black">
                                    {student.name.charAt(0).toUpperCase()}
                                </span>
                                <div className="min-w-0">
                                    <p className="truncate text-sm font-bold">
                                        {student.name}
                                    </p>
                                    <div className="flex items-center gap-2">
                                        <MasteryBadge
                                            mastery={student.mastery}
                                        />
                                        <span className="text-xs text-muted-foreground tabular-nums">
                                            {format.percent(student.accuracy)}
                                        </span>
                                    </div>
                                </div>
                            </div>
                            <div className="flex items-center gap-2">
                                {student.shared_at && (
                                    <span className="flex items-center gap-1 rounded-full border-2 border-[#1f2a44] bg-[#dff7ea] px-2 py-0.5 text-xs font-bold">
                                        <CheckCheck
                                            className="size-3"
                                            aria-hidden="true"
                                        />
                                        {t('classroom.show.shared')}
                                    </span>
                                )}
                                {!student.shared_at && (
                                    <button
                                        type="button"
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            onShareStudent(student.member_id);
                                        }}
                                        className={actionButtonClass}
                                        data-testid={`classroom-share-student-${student.member_id}`}
                                    >
                                        <Send className="size-3.5" />
                                        <span className="text-xs">
                                            {t('classroom.show.share')}
                                        </span>
                                    </button>
                                )}
                                <ChevronDown
                                    className={cn(
                                        'size-4 shrink-0 transition-transform duration-300 ease-out motion-reduce:transition-none',
                                        expandedStudent === student.member_id &&
                                            'rotate-180',
                                    )}
                                    aria-hidden="true"
                                />
                            </div>
                        </button>
                        <div
                            id={`classroom-student-panel-${student.member_id}`}
                            className={cn(
                                'grid transition-[grid-template-rows,opacity] duration-300 ease-out motion-reduce:transition-none',
                                expandedStudent === student.member_id
                                    ? 'grid-rows-[1fr] opacity-100'
                                    : 'grid-rows-[0fr] opacity-0',
                            )}
                            aria-hidden={expandedStudent !== student.member_id}
                            inert={expandedStudent !== student.member_id}
                        >
                            <div className="min-h-0 overflow-hidden">
                                <div className="mt-3 flex flex-col gap-3 border-t-2 border-dashed border-[#1f2a44]/15 pt-3 text-sm">
                                    <dl className="grid grid-cols-3 gap-1.5 text-center sm:grid-cols-6">
                                        {(
                                            [
                                                [
                                                    'thPlays',
                                                    format.number(
                                                        student.plays,
                                                    ),
                                                ],
                                                [
                                                    'thAnswered',
                                                    format.number(
                                                        student.answered,
                                                    ),
                                                ],
                                                [
                                                    'reportCorrect',
                                                    format.number(
                                                        student.correct,
                                                    ),
                                                ],
                                                [
                                                    'reportWrong',
                                                    format.number(
                                                        student.wrong,
                                                    ),
                                                ],
                                                [
                                                    'thPoints',
                                                    format.number(
                                                        student.points,
                                                    ),
                                                ],
                                                [
                                                    'rank',
                                                    student.rank === null
                                                        ? '—'
                                                        : `#${format.number(student.rank)}`,
                                                ],
                                            ] as const
                                        ).map(([label, value]) => (
                                            <div
                                                key={label}
                                                className="flex min-w-0 flex-col rounded-lg border border-[#1f2a44]/15 bg-[#faf7f0] px-1 py-1.5"
                                            >
                                                <dd className="text-sm font-bold tabular-nums">
                                                    {value}
                                                </dd>
                                                <dt className="truncate text-[11px] font-semibold text-[#1f2a44]/70">
                                                    {t(
                                                        `classroom.show.${label}`,
                                                    )}
                                                </dt>
                                            </div>
                                        ))}
                                    </dl>
                                    {student.strengths.length > 0 && (
                                        <div>
                                            <p className="font-bold text-[#116a56]">
                                                {t('classroom.show.strengths')}
                                            </p>
                                            <p className="text-muted-foreground">
                                                {student.strengths
                                                    .map(subjectName)
                                                    .join(', ')}
                                            </p>
                                        </div>
                                    )}
                                    {student.weaknesses.length > 0 && (
                                        <div>
                                            <p className="font-bold text-[#b23a52]">
                                                {t('classroom.show.weaknesses')}
                                            </p>
                                            <p className="text-muted-foreground">
                                                {student.weaknesses
                                                    .map(subjectName)
                                                    .join(', ')}
                                            </p>
                                        </div>
                                    )}
                                    {student.ai_feedback ? (
                                        <div className="flex flex-col gap-2">
                                            <p className="flex items-center gap-1.5 font-bold">
                                                <Sparkles
                                                    className="size-4"
                                                    aria-hidden="true"
                                                />
                                                {t(
                                                    'classroom.show.aiFeedbackTitle',
                                                )}
                                            </p>
                                            <AiPoints
                                                sections={student.ai_feedback}
                                                order={STUDENT_SECTIONS}
                                                compact
                                            />
                                        </div>
                                    ) : (
                                        <p className="text-xs text-muted-foreground">
                                            {student.plays > 0
                                                ? t(
                                                      'classroom.show.noAiFeedback',
                                                  )
                                                : t(
                                                      'classroom.show.notPlayedYet',
                                                  )}
                                        </p>
                                    )}
                                </div>
                            </div>
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
}

function AiPanel({
    classroom,
    report,
    format,
    t,
    runAi,
    aiBusy,
}: {
    classroom: ClassroomDetail;
    report: ClassroomReport | null;
    format: ReturnType<typeof useClassroomFormat>;
    t: (key: string, params?: Record<string, unknown>) => string;
    runAi: () => void;
    aiBusy: boolean;
}) {
    const busy =
        aiBusy ||
        classroom.ai_status === 'queued' ||
        classroom.ai_status === 'running';
    const done = classroom.ai_status === 'done';
    const hasData = (report?.summary.plays ?? 0) > 0;
    const blocked = !classroom.ai_available
        ? t('classroom.show.aiUnavailable')
        : !hasData
          ? t('classroom.show.aiNoData')
          : null;
    const feedback = (report?.students ?? []).filter((s) => s.ai_feedback);
    const [openFeedback, setOpenFeedback] = useState<number[]>([]);
    const allOpen =
        feedback.length > 0 &&
        feedback.every((f) => openFeedback.includes(f.member_id));

    return (
        <div className="flex flex-col gap-4">
            <section
                className="auth-card flex flex-col gap-3 !p-5"
                data-testid="classroom-ai-panel"
            >
                <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="flex min-w-0 flex-col gap-1">
                        <h2 className="flex items-center gap-2 text-lg font-bold">
                            <Brain className="size-5" aria-hidden="true" />
                            {t('classroom.show.aiTitle')}
                        </h2>
                        <p className="text-sm text-muted-foreground">
                            {t('classroom.show.aiIntro')}
                        </p>
                    </div>
                    <button
                        type="button"
                        disabled={busy || blocked !== null}
                        onClick={runAi}
                        className={primaryButtonClass}
                        data-testid="classroom-ai-analyze"
                    >
                        {busy ? (
                            <Loader2 className="size-4 animate-spin motion-reduce:animate-none" />
                        ) : (
                            <Brain className="size-4" />
                        )}
                        {busy
                            ? t('classroom.show.aiProcessing')
                            : done || classroom.ai_summary
                              ? t('classroom.show.aiRerun')
                              : t('classroom.show.aiCreate')}
                    </button>
                </div>
                {blocked && !busy && (
                    <p
                        className="rounded-xl border-2 border-[#1f2a44] bg-[#fff9e6] px-3 py-2 text-sm font-semibold"
                        data-testid="classroom-ai-blocked"
                    >
                        {blocked}
                    </p>
                )}
                {busy && (
                    <p
                        role="status"
                        className="text-sm font-semibold text-muted-foreground"
                    >
                        {t('classroom.show.aiWaiting')}
                    </p>
                )}
                {classroom.ai_status === 'failed' && !busy && (
                    <p
                        role="alert"
                        className="rounded-xl border-2 border-[#c0392b] bg-[#ffe9e6] px-3 py-2 text-sm font-bold text-[#8e2a1f]"
                        data-testid="classroom-ai-failed"
                    >
                        {t('classroom.show.aiFailed')}
                    </p>
                )}
                {done && classroom.report_generated_at && (
                    <p className="text-xs text-muted-foreground">
                        {t('classroom.show.aiGeneratedAt', {
                            time: format.dateTime(
                                classroom.report_generated_at,
                            ),
                        })}
                    </p>
                )}
            </section>

            {classroom.ai_summary && (
                <section
                    className="auth-card flex flex-col gap-3 !p-5"
                    data-testid="classroom-ai-summary"
                >
                    <h2 className="flex items-center gap-2 text-lg font-bold">
                        <Sparkles className="size-5" aria-hidden="true" />
                        {t('classroom.show.aiSummary')}
                    </h2>
                    <AiPoints
                        sections={classroom.ai_summary}
                        order={SUMMARY_SECTIONS}
                        testId="classroom-ai-summary-points"
                    />
                </section>
            )}

            {feedback.length > 0 && (
                <section
                    className="auth-card flex flex-col gap-3 !p-5"
                    data-testid="classroom-ai-students"
                >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                        <h2 className="flex items-center gap-2 text-lg font-bold">
                            <Users className="size-5" aria-hidden="true" />
                            {t('classroom.show.aiStudentFeedback')}
                        </h2>
                        {feedback.length > 1 && (
                            <button
                                type="button"
                                onClick={() =>
                                    setOpenFeedback(
                                        allOpen
                                            ? []
                                            : feedback.map((f) => f.member_id),
                                    )
                                }
                                className="rounded-full border-2 border-[#1f2a44] bg-white px-3 py-1 text-xs font-bold transition-colors hover:bg-[#fff0cf] focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-[#6c5ce7]"
                                data-testid="classroom-ai-feedback-toggle-all"
                            >
                                {allOpen
                                    ? t('classroom.show.collapseAll')
                                    : t('classroom.show.expandAll')}
                            </button>
                        )}
                    </div>
                    <div
                        className={cn(
                            'grid items-start gap-3',
                            feedback.length > 1 && 'md:grid-cols-2',
                        )}
                    >
                        {feedback.map((student) => (
                            <FeedbackAccordion
                                key={student.member_id}
                                student={student}
                                open={openFeedback.includes(student.member_id)}
                                onToggle={() =>
                                    setOpenFeedback((ids) =>
                                        ids.includes(student.member_id)
                                            ? ids.filter(
                                                  (id) =>
                                                      id !== student.member_id,
                                              )
                                            : [...ids, student.member_id],
                                    )
                                }
                            />
                        ))}
                    </div>
                </section>
            )}

            {!classroom.ai_summary && !busy && (
                <EmptyBox
                    icon={Brain}
                    title={t('classroom.show.aiEmpty')}
                    hint={t('classroom.show.aiEmptyHint')}
                />
            )}
        </div>
    );
}

/** One student's AI feedback as a smooth accordion (closed by default). */
function FeedbackAccordion({
    student,
    open,
    onToggle,
}: {
    student: ClassroomReport['students'][number];
    open: boolean;
    onToggle: () => void;
}) {
    const { t } = useTranslations();
    const panelId = `classroom-ai-feedback-panel-${student.member_id}`;
    const points = Object.values(student.ai_feedback ?? {}).reduce(
        (total, list) => total + list.length,
        0,
    );

    return (
        <article
            className={cn(
                'overflow-hidden rounded-xl border-2 border-[#1f2a44] bg-white transition-shadow duration-300',
                open && 'shadow-[3px_3px_0_#1f2a44]',
            )}
            data-testid={`classroom-ai-feedback-${student.member_id}`}
        >
            <button
                type="button"
                onClick={onToggle}
                aria-expanded={open}
                aria-controls={panelId}
                className="flex w-full min-w-0 items-center gap-2 p-3 text-left transition-colors hover:bg-[#faf7f0] focus-visible:outline-3 focus-visible:-outline-offset-3 focus-visible:outline-[#6c5ce7]"
                data-testid={`classroom-ai-feedback-toggle-${student.member_id}`}
            >
                <span className="grid size-8 shrink-0 place-items-center rounded-full border-2 border-[#1f2a44] bg-[#fff0cf] text-xs font-black">
                    {student.name.charAt(0).toUpperCase()}
                </span>
                <span className="flex min-w-0 flex-1 flex-col">
                    <span className="truncate text-sm font-bold">
                        {student.name}
                    </span>
                    <span className="text-xs text-muted-foreground">
                        {t('classroom.show.feedbackPoints', { count: points })}
                    </span>
                </span>
                <MasteryBadge mastery={student.mastery} />
                <ChevronDown
                    className={cn(
                        'size-5 shrink-0 transition-transform duration-300 ease-out motion-reduce:transition-none',
                        open && 'rotate-180',
                    )}
                    aria-hidden="true"
                />
            </button>
            <div
                id={panelId}
                className={cn(
                    'grid transition-[grid-template-rows,opacity] duration-300 ease-out motion-reduce:transition-none',
                    open
                        ? 'grid-rows-[1fr] opacity-100'
                        : 'grid-rows-[0fr] opacity-0',
                )}
                aria-hidden={!open}
                inert={!open}
            >
                <div className="min-h-0 overflow-hidden">
                    <div className="border-t-2 border-dashed border-[#1f2a44]/15 p-3">
                        {student.ai_feedback && (
                            <AiPoints
                                sections={student.ai_feedback}
                                order={STUDENT_SECTIONS}
                                compact
                            />
                        )}
                    </div>
                </div>
            </div>
        </article>
    );
}

function KpiCard({
    icon: Icon,
    label,
    value,
    accent,
}: {
    icon: typeof Users;
    label: string;
    value: string;
    accent: string;
}) {
    return (
        <div className="flex min-w-0 items-center gap-2 rounded-2xl border-2 border-[#151b2e] bg-white p-2.5 shadow-[3px_3px_0_#151b2e] sm:gap-3 sm:p-4">
            <span
                className="hidden size-10 shrink-0 place-items-center rounded-xl border-2 border-[#151b2e] min-[400px]:grid sm:size-11"
                style={{ background: accent }}
            >
                <Icon className="size-5" aria-hidden="true" />
            </span>
            <div className="flex min-w-0 flex-col">
                <p className="flex items-center gap-1.5 text-xl leading-tight font-bold tabular-nums sm:text-2xl md:text-3xl">
                    <span
                        className="grid size-6 shrink-0 place-items-center rounded-md border-2 border-[#151b2e] min-[400px]:hidden"
                        style={{ background: accent }}
                    >
                        <Icon className="size-3.5" aria-hidden="true" />
                    </span>
                    <span className="truncate">{value}</span>
                </p>
                <p className="truncate text-xs font-bold text-muted-foreground sm:text-sm">
                    {label}
                </p>
            </div>
        </div>
    );
}

function gameIconLookup(key: string) {
    const lookup: Record<string, typeof Gamepad2> = {
        'flag-quest': Swords,
        'sky-quiz': Activity,
        'quiz-duel': Swords,
        'knowledge-train': Download,
        'snakes-and-ladders': ChevronUp,
    };
    return lookup[key] ?? Gamepad2;
}
