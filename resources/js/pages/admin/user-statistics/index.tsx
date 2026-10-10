import {
    axisTick,
    chartEvents,
    chartTooltipStyle,
    KpiCard,
    LEVEL_COLORS,
    LEVEL_SHORT,
    ShareBars,
} from '@/components/admin/dashboard-kit';
import {
    EmptyState,
    fieldClass,
    formatNumber,
    formatPercent,
    LEVEL_LABELS,
    Panel,
    rateTone,
} from '@/components/admin/game-stats';
import { ResponsiveTable } from '@/components/responsive-table';
import AdminLayout from '@/layouts/admin-layout';
import { tr } from '@/lib/admin-i18n';
import { cn } from '@/lib/utils';
import { Head, Link, router } from '@inertiajs/react';
import {
    Cake,
    ChartNoAxesColumn,
    GraduationCap,
    Grid3x3,
    RotateCcw,
    School,
    Search,
    Target,
    UserCheck,
    Users,
    UsersRound,
} from 'lucide-react';
import { type ReactNode, useEffect, useRef, useState } from 'react';
import {
    Bar,
    BarChart,
    CartesianGrid,
    Cell,
    ResponsiveContainer,
    Tooltip,
    XAxis,
    YAxis,
} from 'recharts';

interface Segment {
    label: string;
    users: number;
    players: number;
    plays: number;
    points: number;
    avg_points: number;
    accuracy: number | null;
    avg_age: number | null;
}

interface SchoolSegment extends Segment {
    grade_min: number | null;
    grade_max: number | null;
    levels: Record<string, number>;
}

interface Stats {
    summary: {
        users: number;
        complete: number;
        players: number;
        active_30d: number;
        schools: number;
        avg_age: number | null;
        median_age: number | null;
        plays: number;
    };
    byLevel: Segment[];
    byGrade: Segment[];
    byAge: Segment[];
    byAgeGroup: Segment[];
    bySchool: SchoolSegment[];
    matrix: { columns: string[]; rows: { grade: number; counts: number[] }[] };
}

interface Props {
    filters: { level?: string; school?: string };
    stats: Stats;
}

type Tab = 'school' | 'grade' | 'age';

const TABS: { key: Tab; label: string; icon: React.ElementType }[] = [
    { key: 'school', label: 'By school', icon: School },
    { key: 'grade', label: 'By grade', icon: GraduationCap },
    { key: 'age', label: 'By age', icon: Cake },
];

function levelColorForGrade(grade: number): string {
    return grade <= 6
        ? LEVEL_COLORS.sd
        : grade <= 9
          ? LEVEL_COLORS.smp
          : LEVEL_COLORS.sma;
}

