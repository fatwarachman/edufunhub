import { useAdminBreadcrumbs } from '@/components/admin/admin-breadcrumbs';
import {
    ClassroomAiPill,
    ClassroomStatusPill,
    OnlineNowDot,
    type AdminClassroomStatus,
    type ClassroomAiStatus,
} from '@/components/admin/classroom-admin';
import {
    GameDot,
    KpiCard,
    timeAgo,
    UserAvatar,
} from '@/components/admin/dashboard-kit';
import {
    EmptyState,
    formatDateTime,
    formatNumber,
    formatPercent,
    gameLabel,
    Panel,
    rateTone,
    useSubjectLabel,
} from '@/components/admin/game-stats';
import {
    STUDENT_SECTIONS,
    SUMMARY_SECTIONS,
} from '@/components/classroom/ai-points';
import type { AiSections, ClassroomReport } from '@/components/classroom/types';
import { Skeleton } from '@/components/ui/skeleton';
import { useTranslations } from '@/hooks/use-translations';
import AdminLayout from '@/layouts/admin-layout';
import { tr } from '@/lib/admin-i18n';
import { cn } from '@/lib/utils';
import { Deferred, Head, Link, usePoll } from '@inertiajs/react';
import {
    ArrowLeft,
    BarChart3,
    BookOpen,
    BrainCircuit,
    ChevronDown,
    Gamepad2,
    Lightbulb,
    ListChecks,
    Megaphone,
    Target,
    Trophy,
    UsersRound,
} from 'lucide-react';
import { Fragment, useEffect, useId, useState, type ReactNode } from 'react';

interface Member {
    id: number;
    user_id: number;
    name: string;
    account_name: string | null;
    avatar_url: string | null;
    grade: number | null;
    school_name: string | null;
    joined_at: string | null;
    left_at: string | null;
    last_seen_at: string | null;
    online: boolean;
    current_game: string | null;
    plays: number;
    answered: number;
    correct: number;
    wrong: number;
    accuracy: number | null;
    points: number;
    last_played_at: string | null;
    report_shared_at: string | null;
    ai_feedback: AiSections | null;
}

interface Announcement {
    id: number;
    title: string | null;
    body: string;
    display_seconds: number;
    starts_at: string;
    ends_at: string;
    active: boolean;
}

interface Props {
    classroom: {
        id: number;
        name: string;
        description: string | null;
        pin: string;
        status: AdminClassroomStatus;
        starts_at: string | null;
        ends_at: string | null;
        closed_at: string | null;
        created_at: string | null;
        max_members: number;
        ai_status: ClassroomAiStatus;
        ai_summary: AiSections | null;
        report_generated_at: string | null;
        teacher: {
            id: number;
            name: string;
            nickname: string | null;
            email: string;
            avatar_url: string | null;
        } | null;
    };
    games: {
        id: number;
        game_key: string;
        max_plays: number | null;
        subjects: string[];
        questions_count: number;
    }[];
    members: Member[];
    announcements: Announcement[];
    report?: ClassroomReport;
    onlineSeconds: number;
}

const POLL_MS = 15000;

const SECTION_ICONS: Record<string, React.ElementType> = {
    overview: BookOpen,
    strengths: Trophy,
    weaknesses: Target,
    improve: Target,
    misconceptions: Lightbulb,
    actions: ListChecks,
    tips: Lightbulb,
};

/** AI sections as compact bullet lists in admin styling. */
function AiSectionList({
    sections,
    order,
    columns = false,
    testId,
}: {
    sections: AiSections;
    order: readonly string[];
    columns?: boolean;
    testId?: string;
}) {
    const { t } = useTranslations();
    const visible = order.filter((key) => (sections[key]?.length ?? 0) > 0);

    return (
        <div
            className={cn('grid gap-3', columns && 'md:grid-cols-2')}
            data-testid={testId}
        >
            {visible.map((key) => {
                const Icon = SECTION_ICONS[key] ?? BookOpen;
                return (
                    <section
                        key={key}
                        className={cn(
                            'flex min-w-0 flex-col gap-2 rounded-xl border border-border bg-muted/30 p-3',
                            columns &&
                                key === 'overview' &&
                                visible.length > 1 &&
                                'md:col-span-2',
                        )}
                    >
                        <h4 className="flex items-center gap-2 text-sm font-semibold text-foreground">
                            <Icon
                                className="size-4 shrink-0 text-violet-500"
                                aria-hidden="true"
                            />
                            {t(`classroom.ai.section.${key}`)}
                        </h4>
                        <ul className="flex list-disc flex-col gap-1 pl-5 text-sm leading-relaxed text-muted-foreground">
                            {sections[key].map((point, i) => (
                                <li key={i} className="text-pretty break-words">
                                    {point}
                                </li>
                            ))}
                        </ul>
                    </section>
                );
            })}
        </div>
    );
}

