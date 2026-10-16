import { SimplePagination, type Paginated } from '@/components/admin/admin-kit';
import {
    ClassroomAiPill,
    ClassroomStatusPill,
    type AdminClassroomStatus,
    type ClassroomAiStatus,
} from '@/components/admin/classroom-admin';
import { GameDot, KpiCard, UserAvatar } from '@/components/admin/dashboard-kit';
import {
    EmptyState,
    fieldClass,
    formatDateTime,
    formatNumber,
} from '@/components/admin/game-stats';
import AdminLayout from '@/layouts/admin-layout';
import { tr } from '@/lib/admin-i18n';
import { cn } from '@/lib/utils';
import { Head, Link, router } from '@inertiajs/react';
import {
    CalendarClock,
    CheckCircle2,
    ChevronDown,
    ChevronsUpDown,
    PlayCircle,
    RotateCcw,
    School,
    Search,
    UsersRound,
    Wifi,
} from 'lucide-react';
import { useEffect, useId, useRef, useState, type ReactNode } from 'react';

interface ClassroomRow {
    id: number;
    name: string;
    pin: string;
    status: AdminClassroomStatus;
    starts_at: string | null;
    ends_at: string | null;
    max_members: number;
    members_count: number;
    online_count: number;
    plays: number;
    games: string[];
    ai_status: ClassroomAiStatus;
    teacher: {
        id: number;
        name: string;
        email: string;
        avatar_url: string | null;
    } | null;
}

interface Filters {
    status: AdminClassroomStatus | null;
    search: string | null;
    teacher_id: number | null;
}

interface Props {
    filters: Filters;
    summary: {
        total: number;
        scheduled: number;
        active: number;
        ended: number;
        members: number;
        online: number;
    };
    teachers: { id: number; name: string }[];
    classrooms: Paginated<ClassroomRow>;
}

const STATUS_TABS: { value: AdminClassroomStatus | null; label: string }[] = [
    { value: null, label: 'All' },
    { value: 'active', label: 'Active now' },
    { value: 'scheduled', label: 'Scheduled' },
    { value: 'ended', label: 'Ended' },
];

const URL = '/admin/classrooms';

function Schedule({ classroom }: { classroom: ClassroomRow }) {
    return (
        <span className="flex flex-col text-xs text-muted-foreground tabular-nums">
            <span>
                <span className="font-medium text-foreground">
                    {tr('Starts')}
                </span>{' '}
                {formatDateTime(classroom.starts_at)}
            </span>
            <span>
                <span className="font-medium text-foreground">
                    {tr('Ends')}
                </span>{' '}
                {formatDateTime(classroom.ends_at)}
            </span>
        </span>
    );
}

function Games({ games }: { games: string[] }) {
    if (games.length === 0) {
        return <span className="text-xs text-muted-foreground">—</span>;
    }

    return (
        <span className="flex flex-wrap gap-x-3 gap-y-1 text-xs">
            {games.map((game) => (
                <GameDot key={game} game={game} />
            ))}
        </span>
    );
}

function Members({ classroom }: { classroom: ClassroomRow }) {
    return (
        <span className="flex flex-col items-end tabular-nums">
            <span className="font-semibold text-foreground">
                {formatNumber(classroom.members_count)}
                <span className="font-normal text-muted-foreground">
                    {' '}
                    / {formatNumber(classroom.max_members)}
                </span>
            </span>
            {classroom.status === 'active' && (
                <span
                    className={cn(
                        'text-xs',
                        classroom.online_count > 0
                            ? 'font-medium text-emerald-700 dark:text-emerald-400'
                            : 'text-muted-foreground',
                    )}
                >
                    {tr('{0} online', [formatNumber(classroom.online_count)])}
                </span>
            )}
        </span>
    );
}