export default function UserStatistics({ filters, stats }: Props) {
    const [tab, setTab] = useState<Tab>('school');
    const [school, setSchool] = useState(filters.school ?? '');
    const first = useRef(true);
    const { summary } = stats;

    const apply = (changes: Props['filters']) => {
        const query = Object.fromEntries(
            Object.entries({ ...filters, ...changes }).filter(([, v]) => v),
        );
        router.get('/admin/user-statistics', query, {
            preserveScroll: true,
            preserveState: true,
        });
    };

    useEffect(() => {
        if (first.current) {
            first.current = false;
            return;
        }
        const timer = setTimeout(
            () => apply({ school: school.trim() || undefined }),
            400,
        );
        return () => clearTimeout(timer);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [school]);

    const filtered = Boolean(filters.level || filters.school);

    return (
        <>
            <Head title={tr('User Statistics')} />
            <div className="flex flex-col gap-6">
                <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
                    <div className="flex flex-col gap-1">
                        <h2 className="font-display text-2xl font-bold text-foreground">
                            {tr('User Statistics')}
                        </h2>
                        <p className="text-sm text-muted-foreground">
                            {tr(
                                'Learner profiles by school, grade and age with their game results (super admins excluded).',
                            )}
                        </p>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                        <div
                            className="inline-flex rounded-lg border border-border bg-card p-1"
                            role="group"
                            aria-label={tr('School level')}
                        >
                            {['', 'sd', 'smp', 'sma'].map((level) => (
                                <button
                                    key={level || 'all'}
                                    type="button"
                                    aria-pressed={
                                        (filters.level ?? '') === level
                                    }
                                    onClick={() =>
                                        apply({ level: level || undefined })
                                    }
                                    className={cn(
                                        'rounded-md px-3 py-1.5 text-sm font-medium transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none',
                                        (filters.level ?? '') === level
                                            ? 'bg-primary text-primary-foreground'
                                            : 'text-muted-foreground hover:text-foreground',
                                    )}
                                >
                                    {level
                                        ? LEVEL_SHORT[level]
                                        : tr('All levels')}
                                </button>
                            ))}
                        </div>
                        <div className="relative">
                            <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
                            <input
                                type="search"
                                aria-label={tr('Filter by school')}
                                value={school}
                                onChange={(e) => setSchool(e.target.value)}
                                placeholder={tr('Filter by school…')}
                                className={cn(fieldClass, 'w-56 pl-9')}
                            />
                        </div>
                        {filtered && (
                            <button
                                type="button"
                                onClick={() => {
                                    setSchool('');
                                    router.get(
                                        '/admin/user-statistics',
                                        {},
                                        { preserveScroll: true },
                                    );
                                }}
                                className="inline-flex h-9 items-center gap-1.5 rounded-lg px-3 text-sm font-medium text-muted-foreground hover:bg-muted hover:text-foreground"
                            >
                                <RotateCcw className="size-4" />
                                {tr('Reset')}
                            </button>
                        )}
                    </div>
                </div>

                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
                    <KpiCard
                        label={tr('Learners')}
                        value={formatNumber(summary.users)}
                        icon={Users}
                        accent="var(--color-bubble-orange)"
                        footer={
                            <span className="text-xs text-muted-foreground">
                                {formatNumber(summary.complete)}{' '}
                                {tr('complete profiles (')}
                                {summary.users
                                    ? Math.round(
                                          (summary.complete / summary.users) *
                                              100,
                                      )
                                    : 0}
                                %)
                            </span>
                        }
                    />
                    <KpiCard
                        label={tr('Have played')}
                        value={formatNumber(summary.players)}
                        icon={UserCheck}
                        accent="var(--color-bubble-green)"
                        footer={
                            <span className="text-xs text-muted-foreground">
                                {formatNumber(summary.active_30d)}{' '}
                                {tr('active in 30 days ·')}{' '}
                                {formatNumber(summary.plays)} {tr('plays')}
                            </span>
                        }
                    />
                    <KpiCard
                        label={tr('Schools')}
                        value={formatNumber(summary.schools)}
                        icon={School}
                        accent="var(--color-bubble-blue)"
                        footer={
                            <span className="text-xs text-muted-foreground">
                                {summary.schools
                                    ? (summary.users / summary.schools).toFixed(
                                          1,
                                      )
                                    : 0}{' '}
                                {tr('learners per school')}
                            </span>
                        }
                    />
                    <KpiCard
                        label={tr('Average age')}
                        value={summary.avg_age ?? '—'}
                        icon={Cake}
                        accent="var(--color-bubble-purple)"
                        footer={
                            <span className="text-xs text-muted-foreground">
                                {tr('Median')} {summary.median_age ?? '—'}{' '}
                                {tr('years')}
                            </span>
                        }
                    />
                </div>

                <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
                    <Panel
                        title={tr('School level')}
                        description={tr('Share of learners per school level')}
                        icon={GraduationCap}
                    >
                        <ShareBars
                            rows={stats.byLevel.map((row) => ({
                                key: row.label,
                                label: LEVEL_LABELS[row.label] ?? row.label,
                                value: row.users,
                                color: LEVEL_COLORS[row.label],
                            }))}
                            emptyLabel={tr('No learners match these filters')}
                        />
                    </Panel>
                    <Panel
                        title={tr('Learners per grade')}
                        description={tr(
                            'Registered learners vs. learners who have played',
                        )}
                        icon={ChartNoAxesColumn}
                        className="lg:col-span-2"
                        actions={
                            <span className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
                                {(['sd', 'smp', 'sma'] as const).map(
                                    (level) => (
                                        <span
                                            key={level}
                                            className="inline-flex items-center gap-1"
                                        >
                                            <span
                                                className="size-2 rounded-full"
                                                style={{
                                                    background:
                                                        LEVEL_COLORS[level],
                                                }}
                                            />
                                            {tr(LEVEL_SHORT[level])}
                                        </span>
                                    ),
                                )}
                                <span className="inline-flex items-center gap-1">
                                    <span className="size-2 rounded-full bg-bubble-orange/60" />
                                    {tr('Have played')}
                                </span>
                            </span>
                        }
                    >
                        <div className="h-56">
                            <ResponsiveContainer width="100%" height="100%">
                                <BarChart
                                    {...chartEvents}
                                    barGap={2}
                                    data={stats.byGrade.filter(
                                        (row) => row.label !== 'unknown',
                                    )}
                                    margin={{ left: -20, right: 8, top: 4 }}
                                >
                                    <CartesianGrid
                                        strokeDasharray="3 3"
                                        stroke="var(--border)"
                                        vertical={false}
                                    />
                                    <XAxis
                                        dataKey="label"
                                        tick={axisTick}
                                        axisLine={false}
                                        tickLine={false}
                                    />
                                    <YAxis
                                        allowDecimals={false}
                                        domain={[
                                            0,
                                            (max: number) =>
                                                Math.max(
                                                    4,
                                                    Math.ceil(max * 1.2),
                                                ),
                                        ]}
                                        tick={axisTick}
                                        axisLine={false}
                                        tickLine={false}
                                    />
                                    <Tooltip
                                        contentStyle={chartTooltipStyle}
                                        cursor={{ fill: 'var(--muted)' }}
                                        labelFormatter={(v) =>
                                            tr('Grade {0}', [v])
                                        }
                                    />
                                    <Bar
                                        dataKey="users"
                                        name="Learners"
                                        radius={[6, 6, 0, 0]}
                                    >
                                        {stats.byGrade
                                            .filter(
                                                (row) =>
                                                    row.label !== 'unknown',
                                            )
                                            .map((row) => (
                                                <Cell
                                                    key={row.label}
                                                    fill={levelColorForGrade(
                                                        Number(row.label),
                                                    )}
                                                />
                                            ))}
                                    </Bar>
                                    <Bar
                                        dataKey="players"
                                        name="Have played"
                                        radius={[6, 6, 0, 0]}
                                        fill="var(--color-bubble-orange)"
                                        fillOpacity={0.55}
                                    />
                                </BarChart>
                            </ResponsiveContainer>
                        </div>
                    </Panel>
                </div>

                <div className="grid grid-cols-1 gap-6 lg:grid-cols-5">
                    <Panel
                        title={tr('Age distribution')}
                        description={tr('Learners per year of age')}
                        icon={Cake}
                        className="lg:col-span-3"
                    >
                        <div className="h-56">
                            <ResponsiveContainer width="100%" height="100%">
                                <BarChart
                                    {...chartEvents}
                                    data={stats.byAge.filter(
                                        (row) => row.label !== 'unknown',
                                    )}
                                    margin={{ left: -20, right: 8, top: 4 }}
                                >
                                    <CartesianGrid
                                        strokeDasharray="3 3"
                                        stroke="var(--border)"
                                        vertical={false}
                                    />
                                    <XAxis
                                        dataKey="label"
                                        tick={axisTick}
                                        axisLine={false}
                                        tickLine={false}
                                    />
                                    <YAxis
                                        allowDecimals={false}
                                        domain={[
                                            0,
                                            (max: number) =>
                                                Math.max(
                                                    4,
                                                    Math.ceil(max * 1.2),
                                                ),
                                        ]}
                                        tick={axisTick}
                                        axisLine={false}
                                        tickLine={false}
                                    />
                                    <Tooltip
                                        contentStyle={chartTooltipStyle}
                                        cursor={{ fill: 'var(--muted)' }}
                                        labelFormatter={(v) =>
                                            tr('Age {0}', [v])
                                        }
                                    />
                                    <Bar
                                        dataKey="users"
                                        name="Learners"
                                        radius={[6, 6, 0, 0]}
                                        fill="var(--color-bubble-purple)"
                                    />
                                </BarChart>
                            </ResponsiveContainer>
                        </div>
                    </Panel>
                    <Panel
                        title={tr('Grade × age')}
                        description={tr(
                            'Spot learners whose age does not fit their grade',
                        )}
                        icon={Grid3x3}
                        className="lg:col-span-2"
                    >
                        <Matrix matrix={stats.matrix} />
                    </Panel>
                </div>

                <section className="flex flex-col rounded-2xl border border-border bg-card shadow-sm">
                    <header className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-5 py-3">
                        <div
                            className="inline-flex rounded-lg border border-border bg-background p-1"
                            role="tablist"
                            aria-label={tr('Breakdown')}
                        >
                            {TABS.map((item) => (
                                <button
                                    key={item.key}
                                    type="button"
                                    role="tab"
                                    aria-selected={tab === item.key}
                                    onClick={() => setTab(item.key)}
                                    className={cn(
                                        'inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none',
                                        tab === item.key
                                            ? 'bg-muted text-foreground'
                                            : 'text-muted-foreground hover:text-foreground',
                                    )}
                                >
                                    <item.icon className="size-4" />
                                    {tr(item.label)}
                                </button>
                            ))}
                        </div>
                        <span className="text-xs text-muted-foreground">
                            {tr(
                                'Accuracy = correct answers ÷ all answers in recorded games',
                            )}
                        </span>
                    </header>
                    <div className="p-5">
                        {tab === 'school' && (
                            <SchoolTable rows={stats.bySchool} />
                        )}
                        {tab === 'grade' && (
                            <SegmentTable
                                rows={stats.byGrade}
                                header={tr('Grade')}
                                labelFor={(label) =>
                                    label === 'unknown'
                                        ? tr('Not set')
                                        : tr('Grade {0}', [label])
                                }
                            />
                        )}
                        {tab === 'age' && (
                            <SegmentTable
                                rows={stats.byAgeGroup}
                                header={tr('Age group')}
                                labelFor={(label) =>
                                    label === 'unknown'
                                        ? tr('Not set')
                                        : tr('{0} years', [label])
                                }
                            />
                        )}
                    </div>
                </section>
            </div>
        </>
    );
}

