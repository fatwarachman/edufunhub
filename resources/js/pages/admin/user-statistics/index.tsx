import {
    axisTick,
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
import AdminLayout from '@/layouts/admin-layout';
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
            <Head title="User Statistics" />
            <div className="flex flex-col gap-6">
                <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
                    <div className="flex flex-col gap-1">
                        <h2 className="font-display text-2xl font-bold text-foreground">
                            User Statistics
                        </h2>
                        <p className="text-sm text-muted-foreground">
                            Learner profiles by school, grade and age with their
                            game results (super admins excluded).
                        </p>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                        <div
                            className="inline-flex rounded-lg border border-border bg-card p-1"
                            role="group"
                            aria-label="School level"
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
                                    {level ? LEVEL_SHORT[level] : 'All levels'}
                                </button>
                            ))}
                        </div>
                        <div className="relative">
                            <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
                            <input
                                type="search"
                                aria-label="Filter by school"
                                value={school}
                                onChange={(e) => setSchool(e.target.value)}
                                placeholder="Filter by school…"
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
                                Reset
                            </button>
                        )}
                    </div>
                </div>

                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
                    <KpiCard
                        label="Learners"
                        value={formatNumber(summary.users)}
                        icon={Users}
                        accent="var(--color-bubble-orange)"
                        footer={
                            <span className="text-xs text-muted-foreground">
                                {formatNumber(summary.complete)} complete
                                profiles (
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
                        label="Have played"
                        value={formatNumber(summary.players)}
                        icon={UserCheck}
                        accent="var(--color-bubble-green)"
                        footer={
                            <span className="text-xs text-muted-foreground">
                                {formatNumber(summary.active_30d)} active in 30
                                days · {formatNumber(summary.plays)} plays
                            </span>
                        }
                    />
                    <KpiCard
                        label="Schools"
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
                                learners per school
                            </span>
                        }
                    />
                    <KpiCard
                        label="Average age"
                        value={summary.avg_age ?? '—'}
                        icon={Cake}
                        accent="var(--color-bubble-purple)"
                        footer={
                            <span className="text-xs text-muted-foreground">
                                Median {summary.median_age ?? '—'} years
                            </span>
                        }
                    />
                </div>

                <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
                    <Panel
                        title="School level"
                        description="Share of learners per school level"
                        icon={GraduationCap}
                    >
                        <ShareBars
                            rows={stats.byLevel.map((row) => ({
                                key: row.label,
                                label: LEVEL_LABELS[row.label] ?? row.label,
                                value: row.users,
                                color: LEVEL_COLORS[row.label],
                            }))}
                            emptyLabel="No learners match these filters"
                        />
                    </Panel>
                    <Panel
                        title="Learners per grade"
                        description="Registered learners vs. learners who have played"
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
                                            {LEVEL_SHORT[level]}
                                        </span>
                                    ),
                                )}
                                <span className="inline-flex items-center gap-1">
                                    <span className="size-2 rounded-full bg-bubble-orange/60" />
                                    Have played
                                </span>
                            </span>
                        }
                    >
                        <div className="h-56">
                            <ResponsiveContainer width="100%" height="100%">
                                <BarChart
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
                                        labelFormatter={(v) => `Grade ${v}`}
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
                        title="Age distribution"
                        description="Learners per year of age"
                        icon={Cake}
                        className="lg:col-span-3"
                    >
                        <div className="h-56">
                            <ResponsiveContainer width="100%" height="100%">
                                <BarChart
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
                                        labelFormatter={(v) => `Age ${v}`}
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
                        title="Grade × age"
                        description="Spot learners whose age does not fit their grade"
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
                            aria-label="Breakdown"
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
                                    {item.label}
                                </button>
                            ))}
                        </div>
                        <span className="text-xs text-muted-foreground">
                            Accuracy = correct answers ÷ all answers in recorded
                            games
                        </span>
                    </header>
                    <div className="p-5">
                        {tab === 'school' && (
                            <SchoolTable rows={stats.bySchool} />
                        )}
                        {tab === 'grade' && (
                            <SegmentTable
                                rows={stats.byGrade}
                                header="Grade"
                                labelFor={(label) =>
                                    label === 'unknown'
                                        ? 'Not set'
                                        : `Grade ${label}`
                                }
                            />
                        )}
                        {tab === 'age' && (
                            <SegmentTable
                                rows={stats.byAgeGroup}
                                header="Age group"
                                labelFor={(label) =>
                                    label === 'unknown'
                                        ? 'Not set'
                                        : `${label} years`
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
                title="No learners with both grade and age"
            />
        );
    }

    return (
        <div className="overflow-x-auto">
            <table className="w-full min-w-[320px] border-separate border-spacing-1 text-xs">
                <thead>
                    <tr>
                        <th className="text-left font-medium text-muted-foreground">
                            Grade
                        </th>
                        {matrix.columns.map((column) => (
                            <th
                                key={column}
                                className="font-medium text-muted-foreground"
                            >
                                {column}
                            </th>
                        ))}
                    </tr>
                </thead>
                <tbody>
                    {matrix.rows.map((row) => (
                        <tr key={row.grade}>
                            <td className="pr-1 font-medium text-foreground tabular-nums">
                                {row.grade}
                            </td>
                            {row.counts.map((count, index) => (
                                <td
                                    key={index}
                                    title={`Grade ${row.grade}, age ${matrix.columns[index]}: ${count}`}
                                    className={cn(
                                        'h-6 rounded-md text-center tabular-nums',
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
                                </td>
                            ))}
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
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
                title="No learners match these filters"
            />
        );
    }

    return (
        <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] text-sm">
                <thead>
                    <tr className="border-b border-border text-xs tracking-wider text-muted-foreground uppercase">
                        <th className="py-2 pr-3 text-left font-medium">
                            {header}
                        </th>
                        <th className="px-3 py-2 text-left font-medium">
                            Learners
                        </th>
                        <th className="px-3 py-2 text-right font-medium">
                            Have played
                        </th>
                        <th className="px-3 py-2 text-right font-medium">
                            Plays
                        </th>
                        <th className="px-3 py-2 text-right font-medium">
                            Avg points
                        </th>
                        <th className="px-3 py-2 text-right font-medium">
                            Avg age
                        </th>
                        <th className="py-2 pl-3 text-right font-medium">
                            Accuracy
                        </th>
                    </tr>
                </thead>
                <tbody className="divide-y divide-border">
                    {visible.map((row) => (
                        <tr key={row.label}>
                            <td className="py-2.5 pr-3 font-medium whitespace-nowrap text-foreground">
                                {labelFor(row.label)}
                            </td>
                            <td className="px-3 py-2.5">
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
                            </td>
                            <td className="px-3 py-2.5 text-right text-foreground tabular-nums">
                                {formatNumber(row.players)}
                                <span className="ml-1 text-xs text-muted-foreground">
                                    (
                                    {Math.round(
                                        (row.players / row.users) * 100,
                                    )}
                                    %)
                                </span>
                            </td>
                            <td className="px-3 py-2.5 text-right text-foreground tabular-nums">
                                {formatNumber(row.plays)}
                            </td>
                            <td className="px-3 py-2.5 text-right text-foreground tabular-nums">
                                {row.avg_points}
                            </td>
                            <td className="px-3 py-2.5 text-right text-foreground tabular-nums">
                                {row.avg_age ?? '—'}
                            </td>
                            <td
                                className={cn(
                                    'py-2.5 pl-3 text-right font-medium tabular-nums',
                                    rateTone(row.accuracy),
                                )}
                            >
                                {formatPercent(row.accuracy)}
                            </td>
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    );
}

function SchoolTable({ rows }: { rows: SchoolSegment[] }) {
    const max = Math.max(1, ...rows.map((row) => row.users));

    if (rows.length === 0) {
        return (
            <EmptyState icon={School} title="No schools match these filters" />
        );
    }

    return (
        <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] text-sm">
                <thead>
                    <tr className="border-b border-border text-xs tracking-wider text-muted-foreground uppercase">
                        <th className="py-2 pr-3 text-left font-medium">
                            School
                        </th>
                        <th className="px-3 py-2 text-left font-medium">
                            Level
                        </th>
                        <th className="px-3 py-2 text-left font-medium">
                            Learners
                        </th>
                        <th className="px-3 py-2 text-right font-medium">
                            Grades
                        </th>
                        <th className="px-3 py-2 text-right font-medium">
                            Avg age
                        </th>
                        <th className="px-3 py-2 text-right font-medium">
                            Plays
                        </th>
                        <th className="px-3 py-2 text-right font-medium">
                            Points
                        </th>
                        <th className="py-2 pl-3 text-right font-medium">
                            Accuracy
                        </th>
                    </tr>
                </thead>
                <tbody className="divide-y divide-border">
                    {rows.map((row) => (
                        <tr key={row.label}>
                            <td className="max-w-64 py-2.5 pr-3">
                                <Link
                                    href={`/admin/leaderboard?school=${encodeURIComponent(row.label)}`}
                                    className="block truncate font-medium text-foreground hover:underline"
                                    title={row.label}
                                >
                                    {row.label}
                                </Link>
                            </td>
                            <td className="px-3 py-2.5">
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
                                                title={`${count} learners`}
                                            >
                                                {LEVEL_SHORT[level]}
                                            </span>
                                        ),
                                    )}
                                </div>
                            </td>
                            <td className="px-3 py-2.5">
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
                            </td>
                            <td className="px-3 py-2.5 text-right whitespace-nowrap text-foreground tabular-nums">
                                {row.grade_min === null
                                    ? '—'
                                    : row.grade_min === row.grade_max
                                      ? row.grade_min
                                      : `${row.grade_min}–${row.grade_max}`}
                            </td>
                            <td className="px-3 py-2.5 text-right text-foreground tabular-nums">
                                {row.avg_age ?? '—'}
                            </td>
                            <td className="px-3 py-2.5 text-right text-foreground tabular-nums">
                                {formatNumber(row.plays)}
                            </td>
                            <td className="px-3 py-2.5 text-right font-semibold text-foreground tabular-nums">
                                {formatNumber(row.points)}
                            </td>
                            <td
                                className={cn(
                                    'py-2.5 pl-3 text-right font-medium tabular-nums',
                                    rateTone(row.accuracy),
                                )}
                            >
                                <span className="inline-flex items-center gap-1">
                                    <Target className="size-3 opacity-60" />
                                    {formatPercent(row.accuracy)}
                                </span>
                            </td>
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    );
}

UserStatistics.layout = (page: ReactNode) => (
    <AdminLayout title="User Statistics">{page}</AdminLayout>
);
