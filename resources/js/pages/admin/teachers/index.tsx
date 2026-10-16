import { SimplePagination, type Paginated } from '@/components/admin/admin-kit';
import { KpiCard, timeAgo, UserAvatar } from '@/components/admin/dashboard-kit';
import {
    EmptyState,
    fieldClass,
    formatNumber,
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
import { tr } from '@/lib/admin-i18n';
import { cn } from '@/lib/utils';
import { Head, Link, router } from '@inertiajs/react';
import {
    ArrowDown,
    ArrowUp,
    ChevronDown,
    ChevronsUpDown,
    ClipboardList,
    GraduationCap,
    Inbox,
    ListChecks,
    RotateCcw,
    School,
    Search,
    UsersRound,
    Wallet,
} from 'lucide-react';
import { useEffect, useId, useRef, useState, type ReactNode } from 'react';

type Sort =
    | 'questions'
    | 'classrooms'
    | 'participants'
    | 'compensation'
    | 'points'
    | 'name'
    | 'joined';

interface TeacherRow {
    id: number;
    name: string;
    nickname: string | null;
    email: string;
    avatar_url: string | null;
    school_name: string | null;
    school_city: string | null;
    disabled: boolean;
    joined_at: string | null;
    last_seen_at: string | null;
    subjects: TeacherSubjects;
    questions: {
        total: number;
        active: number;
        manual: number;
        imported: number;
        ai: number;
    };
    classrooms: {
        total: number;
        active: number;
        scheduled: number;
        ended: number;
    };
    participants: number;
    classroom_plays: number;
    answers: number;
    success_rate: number | null;
    account_points: number;
    compensation: number;
    pending_requests: number;
}

interface Filters {
    search: string | null;
    subject: string | null;
    sort: Sort;
    direction: 'asc' | 'desc';
}

interface Props {
    filters: Filters;
    summary: {
        teachers: number;
        active_teachers: number;
        questions: number;
        active_questions: number;
        classrooms: number;
        active_classrooms: number;
        participants: number;
        compensation: number;
        pending_requests: number;
    };
    subjects: SubjectOption[];
    teachers: Paginated<TeacherRow>;
}

const SORTS: { value: Sort; label: string }[] = [
    { value: 'questions', label: 'Questions' },
    { value: 'classrooms', label: 'Classrooms' },
    { value: 'participants', label: 'Participants' },
    { value: 'compensation', label: 'Compensation' },
    { value: 'points', label: 'Account points' },
    { value: 'name', label: 'Name' },
    { value: 'joined', label: 'Joined' },
];

function TeacherName({ teacher }: { teacher: TeacherRow }) {
    const meta = [teacher.school_name, teacher.school_city]
        .filter(Boolean)
        .join(' · ');

    return (
        <span className="flex min-w-0 items-center gap-2.5">
            <UserAvatar
                name={teacher.name}
                src={teacher.avatar_url}
                userId={teacher.id}
            />
            <span className="flex min-w-0 flex-col">
                <span className="flex min-w-0 items-center gap-1.5">
                    <span className="font-medium break-words text-foreground">
                        {teacher.name}
                    </span>
                    {teacher.disabled && (
                        <span className="rounded-full bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
                            {tr('Disabled')}
                        </span>
                    )}
                </span>
                <span className="text-xs break-all text-muted-foreground">
                    {meta || teacher.email}
                </span>
            </span>
        </span>
    );
}

export default function TeachersIndex({
    filters,
    summary,
    subjects,
    teachers,
}: Props) {
    const [search, setSearch] = useState(filters.search ?? '');
    const [open, setOpen] = useState<Set<number>>(new Set());
    const firstRender = useRef(true);
    const baseId = useId();

    const defaultDirection = (sort: Sort) => (sort === 'name' ? 'asc' : 'desc');

    const apply = (changes: Partial<Filters>) => {
        const next = { ...filters, ...changes };
        router.get(
            '/admin/teachers',
            Object.fromEntries(
                Object.entries(next).filter(
                    ([key, value]) =>
                        value !== null &&
                        value !== '' &&
                        !(key === 'sort' && value === 'questions') &&
                        !(
                            key === 'direction' &&
                            value === defaultDirection(next.sort)
                        ),
                ),
            ),
            { preserveScroll: true, preserveState: true },
        );
    };

    useEffect(() => {
        if (firstRender.current) {
            firstRender.current = false;
            return;
        }
        const timer = setTimeout(
            () => apply({ search: search.trim() || null }),
            400,
        );
        return () => clearTimeout(timer);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [search]);

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

    const sortBy = (sort: Sort) =>
        apply({
            sort,
            direction:
                filters.sort === sort
                    ? filters.direction === 'desc'
                        ? 'asc'
                        : 'desc'
                    : defaultDirection(sort),
        });

    const filtered = Boolean(
        filters.search ||
        filters.subject ||
        filters.sort !== 'questions' ||
        filters.direction !== defaultDirection(filters.sort),
    );
    const allOpen =
        teachers.data.length > 0 &&
        teachers.data.every((teacher) => open.has(teacher.id));

    const sortHeader = (sort: Sort, label: string, align = 'text-right') => {
        const active = filters.sort === sort;
        const Icon = !active
            ? ChevronsUpDown
            : filters.direction === 'desc'
              ? ArrowDown
              : ArrowUp;
        return (
            <th
                scope="col"
                className={cn('px-3 py-2.5 font-medium', align)}
                aria-sort={
                    active
                        ? filters.direction === 'desc'
                            ? 'descending'
                            : 'ascending'
                        : 'none'
                }
            >
                <button
                    type="button"
                    onClick={() => sortBy(sort)}
                    className={cn(
                        'inline-flex items-center gap-1 rounded uppercase hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none',
                        active && 'text-foreground',
                    )}
                >
                    {tr(label)}
                    <Icon className="size-3.5" aria-hidden="true" />
                </button>
            </th>
        );
    };

    return (
        <>
            <Head title={tr('Teachers')} />
            <div className="flex flex-col gap-6">
                <div className="flex flex-col gap-1">
                    <h2 className="font-display text-2xl font-bold text-foreground">
                        {tr('Teachers')}
                    </h2>
                    <p className="text-sm text-muted-foreground">
                        {tr(
                            'Questions, classrooms, participants, compensation and points for every teacher.',
                        )}
                    </p>
                </div>

                <div
                    className="grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-3 2xl:grid-cols-6"
                    data-testid="teachers-summary"
                >
                    <KpiCard
                        label={tr('Teachers')}
                        value={formatNumber(summary.teachers)}
                        icon={GraduationCap}
                        accent="#6366f1"
                        footer={
                            <span className="text-xs text-muted-foreground">
                                {tr('{0} active in 30 days', [
                                    formatNumber(summary.active_teachers),
                                ])}
                            </span>
                        }
                    />
                    <KpiCard
                        label={tr('Questions by teachers')}
                        value={formatNumber(summary.questions)}
                        icon={ListChecks}
                        accent="#f59e0b"
                        footer={
                            <span className="text-xs text-muted-foreground">
                                {tr('{0} active', [
                                    formatNumber(summary.active_questions),
                                ])}
                            </span>
                        }
                    />
                    <KpiCard
                        label={tr('Classrooms')}
                        value={formatNumber(summary.classrooms)}
                        icon={School}
                        accent="#10b981"
                        footer={
                            <span className="text-xs text-muted-foreground">
                                {tr('{0} active now', [
                                    formatNumber(summary.active_classrooms),
                                ])}
                            </span>
                        }
                    />
                    <KpiCard
                        label={tr('Total participants')}
                        value={formatNumber(summary.participants)}
                        icon={UsersRound}
                        accent="#0ea5e9"
                        footer={
                            <span className="text-xs text-muted-foreground">
                                {tr('unique students in classrooms')}
                            </span>
                        }
                    />
                    <KpiCard
                        label={tr('Compensation total')}
                        value={rupiah(summary.compensation)}
                        icon={Wallet}
                        accent="#8b5cf6"
                        footer={
                            <span className="text-xs text-muted-foreground">
                                {tr('earned by teacher questions')}
                            </span>
                        }
                    />
                    <KpiCard
                        label={tr('Pending requests')}
                        value={formatNumber(summary.pending_requests)}
                        icon={Inbox}
                        accent="#ef4444"
                        href="/admin/teacher-requests"
                        footer={
                            <span className="text-xs text-muted-foreground">
                                {tr('teacher access requests')}
                            </span>
                        }
                    />
                </div>

                <div
                    className="flex flex-wrap items-center gap-2 rounded-2xl border border-border bg-card p-3 shadow-sm"
                    data-testid="teachers-filters"
                >
                    <div className="relative w-full min-w-0 sm:w-auto sm:flex-1 lg:max-w-sm">
                        <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
                        <input
                            value={search}
                            onChange={(event) => setSearch(event.target.value)}
                            placeholder={tr('Search name, email or school')}
                            aria-label={tr('Search teachers')}
                            className={`${fieldClass} w-full pl-9`}
                            data-testid="teachers-search"
                        />
                    </div>
                    <select
                        aria-label={tr('Subject')}
                        value={filters.subject ?? ''}
                        onChange={(event) =>
                            apply({ subject: event.target.value || null })
                        }
                        className={cn(
                            fieldClass,
                            'min-w-0 flex-1 sm:flex-none',
                        )}
                        data-testid="teachers-subject-filter"
                    >
                        <option value="">{tr('All subjects')}</option>
                        {subjects.map((subject) => (
                            <option key={subject.key} value={subject.key}>
                                {subjectName(subjects, subject.key)}
                            </option>
                        ))}
                    </select>
                    <select
                        aria-label={tr('Sort by')}
                        value={filters.sort}
                        onChange={(event) => {
                            const sort = event.target.value as Sort;
                            apply({ sort, direction: defaultDirection(sort) });
                        }}
                        className={cn(
                            fieldClass,
                            'min-w-0 flex-1 sm:flex-none lg:hidden',
                        )}
                        data-testid="teachers-sort"
                    >
                        {SORTS.map((option) => (
                            <option key={option.value} value={option.value}>
                                {tr('Sort: {0}', [tr(option.label)])}
                            </option>
                        ))}
                    </select>
                    {filtered && (
                        <button
                            type="button"
                            onClick={() => {
                                setSearch('');
                                router.get(
                                    '/admin/teachers',
                                    {},
                                    { preserveScroll: true },
                                );
                            }}
                            className="inline-flex h-9 items-center gap-1.5 rounded-lg px-3 text-sm font-medium text-muted-foreground hover:bg-accent hover:text-foreground"
                        >
                            <RotateCcw className="size-4" />
                            {tr('Reset')}
                        </button>
                    )}
                </div>

                {teachers.data.length === 0 ? (
                    <div className="rounded-2xl border border-border bg-card shadow-sm">
                        <EmptyState
                            icon={GraduationCap}
                            title={tr('No teachers found')}
                            description={tr('Change the search or filters.')}
                        />
                    </div>
                ) : (
                    <>
                        <div
                            className="hidden overflow-x-auto rounded-2xl border border-border bg-card shadow-sm lg:block"
                            data-testid="teachers-table"
                        >
                            <table className="w-full text-sm">
                                <caption className="sr-only">
                                    {tr('Teachers')}
                                </caption>
                                <thead>
                                    <tr className="border-b border-border text-xs tracking-wider text-muted-foreground uppercase">
                                        {sortHeader(
                                            'name',
                                            'Teacher',
                                            'pl-4 text-left',
                                        )}
                                        <th
                                            scope="col"
                                            className="px-3 py-2.5 text-left font-medium"
                                        >
                                            {tr('Subjects')}
                                        </th>
                                        {sortHeader('questions', 'Questions')}
                                        {sortHeader('classrooms', 'Classrooms')}
                                        {sortHeader(
                                            'participants',
                                            'Participants',
                                        )}
                                        {sortHeader('points', 'Points')}
                                        {sortHeader(
                                            'compensation',
                                            'Compensation',
                                        )}
                                        {sortHeader(
                                            'joined',
                                            'Joined',
                                            'pr-4 text-right',
                                        )}
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-border">
                                    {teachers.data.map((teacher) => (
                                        <tr
                                            key={teacher.id}
                                            className="hover:bg-muted/30"
                                            data-testid="teachers-row"
                                        >
                                            <td className="py-2.5 pr-3 pl-4 align-middle">
                                                <Link
                                                    href={`/admin/teachers/${teacher.id}`}
                                                    className="block rounded-lg hover:underline focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                                                >
                                                    <TeacherName
                                                        teacher={teacher}
                                                    />
                                                </Link>
                                            </td>
                                            <td className="max-w-56 px-3 py-2.5 align-middle">
                                                <SubjectChips
                                                    subjects={subjects}
                                                    assigned={teacher.subjects}
                                                    limit={3}
                                                />
                                            </td>
                                            <td className="px-3 py-2.5 text-right align-middle tabular-nums">
                                                <span className="font-semibold text-foreground">
                                                    {formatNumber(
                                                        teacher.questions.total,
                                                    )}
                                                </span>
                                                <span className="block text-xs text-muted-foreground">
                                                    {tr('{0} active', [
                                                        formatNumber(
                                                            teacher.questions
                                                                .active,
                                                        ),
                                                    ])}
                                                </span>
                                            </td>
                                            <td className="px-3 py-2.5 text-right align-middle tabular-nums">
                                                <span className="font-semibold text-foreground">
                                                    {formatNumber(
                                                        teacher.classrooms
                                                            .total,
                                                    )}
                                                </span>
                                                <span className="block text-xs text-muted-foreground">
                                                    {tr('{0} active now', [
                                                        formatNumber(
                                                            teacher.classrooms
                                                                .active,
                                                        ),
                                                    ])}
                                                </span>
                                            </td>
                                            <td className="px-3 py-2.5 text-right align-middle tabular-nums">
                                                <span className="font-semibold text-foreground">
                                                    {formatNumber(
                                                        teacher.participants,
                                                    )}
                                                </span>
                                                <span className="block text-xs text-muted-foreground">
                                                    {tr('{0} plays', [
                                                        formatNumber(
                                                            teacher.classroom_plays,
                                                        ),
                                                    ])}
                                                </span>
                                            </td>
                                            <td className="px-3 py-2.5 text-right align-middle font-semibold text-foreground tabular-nums">
                                                {formatNumber(
                                                    teacher.account_points,
                                                )}
                                            </td>
                                            <td className="px-3 py-2.5 text-right align-middle tabular-nums">
                                                <span className="font-semibold whitespace-nowrap text-foreground">
                                                    {rupiah(
                                                        teacher.compensation,
                                                    )}
                                                </span>
                                                <span
                                                    className={cn(
                                                        'block text-xs',
                                                        rateTone(
                                                            teacher.success_rate,
                                                        ),
                                                    )}
                                                >
                                                    {teacher.success_rate ===
                                                    null
                                                        ? tr('No answers yet')
                                                        : tr('{0}% correct', [
                                                              teacher.success_rate,
                                                          ])}
                                                </span>
                                            </td>
                                            <td className="py-2.5 pr-4 pl-3 text-right align-middle text-xs whitespace-nowrap text-muted-foreground">
                                                <span className="block text-foreground">
                                                    {timeAgo(teacher.joined_at)}
                                                </span>
                                                {tr('Last active: {0}', [
                                                    teacher.last_seen_at
                                                        ? timeAgo(
                                                              teacher.last_seen_at,
                                                          )
                                                        : tr('Never'),
                                                ])}
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>

                        <div className="flex flex-col gap-2 lg:hidden">
                            {teachers.data.length > 1 && (
                                <button
                                    type="button"
                                    onClick={() =>
                                        setOpen(
                                            allOpen
                                                ? new Set()
                                                : new Set(
                                                      teachers.data.map(
                                                          (teacher) =>
                                                              teacher.id,
                                                      ),
                                                  ),
                                        )
                                    }
                                    className="inline-flex h-8 w-fit items-center gap-1.5 self-end rounded-lg border border-border px-3 text-xs font-medium text-foreground hover:bg-accent"
                                    data-testid="teachers-toggle-all"
                                >
                                    <ChevronsUpDown className="size-3.5" />
                                    {allOpen
                                        ? tr('Collapse all')
                                        : tr('Expand all')}
                                </button>
                            )}
                            <ul
                                className="flex flex-col gap-2"
                                data-testid="teachers-cards"
                            >
                                {teachers.data.map((teacher) => {
                                    const expanded = open.has(teacher.id);
                                    const panelId = `${baseId}-teacher-${teacher.id}`;
                                    return (
                                        <li
                                            key={teacher.id}
                                            className="min-w-0 overflow-hidden rounded-2xl border border-border bg-card shadow-sm"
                                            data-testid="teachers-card"
                                        >
                                            <button
                                                type="button"
                                                onClick={() =>
                                                    toggle(teacher.id)
                                                }
                                                aria-expanded={expanded}
                                                aria-controls={panelId}
                                                className="flex w-full min-w-0 items-start gap-2 p-3 text-left hover:bg-muted/40 focus-visible:bg-muted/40 focus-visible:outline-none"
                                            >
                                                <span className="flex min-w-0 flex-1 flex-col gap-2">
                                                    <TeacherName
                                                        teacher={teacher}
                                                    />
                                                    <SubjectChips
                                                        subjects={subjects}
                                                        assigned={
                                                            teacher.subjects
                                                        }
                                                        limit={3}
                                                    />
                                                </span>
                                                <ChevronDown
                                                    className={cn(
                                                        'mt-2 size-4 shrink-0 text-muted-foreground transition-transform duration-300 motion-reduce:transition-none',
                                                        expanded &&
                                                            'rotate-180',
                                                    )}
                                                    aria-hidden="true"
                                                />
                                            </button>
                                            <div className="grid grid-cols-3 gap-2 px-3 pb-3">
                                                <Tile
                                                    label={tr('Questions')}
                                                    value={formatNumber(
                                                        teacher.questions.total,
                                                    )}
                                                />
                                                <Tile
                                                    label={tr('Classrooms')}
                                                    value={formatNumber(
                                                        teacher.classrooms
                                                            .total,
                                                    )}
                                                />
                                                <Tile
                                                    label={tr('Participants')}
                                                    value={formatNumber(
                                                        teacher.participants,
                                                    )}
                                                />
                                            </div>
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
                                                data-testid={`teachers-panel-${teacher.id}`}
                                            >
                                                <div className="min-h-0 overflow-hidden">
                                                    <TeacherDetails
                                                        teacher={teacher}
                                                    />
                                                </div>
                                            </div>
                                        </li>
                                    );
                                })}
                            </ul>
                        </div>
                    </>
                )}

                <SimplePagination
                    links={teachers.links}
                    from={teachers.from}
                    to={teachers.to}
                    total={teachers.total}
                />
            </div>
        </>
    );
}

function Tile({ label, value }: { label: string; value: ReactNode }) {
    return (
        <div className="flex min-w-0 flex-col items-center rounded-xl bg-muted/50 px-1 py-2 text-center">
            <span className="text-base font-bold text-foreground tabular-nums">
                {value}
            </span>
            <span className="w-full truncate text-[10px] text-muted-foreground min-[360px]:text-xs">
                {label}
            </span>
        </div>
    );
}

function TeacherDetails({ teacher }: { teacher: TeacherRow }) {
    return (
        <div className="flex flex-col gap-3 border-t border-dashed border-border bg-muted/20 p-3">
            <dl className="grid grid-cols-1 gap-x-8 gap-y-2 text-xs min-[400px]:grid-cols-2">
                <Fact label={tr('Active questions')}>
                    {formatNumber(teacher.questions.active)}
                </Fact>
                <Fact label={tr('Manual / import / AI')}>
                    {formatNumber(teacher.questions.manual)} /{' '}
                    {formatNumber(teacher.questions.imported)} /{' '}
                    {formatNumber(teacher.questions.ai)}
                </Fact>
                <Fact label={tr('Answers')}>
                    {formatNumber(teacher.answers)}
                </Fact>
                <Fact label={tr('Success rate')}>
                    <span className={rateTone(teacher.success_rate)}>
                        {teacher.success_rate === null
                            ? '—'
                            : `${teacher.success_rate}%`}
                    </span>
                </Fact>
                <Fact label={tr('Active classrooms')}>
                    {formatNumber(teacher.classrooms.active)}
                </Fact>
                <Fact label={tr('Scheduled / ended')}>
                    {formatNumber(teacher.classrooms.scheduled)} /{' '}
                    {formatNumber(teacher.classrooms.ended)}
                </Fact>
                <Fact label={tr('Classroom plays')}>
                    {formatNumber(teacher.classroom_plays)}
                </Fact>
                <Fact label={tr('Account points')}>
                    {formatNumber(teacher.account_points)}
                </Fact>
                <Fact label={tr('Compensation')}>
                    {rupiah(teacher.compensation)}
                </Fact>
                <Fact label={tr('Last active')}>
                    {teacher.last_seen_at
                        ? timeAgo(teacher.last_seen_at)
                        : tr('Never')}
                </Fact>
                <Fact label={tr('Joined')}>{timeAgo(teacher.joined_at)}</Fact>
                <Fact label={tr('Email')}>
                    <span className="break-all whitespace-normal">
                        {teacher.email}
                    </span>
                </Fact>
            </dl>
            <div className="flex flex-wrap gap-x-4 gap-y-1">
                <Link
                    href={`/admin/teachers/${teacher.id}`}
                    className="inline-flex w-fit items-center gap-1 text-xs font-medium text-foreground underline decoration-border underline-offset-4 hover:decoration-foreground"
                >
                    <ClipboardList className="size-3.5" aria-hidden="true" />
                    {tr('Teacher details')}
                </Link>
                <Link
                    href={`/admin/users/${teacher.id}`}
                    className="w-fit text-xs font-medium text-muted-foreground underline decoration-border underline-offset-4 hover:text-foreground"
                >
                    {tr('User profile')}
                </Link>
            </div>
        </div>
    );
}

function Fact({ label, children }: { label: string; children: ReactNode }) {
    return (
        <div className="flex min-w-0 items-baseline justify-between gap-2">
            <dt className="truncate text-muted-foreground">{label}</dt>
            <dd className="font-semibold whitespace-nowrap text-foreground tabular-nums">
                {children}
            </dd>
        </div>
    );
}

TeachersIndex.layout = (page: ReactNode) => (
    <AdminLayout title={tr('Teachers')}>{page}</AdminLayout>
);
