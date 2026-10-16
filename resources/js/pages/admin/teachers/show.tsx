import { KpiCard, timeAgo, UserAvatar } from '@/components/admin/dashboard-kit';
import {
    EmptyState,
    formatDateTime,
    formatNumber,
    Panel,
    rateTone,
} from '@/components/admin/game-stats';
import {
    rupiah,
    SubjectChips,
    subjectName,
    type SubjectOption,
    type TeacherSubjects,
} from '@/components/admin/teacher-kit';
import AdminLayout from '@/layouts/admin-layout';
import { adminLocale, tr } from '@/lib/admin-i18n';
import { cn } from '@/lib/utils';
import { Head, Link } from '@inertiajs/react';
import {
    Activity,
    ArrowLeft,
    BookOpen,
    Coins,
    History,
    ListChecks,
    School,
    Trophy,
    UserRound,
    UsersRound,
    Wallet,
} from 'lucide-react';
import { type ReactNode } from 'react';

type ClassroomStatus = 'scheduled' | 'active' | 'ended';

interface Bucket {
    label: string;
    answered: number;
    correct: number;
    wrong: number;
    success_rate: number | null;
    players: number;
    compensation: number;
}

interface Props {
    teacher: {
        id: number;
        name: string;
        nickname: string | null;
        email: string;
        avatar_url: string | null;
        school_name: string | null;
        school_city: string | null;
        school_level: string | null;
        is_superadmin: boolean;
        disabled: boolean;
        joined_at: string | null;
        last_seen_at: string | null;
        roles: { id: number; name: string; slug: string }[];
        subjects: TeacherSubjects;
    };
    questions: {
        summary: {
            answered: number;
            correct: number;
            wrong: number;
            success_rate: number | null;
            players: number;
            compensation: number;
            questions: number;
            active_questions: number;
            inactive_questions: number;
            used_questions: number;
        };
        bySource: { source: string; total: number; active: number }[];
        bySubject: {
            subject: string;
            total: number;
            active: number;
            answered: number;
            success_rate: number | null;
            compensation: number;
        }[];
        byLevel: Bucket[];
        byGame: Bucket[];
        top: {
            id: number;
            key: string;
            subject: string;
            prompt_id: string;
            prompt_en: string | null;
            is_active: boolean;
            source: string;
            answered: number;
            success_rate: number | null;
            compensation: number;
        }[];
    };
    classrooms: {
        summary: {
            total: number;
            scheduled: number;
            active: number;
            ended: number;
            memberships: number;
            participants: number;
            plays: number;
        };
        items: {
            id: number;
            name: string;
            pin: string;
            status: ClassroomStatus;
            starts_at: string | null;
            ends_at: string | null;
            members: number;
            max_members: number;
            plays: number;
            games: number;
        }[];
    };
    points: {
        balance: number;
        earned: number;
        spent: number;
        entries: number;
        recent: {
            id: number;
            points: number;
            reason: string;
            created_at: string | null;
        }[];
    };
    requests: {
        id: number;
        subject_key: string | null;
        status: 'pending' | 'approved' | 'rejected';
        message: string | null;
        reviewer: string | null;
        reviewed_at: string | null;
        created_at: string | null;
    }[];
    activity: {
        id: number;
        log_name: string | null;
        description: string;
        event: string | null;
        subject_type: string | null;
        by_self: boolean;
        causer_name: string | null;
        created_at: string | null;
    }[];
    subjects: SubjectOption[];
}

const SOURCE_LABELS: Record<string, string> = {
    teacher: 'Manual (teacher)',
    import: 'Bulk import',
    ai: 'AI generated',
    admin: 'Admin panel',
    system: 'Built-in bank',
};

const SOURCE_COLORS: Record<string, string> = {
    teacher: '#6366f1',
    import: '#0ea5e9',
    ai: '#8b5cf6',
    admin: '#f59e0b',
    system: '#94a3b8',
};

const LEVEL_NAMES: Record<string, string> = {
    tk: 'Kindergarten (TK)',
    sd: 'Elementary (SD)',
    smp: 'Junior high (SMP)',
    sma: 'Senior high (SMA)',
};

const STATUS_STYLES: Record<string, string> = {
    active: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300',
    scheduled: 'bg-sky-100 text-sky-800 dark:bg-sky-900/40 dark:text-sky-300',
    ended: 'bg-muted text-muted-foreground',
    pending:
        'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300',
    approved:
        'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300',
    rejected: 'bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300',
};

