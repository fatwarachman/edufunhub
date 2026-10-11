import {
    AccuracyBar,
    actionButtonClass,
    ClassroomDialog,
    ConfirmDialog,
    dangerButtonClass,
    DifficultyChip,
    EmptyBox,
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
import { useTranslations } from '@/hooks/use-translations';
import { useVisibleInterval } from '@/hooks/use-visible-interval';
import PlayerLayout from '@/layouts/player-layout';
import { absoluteUrl, shareWhatsApp } from '@/lib/share';
import { useSubjectName } from '@/lib/subjects';
import { cn } from '@/lib/utils';
import { Link, router } from '@inertiajs/react';
import {
    Activity,
    AlertTriangle,
    ArrowUpRight,
    Ban,
    BarChart3,
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
}

export default function ClassroomShow({
    classroom,
    live,
    report,
}: ClassroomShowProps) {
    const { t } = useTranslations();
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
            router.reload({
                only: ['live'],
                preserveScroll: true,
                preserveState: true,
            });
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
            `/teacher/classrooms/${classroom.id}/kick`,
            { member_id: memberId },
            { preserveScroll: true },
        );
        setShowKickConfirm(null);
    };

    const shareAll = () => {
        router.post(
            `/teacher/classrooms/${classroom.id}/share`,
            { note: shareNote || null },
            { preserveScroll: true },
        );
        setShowShareDialog(false);
        setShareNote('');
    };

    const shareStudent = (userId: number) => {
        router.post(
            `/teacher/classrooms/${classroom.id}/share-student`,
            { user_id: userId },
            { preserveScroll: true },
        );
    };

    const runAi = () => {
        setAiBusy(true);
        httpPost(`/teacher/classrooms/${classroom.id}/analyze`).finally(() =>
            setAiBusy(false),
        );
    };

    const httpPost = async (url: string) => {
        try {
            const { response } = await fetch(url, {
                method: 'POST',
                headers: {
                    'X-CSRF-TOKEN':
                        document.querySelector<HTMLMetaElement>(
                            'meta[name="csrf-token"]',
                        )?.content ?? '',
                    Accept: 'application/json',
                },
            });
            if (response.ok) {
                router.reload({ only: ['classroom'], preserveScroll: true });
            }
        } catch {
            // silent
        }
    };

    const aiPolling =
        classroom.ai_status === 'queued' || classroom.ai_status === 'running';
    useVisibleInterval(
        () => {
            router.reload({
                only: ['classroom', 'report'],
                preserveScroll: true,
                preserveState: true,
            });
        },
        5000,
        aiPolling,
    );

    const shareUrl = absoluteUrl(classroom.join_path);

    return (
        <PlayerLayout title={classroom.name}>
            <div className="flex flex-wrap items-end justify-between gap-4">
                <div className="flex min-w-0 flex-col items-start gap-3">
                    <TeacherTabs active="classrooms" />
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
                </div>
            </div>

            <section
                className="auth-card flex flex-col gap-4 !p-5"
                data-testid="classroom-show-pin"
            >
                <div className="flex flex-wrap items-center justify-between gap-3">
                    <span className="text-sm font-bold">
                        {t('classroom.common.pin')}
                    </span>
                    <div className="flex flex-wrap gap-2">
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
                </div>
                <div className="flex items-center gap-4">
                    <span
                        className="font-display text-4xl font-black tracking-[0.3em] md:text-6xl"
                        data-testid="classroom-pin-display"
                    >
                        {classroom.pin}
                    </span>
                </div>
            </section>

            <nav
                className="flex flex-wrap gap-1 rounded-[1.25rem] border-2 border-[#1f2a44] bg-white p-1"
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
                                'flex min-h-11 min-w-0 flex-1 basis-[6rem] items-center justify-center gap-1.5 rounded-full px-3 text-sm leading-tight font-bold transition-colors disabled:cursor-not-allowed disabled:opacity-50',
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
            <div className="grid gap-4 sm:grid-cols-3">
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
    onShareStudent: (userId: number) => void;
    onShareAll: () => void;
}) {
    const { summary } = report;
    const [expandedStudent, setExpandedStudent] = useState<number | null>(null);
    const subjectName = useSubjectName();

    return (
        <div className="flex flex-col gap-6">
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
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
                    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                        {report.games.map((g) => {
                            const Icon = classroom.games.find(
                                (cg) => cg.game_key === g.game_key,
                            )
                                ? gameIconLookup(g.game_key)
                                : Gamepad2;
                            return (
                                <div
                                    key={g.game_key}
                                    className="rounded-xl border-2 border-[#1f2a44] bg-white p-3"
                                >
                                    <div className="flex items-center gap-2 text-sm font-bold">
                                        <Icon
                                            className="size-4 shrink-0"
                                            aria-hidden="true"
                                        />
                                        <span className="min-w-0 truncate">
                                            {t(`teacher.games.${g.game_key}`, {
                                                defaultValue: g.game_key,
                                            })}
                                        </span>
                                    </div>
                                    <div className="mt-2 flex flex-wrap gap-3 text-xs">
                                        <span>
                                            {t('classroom.show.reportPlays')}:{' '}
                                            <strong>
                                                {format.number(g.plays)}
                                            </strong>
                                        </span>
                                        <span>
                                            {t('classroom.show.reportPlayers')}:{' '}
                                            <strong>
                                                {format.number(g.players)}
                                            </strong>
                                        </span>
                                        <span>
                                            {t('classroom.show.reportAccuracy')}
                                            :{' '}
                                            <strong>
                                                {format.percent(g.accuracy)}
                                            </strong>
                                        </span>
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
                                <span>
                                    {t(
                                        `classroom.insights.${insight.key}`,
                                        insight.params as Record<
                                            string,
                                            string | number
                                        >,
                                    )}
                                </span>
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
                            className="flex w-full items-center justify-between gap-2 text-left"
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
                                            onShareStudent(student.user_id);
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
                                {expandedStudent === student.member_id ? (
                                    <ChevronUp className="size-4" />
                                ) : (
                                    <ChevronDown className="size-4" />
                                )}
                            </div>
                        </button>
                        {expandedStudent === student.member_id && (
                            <div className="mt-3 flex flex-col gap-2 border-t-2 border-[#1f2a44]/10 pt-3 text-sm">
                                {student.strengths.length > 0 && (
                                    <div>
                                        <p className="font-bold text-[#116a56]">
                                            {t('classroom.show.strengths')}
                                        </p>
                                        <p className="text-muted-foreground">
                                            {student.strengths.join(', ')}
                                        </p>
                                    </div>
                                )}
                                {student.weaknesses.length > 0 && (
                                    <div>
                                        <p className="font-bold text-[#b23a52]">
                                            {t('classroom.show.weaknesses')}
                                        </p>
                                        <p className="text-muted-foreground">
                                            {student.weaknesses.join(', ')}
                                        </p>
                                    </div>
                                )}
                            </div>
                        )}
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

    return (
        <div className="flex flex-col gap-4">
            {!done && (
                <button
                    type="button"
                    disabled={!classroom.ai_available || busy || !report}
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
                        : t('classroom.show.aiCreate')}
                </button>
            )}
            {classroom.ai_status === 'failed' && (
                <p
                    className="rounded-xl border-2 border-[#c0392b] bg-[#ffe9e6] px-3 py-2 text-sm font-bold text-[#8e2a1f]"
                    data-testid="classroom-ai-failed"
                >
                    {t('classroom.show.aiFailed')}
                </p>
            )}
            {classroom.ai_summary && (
                <section
                    className="auth-card flex flex-col gap-3 !p-5"
                    data-testid="classroom-ai-summary"
                >
                    <h2 className="flex items-center gap-2 text-lg font-bold">
                        <Brain className="size-5" aria-hidden="true" />
                        {t('classroom.show.aiSummary')}
                    </h2>
                    <p className="text-sm leading-relaxed whitespace-pre-line">
                        {classroom.ai_summary}
                    </p>
                </section>
            )}
            {report?.students
                .filter((s) => s.ai_feedback)
                .map((student) => (
                    <section
                        key={student.member_id}
                        className="auth-card flex flex-col gap-3 !p-5"
                        data-testid={`classroom-ai-feedback-${student.member_id}`}
                    >
                        <h3 className="flex items-center gap-2 text-base font-bold">
                            <Brain className="size-4" aria-hidden="true" />
                            {student.name}
                        </h3>
                        <p className="text-sm leading-relaxed whitespace-pre-line">
                            {student.ai_feedback}
                        </p>
                    </section>
                ))}
            {!done && !classroom.ai_summary && report === null && (
                <EmptyBox
                    icon={Brain}
                    title={t('classroom.show.aiEmpty')}
                    hint={t('classroom.show.aiEmptyHint')}
                />
            )}
        </div>
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
        <div className="auth-card flex min-w-0 flex-col gap-3 !p-5">
            <span
                className="grid size-11 place-items-center rounded-xl border-2 border-[#151b2e]"
                style={{ background: accent }}
            >
                <Icon className="size-5" aria-hidden="true" />
            </span>
            <div className="flex flex-col gap-0.5">
                <p className="truncate text-2xl font-bold tabular-nums md:text-3xl">
                    {value}
                </p>
                <p className="text-sm font-bold">{label}</p>
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