function TeacherName({ classroom }: { classroom: ClassroomRow }) {
    if (!classroom.teacher) {
        return <span className="text-muted-foreground">—</span>;
    }

    return (
        <span className="flex min-w-0 items-center gap-2">
            <UserAvatar
                name={classroom.teacher.name}
                src={classroom.teacher.avatar_url}
                className="size-7 text-[10px]"
            />
            <span className="flex min-w-0 flex-col">
                <span className="truncate text-foreground">
                    {classroom.teacher.name}
                </span>
                <span className="truncate text-xs text-muted-foreground">
                    {classroom.teacher.email}
                </span>
            </span>
        </span>
    );
}

export default function ClassroomsIndex({
    filters,
    summary,
    teachers,
    classrooms,
}: Props) {
    const [search, setSearch] = useState(filters.search ?? '');
    const [open, setOpen] = useState<Set<number>>(new Set());
    const firstRender = useRef(true);
    const baseId = useId();

    const apply = (changes: Partial<Filters>) => {
        const next = { ...filters, ...changes };
        router.get(
            URL,
            Object.fromEntries(
                Object.entries(next).filter(
                    ([, value]) => value !== null && value !== '',
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

    const filtered = Boolean(
        filters.status || filters.search || filters.teacher_id,
    );
    const allOpen =
        classrooms.data.length > 0 &&
        classrooms.data.every((classroom) => open.has(classroom.id));
    const counts: Record<string, number> = {
        all: summary.total,
        active: summary.active,
        scheduled: summary.scheduled,
        ended: summary.ended,
    };

    return (
        <>
            <Head title={tr('Classrooms')} />
            <div className="flex flex-col gap-6">
                <div className="flex flex-col gap-1">
                    <h2 className="font-display text-2xl font-bold text-foreground">
                        {tr('Classrooms')}
                    </h2>
                    <p className="text-sm text-muted-foreground">
                        {tr(
                            'Every teacher classroom: scheduled, running now and finished, with members, plays and AI analysis.',
                        )}
                    </p>
                </div>

                <div
                    className="grid grid-cols-2 gap-3 sm:gap-4 md:grid-cols-3 xl:grid-cols-6"
                    data-testid="classrooms-summary"
                >
                    <KpiCard
                        label={tr('Classrooms')}
                        value={formatNumber(summary.total)}
                        icon={School}
                        accent="#6366f1"
                    />
                    <KpiCard
                        label={tr('Scheduled')}
                        value={formatNumber(summary.scheduled)}
                        icon={CalendarClock}
                        accent="#0ea5e9"
                    />
                    <KpiCard
                        label={tr('Active now')}
                        value={formatNumber(summary.active)}
                        icon={PlayCircle}
                        accent="#10b981"
                    />
                    <KpiCard
                        label={tr('Ended')}
                        value={formatNumber(summary.ended)}
                        icon={CheckCircle2}
                        accent="#64748b"
                    />
                    <KpiCard
                        label={tr('Members')}
                        value={formatNumber(summary.members)}
                        icon={UsersRound}
                        accent="#f59e0b"
                    />
                    <KpiCard
                        label={tr('Online now')}
                        value={formatNumber(summary.online)}
                        icon={Wifi}
                        accent="#22c55e"
                    />
                </div>

                <div
                    className="flex flex-col gap-3 rounded-2xl border border-border bg-card p-3 shadow-sm"
                    data-testid="classrooms-filters"
                >
                    <div
                        className="flex flex-wrap gap-1.5"
                        role="group"
                        aria-label={tr('Status')}
                    >
                        {STATUS_TABS.map((tab) => {
                            const active = filters.status === tab.value;
                            return (
                                <button
                                    key={tab.label}
                                    type="button"
                                    onClick={() => apply({ status: tab.value })}
                                    aria-pressed={active}
                                    className={cn(
                                        'inline-flex h-8 items-center gap-1.5 rounded-lg border px-3 text-xs font-medium transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none',
                                        active
                                            ? 'border-primary bg-primary text-primary-foreground'
                                            : 'border-border text-foreground hover:bg-accent',
                                    )}
                                    data-testid={`classrooms-status-${tab.value ?? 'all'}`}
                                >
                                    {tr(tab.label)}
                                    <span
                                        className={cn(
                                            'rounded-full px-1.5 text-[10px] tabular-nums',
                                            active
                                                ? 'bg-primary-foreground/20'
                                                : 'bg-muted text-muted-foreground',
                                        )}
                                    >
                                        {formatNumber(
                                            counts[tab.value ?? 'all'],
                                        )}
                                    </span>
                                </button>
                            );
                        })}
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                        <div className="relative w-full min-w-0 sm:w-auto sm:flex-1 lg:max-w-sm">
                            <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
                            <input
                                value={search}
                                onChange={(event) =>
                                    setSearch(event.target.value)
                                }
                                placeholder={tr(
                                    'Search classroom, teacher or PIN',
                                )}
                                aria-label={tr('Search classrooms')}
                                className={`${fieldClass} w-full pl-9`}
                                data-testid="classrooms-search"
                            />
                        </div>
                        <select
                            aria-label={tr('Teacher')}
                            value={filters.teacher_id ?? ''}
                            onChange={(event) =>
                                apply({
                                    teacher_id: event.target.value
                                        ? Number(event.target.value)
                                        : null,
                                })
                            }
                            className={cn(
                                fieldClass,
                                'min-w-0 flex-1 sm:max-w-xs sm:flex-none',
                            )}
                            data-testid="classrooms-teacher-filter"
                        >
                            <option value="">{tr('All teachers')}</option>
                            {teachers.map((teacher) => (
                                <option key={teacher.id} value={teacher.id}>
                                    {teacher.name}
                                </option>
                            ))}
                        </select>
                        {filtered && (
                            <button
                                type="button"
                                onClick={() => {
                                    setSearch('');
                                    router.get(
                                        URL,
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
                </div>

                {classrooms.data.length === 0 ? (
                    <div className="rounded-2xl border border-border bg-card shadow-sm">
                        <EmptyState
                            icon={School}
                            title={tr('No classrooms found')}
                            description={tr('Change the search or filters.')}
                        />
                    </div>
                ) : (
                    <>
                        <div
                            className="hidden overflow-hidden rounded-2xl border border-border bg-card shadow-sm lg:block"
                            data-testid="classrooms-table"
                        >
                            <table className="w-full text-sm">
                                <caption className="sr-only">
                                    {tr('Classrooms')}
                                </caption>
                                <thead>
                                    <tr className="border-b border-border text-left text-xs tracking-wider text-muted-foreground uppercase">
                                        <th
                                            scope="col"
                                            className="py-2.5 pr-3 pl-4 font-medium"
                                        >
                                            {tr('Classroom')}
                                        </th>
                                        <th
                                            scope="col"
                                            className="px-3 py-2.5 font-medium"
                                        >
                                            {tr('Teacher')}
                                        </th>
                                        <th
                                            scope="col"
                                            className="px-3 py-2.5 font-medium"
                                        >
                                            {tr('Schedule')}
                                        </th>
                                        <th
                                            scope="col"
                                            className="px-3 py-2.5 text-right font-medium"
                                        >
                                            {tr('Members')}
                                        </th>
                                        <th
                                            scope="col"
                                            className="px-3 py-2.5 font-medium"
                                        >
                                            {tr('Games')}
                                        </th>
                                        <th
                                            scope="col"
                                            className="px-3 py-2.5 text-right font-medium"
                                        >
                                            {tr('Plays')}
                                        </th>
                                        <th
                                            scope="col"
                                            className="py-2.5 pr-4 pl-3 font-medium"
                                        >
                                            {tr('AI analysis')}
                                        </th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-border">
                                    {classrooms.data.map((classroom) => (
                                        <tr
                                            key={classroom.id}
                                            className="hover:bg-muted/30"
                                            data-testid="classrooms-row"
                                        >
                                            <td className="py-2.5 pr-3 pl-4 align-middle">
                                                <Link
                                                    href={`${URL}/${classroom.id}`}
                                                    className="flex flex-col gap-1 rounded-lg focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                                                >
                                                    <span className="font-medium break-words text-foreground hover:underline">
                                                        {classroom.name}
                                                    </span>
                                                    <span className="flex flex-wrap items-center gap-1.5">
                                                        <ClassroomStatusPill
                                                            status={
                                                                classroom.status
                                                            }
                                                        />
                                                        {classroom.status === 'active' && (
                                                            <Link
                                                                href={`${URL}/${classroom.id}/world`}
                                                                className="text-xs font-semibold text-primary hover:underline"
                                                                data-testid="classroom-monitor-link"
                                                            >
                                                                {tr('Monitor')}
                                                            </Link>
                                                        )}
                                                        <span className="font-mono text-xs text-muted-foreground">
                                                            {tr('PIN')}{' '}
                                                            {classroom.pin}
                                                        </span>
                                                    </span>
                                                </Link>
                                            </td>
                                            <td className="max-w-56 px-3 py-2.5 align-middle">
                                                <TeacherName
                                                    classroom={classroom}
                                                />
                                            </td>
                                            <td className="px-3 py-2.5 align-middle whitespace-nowrap">
                                                <Schedule
                                                    classroom={classroom}
                                                />
                                            </td>
                                            <td className="px-3 py-2.5 text-right align-middle">
                                                <Members
                                                    classroom={classroom}
                                                />
                                            </td>
                                            <td className="max-w-64 px-3 py-2.5 align-middle">
                                                <Games
                                                    games={classroom.games}
                                                />
                                            </td>
                                            <td className="px-3 py-2.5 text-right align-middle font-semibold text-foreground tabular-nums">
                                                {formatNumber(classroom.plays)}
                                            </td>
                                            <td className="py-2.5 pr-4 pl-3 align-middle">
                                                <ClassroomAiPill
                                                    status={classroom.ai_status}
                                                />
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>

                        <div className="flex flex-col gap-2 lg:hidden">
                            {classrooms.data.length > 1 && (
                                <button
                                    type="button"
                                    onClick={() =>
                                        setOpen(
                                            allOpen
                                                ? new Set()
                                                : new Set(
                                                      classrooms.data.map(
                                                          (classroom) =>
                                                              classroom.id,
                                                      ),
                                                  ),
                                        )
                                    }
                                    className="inline-flex h-8 w-fit items-center gap-1.5 self-end rounded-lg border border-border px-3 text-xs font-medium text-foreground hover:bg-accent"
                                    data-testid="classrooms-toggle-all"
                                >
                                    <ChevronsUpDown className="size-3.5" />
                                    {allOpen
                                        ? tr('Collapse all')
                                        : tr('Expand all')}
                                </button>
                            )}
                            <ul
                                className="flex flex-col gap-2"
                                data-testid="classrooms-cards"
                            >
                                {classrooms.data.map((classroom) => {
                                    const expanded = open.has(classroom.id);
                                    const panelId = `${baseId}-classroom-${classroom.id}`;
                                    return (
                                        <li
                                            key={classroom.id}
                                            className="min-w-0 overflow-hidden rounded-2xl border border-border bg-card shadow-sm"
                                            data-testid="classrooms-card"
                                        >
                                            <button
                                                type="button"
                                                onClick={() =>
                                                    toggle(classroom.id)
                                                }
                                                aria-expanded={expanded}
                                                aria-controls={panelId}
                                                className="flex w-full min-w-0 items-start gap-2 p-3 text-left hover:bg-muted/40 focus-visible:bg-muted/40 focus-visible:outline-none"
                                            >
                                                <span className="flex min-w-0 flex-1 flex-col gap-1.5">
                                                    <span className="font-medium break-words text-foreground">
                                                        {classroom.name}
                                                    </span>
                                                    <span className="flex flex-wrap items-center gap-1.5">
                                                        <ClassroomStatusPill
                                                            status={
                                                                classroom.status
                                                            }
                                                        />
                                                        {classroom.status === 'active' && (
                                                            <Link
                                                                href={`${URL}/${classroom.id}/world`}
                                                                className="text-xs font-semibold text-primary hover:underline"
                                                                data-testid="classroom-monitor-link"
                                                            >
                                                                {tr('Monitor')}
                                                            </Link>
                                                        )}
                                                        <span className="font-mono text-xs text-muted-foreground">
                                                            {tr('PIN')}{' '}
                                                            {classroom.pin}
                                                        </span>
                                                    </span>
                                                    <span className="truncate text-xs text-muted-foreground">
                                                        {classroom.teacher
                                                            ?.name ?? '—'}
                                                    </span>
                                                </span>
                                                <ChevronDown
                                                    className={cn(
                                                        'mt-1 size-4 shrink-0 text-muted-foreground transition-transform duration-300 motion-reduce:transition-none',
                                                        expanded &&
                                                            'rotate-180',
                                                    )}
                                                    aria-hidden="true"
                                                />
                                            </button>
                                            <div className="grid grid-cols-3 gap-2 px-3 pb-3">
                                                <Tile
                                                    label={tr('Members')}
                                                    value={formatNumber(
                                                        classroom.members_count,
                                                    )}
                                                />
                                                <Tile
                                                    label={tr('Online')}
                                                    value={formatNumber(
                                                        classroom.online_count,
                                                    )}
                                                    tone={
                                                        classroom.online_count >
                                                        0
                                                            ? 'text-emerald-600 dark:text-emerald-400'
                                                            : undefined
                                                    }
                                                />
                                                <Tile
                                                    label={tr('Plays')}
                                                    value={formatNumber(
                                                        classroom.plays,
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
                                                data-testid={`classrooms-panel-${classroom.id}`}
                                            >
                                                <div className="min-h-0 overflow-hidden">
                                                    <div className="flex flex-col gap-3 border-t border-dashed border-border bg-muted/20 p-3">
                                                        <TeacherName
                                                            classroom={
                                                                classroom
                                                            }
                                                        />
                                                        <Schedule
                                                            classroom={
                                                                classroom
                                                            }
                                                        />
                                                        <Games
                                                            games={
                                                                classroom.games
                                                            }
                                                        />
                                                        <span className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                                                            <ClassroomAiPill
                                                                status={
                                                                    classroom.ai_status
                                                                }
                                                            />
                                                            {tr(
                                                                'Max {0} members',
                                                                [
                                                                    classroom.max_members,
                                                                ],
                                                            )}
                                                        </span>
                                                        <Link
                                                            href={`${URL}/${classroom.id}`}
                                                            className="w-fit text-xs font-medium text-foreground underline decoration-border underline-offset-4 hover:decoration-foreground"
                                                        >
                                                            {tr(
                                                                'Open classroom',
                                                            )}
                                                        </Link>
                                                    </div>
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
                    links={classrooms.links}
                    from={classrooms.from}
                    to={classrooms.to}
                    total={classrooms.total}
                />
            </div>
        </>
    );
}

function Tile({
    label,
    value,
    tone,
}: {
    label: string;
    value: ReactNode;
    tone?: string;
}) {
    return (
        <div className="flex min-w-0 flex-col items-center rounded-xl bg-muted/50 px-1 py-2 text-center">
            <span
                className={cn(
                    'text-base font-bold text-foreground tabular-nums',
                    tone,
                )}
            >
                {value}
            </span>
            <span className="w-full truncate text-[10px] text-muted-foreground min-[360px]:text-xs">
                {label}
            </span>
        </div>
    );
}

ClassroomsIndex.layout = (page: ReactNode) => (
    <AdminLayout title={tr('Classrooms')}>{page}</AdminLayout>
);