function Matrix({ matrix }: { matrix: Stats['matrix'] }) {
    const max = Math.max(1, ...matrix.rows.flatMap((row) => row.counts));
    const total = matrix.rows.reduce(
        (sum, row) => sum + row.counts.reduce((a, b) => a + b, 0),
        0,
    );

    if (total === 0) {
        return (
            <EmptyState
                icon={Grid3x3}
                title={tr('No learners with both grade and age')}
            />
        );
    }

    return (
        <ResponsiveTable
            testId="user-stats-age-grade"
            rows={matrix.rows}
            rowKey={(row) => row.grade}
            tableClassName="text-xs"
            columns={[
                {
                    key: 'grade',
                    header: tr('Grade'),
                    primary: true,
                    cellClassName:
                        'px-1 py-0.5 font-medium text-foreground tabular-nums',
                    headerClassName: 'px-1',
                    cell: (row) => row.grade,
                },
                {
                    key: 'total',
                    header: tr('Learners'),
                    summary: true,
                    hideInAccordion: true,
                    headerClassName: 'hidden',
                    cellClassName: 'hidden',
                    cell: (row) =>
                        tr('{0} learners', [
                            row.counts.reduce((a, b) => a + b, 0),
                        ]),
                },
                ...matrix.columns.map((column, index) => ({
                    key: `age-${column}`,
                    header: column,
                    align: 'center' as const,
                    headerClassName: 'px-0.5 first:pl-0.5 last:pr-0.5',
                    cellClassName: 'px-0.5 py-0.5 first:pl-0.5 last:pr-0.5',
                    cell: (row: (typeof matrix.rows)[number]) => {
                        const count = row.counts[index];
                        return (
                            <span
                                title={tr('Grade {0}, age {1}: {2}', [
                                    row.grade,
                                    column,
                                    count,
                                ])}
                                className={cn(
                                    'flex h-6 min-w-8 items-center justify-center rounded-md px-1 tabular-nums',
                                    count === 0
                                        ? 'bg-muted/60 text-muted-foreground/60'
                                        : 'font-semibold text-foreground',
                                )}
                                style={
                                    count > 0
                                        ? {
                                              background: `color-mix(in oklab, var(--color-bubble-orange) ${30 + (count / max) * 60}%, transparent)`,
                                          }
                                        : undefined
                                }
                            >
                                {count || '·'}
                            </span>
                        );
                    },
                })),
            ]}
        />
    );
}