function Fact({ label, children }: { label: string; children: ReactNode }) {
    return (
        <div className="flex min-w-0 flex-col gap-0.5">
            <dt className="text-xs text-muted-foreground">{label}</dt>
            <dd className="text-sm font-medium break-words text-foreground">
                {children}
            </dd>
        </div>
    );
}

function ReportSkeleton() {
    return (
        <div
            role="status"
            aria-label={tr('Loading classroom analysis')}
            className="flex flex-col gap-4"
            data-testid="classroom-report-skeleton"
        >
            <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
                {[0, 1, 2, 3].map((i) => (
                    <Skeleton
                        key={i}
                        className="h-28 rounded-2xl motion-safe:animate-pulse"
                    />
                ))}
            </div>
            <div className="grid gap-4 lg:grid-cols-2">
                <Skeleton className="h-56 rounded-2xl motion-safe:animate-pulse" />
                <Skeleton className="h-56 rounded-2xl motion-safe:animate-pulse" />
            </div>
            <span className="sr-only">{tr('Loading classroom analysis')}</span>
        </div>
    );
}

function AccuracyCell({ value }: { value: number | null }) {
    return (
        <span className={cn('font-semibold tabular-nums', rateTone(value))}>
            {formatPercent(value)}
        </span>
    );
}