const STATUS_LABELS: Record<string, string> = {
    active: 'Active',
    scheduled: 'Scheduled',
    ended: 'Ended',
    pending: 'Pending',
    approved: 'Approved',
    rejected: 'Rejected',
};

function Pill({ status }: { status: string }) {
    return (
        <span
            className={cn(
                'inline-flex rounded-full px-2 py-0.5 text-xs font-medium whitespace-nowrap',
                STATUS_STYLES[status] ?? 'bg-muted text-muted-foreground',
            )}
        >
            {tr(STATUS_LABELS[status] ?? status)}
        </span>
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

function MiniStat({
    label,
    value,
    tone,
}: {
    label: string;
    value: ReactNode;
    tone?: string;
}) {
    return (
        <div className="flex min-w-0 flex-col rounded-xl bg-muted/50 px-3 py-2">
            <span
                className={cn(
                    'text-lg font-bold text-foreground tabular-nums',
                    tone,
                )}
            >
                {value}
            </span>
            <span className="truncate text-xs text-muted-foreground">
                {label}
            </span>
        </div>
    );
}

const percent = (value: number | null) => (value === null ? '—' : `${value}%`);

export default function TeacherShow({
    teacher,
    questions,
    classrooms,
    points,
    requests,
    activity,
    subjects,
}: Props) {
    const locale = adminLocale();
    const prompt = (item: Props['questions']['top'][number]) =>
        locale === 'id-ID' ? item.prompt_id : item.prompt_en || item.prompt_id;
    const sourceTotal = questions.bySource.reduce(
        (sum, row) => sum + row.total,
        0,
    );
    const school = [teacher.school_name, teacher.school_city]
        .filter(Boolean)
        .join(' · ');

    return (
        <>
            <Head title={`${tr('Teacher')} · ${teacher.name}`} />
            <div className="flex flex-col gap-6">
                <Link
                    href="/admin/teachers"
                    className="inline-flex w-fit items-center gap-1.5 text-sm font-medium text-muted-foreground hover:text-foreground"
                >
                    <ArrowLeft className="size-4" aria-hidden="true" />
                    {tr('All teachers')}
                </Link>

                <section
                    className="flex flex-col gap-4 rounded-2xl border border-border bg-card p-5 shadow-sm"
                    data-testid="teacher-profile"
                >
                    <div className="flex flex-wrap items-start justify-between gap-4">
                        <div className="flex min-w-0 items-center gap-3">
                            <UserAvatar
                                name={teacher.name}
                                src={teacher.avatar_url}
                                userId={teacher.id}
                                className="size-14 text-base"
                            />
                            <div className="flex min-w-0 flex-col gap-1">
                                <h2 className="font-display text-2xl font-bold break-words text-foreground">
                                    {teacher.name}
                                </h2>
                                <div className="flex flex-wrap items-center gap-1.5">
                                    {teacher.roles.map((role) => (
                                        <span
                                            key={role.id}
                                            className="rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary"
                                        >
                                            {role.name}
                                        </span>
                                    ))}
                                    {teacher.is_superadmin &&
                                        !teacher.roles.some((role) =>
                                            /super/i.test(role.name),
                                        ) && (
                                            <span className="rounded-full bg-violet-100 px-2 py-0.5 text-xs font-medium text-violet-800 dark:bg-violet-900/40 dark:text-violet-300">
                                                {tr('Super admin')}
                                            </span>
                                        )}
                                    {teacher.disabled && (
                                        <span className="rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">
                                            {tr('Disabled')}
                                        </span>
                                    )}
                                </div>
                            </div>
                        </div>
                        <Link
                            href={`/admin/users/${teacher.id}`}
                            className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-border px-3 text-sm font-medium text-foreground hover:bg-accent"
                        >
                            <UserRound className="size-4" aria-hidden="true" />
                            {tr('User profile')}
                        </Link>
                    </div>
                    <dl className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
                        <Fact label={tr('Email')}>
                            <span className="break-all">{teacher.email}</span>
                        </Fact>
                        <Fact label={tr('School')}>{school || '—'}</Fact>
                        <Fact label={tr('Joined')}>
                            {formatDateTime(teacher.joined_at)}
                        </Fact>
                        <Fact label={tr('Last seen')}>
                            {teacher.last_seen_at
                                ? timeAgo(teacher.last_seen_at)
                                : tr('Never')}
                        </Fact>
                    </dl>
                    <div className="flex flex-col gap-1.5">
                        <span className="text-xs text-muted-foreground">
                            {tr('Subjects')}
                        </span>
                        <SubjectChips
                            subjects={subjects}
                            assigned={teacher.subjects}
                        />
                    </div>
                </section>

                <div className="grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4">
                    <KpiCard
                        label={tr('Manual & import questions')}
                        value={formatNumber(questions.summary.questions)}
                        icon={ListChecks}
                        accent="#f59e0b"
                        footer={
                            <span className="text-xs text-muted-foreground">
                                {tr('{0} active · {1} inactive', [
                                    formatNumber(
                                        questions.summary.active_questions,
                                    ),
                                    formatNumber(
                                        questions.summary.inactive_questions,
                                    ),
                                ])}
                            </span>
                        }
                    />
                    <KpiCard
                        label={tr('Classrooms')}
                        value={formatNumber(classrooms.summary.total)}
                        icon={School}
                        accent="#10b981"
                        footer={
                            <span className="text-xs text-muted-foreground">
                                {tr('{0} active now', [
                                    formatNumber(classrooms.summary.active),
                                ])}
                            </span>
                        }
                    />
                    <KpiCard
                        label={tr('Participants')}
                        value={formatNumber(classrooms.summary.participants)}
                        icon={UsersRound}
                        accent="#0ea5e9"
                        footer={
                            <span className="text-xs text-muted-foreground">
                                {tr('{0} plays', [
                                    formatNumber(classrooms.summary.plays),
                                ])}
                            </span>
                        }
                    />
                    <KpiCard
                        label={tr('Compensation')}
                        value={rupiah(questions.summary.compensation)}
                        icon={Wallet}
                        accent="#8b5cf6"
                        footer={
                            <span
                                className={cn(
                                    'text-xs font-medium',
                                    rateTone(questions.summary.success_rate),
                                )}
                            >
                                {questions.summary.success_rate === null
                                    ? tr('No answers yet')
                                    : tr('{0}% correct', [
                                          questions.summary.success_rate,
                                      ])}
                            </span>
                        }
                    />
                </div>

                <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
                    <Panel
                        title="Question usage"
                        description="Answers to this teacher's questions in games."
                        icon={BookOpen}
                    >
                        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                            <MiniStat
                                label={tr('Answers')}
                                value={formatNumber(questions.summary.answered)}
                            />
                            <MiniStat
                                label={tr('Right / wrong')}
                                value={`${formatNumber(questions.summary.correct)} / ${formatNumber(questions.summary.wrong)}`}
                            />
                            <MiniStat
                                label={tr('Success rate')}
                                value={percent(questions.summary.success_rate)}
                                tone={rateTone(questions.summary.success_rate)}
                            />
                            <MiniStat
                                label={tr('Players reached')}
                                value={formatNumber(questions.summary.players)}
                            />
                            <MiniStat
                                label={tr('Questions used')}
                                value={formatNumber(
                                    questions.summary.used_questions,
                                )}
                            />
                            <MiniStat
                                label={tr('Compensation')}
                                value={rupiah(questions.summary.compensation)}
                            />
                        </div>
                        {questions.byLevel.some(
                            (level) => level.answered > 0,
                        ) && (
                            <ul className="mt-4 flex flex-col divide-y divide-border text-sm">
                                {questions.byLevel
                                    .filter((level) => level.answered > 0)
                                    .map((level) => (
                                        <li
                                            key={level.label}
                                            className="flex items-center justify-between gap-3 py-2"
                                        >
                                            <span className="text-muted-foreground">
                                                {tr(
                                                    LEVEL_NAMES[level.label] ??
                                                        level.label,
                                                )}
                                            </span>
                                            <span className="flex items-center gap-3 tabular-nums">
                                                <span>
                                                    {tr('{0} answers', [
                                                        formatNumber(
                                                            level.answered,
                                                        ),
                                                    ])}
                                                </span>
                                                <span
                                                    className={rateTone(
                                                        level.success_rate,
                                                    )}
                                                >
                                                    {percent(
                                                        level.success_rate,
                                                    )}
                                                </span>
                                            </span>
                                        </li>
                                    ))}
                            </ul>
                        )}
                    </Panel>

                    <Panel
                        title="Questions by source"
                        description="Manual, imported and AI questions this account authored."
                        icon={ListChecks}
                    >
                        {questions.bySource.length === 0 ? (
                            <EmptyState
                                icon={ListChecks}
                                title={tr('No questions yet')}
                            />
                        ) : (
                            <ul className="flex flex-col gap-3">
                                {questions.bySource.map((row) => (
                                    <li
                                        key={row.source}
                                        className="flex flex-col gap-1"
                                    >
                                        <span className="flex items-center justify-between gap-3 text-sm">
                                            <span className="font-medium text-foreground">
                                                {tr(
                                                    SOURCE_LABELS[row.source] ??
                                                        row.source,
                                                )}
                                            </span>
                                            <span className="text-muted-foreground tabular-nums">
                                                {tr('{0} total · {1} active', [
                                                    formatNumber(row.total),
                                                    formatNumber(row.active),
                                                ])}
                                            </span>
                                        </span>
                                        <span className="h-2 overflow-hidden rounded-full bg-muted">
                                            <span
                                                className="block h-full rounded-full"
                                                style={{
                                                    width: `${sourceTotal > 0 ? (row.total / sourceTotal) * 100 : 0}%`,
                                                    background:
                                                        SOURCE_COLORS[
                                                            row.source
                                                        ] ?? 'var(--primary)',
                                                }}
                                            />
                                        </span>
                                    </li>
                                ))}
                            </ul>
                        )}
                        <p className="mt-3 text-xs text-muted-foreground">
                            {tr(
                                'Only manual and imported questions earn compensation.',
                            )}
                        </p>
                    </Panel>
                </div>

                <Panel
                    title="Questions by subject"
                    icon={BookOpen}
                    className="overflow-hidden"
                >
                    {questions.bySubject.length === 0 ? (
                        <EmptyState
                            icon={BookOpen}
                            title={tr('No questions yet')}
                        />
                    ) : (
                        <div className="-m-5 overflow-x-auto">
                            <table className="w-full text-sm">
                                <thead>
                                    <tr className="border-b border-border text-xs tracking-wider text-muted-foreground uppercase">
                                        <th className="px-4 py-2.5 text-left font-medium">
                                            {tr('Subject')}
                                        </th>
                                        <th className="px-3 py-2.5 text-right font-medium">
                                            {tr('Questions')}
                                        </th>
                                        <th className="px-3 py-2.5 text-right font-medium">
                                            {tr('Answers')}
                                        </th>
                                        <th className="px-3 py-2.5 text-right font-medium">
                                            {tr('Success rate')}
                                        </th>
                                        <th className="px-4 py-2.5 text-right font-medium">
                                            {tr('Compensation')}
                                        </th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-border">
                                    {questions.bySubject.map((row) => (
                                        <tr key={row.subject}>
                                            <td className="px-4 py-2.5 font-medium text-foreground">
                                                {subjectName(
                                                    subjects,
                                                    row.subject,
                                                )}
                                            </td>
                                            <td className="px-3 py-2.5 text-right tabular-nums">
                                                {formatNumber(row.total)}
                                                <span className="block text-xs text-muted-foreground">
                                                    {tr('{0} active', [
                                                        formatNumber(
                                                            row.active,
                                                        ),
                                                    ])}
                                                </span>
                                            </td>
                                            <td className="px-3 py-2.5 text-right tabular-nums">
                                                {formatNumber(row.answered)}
                                            </td>
                                            <td
                                                className={cn(
                                                    'px-3 py-2.5 text-right font-semibold tabular-nums',
                                                    rateTone(row.success_rate),
                                                )}
                                            >
                                                {percent(row.success_rate)}
                                            </td>
                                            <td className="px-4 py-2.5 text-right whitespace-nowrap tabular-nums">
                                                {rupiah(row.compensation)}
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}
                </Panel>

                <Panel
                    title="Most used questions"
                    description="Top 5 by answers in games."
                    icon={Trophy}
                >
                    {questions.top.length === 0 ? (
                        <EmptyState
                            icon={Trophy}
                            title={tr('No answers yet')}
                        />
                    ) : (
                        <ol className="flex flex-col divide-y divide-border">
                            {questions.top.map((item, index) => (
                                <li
                                    key={item.id}
                                    className="flex flex-col gap-2 py-3 first:pt-0 last:pb-0 sm:flex-row sm:items-center sm:justify-between"
                                >
                                    <Link
                                        href={`/admin/questions/${item.id}`}
                                        className="flex min-w-0 items-start gap-3 hover:underline"
                                    >
                                        <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-bold text-foreground">
                                            {index + 1}
                                        </span>
                                        <span className="flex min-w-0 flex-col">
                                            <span className="text-sm font-medium break-words text-foreground">
                                                {prompt(item)}
                                            </span>
                                            <span className="text-xs text-muted-foreground">
                                                {subjectName(
                                                    subjects,
                                                    item.subject,
                                                )}{' '}
                                                ·{' '}
                                                {tr(
                                                    SOURCE_LABELS[
                                                        item.source
                                                    ] ?? item.source,
                                                )}
                                                {!item.is_active &&
                                                    ` · ${tr('Inactive')}`}
                                            </span>
                                        </span>
                                    </Link>
                                    <span className="flex shrink-0 items-center gap-3 pl-9 text-xs tabular-nums sm:pl-0">
                                        <span>
                                            {tr('{0} answers', [
                                                formatNumber(item.answered),
                                            ])}
                                        </span>
                                        <span
                                            className={cn(
                                                'font-semibold',
                                                rateTone(item.success_rate),
                                            )}
                                        >
                                            {percent(item.success_rate)}
                                        </span>
                                        <span className="whitespace-nowrap">
                                            {rupiah(item.compensation)}
                                        </span>
                                    </span>
                                </li>
                            ))}
                        </ol>
                    )}
                </Panel>

                <Panel
                    title="Classrooms"
                    description="Classrooms this teacher opened, newest first."
                    icon={School}
                >
                    <div className="mb-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
                        <MiniStat
                            label={tr('Active')}
                            value={formatNumber(classrooms.summary.active)}
                        />
                        <MiniStat
                            label={tr('Scheduled')}
                            value={formatNumber(classrooms.summary.scheduled)}
                        />
                        <MiniStat
                            label={tr('Ended')}
                            value={formatNumber(classrooms.summary.ended)}
                        />
                        <MiniStat
                            label={tr('Memberships')}
                            value={formatNumber(classrooms.summary.memberships)}
                        />
                    </div>
                    {classrooms.items.length === 0 ? (
                        <EmptyState
                            icon={School}
                            title={tr('No classrooms yet')}
                        />
                    ) : (
                        <ul className="flex flex-col divide-y divide-border">
                            {classrooms.items.map((classroom) => (
                                <li key={classroom.id}>
                                    <Link
                                        href={`/admin/classrooms/${classroom.id}`}
                                        className="flex flex-col gap-1.5 rounded-lg py-3 hover:bg-muted/30 sm:flex-row sm:items-center sm:justify-between sm:px-2"
                                    >
                                        <span className="flex min-w-0 flex-col gap-0.5">
                                            <span className="flex flex-wrap items-center gap-2">
                                                <span className="font-medium break-words text-foreground">
                                                    {classroom.name}
                                                </span>
                                                <Pill
                                                    status={classroom.status}
                                                />
                                            </span>
                                            <span className="text-xs text-muted-foreground">
                                                {formatDateTime(
                                                    classroom.starts_at,
                                                )}{' '}
                                                –{' '}
                                                {formatDateTime(
                                                    classroom.ends_at,
                                                )}
                                            </span>
                                        </span>
                                        <span className="flex shrink-0 flex-wrap gap-3 text-xs text-muted-foreground tabular-nums">
                                            <span>
                                                {tr('{0} / {1} members', [
                                                    formatNumber(
                                                        classroom.members,
                                                    ),
                                                    formatNumber(
                                                        classroom.max_members,
                                                    ),
                                                ])}
                                            </span>
                                            <span>
                                                {tr('{0} plays', [
                                                    formatNumber(
                                                        classroom.plays,
                                                    ),
                                                ])}
                                            </span>
                                            <span>
                                                {tr('{0} games', [
                                                    classroom.games,
                                                ])}
                                            </span>
                                        </span>
                                    </Link>
                                </li>
                            ))}
                        </ul>
                    )}
                </Panel>

                <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
                    <Panel title="Account points" icon={Coins}>
                        <div className="grid grid-cols-3 gap-2">
                            <MiniStat
                                label={tr('Balance')}
                                value={formatNumber(points.balance)}
                            />
                            <MiniStat
                                label={tr('Earned')}
                                value={formatNumber(points.earned)}
                                tone="text-emerald-600 dark:text-emerald-400"
                            />
                            <MiniStat
                                label={tr('Spent')}
                                value={formatNumber(points.spent)}
                                tone="text-red-600 dark:text-red-400"
                            />
                        </div>
                        {points.recent.length > 0 && (
                            <ul className="mt-4 flex flex-col divide-y divide-border text-sm">
                                {points.recent.map((entry) => (
                                    <li
                                        key={entry.id}
                                        className="flex items-center justify-between gap-3 py-2"
                                    >
                                        <span className="min-w-0 truncate text-muted-foreground">
                                            {entry.reason}
                                        </span>
                                        <span className="flex shrink-0 items-center gap-3">
                                            <span
                                                className={cn(
                                                    'font-semibold tabular-nums',
                                                    entry.points >= 0
                                                        ? 'text-emerald-600 dark:text-emerald-400'
                                                        : 'text-red-600 dark:text-red-400',
                                                )}
                                            >
                                                {entry.points > 0 ? '+' : ''}
                                                {formatNumber(entry.points)}
                                            </span>
                                            <span className="text-xs text-muted-foreground">
                                                {timeAgo(entry.created_at)}
                                            </span>
                                        </span>
                                    </li>
                                ))}
                            </ul>
                        )}
                    </Panel>

                    <Panel
                        title="Teacher requests"
                        description="Requests this account sent for teacher access."
                        icon={History}
                        actions={
                            <Link
                                href="/admin/teacher-requests"
                                className="text-xs font-medium text-muted-foreground underline underline-offset-4 hover:text-foreground"
                            >
                                {tr('All requests')}
                            </Link>
                        }
                    >
                        {requests.length === 0 ? (
                            <EmptyState
                                icon={History}
                                title={tr('No requests')}
                                description={tr(
                                    'This teacher was given the role directly.',
                                )}
                            />
                        ) : (
                            <ul className="flex flex-col divide-y divide-border text-sm">
                                {requests.map((request) => (
                                    <li
                                        key={request.id}
                                        className="flex flex-col gap-1 py-2.5 first:pt-0 last:pb-0"
                                    >
                                        <span className="flex flex-wrap items-center justify-between gap-2">
                                            <span className="font-medium text-foreground">
                                                {subjectName(
                                                    subjects,
                                                    request.subject_key,
                                                )}
                                            </span>
                                            <Pill status={request.status} />
                                        </span>
                                        {request.message && (
                                            <p className="text-xs break-words text-muted-foreground">
                                                {request.message}
                                            </p>
                                        )}
                                        <span className="text-xs text-muted-foreground">
                                            {tr('Sent {0}', [
                                                formatDateTime(
                                                    request.created_at,
                                                ),
                                            ])}
                                            {request.reviewed_at &&
                                                ` · ${tr('Reviewed by {0}, {1}', [request.reviewer ?? '—', formatDateTime(request.reviewed_at)])}`}
                                        </span>
                                    </li>
                                ))}
                            </ul>
                        )}
                    </Panel>
                </div>

                <Panel title="Recent activity" icon={Activity}>
                    {activity.length === 0 ? (
                        <EmptyState
                            icon={Activity}
                            title={tr('No activity yet')}
                        />
                    ) : (
                        <ul className="flex flex-col divide-y divide-border text-sm">
                            {activity.map((item) => (
                                <li
                                    key={item.id}
                                    className="flex items-center justify-between gap-3 py-2"
                                >
                                    <span className="min-w-0">
                                        <span className="block break-words text-foreground">
                                            {tr(item.description)}
                                        </span>
                                        {!item.by_self && item.causer_name && (
                                            <span className="text-xs text-muted-foreground">
                                                {tr('by {0}', [
                                                    item.causer_name,
                                                ])}
                                            </span>
                                        )}
                                    </span>
                                    <span className="shrink-0 text-xs whitespace-nowrap text-muted-foreground">
                                        {timeAgo(item.created_at)}
                                    </span>
                                </li>
                            ))}
                        </ul>
                    )}
                </Panel>
            </div>
        </>
    );
}

TeacherShow.layout = (page: ReactNode) => (
    <AdminLayout title={tr('Teachers')}>{page}</AdminLayout>
);