function SegmentTable({
    rows,
    header,
    labelFor,
}: {
    rows: Segment[];
    header: string;
    labelFor: (label: string) => string;
}) {
    const visible = rows.filter((row) => row.users > 0);
    const max = Math.max(1, ...visible.map((row) => row.users));

    if (visible.length === 0) {
        return (
            <EmptyState
                icon={UsersRound}
                title={tr('No learners match these filters')}
            />
        );
    }

    return (
        <ResponsiveTable
            testId="user-stats-segments"
            rows={visible}
            rowKey={(row) => row.label}
            columns={[
                {
                    key: 'label',
                    header,
                    primary: true,
                    cellClassName:
                        'font-medium whitespace-nowrap text-foreground',
                    cell: (row) => labelFor(row.label),
                },
                {
                    key: 'users',
                    header: tr('Learners'),
                    summary: true,
                    cell: (row) => (
                        <div className="flex items-center gap-2">
                            <div className="h-2 w-24 shrink-0 overflow-hidden rounded-full bg-muted">
                                <div
                                    className="h-full rounded-full bg-primary"
                                    style={{
                                        width: `${(row.users / max) * 100}%`,
                                    }}
                                />
                            </div>
                            <span className="text-foreground tabular-nums">
                                {formatNumber(row.users)}
                            </span>
                        </div>
                    ),
                },
                {
                    key: 'players',
                    header: tr('Have played'),
                    align: 'right',
                    cellClassName:
                        'whitespace-nowrap text-foreground tabular-nums',
                    cell: (row) => (
                        <>
                            {formatNumber(row.players)}
                            <span className="ml-1 text-xs text-muted-foreground">
                                ({Math.round((row.players / row.users) * 100)}%)
                            </span>
                        </>
                    ),
                },
                {
                    key: 'plays',
                    header: tr('Plays'),
                    align: 'right',
                    cellClassName: 'text-foreground tabular-nums',
                    cell: (row) => formatNumber(row.plays),
                },
                {
                    key: 'avg_points',
                    header: tr('Avg points'),
                    align: 'right',
                    cellClassName: 'text-foreground tabular-nums',
                    cell: (row) => row.avg_points,
                },
                {
                    key: 'avg_age',
                    header: tr('Avg age'),
                    align: 'right',
                    cellClassName: 'text-foreground tabular-nums',
                    cell: (row) => row.avg_age ?? '—',
                },
                {
                    key: 'accuracy',
                    header: tr('Accuracy'),
                    align: 'right',
                    cellClassName: 'font-medium tabular-nums',
                    cell: (row) => (
                        <span className={rateTone(row.accuracy)}>
                            {formatPercent(row.accuracy)}
                        </span>
                    ),
                },
            ]}
        />
    );
}