function ReportSection({ report }: { report: ClassroomReport }) {
    const { t, i18n } = useTranslations();
    const subjectLabel = useSubjectLabel();
    const english = i18n.language?.startsWith('en');
    const pick = (id: unknown, en: unknown) =>
        String((english && en) || id || '');
    const insightText = (insight: ClassroomReport['insights'][number]) => {
        const p = insight.params;
        return t(`classroom.insights.${insight.key}`, {
            ...p,
            subject: subjectLabel(String(p.subject ?? '')),
            topic: pick(p.topic, p.topic_en),
            prompt: pick(p.prompt, p.prompt_en),
            accuracy: formatPercent(
                typeof p.accuracy === 'number' ? p.accuracy : null,
            ),
            interpolation: { escapeValue: false },
        });
    };
    const { summary } = report;
    const topics = [...report.topics]
        .sort((a, b) => (a.accuracy ?? 101) - (b.accuracy ?? 101))
        .slice(0, 10);
    const questions = report.questions.slice(0, 10);

    return (
        <div className="flex flex-col gap-4" data-testid="classroom-report">
            <div className="grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4">
                <KpiCard
                    label={tr('Played members')}
                    value={`${formatNumber(summary.played_members)} / ${formatNumber(summary.members)}`}
                    icon={UsersRound}
                    accent="#6366f1"
                />
                <KpiCard
                    label={tr('Plays')}
                    value={formatNumber(summary.plays)}
                    icon={Gamepad2}
                    accent="#10b981"
                />
                <KpiCard
                    label={tr('Questions answered')}
                    value={formatNumber(summary.answered)}
                    icon={ListChecks}
                    accent="#f59e0b"
                    footer={
                        <span
                            className={cn(
                                'text-xs font-medium',
                                rateTone(summary.accuracy),
                            )}
                        >
                            {summary.accuracy === null
                                ? tr('No answers yet')
                                : tr('{0}% correct', [summary.accuracy])}
                        </span>
                    }
                />
                <KpiCard
                    label={tr('Points')}
                    value={formatNumber(summary.points)}
                    icon={Trophy}
                    accent="#8b5cf6"
                />
            </div>

            {report.insights.length > 0 && (
                <Panel title="Insights" icon={Lightbulb}>
                    <ul
                        className="flex flex-col gap-2"
                        data-testid="classroom-report-insights"
                    >
                        {report.insights.map((insight, i) => (
                            <li
                                key={i}
                                className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900 dark:border-amber-900/50 dark:bg-amber-950/30 dark:text-amber-200"
                            >
                                {insightText(insight)}
                            </li>
                        ))}
                    </ul>
                </Panel>
            )}

            <div className="grid gap-4 lg:grid-cols-2">
                <Panel title="Per game" icon={Gamepad2}>
                    {report.games.length === 0 ? (
                        <EmptyState icon={Gamepad2} title="No plays yet" />
                    ) : (
                        <table className="w-full text-sm">
                            <thead>
                                <tr className="text-left text-xs text-muted-foreground uppercase">
                                    <th
                                        scope="col"
                                        className="pb-2 font-medium"
                                    >
                                        {tr('Game')}
                                    </th>
                                    <th
                                        scope="col"
                                        className="pb-2 text-right font-medium"
                                    >
                                        {tr('Plays')}
                                    </th>
                                    <th
                                        scope="col"
                                        className="pb-2 text-right font-medium"
                                    >
                                        {tr('Players')}
                                    </th>
                                    <th
                                        scope="col"
                                        className="pb-2 text-right font-medium"
                                    >
                                        {tr('Accuracy')}
                                    </th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-border">
                                {report.games.map((game) => (
                                    <tr key={game.game_key}>
                                        <td className="py-2">
                                            <GameDot game={game.game_key} />
                                        </td>
                                        <td className="py-2 text-right tabular-nums">
                                            {formatNumber(game.plays)}
                                        </td>
                                        <td className="py-2 text-right tabular-nums">
                                            {formatNumber(game.players)}
                                        </td>
                                        <td className="py-2 text-right">
                                            <AccuracyCell
                                                value={game.accuracy}
                                            />
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    )}
                </Panel>

                <Panel title="Per subject" icon={BookOpen}>
                    {report.subjects.length === 0 ? (
                        <EmptyState icon={BookOpen} title="No answers yet" />
                    ) : (
                        <ul className="flex flex-col gap-3">
                            {report.subjects.map((subject) => (
                                <li
                                    key={subject.key}
                                    className="flex flex-col gap-1"
                                >
                                    <span className="flex items-center justify-between gap-2 text-sm">
                                        <span className="truncate text-foreground">
                                            {subjectLabel(subject.key)}
                                        </span>
                                        <span className="text-xs text-muted-foreground tabular-nums">
                                            {formatNumber(subject.correct)} /{' '}
                                            {formatNumber(subject.answered)} ·{' '}
                                            <AccuracyCell
                                                value={subject.accuracy}
                                            />
                                        </span>
                                    </span>
                                    <span
                                        className="h-1.5 overflow-hidden rounded-full bg-muted"
                                        aria-hidden="true"
                                    >
                                        <span
                                            className="block h-full rounded-full bg-primary"
                                            style={{
                                                width: `${subject.accuracy ?? 0}%`,
                                            }}
                                        />
                                    </span>
                                </li>
                            ))}
                        </ul>
                    )}
                </Panel>
            </div>

            {(topics.length > 0 || questions.length > 0) && (
                <div className="grid gap-4 lg:grid-cols-2">
                    {topics.length > 0 && (
                        <Panel
                            title="Topics"
                            description="Weakest topics first."
                            icon={Target}
                        >
                            <ul className="flex flex-col divide-y divide-border text-sm">
                                {topics.map((topic) => (
                                    <li
                                        key={topic.id}
                                        className="flex items-center justify-between gap-3 py-2"
                                    >
                                        <span className="flex min-w-0 flex-col">
                                            <span className="break-words text-foreground">
                                                {pick(
                                                    topic.name_id,
                                                    topic.name_en,
                                                )}
                                            </span>
                                            <span className="text-xs text-muted-foreground">
                                                {subjectLabel(
                                                    topic.subject_key,
                                                )}{' '}
                                                ·{' '}
                                                {tr('{0} answers', [
                                                    formatNumber(
                                                        topic.answered,
                                                    ),
                                                ])}
                                            </span>
                                        </span>
                                        <AccuracyCell value={topic.accuracy} />
                                    </li>
                                ))}
                            </ul>
                        </Panel>
                    )}
                    {questions.length > 0 && (
                        <Panel
                            title="Hardest questions"
                            description="Questions answered at least 3 times, lowest accuracy first."
                            icon={ListChecks}
                        >
                            <ul className="flex flex-col divide-y divide-border text-sm">
                                {questions.map((question) => (
                                    <li
                                        key={question.id}
                                        className="flex items-start justify-between gap-3 py-2"
                                    >
                                        <span className="flex min-w-0 flex-col">
                                            <Link
                                                href={`/admin/questions/${question.id}`}
                                                className="break-words text-foreground hover:underline"
                                            >
                                                {pick(
                                                    question.prompt_id,
                                                    question.prompt_en,
                                                )}
                                            </Link>
                                            <span className="text-xs text-muted-foreground">
                                                {subjectLabel(question.subject)}{' '}
                                                ·{' '}
                                                {tr('{0} answers', [
                                                    formatNumber(
                                                        question.answered,
                                                    ),
                                                ])}
                                                {question.top_wrong &&
                                                    ` · ${tr('Common wrong answer: {0}', [question.top_wrong.text])}`}
                                            </span>
                                        </span>
                                        <AccuracyCell
                                            value={question.accuracy}
                                        />
                                    </li>
                                ))}
                            </ul>
                        </Panel>
                    )}
                </div>
            )}
        </div>
    );
}

function MemberFeedback({ member }: { member: Member }) {
    return (
        <div className="flex flex-col gap-2">
            <span className="flex items-center gap-1.5 text-xs font-semibold text-foreground">
                <BrainCircuit
                    className="size-3.5 text-violet-500"
                    aria-hidden="true"
                />
                {tr('AI feedback for {0}', [member.name])}
            </span>
            {member.ai_feedback ? (
                <AiSectionList
                    sections={member.ai_feedback}
                    order={STUDENT_SECTIONS}
                    columns
                    testId={`classroom-member-feedback-${member.id}`}
                />
            ) : (
                <p className="text-xs text-muted-foreground">
                    {tr('No AI feedback for this student yet.')}
                </p>
            )}
        </div>
    );
}

function MemberName({ member }: { member: Member }) {
    return (
        <span className="flex min-w-0 items-center gap-2.5">
            <UserAvatar name={member.name} src={member.avatar_url} />
            <span className="flex min-w-0 flex-col">
                <Link
                    href={`/admin/users/${member.user_id}`}
                    className="font-medium break-words text-foreground hover:underline"
                >
                    {member.name}
                </Link>
                <span className="text-xs break-words text-muted-foreground">
                    {[
                        member.grade === null
                            ? null
                            : member.grade === 0
                              ? tr('Kindergarten')
                              : tr('Grade {0}', [member.grade]),
                        member.school_name,
                    ]
                        .filter(Boolean)
                        .join(' · ') || member.account_name}
                </span>
            </span>
        </span>
    );
}

function Flags({ member }: { member: Member }) {
    return (
        <span className="flex flex-wrap gap-1">
            {member.report_shared_at ? (
                <span
                    className="rounded-full bg-emerald-100 px-2 py-0.5 text-[11px] font-medium text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300"
                    data-testid="classroom-member-shared"
                >
                    {tr('Report shared')}
                </span>
            ) : (
                <span className="rounded-full bg-muted px-2 py-0.5 text-[11px] text-muted-foreground">
                    {tr('Not shared')}
                </span>
            )}
            {member.ai_feedback && (
                <span className="rounded-full bg-violet-100 px-2 py-0.5 text-[11px] font-medium text-violet-800 dark:bg-violet-900/40 dark:text-violet-300">
                    {tr('AI feedback')}
                </span>
            )}
        </span>
    );
}

function MembersPanel({
    members,
    status,
}: {
    members: Member[];
    status: AdminClassroomStatus;
}) {
    const [open, setOpen] = useState<Set<number>>(new Set());
    const baseId = useId();
    const online = members.filter((member) => member.online).length;
    const toggle = (id: number) =>
        setOpen((current) => {
            const next = new Set(current);
            if (next.has(id)) {
                next.delete(id);
            } else {
                next.add(id);
            }
            return next;
        });

    return (
        <Panel
            title="Members"
            description={
                status === 'active'
                    ? tr('{0} members · {1} online now', [
                          members.filter((member) => !member.left_at).length,
                          online,
                      ])
                    : tr('{0} members', [
                          members.filter((member) => !member.left_at).length,
                      ])
            }
            icon={UsersRound}
        >
            {members.length === 0 ? (
                <EmptyState icon={UsersRound} title="No members yet" />
            ) : (
                <>
                    <div
                        className="-mx-5 -my-5 hidden overflow-x-auto lg:block"
                        data-testid="classroom-members-table"
                    >
                        <table className="w-full text-sm">
                            <caption className="sr-only">
                                {tr('Members')}
                            </caption>
                            <thead>
                                <tr className="border-b border-border text-left text-xs tracking-wider text-muted-foreground uppercase">
                                    <th
                                        scope="col"
                                        className="py-2.5 pr-3 pl-5 font-medium"
                                    >
                                        {tr('Student')}
                                    </th>
                                    <th
                                        scope="col"
                                        className="px-3 py-2.5 font-medium"
                                    >
                                        {tr('Presence')}
                                    </th>
                                    <th
                                        scope="col"
                                        className="px-3 py-2.5 font-medium"
                                    >
                                        {tr('Joined')}
                                    </th>
                                    <th
                                        scope="col"
                                        className="px-3 py-2.5 text-right font-medium"
                                    >
                                        {tr('Plays')}
                                    </th>
                                    <th
                                        scope="col"
                                        className="px-3 py-2.5 text-right font-medium"
                                    >
                                        {tr('Accuracy')}
                                    </th>
                                    <th
                                        scope="col"
                                        className="px-3 py-2.5 text-right font-medium"
                                    >
                                        {tr('Points')}
                                    </th>
                                    <th
                                        scope="col"
                                        className="py-2.5 pr-5 pl-3 font-medium"
                                    >
                                        {tr('Report')}
                                    </th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-border">
                                {members.map((member) => {
                                    const expanded = open.has(member.id);
                                    const panelId = `${baseId}-member-${member.id}`;
                                    return (
                                        <Fragment key={member.id}>
                                            <tr
                                                className={cn(
                                                    'hover:bg-muted/30',
                                                    member.left_at &&
                                                        'opacity-60',
                                                )}
                                                data-testid="classroom-member-row"
                                            >
                                                <td className="py-2.5 pr-3 pl-5 align-middle">
                                                    <MemberName
                                                        member={member}
                                                    />
                                                </td>
                                                <td className="px-3 py-2.5 align-middle">
                                                    <span className="flex flex-col gap-0.5">
                                                        <OnlineNowDot
                                                            online={
                                                                member.online
                                                            }
                                                        />
                                                        {member.current_game ? (
                                                            <span className="text-xs text-muted-foreground">
                                                                {tr(
                                                                    'Playing {0}',
                                                                    [
                                                                        gameLabel(
                                                                            member.current_game,
                                                                        ),
                                                                    ],
                                                                )}
                                                            </span>
                                                        ) : (
                                                            member.last_seen_at && (
                                                                <span className="text-xs text-muted-foreground">
                                                                    {tr(
                                                                        'Seen {0}',
                                                                        [
                                                                            timeAgo(
                                                                                member.last_seen_at,
                                                                            ),
                                                                        ],
                                                                    )}
                                                                </span>
                                                            )
                                                        )}
                                                    </span>
                                                </td>
                                                <td className="px-3 py-2.5 align-middle text-xs whitespace-nowrap text-muted-foreground">
                                                    <span className="block">
                                                        {formatDateTime(
                                                            member.joined_at,
                                                        )}
                                                    </span>
                                                    {member.left_at && (
                                                        <span className="block text-red-600 dark:text-red-400">
                                                            {tr('Left {0}', [
                                                                formatDateTime(
                                                                    member.left_at,
                                                                ),
                                                            ])}
                                                        </span>
                                                    )}
                                                </td>
                                                <td className="px-3 py-2.5 text-right align-middle tabular-nums">
                                                    {formatNumber(member.plays)}
                                                </td>
                                                <td className="px-3 py-2.5 text-right align-middle">
                                                    <AccuracyCell
                                                        value={member.accuracy}
                                                    />
                                                    <span className="block text-xs text-muted-foreground tabular-nums">
                                                        {formatNumber(
                                                            member.correct,
                                                        )}{' '}
                                                        /{' '}
                                                        {formatNumber(
                                                            member.answered,
                                                        )}
                                                    </span>
                                                </td>
                                                <td className="px-3 py-2.5 text-right align-middle font-semibold tabular-nums">
                                                    {formatNumber(
                                                        member.points,
                                                    )}
                                                </td>
                                                <td className="py-2.5 pr-5 pl-3 align-middle">
                                                    <span className="flex items-center justify-between gap-2">
                                                        <Flags
                                                            member={member}
                                                        />
                                                        {member.ai_feedback && (
                                                            <button
                                                                type="button"
                                                                onClick={() =>
                                                                    toggle(
                                                                        member.id,
                                                                    )
                                                                }
                                                                aria-expanded={
                                                                    expanded
                                                                }
                                                                aria-controls={
                                                                    panelId
                                                                }
                                                                aria-label={tr(
                                                                    'AI feedback for {0}',
                                                                    [
                                                                        member.name,
                                                                    ],
                                                                )}
                                                                className="rounded-lg p-1 text-muted-foreground hover:bg-accent hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                                                                data-testid="classroom-member-feedback-toggle"
                                                            >
                                                                <ChevronDown
                                                                    className={cn(
                                                                        'size-4 transition-transform motion-reduce:transition-none',
                                                                        expanded &&
                                                                            'rotate-180',
                                                                    )}
                                                                    aria-hidden="true"
                                                                />
                                                            </button>
                                                        )}
                                                    </span>
                                                </td>
                                            </tr>
                                            {expanded && (
                                                <tr id={panelId}>
                                                    <td
                                                        colSpan={7}
                                                        className="bg-muted/20 px-5 py-3"
                                                    >
                                                        <MemberFeedback
                                                            member={member}
                                                        />
                                                    </td>
                                                </tr>
                                            )}
                                        </Fragment>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>

                    <ul
                        className="flex flex-col gap-2 lg:hidden"
                        data-testid="classroom-members-cards"
                    >
                        {members.map((member) => {
                            const expanded = open.has(member.id);
                            const panelId = `${baseId}-card-${member.id}`;
                            return (
                                <li
                                    key={member.id}
                                    className={cn(
                                        'min-w-0 overflow-hidden rounded-xl border border-border',
                                        member.left_at && 'opacity-60',
                                    )}
                                >
                                    <button
                                        type="button"
                                        onClick={() => toggle(member.id)}
                                        aria-expanded={expanded}
                                        aria-controls={panelId}
                                        className="flex w-full min-w-0 items-start gap-2 p-3 text-left hover:bg-muted/40 focus-visible:bg-muted/40 focus-visible:outline-none"
                                    >
                                        <span className="flex min-w-0 flex-1 flex-col gap-1.5">
                                            <span className="font-medium break-words text-foreground">
                                                {member.name}
                                            </span>
                                            <span className="flex flex-wrap items-center gap-2">
                                                <OnlineNowDot
                                                    online={member.online}
                                                />
                                                {member.current_game && (
                                                    <span className="text-xs text-muted-foreground">
                                                        {tr('Playing {0}', [
                                                            gameLabel(
                                                                member.current_game,
                                                            ),
                                                        ])}
                                                    </span>
                                                )}
                                            </span>
                                            <span className="text-xs text-muted-foreground tabular-nums">
                                                {tr(
                                                    '{0} plays · {1} accuracy · {2} points',
                                                    [
                                                        formatNumber(
                                                            member.plays,
                                                        ),
                                                        formatPercent(
                                                            member.accuracy,
                                                        ),
                                                        formatNumber(
                                                            member.points,
                                                        ),
                                                    ],
                                                )}
                                            </span>
                                        </span>
                                        <ChevronDown
                                            className={cn(
                                                'mt-1 size-4 shrink-0 text-muted-foreground transition-transform duration-300 motion-reduce:transition-none',
                                                expanded && 'rotate-180',
                                            )}
                                            aria-hidden="true"
                                        />
                                    </button>
                                    <div
                                        id={panelId}
                                        className={cn(
                                            'grid transition-[grid-template-rows,opacity] duration-300 ease-out motion-reduce:transition-none',
                                            expanded
                                                ? 'grid-rows-[1fr] opacity-100'
                                                : 'grid-rows-[0fr] opacity-0',
                                        )}
                                        aria-hidden={!expanded}
                                        inert={!expanded}
                                    >
                                        <div className="min-h-0 overflow-hidden">
                                            <div className="flex flex-col gap-3 border-t border-dashed border-border bg-muted/20 p-3">
                                                <dl className="grid grid-cols-2 gap-2">
                                                    <Fact label={tr('Joined')}>
                                                        {formatDateTime(
                                                            member.joined_at,
                                                        )}
                                                    </Fact>
                                                    <Fact label={tr('Left')}>
                                                        {formatDateTime(
                                                            member.left_at,
                                                        )}
                                                    </Fact>
                                                    <Fact
                                                        label={tr(
                                                            'Right / wrong',
                                                        )}
                                                    >
                                                        {formatNumber(
                                                            member.correct,
                                                        )}{' '}
                                                        /{' '}
                                                        {formatNumber(
                                                            member.wrong,
                                                        )}
                                                    </Fact>
                                                    <Fact
                                                        label={tr(
                                                            'Last played',
                                                        )}
                                                    >
                                                        {member.last_played_at
                                                            ? timeAgo(
                                                                  member.last_played_at,
                                                              )
                                                            : tr(
                                                                  'Never played',
                                                              )}
                                                    </Fact>
                                                </dl>
                                                <Flags member={member} />
                                                <MemberFeedback
                                                    member={member}
                                                />
                                                <Link
                                                    href={`/admin/users/${member.user_id}`}
                                                    className="w-fit text-xs font-medium text-foreground underline decoration-border underline-offset-4 hover:decoration-foreground"
                                                >
                                                    {tr('Open profile of')}{' '}
                                                    {member.name}
                                                </Link>
                                            </div>
                                        </div>
                                    </div>
                                </li>
                            );
                        })}
                    </ul>
                </>
            )}
        </Panel>
    );
}

export default function ClassroomShow({
    classroom,
    games,
    members,
    announcements,
    report,
}: Props) {
    const subjectLabel = useSubjectLabel();
    const active = classroom.status === 'active';
    const { start, stop } = usePoll(
        POLL_MS,
        { only: ['members'] },
        { autoStart: false, keepAlive: false },
    );

    useEffect(() => {
        if (active) {
            start();
        } else {
            stop();
        }
        return () => stop();
    }, [active, start, stop]);

    useAdminBreadcrumbs([
        { title: tr('Classrooms'), href: '/admin/classrooms' },
        { title: classroom.name },
    ]);

    const teacherName =
        classroom.teacher?.nickname || classroom.teacher?.name || '—';

    return (
        <>
            <Head title={classroom.name} />
            <div className="flex flex-col gap-6">
                <Link
                    href="/admin/classrooms"
                    className="inline-flex w-fit items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
                >
                    <ArrowLeft className="size-4" />
                    {tr('All classrooms')}
                </Link>

                <section
                    className="flex flex-col gap-5 rounded-2xl border border-border bg-card p-5 shadow-sm"
                    data-testid="classroom-header"
                >
                    <div className="flex flex-wrap items-start justify-between gap-3">
                        <div className="flex min-w-0 flex-col gap-2">
                            <h2 className="font-display text-2xl font-bold break-words text-foreground">
                                {classroom.name}
                            </h2>
                            <div className="flex flex-wrap items-center gap-2">
                                <ClassroomStatusPill
                                    status={classroom.status}
                                />
                                <ClassroomAiPill status={classroom.ai_status} />
                                <span
                                    className="rounded-lg bg-muted px-2 py-0.5 font-mono text-sm font-semibold tracking-widest text-foreground"
                                    data-testid="classroom-pin"
                                >
                                    {tr('PIN')} {classroom.pin}
                                </span>
                            </div>
                        </div>
                        {classroom.teacher && (
                            <div className="flex min-w-0 items-center gap-3 rounded-xl border border-border p-3">
                                <UserAvatar
                                    name={teacherName}
                                    src={classroom.teacher.avatar_url}
                                    userId={classroom.teacher.id}
                                />
                                <div className="flex min-w-0 flex-col">
                                    <span className="text-xs text-muted-foreground">
                                        {tr('Teacher')}
                                    </span>
                                    <span className="truncate font-medium text-foreground">
                                        {teacherName}
                                    </span>
                                    <span className="flex flex-wrap gap-x-3 text-xs">
                                        <Link
                                            href={`/admin/teachers/${classroom.teacher.id}`}
                                            className="font-medium text-primary hover:underline"
                                            data-testid="classroom-teacher-link"
                                        >
                                            {tr('Teacher profile')}
                                        </Link>
                                        <Link
                                            href={`/admin/users/${classroom.teacher.id}`}
                                            className="font-medium text-primary hover:underline"
                                        >
                                            {tr('User account')}
                                        </Link>
                                    </span>
                                </div>
                            </div>
                        )}
                    </div>

                    <dl className="grid grid-cols-2 gap-4 sm:grid-cols-3 xl:grid-cols-6">
                        <Fact label={tr('Starts')}>
                            {formatDateTime(classroom.starts_at)}
                        </Fact>
                        <Fact label={tr('Ends')}>
                            {formatDateTime(classroom.ends_at)}
                        </Fact>
                        <Fact label={tr('Closed at')}>
                            {formatDateTime(classroom.closed_at)}
                        </Fact>
                        <Fact label={tr('Max members')}>
                            {formatNumber(classroom.max_members)}
                        </Fact>
                        <Fact label={tr('Created')}>
                            {formatDateTime(classroom.created_at)}
                        </Fact>
                        <Fact label={tr('Report saved')}>
                            {formatDateTime(classroom.report_generated_at)}
                        </Fact>
                    </dl>

                    {classroom.description && (
                        <p className="text-sm whitespace-pre-line text-muted-foreground">
                            {classroom.description}
                        </p>
                    )}
                </section>

                <div className="grid gap-4 lg:grid-cols-2">
                    <Panel
                        title="Games"
                        description={tr('{0} games picked by the teacher', [
                            games.length,
                        ])}
                        icon={Gamepad2}
                    >
                        {games.length === 0 ? (
                            <EmptyState icon={Gamepad2} title="No games" />
                        ) : (
                            <ul
                                className="flex flex-col divide-y divide-border"
                                data-testid="classroom-games"
                            >
                                {games.map((game) => (
                                    <li
                                        key={game.id}
                                        className="flex flex-col gap-1.5 py-2.5 first:pt-0 last:pb-0"
                                    >
                                        <span className="flex items-center justify-between gap-2 text-sm font-medium">
                                            <GameDot game={game.game_key} />
                                            <span className="text-xs font-normal text-muted-foreground">
                                                {game.max_plays === null
                                                    ? tr('Unlimited plays')
                                                    : tr(
                                                          'Max {0} plays per student',
                                                          [game.max_plays],
                                                      )}
                                            </span>
                                        </span>
                                        <span className="flex flex-wrap items-center gap-1">
                                            {game.subjects.length === 0 ? (
                                                <span className="rounded-full bg-muted px-2 py-0.5 text-[11px] text-muted-foreground">
                                                    {tr('All subjects')}
                                                </span>
                                            ) : (
                                                game.subjects.map((subject) => (
                                                    <span
                                                        key={subject}
                                                        className="rounded-full bg-primary/10 px-2 py-0.5 text-[11px] font-medium text-primary"
                                                    >
                                                        {subjectLabel(subject)}
                                                    </span>
                                                ))
                                            )}
                                            <span className="text-[11px] text-muted-foreground">
                                                {game.questions_count > 0
                                                    ? tr(
                                                          '{0} picked questions',
                                                          [
                                                              game.questions_count,
                                                          ],
                                                      )
                                                    : tr('Question bank')}
                                            </span>
                                        </span>
                                    </li>
                                ))}
                            </ul>
                        )}
                    </Panel>

                    <Panel title="Announcements" icon={Megaphone}>
                        {announcements.length === 0 ? (
                            <EmptyState
                                icon={Megaphone}
                                title="No announcements"
                            />
                        ) : (
                            <ul
                                className="flex flex-col gap-2"
                                data-testid="classroom-announcements"
                            >
                                {announcements.map((announcement) => (
                                    <li
                                        key={announcement.id}
                                        className="flex flex-col gap-1 rounded-xl border border-border p-3"
                                    >
                                        <span className="flex items-center justify-between gap-2">
                                            <span className="text-sm font-medium break-words text-foreground">
                                                {announcement.title ||
                                                    tr('Announcement')}
                                            </span>
                                            {announcement.active && (
                                                <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[11px] font-medium text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300">
                                                    {tr('Showing now')}
                                                </span>
                                            )}
                                        </span>
                                        <p className="text-sm break-words whitespace-pre-line text-muted-foreground">
                                            {announcement.body}
                                        </p>
                                        <span className="text-xs text-muted-foreground">
                                            {formatDateTime(
                                                announcement.starts_at,
                                            )}{' '}
                                            ·{' '}
                                            {tr('{0}s on screen', [
                                                announcement.display_seconds,
                                            ])}
                                        </span>
                                    </li>
                                ))}
                            </ul>
                        )}
                    </Panel>
                </div>

                <MembersPanel members={members} status={classroom.status} />

                <Panel
                    title="AI class analysis"
                    icon={BrainCircuit}
                    actions={<ClassroomAiPill status={classroom.ai_status} />}
                >
                    {classroom.ai_summary ? (
                        <AiSectionList
                            sections={classroom.ai_summary}
                            order={SUMMARY_SECTIONS}
                            columns
                            testId="classroom-ai-summary"
                        />
                    ) : (
                        <p className="text-sm text-muted-foreground">
                            {classroom.ai_status === 'queued' ||
                            classroom.ai_status === 'running'
                                ? tr('The analysis is running now.')
                                : tr(
                                      'The teacher has not run an AI analysis for this classroom yet.',
                                  )}
                        </p>
                    )}
                </Panel>

                <section className="flex flex-col gap-3">
                    <h3 className="flex items-center gap-2 font-display text-lg font-bold text-foreground">
                        <BarChart3
                            className="size-5 text-muted-foreground"
                            aria-hidden="true"
                        />
                        {tr('Classroom analysis')}
                    </h3>
                    <Deferred data="report" fallback={<ReportSkeleton />}>
                        {report ? (
                            <ReportSection report={report} />
                        ) : (
                            <ReportSkeleton />
                        )}
                    </Deferred>
                </section>
            </div>
        </>
    );
}

ClassroomShow.layout = (page: ReactNode) => (
    <AdminLayout title={tr('Classrooms')}>{page}</AdminLayout>
);