function SchoolTable({ rows }: { rows: SchoolSegment[] }) {
    const max = Math.max(1, ...rows.map((row) => row.users));

    if (rows.length === 0) {
        return (
            <EmptyState
                icon={School}
                title={tr('No schools match these filters')}
            />
        );
    }

    return (
        <ResponsiveTable
            testId="user-stats-schools"
            rows={rows}
            rowKey={(row) => row.label}
            columns={[
                {
                    key: 'school',
                    header: tr('School'),
                    primary: true,
                    cellClassName: 'max-w-64',
                    cell: (row) => (
                        <Link
                            href={`/admin/leaderboard?school=${encodeURIComponent(row.label)}`}
                            className="block font-medium [overflow-wrap:anywhere] text-foreground hover:underline"
                            title={tr(row.label)}
                            onClick={(e) => e.stopPropagation()}
                        >
                            {tr(row.label)}
                        </Link>
                    ),
                },
                {
                    key: 'levels',
                    header: tr('Level'),
                    cell: (row) => (
                        <div className="flex flex-wrap gap-1">
                            {Object.entries(row.levels).map(
                                ([level, count]) => (
                                    <span
                                        key={level}
                                        className="rounded-full px-2 py-0.5 text-xs font-semibold"
                                        style={{
                                            background: `color-mix(in oklab, ${LEVEL_COLORS[level]} 16%, transparent)`,
                                            color: LEVEL_COLORS[level],
                                        }}
                                        title={tr('{0} learners', [count])}
                                    >
                                        {tr(LEVEL_SHORT[level])}
                                    </span>
                                ),
                            )}
                        </div>
                    ),
                },
                {
                    key: 'users',
                    header: tr('Learners'),
                    summary: true,
                    cell: (row) => (
                        <div className="flex items-center gap-2">
                            <div className="h-2 w-20 shrink-0 overflow-hidden rounded-full bg-muted">
                                <div
                                    className="h-full rounded-full bg-primary"
                                    style={{
                                        width: `${(row.users / max) * 100}%`,
                                    }}
                                />
                            </div>
                            <span className="text-foreground tabular-nums">
                                {formatNumber(row.users)}
                            </span>
                        </div>
                    ),
                },
                {
                    key: 'grades',
                    header: tr('Grades'),
                    align: 'right',
                    cellClassName:
                        'whitespace-nowrap text-foreground tabular-nums',
                    cell: (row) =>
                        row.grade_min === null
                            ? '—'
                            : row.grade_min === row.grade_max
                              ? row.grade_min
                              : `${row.grade_min}–${row.grade_max}`,
                },
                {
                    key: 'avg_age',
                    header: tr('Avg age'),
                    align: 'right',
                    cellClassName: 'text-foreground tabular-nums',
                    cell: (row) => row.avg_age ?? '—',
                },
                {
                    key: 'plays',
                    header: tr('Plays'),
                    align: 'right',
                    cellClassName: 'text-foreground tabular-nums',
                    cell: (row) => formatNumber(row.plays),
                },
                {
                    key: 'points',
                    header: tr('Points'),
                    align: 'right',
                    cellClassName: 'font-semibold text-foreground tabular-nums',
                    cell: (row) => formatNumber(row.points),
                },
                {
                    key: 'accuracy',
                    header: tr('Accuracy'),
                    align: 'right',
                    summary: true,
                    cellClassName: 'font-medium tabular-nums',
                    cell: (row) => (
                        <span
                            className={cn(
                                'inline-flex items-center gap-1',
                                rateTone(row.accuracy),
                            )}
                        >
                            <Target className="size-3 opacity-60" />
                            {formatPercent(row.accuracy)}
                        </span>
                    ),
                },
            ]}
        />
    );
}

UserStatistics.layout = (page: ReactNode) => (
    <AdminLayout title={tr('User Statistics')}>{page}</AdminLayout>
);
