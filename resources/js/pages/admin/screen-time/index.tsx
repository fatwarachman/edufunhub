import {
    axisTick,
    chartTooltipStyle,
    GAME_COLORS,
    KpiCard,
    ShareBars,
    timeAgo,
} from '@/components/admin/dashboard-kit';
import {
    EmptyState,
    fieldClass,
    formatNumber,
    gameLabel,
    Panel,
} from '@/components/admin/game-stats';
import { ResponsiveTable } from '@/components/responsive-table';
import AdminLayout from '@/layouts/admin-layout';
import { adminLocale, tr } from '@/lib/admin-i18n';
import { cn } from '@/lib/utils';
import { Deferred, Head, router } from '@inertiajs/react';
import {
    ArrowDown,
    ArrowUp,
    ChevronLeft,
    ChevronRight,
    Clock,
    Flame,
    Grid3x3,
    MonitorSmartphone,
    PieChart,
    Search,
    TriangleAlert,
    UserRound,
    UsersRound,
    X,
} from 'lucide-react';
import { type ReactNode, useEffect, useRef, useState } from 'react';
import {
    Bar,
    BarChart,
    CartesianGrid,
    ReferenceLine,
    ResponsiveContainer,
    Tooltip,
    XAxis,
    YAxis,
} from 'recharts';

type Sort = 'avg' | 'max' | 'over' | 'total' | 'name' | 'last';

interface Filters {
    days: number;
    search: string | null;
    sort: Sort;
    direction: 'asc' | 'desc';
    page: number;
    user: number | null;
}

interface AreaRow {
    area: string;
    category: Category;
    seconds: number;
    users: number;
    accent: string | null;
}

interface Overview {
    summary: {
        total_seconds: number;
        active_users: number;
        user_days: number;
        avg_seconds_per_user_day: number | null;
        over_users: number;
        today_users: number;
        today_over_users: number;
        limit_minutes: number;
    };
    daily: {
        date: string;
        seconds: number;
        users: number;
        avg_seconds: number;
        over_users: number;
    }[];
    areas: AreaRow[];
    heatmap: { weekday: number; hour: number; seconds: number }[];
}

interface UserRow {
    user_id: number;
    name: string;
    account_name: string;
    grade: number | null;
    school_name: string | null;
    total_seconds: number;
    active_days: number;
    avg_seconds: number;
    max_day_seconds: number;
    over_days: number;
    last_day: string;
    last_seen_at: string | null;
}

interface UsersPage {
    data: UserRow[];
    total: number;
    from: number | null;
    to: number | null;
    current_page: number;
    last_page: number;
}

type Category = 'portal' | 'games' | 'chat' | 'character' | 'other';

interface Drilldown {
    user: {
        id: number;
        name: string;
        account_name: string;
        grade: number | null;
        school_name: string | null;
        last_seen_at: string | null;
    };
    summary: {
        total_seconds: number;
        active_days: number;
        avg_seconds: number;
        max_day_seconds: number;
        over_days: number;
    };
    daily: ({ date: string; seconds: number } & Record<Category, number>)[];
    areas: AreaRow[];
}

interface Props {
    filters: Filters;
    limitMinutes: number;
    timezone: string;
    overview?: Overview;
    users?: UsersPage;
    drilldown?: Drilldown | null;
}

const RANGES = [7, 30, 90];

const CATEGORIES: { key: Category; label: string; color: string }[] = [
    { key: 'portal', label: 'Portal', color: 'var(--color-bubble-blue)' },
    { key: 'games', label: 'Games', color: 'var(--color-bubble-orange)' },
    { key: 'chat', label: 'Chat', color: 'var(--color-bubble-pink)' },
    {
        key: 'character',
        label: 'Character',
        color: 'var(--color-bubble-purple)',
    },
    { key: 'other', label: 'Other', color: '#94a3b8' },
];

const AREA_LABELS: Record<string, string> = {
    portal: 'Portal',
    dashboard: 'Dashboard',
    chat: 'Chat',
    character: 'Character',
    vault: 'Vault',
    notifications: 'Notifications',
    gamelist: 'Game list',
    games: 'Game list',
    admin: 'Admin panel',
    teacher: 'Teacher portal',
    settings: 'Settings',
    feedback: 'Feedback',
    home: 'Home',
};

const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

function areaLabel(area: string): string {
    if (area.startsWith('game:')) return gameLabel(area.slice(5));
    return tr(AREA_LABELS[area] ?? area);
}

function areaColor(row: AreaRow): string {
    if (row.area.startsWith('game:')) {
        const key = row.area.slice(5);
        return GAME_COLORS[key] ?? row.accent ?? 'var(--color-bubble-orange)';
    }
    return CATEGORIES.find((c) => c.key === row.category)?.color ?? '#94a3b8';
}

/** 5h 05m · 12m · 0m */
export function formatScreenTime(seconds: number | null | undefined): string {
    if (seconds === null || seconds === undefined) return '—';
    const minutes = Math.round(Math.max(0, seconds) / 60);
    const h = Math.floor(minutes / 60);
    const m = minutes % 60;
    return h > 0 ? `${h}h ${String(m).padStart(2, '0')}m` : `${m}m`;
}

/**
 * Y axis in minutes with round ticks. The limit line is part of the scale
 * once usage gets near it; far below it, the bars keep the full height and
 * the caption names the limit instead.
 */
function minuteScale(
    maxMinutes: number,
    limitMinutes: number,
): { ticks: number[]; showLimit: boolean } {
    const showLimit = maxMinutes >= limitMinutes * 0.4;
    const top = Math.max(
        1,
        showLimit ? Math.max(maxMinutes, limitMinutes) : maxMinutes,
    );
    const step =
        [1, 2, 5, 10, 15, 30, 60, 120, 180, 240].find((s) => top / s <= 5) ??
        360;
    const ticks: number[] = [];
    for (let tick = 0; tick < top + step; tick += step) ticks.push(tick);
    return { ticks, showLimit };
}

const shortDate = (value: string) =>
    new Date(`${value}T00:00:00`).toLocaleDateString(adminLocale(), {
        day: 'numeric',
        month: 'short',
    });

function visit(filters: Filters, changes: Partial<Filters>) {
    const next = { ...filters, page: 1, ...changes };
    const query: Record<string, string | number> = {};
    if (next.days !== 7) query.days = next.days;
    if (next.search) query.search = next.search;
    if (next.sort !== 'avg') query.sort = next.sort;
    if (next.direction !== 'desc') query.direction = next.direction;
    if (next.page > 1) query.page = next.page;
    if (next.user) query.user = next.user;
    router.get('/admin/screen-time', query, {
        preserveScroll: true,
        preserveState: true,
    });
}

export default function ScreenTime({
    filters,
    limitMinutes,
    timezone,
    overview,
    users,
    drilldown,
}: Props) {
    const [search, setSearch] = useState(filters.search ?? '');
    const debounce = useRef<ReturnType<typeof setTimeout> | null>(null);
    const firstRender = useRef(true);
    const drillRef = useRef<HTMLDivElement | null>(null);
    const limitSeconds = limitMinutes * 60;

    useEffect(() => {
        if (firstRender.current) {
            firstRender.current = false;
            return;
        }
        if (debounce.current) clearTimeout(debounce.current);
        debounce.current = setTimeout(
            () => visit(filters, { search: search.trim() || null }),
            400,
        );
        return () => {
            if (debounce.current) clearTimeout(debounce.current);
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [search]);

    useEffect(() => {
        if (drilldown && drillRef.current) {
            drillRef.current.scrollIntoView({
                behavior: 'smooth',
                block: 'start',
            });
        }
    }, [drilldown]);

    return (
        <>
            <Head title={tr('Screen Time')} />
            <div className="flex flex-col gap-6">
                <div className="flex flex-col gap-1">
                    <h2 className="font-display text-2xl font-bold text-foreground">
                        {tr('Screen Time')}
                    </h2>
                    <p className="text-sm text-muted-foreground">
                        {tr(
                            'Active time signed-in users keep the app open (visible tab with recent input). Healthy is under {0} per day. Days follow {1}.',
                            [formatScreenTime(limitSeconds), timezone],
                        )}
                    </p>
                </div>

                <div
                    className="flex flex-wrap items-center gap-2 rounded-2xl border border-border bg-card p-3 shadow-sm"
                    data-testid="screen-time-filters"
                >
                    <div
                        className="inline-flex rounded-lg border border-border bg-background p-1"
                        role="group"
                        aria-label={tr('Time range')}
                    >
                        {RANGES.map((range) => (
                            <button
                                key={range}
                                type="button"
                                onClick={() => visit(filters, { days: range })}
                                aria-pressed={filters.days === range}
                                className={cn(
                                    'rounded-md px-3 py-1 text-sm font-medium transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none',
                                    filters.days === range
                                        ? 'bg-primary text-primary-foreground'
                                        : 'text-muted-foreground hover:text-foreground',
                                )}
                            >
                                {tr('{0} days', [range])}
                            </button>
                        ))}
                    </div>
                    <div className="relative min-w-0 flex-1 sm:max-w-xs">
                        <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
                        <input
                            value={search}
                            onChange={(event) => setSearch(event.target.value)}
                            placeholder={tr('Search name, nickname or school')}
                            aria-label={tr('Search users')}
                            className={`${fieldClass} w-full pl-9`}
                            data-testid="screen-time-search"
                        />
                    </div>
                </div>

                <Deferred data="overview" fallback={<OverviewSkeleton />}>
                    {overview ? (
                        <OverviewSections
                            overview={overview}
                            days={filters.days}
                            limitSeconds={limitSeconds}
                        />
                    ) : (
                        <OverviewSkeleton />
                    )}
                </Deferred>

                <Deferred
                    data={['users', 'drilldown']}
                    fallback={<SkeletonBlock className="h-96" />}
                >
                    <>
                        {drilldown && (
                            <div ref={drillRef} className="scroll-mt-20">
                                <UserDrilldown
                                    data={drilldown}
                                    limitSeconds={limitSeconds}
                                    days={filters.days}
                                    onClose={() =>
                                        visit(filters, {
                                            user: null,
                                            page: filters.page,
                                        })
                                    }
                                />
                            </div>
                        )}
                        {users && (
                            <UsersTable
                                users={users}
                                filters={filters}
                                limitSeconds={limitSeconds}
                            />
                        )}
                    </>
                </Deferred>
            </div>
        </>
    );
}

function SkeletonBlock({ className }: { className?: string }) {
    return (
        <div
            className={cn(
                'animate-pulse rounded-2xl border border-border bg-muted/60',
                className,
            )}
        />
    );
}

function OverviewSkeleton() {
    return (
        <div className="flex flex-col gap-6" aria-busy="true">
            <div className="grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4">
                {[0, 1, 2, 3].map((i) => (
                    <SkeletonBlock key={i} className="h-32" />
                ))}
            </div>
            <div className="grid grid-cols-1 gap-6 lg:grid-cols-5">
                <SkeletonBlock className="h-72 lg:col-span-3" />
                <SkeletonBlock className="h-72 lg:col-span-2" />
            </div>
        </div>
    );
}

function OverviewSections({
    overview,
    days,
    limitSeconds,
}: {
    overview: Overview;
    days: number;
    limitSeconds: number;
}) {
    const { summary } = overview;
    const limitMinutes = limitSeconds / 60;
    const chartData = overview.daily.map((day) => ({
        ...day,
        minutes: Math.round(day.avg_seconds / 6) / 10,
    }));
    const scale = minuteScale(
        Math.max(0, ...chartData.map((d) => d.minutes)),
        limitMinutes,
    );

    const categoryRows = CATEGORIES.map((category) => ({
        key: category.key,
        label: tr(category.label),
        color: category.color,
        value: Math.round(
            overview.areas
                .filter((row) => row.category === category.key)
                .reduce((sum, row) => sum + row.seconds, 0) / 60,
        ),
    })).filter((row) => row.value > 0);
    const gameRows = overview.areas.filter((row) =>
        row.area.startsWith('game:'),
    );
    const maxGame = Math.max(1, ...gameRows.map((row) => row.seconds));

    return (
        <div className="flex flex-col gap-6">
            <div
                className="grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4"
                data-testid="screen-time-kpis"
            >
                <KpiCard
                    label="Avg per user / day"
                    value={formatScreenTime(summary.avg_seconds_per_user_day)}
                    icon={Clock}
                    accent="#6366f1"
                    footer={
                        <span className="text-xs text-muted-foreground">
                            {tr('Healthy under {0}', [
                                formatScreenTime(limitSeconds),
                            ])}
                        </span>
                    }
                />
                <KpiCard
                    label="Total screen time"
                    value={formatScreenTime(summary.total_seconds)}
                    icon={MonitorSmartphone}
                    accent="#10b981"
                    footer={
                        <span className="text-xs text-muted-foreground">
                            {tr('{0} user-days', [
                                formatNumber(summary.user_days),
                            ])}
                        </span>
                    }
                />
                <KpiCard
                    label="Over limit today"
                    value={
                        <span
                            className={cn(
                                summary.today_over_users > 0 &&
                                    'text-red-600 dark:text-red-400',
                            )}
                        >
                            {formatNumber(summary.today_over_users)}
                        </span>
                    }
                    icon={TriangleAlert}
                    accent="#ef4444"
                    footer={
                        <span className="text-xs text-muted-foreground">
                            {tr('{0} in the last {1} days', [
                                formatNumber(summary.over_users),
                                days,
                            ])}
                        </span>
                    }
                />
                <KpiCard
                    label="Active users"
                    value={formatNumber(summary.active_users)}
                    icon={UsersRound}
                    accent="#f59e0b"
                    footer={
                        <span className="text-xs text-muted-foreground">
                            {tr('{0} today', [
                                formatNumber(summary.today_users),
                            ])}
                        </span>
                    }
                />
            </div>

            <div className="grid grid-cols-1 gap-6 lg:grid-cols-5">
                <Panel
                    title="Daily trend"
                    description={tr(
                        'Average minutes per active user · red dashed line = {0} limit (shown once usage gets close)',
                        [formatScreenTime(limitSeconds)],
                    )}
                    icon={Clock}
                    className="lg:col-span-3"
                >
                    <div className="h-60" data-testid="screen-time-daily">
                        <ResponsiveContainer width="100%" height="100%">
                            <BarChart
                                data={chartData}
                                margin={{
                                    top: 8,
                                    right: 4,
                                    left: -14,
                                    bottom: 0,
                                }}
                            >
                                <CartesianGrid
                                    vertical={false}
                                    stroke="var(--border)"
                                />
                                <XAxis
                                    dataKey="date"
                                    tick={axisTick}
                                    tickLine={false}
                                    axisLine={false}
                                    minTickGap={18}
                                    tickFormatter={shortDate}
                                />
                                <YAxis
                                    tick={axisTick}
                                    tickLine={false}
                                    axisLine={false}
                                    allowDecimals={false}
                                    domain={[
                                        0,
                                        scale.ticks[scale.ticks.length - 1],
                                    ]}
                                    ticks={scale.ticks}
                                />
                                <Tooltip
                                    contentStyle={chartTooltipStyle}
                                    cursor={{ fill: 'var(--muted)' }}
                                    labelFormatter={(value) =>
                                        shortDate(String(value))
                                    }
                                    formatter={(_value, _name, item) => {
                                        const row =
                                            item.payload as (typeof chartData)[number];
                                        return [
                                            tr(
                                                '{0} avg · {1} users · {2} over limit',
                                                [
                                                    formatScreenTime(
                                                        row.avg_seconds,
                                                    ),
                                                    row.users,
                                                    row.over_users,
                                                ],
                                            ),
                                            '',
                                        ];
                                    }}
                                />
                                {scale.showLimit && (
                                    <ReferenceLine
                                        y={limitMinutes}
                                        stroke="#ef4444"
                                        strokeDasharray="4 4"
                                        label={{
                                            value: formatScreenTime(
                                                limitSeconds,
                                            ),
                                            position: 'insideTopRight',
                                            fill: 'var(--muted-foreground)',
                                            fontSize: 11,
                                        }}
                                    />
                                )}
                                <Bar
                                    dataKey="minutes"
                                    fill="#6366f1"
                                    radius={[4, 4, 0, 0]}
                                />
                            </BarChart>
                        </ResponsiveContainer>
                    </div>
                </Panel>

                <Panel
                    title="Where time goes"
                    description="Minutes per area in this range"
                    icon={PieChart}
                    className="lg:col-span-2"
                >
                    <div
                        className="flex flex-col gap-5"
                        data-testid="screen-time-areas"
                    >
                        <ShareBars
                            rows={categoryRows}
                            emptyLabel={tr('No screen time recorded yet')}
                        />
                        {gameRows.length > 0 && (
                            <div className="flex flex-col gap-2.5 border-t border-border pt-4">
                                <p className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
                                    {tr('Games')}
                                </p>
                                <ul className="flex flex-col gap-2">
                                    {gameRows.slice(0, 8).map((row) => (
                                        <li
                                            key={row.area}
                                            className="flex flex-col gap-1"
                                        >
                                            <div className="flex items-center justify-between gap-2 text-sm">
                                                <span className="min-w-0 truncate text-foreground">
                                                    {areaLabel(row.area)}
                                                </span>
                                                <span className="font-semibold text-foreground tabular-nums">
                                                    {formatScreenTime(
                                                        row.seconds,
                                                    )}
                                                </span>
                                            </div>
                                            <div className="h-1.5 overflow-hidden rounded-full bg-muted">
                                                <div
                                                    className="h-full rounded-full"
                                                    style={{
                                                        width: `${(row.seconds / maxGame) * 100}%`,
                                                        background:
                                                            areaColor(row),
                                                    }}
                                                />
                                            </div>
                                        </li>
                                    ))}
                                </ul>
                            </div>
                        )}
                    </div>
                </Panel>
            </div>

            <Panel
                title="When users are on screen"
                description="Active minutes by weekday and hour (session start, local time)"
                icon={Grid3x3}
            >
                <Heatmap cells={overview.heatmap} />
            </Panel>
        </div>
    );
}

function Heatmap({ cells }: { cells: Overview['heatmap'] }) {
    const grid = Array.from({ length: 7 }, () => Array<number>(24).fill(0));
    for (const cell of cells) {
        if (grid[cell.weekday]) grid[cell.weekday][cell.hour] += cell.seconds;
    }
    const max = Math.max(0, ...grid.flat());
    if (max === 0) {
        return (
            <EmptyState
                icon={Grid3x3}
                title={tr('No screen time recorded yet')}
            />
        );
    }

    return (
        <div className="flex flex-col gap-2" data-testid="screen-time-heatmap">
            <div className="grid grid-cols-[2rem_minmax(0,1fr)] gap-x-2 gap-y-1 sm:grid-cols-[2.5rem_minmax(0,1fr)]">
                {grid.map((row, weekday) => (
                    <HeatRow key={weekday} label={WEEKDAYS[weekday]}>
                        {row.map((seconds, hour) => (
                            <span
                                key={hour}
                                title={`${tr(WEEKDAYS[weekday])} ${String(hour).padStart(2, '0')}:00 · ${formatScreenTime(seconds)}`}
                                className="aspect-square min-w-0 rounded-[3px] bg-muted"
                                style={
                                    seconds > 0
                                        ? {
                                              background: `color-mix(in oklab, #6366f1 ${Math.round(15 + (seconds / max) * 85)}%, transparent)`,
                                          }
                                        : undefined
                                }
                            />
                        ))}
                    </HeatRow>
                ))}
                <span />
                <div className="grid grid-cols-4 text-[10px] text-muted-foreground tabular-nums sm:text-xs">
                    {[0, 6, 12, 18].map((hour) => (
                        <span key={hour}>
                            {String(hour).padStart(2, '0')}:00
                        </span>
                    ))}
                </div>
            </div>
            <div className="flex items-center justify-end gap-1.5 text-xs text-muted-foreground">
                {tr('Less')}
                <span className="size-3 rounded-[3px] bg-muted" />
                {[15, 40, 65, 100].map((pct) => (
                    <span
                        key={pct}
                        className="size-3 rounded-[3px]"
                        style={{
                            background: `color-mix(in oklab, #6366f1 ${pct}%, transparent)`,
                        }}
                    />
                ))}
                {tr('More')}
            </div>
        </div>
    );
}

function HeatRow({ label, children }: { label: string; children: ReactNode }) {
    return (
        <>
            <span className="self-center text-[10px] font-medium text-muted-foreground sm:text-xs">
                {tr(label)}
            </span>
            <div className="grid grid-cols-[repeat(24,minmax(0,1fr))] gap-[2px] sm:gap-1">
                {children}
            </div>
        </>
    );
}

function OverBadge({ count }: { count: number }) {
    return count > 0 ? (
        <span className="inline-flex items-center gap-1 rounded-full bg-red-500/10 px-2 py-0.5 text-xs font-semibold text-red-700 tabular-nums dark:bg-red-500/15 dark:text-red-300">
            <Flame className="size-3" />
            {count}
        </span>
    ) : (
        <span className="text-xs text-muted-foreground tabular-nums">0</span>
    );
}

function profileLine(row: {
    grade: number | null;
    school_name: string | null;
}): string {
    return (
        [
            row.grade !== null ? tr('Grade {0}', [row.grade]) : null,
            row.school_name,
        ]
            .filter(Boolean)
            .join(' · ') || '—'
    );
}

function UsersTable({
    users,
    filters,
    limitSeconds,
}: {
    users: UsersPage;
    filters: Filters;
    limitSeconds: number;
}) {
    const sortBy = (sort: Sort) =>
        visit(filters, {
            sort,
            direction:
                filters.sort === sort && filters.direction === 'desc'
                    ? 'asc'
                    : 'desc',
        });
    const open = (userId: number) =>
        visit(filters, { user: userId, page: filters.page });

    const header = (sort: Sort, label: string) => {
        const active = filters.sort === sort;
        const Arrow = filters.direction === 'asc' ? ArrowUp : ArrowDown;
        return (
            <button
                type="button"
                onClick={() => sortBy(sort)}
                aria-pressed={active}
                className={cn(
                    'inline-flex items-center gap-1 rounded uppercase hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none',
                    active && 'text-foreground',
                )}
            >
                {tr(label)}
                {active && <Arrow className="size-3" />}
            </button>
        );
    };

    return (
        <Panel
            title="Users"
            description={tr(
                'Average per active day · red badge = days at or over {0}. Open a row for the daily breakdown.',
                [formatScreenTime(limitSeconds)],
            )}
            icon={UsersRound}
        >
            {users.data.length === 0 ? (
                <EmptyState
                    icon={UsersRound}
                    title={tr('No users found')}
                    description={tr('Change the range or search.')}
                />
            ) : (
                <div className="group/screen flex flex-col gap-4">
                    <label className="hidden items-center gap-2 text-xs text-muted-foreground group-has-[[data-layout=accordion]]/screen:flex">
                        {tr('Sort by')}
                        <select
                            value={filters.sort}
                            onChange={(event) =>
                                visit(filters, {
                                    sort: event.target.value as Sort,
                                    direction:
                                        event.target.value === 'name'
                                            ? 'asc'
                                            : 'desc',
                                })
                            }
                            className={cn(fieldClass, 'h-8 flex-1')}
                        >
                            <option value="avg">{tr('Avg / day')}</option>
                            <option value="max">{tr('Max day')}</option>
                            <option value="over">
                                {tr('Days over limit')}
                            </option>
                            <option value="last">{tr('Last active')}</option>
                            <option value="name">{tr('Name')}</option>
                        </select>
                    </label>
                    <ResponsiveTable
                        testId="screen-time-table"
                        rows={users.data}
                        rowKey={(row) => row.user_id}
                        onRowClick={(row) => open(row.user_id)}
                        rowAriaLabel={(row) =>
                            tr('Open daily breakdown of {0}', [row.name])
                        }
                        rowClassName={(row) =>
                            filters.user === row.user_id
                                ? 'bg-muted/50'
                                : undefined
                        }
                        columns={[
                            {
                                key: 'name',
                                header: header('name', 'Name'),
                                label: tr('Name'),
                                primary: true,
                                cell: (row) => (
                                    <span
                                        className="block max-w-[14rem] font-medium [overflow-wrap:anywhere] text-foreground"
                                        data-testid={`screen-time-user-${row.user_id}`}
                                    >
                                        {row.name}
                                    </span>
                                ),
                            },
                            {
                                key: 'profile',
                                header: tr('Grade / school'),
                                cellClassName:
                                    'max-w-[14rem] text-muted-foreground',
                                cell: (row) => (
                                    <span className="line-clamp-2">
                                        {profileLine(row)}
                                    </span>
                                ),
                            },
                            {
                                key: 'avg',
                                header: header('avg', 'Avg / day'),
                                label: tr('Avg / day'),
                                align: 'right',
                                summary: true,
                                cellClassName: 'font-semibold tabular-nums',
                                cell: (row) => (
                                    <span
                                        className={
                                            row.avg_seconds >= limitSeconds
                                                ? 'text-red-600 dark:text-red-400'
                                                : 'text-foreground'
                                        }
                                    >
                                        {formatScreenTime(row.avg_seconds)}
                                    </span>
                                ),
                            },
                            {
                                key: 'max',
                                header: header('max', 'Max day'),
                                label: tr('Max day'),
                                align: 'right',
                                cellClassName: 'text-foreground tabular-nums',
                                cell: (row) =>
                                    formatScreenTime(row.max_day_seconds),
                            },
                            {
                                key: 'over',
                                header: header('over', 'Days over limit'),
                                label: tr('Days over limit'),
                                align: 'right',
                                summary: true,
                                cell: (row) => (
                                    <OverBadge count={row.over_days} />
                                ),
                            },
                            {
                                key: 'last',
                                header: header('last', 'Last active'),
                                label: tr('Last active'),
                                align: 'right',
                                cellClassName: 'text-muted-foreground',
                                cell: (row) =>
                                    row.last_seen_at
                                        ? timeAgo(row.last_seen_at)
                                        : shortDate(row.last_day),
                            },
                        ]}
                    />

                    <div className="flex flex-wrap items-center justify-between gap-3">
                        <p className="text-sm text-muted-foreground tabular-nums">
                            {users.from}–{users.to} {tr('of')} {users.total}
                        </p>
                        <div className="flex items-center gap-2">
                            <PageButton
                                disabled={users.current_page <= 1}
                                onClick={() =>
                                    visit(filters, {
                                        page: users.current_page - 1,
                                    })
                                }
                            >
                                <ChevronLeft className="size-4" />
                                {tr('Prev')}
                            </PageButton>
                            <PageButton
                                disabled={users.current_page >= users.last_page}
                                onClick={() =>
                                    visit(filters, {
                                        page: users.current_page + 1,
                                    })
                                }
                            >
                                {tr('Next')}
                                <ChevronRight className="size-4" />
                            </PageButton>
                        </div>
                    </div>
                </div>
            )}
        </Panel>
    );
}

function PageButton({
    disabled,
    onClick,
    children,
}: {
    disabled: boolean;
    onClick: () => void;
    children: ReactNode;
}) {
    return (
        <button
            type="button"
            disabled={disabled}
            onClick={onClick}
            className="inline-flex h-9 items-center gap-1 rounded-lg border border-border px-3 text-sm font-medium text-foreground hover:bg-muted disabled:pointer-events-none disabled:opacity-40"
        >
            {children}
        </button>
    );
}

function UserDrilldown({
    data,
    limitSeconds,
    days,
    onClose,
}: {
    data: Drilldown;
    limitSeconds: number;
    days: number;
    onClose: () => void;
}) {
    const limitMinutes = limitSeconds / 60;
    const chartData = data.daily.map((day) => ({
        date: day.date,
        seconds: day.seconds,
        ...Object.fromEntries(
            CATEGORIES.map((c) => [c.key, Math.round(day[c.key] / 6) / 10]),
        ),
    }));
    const scale = minuteScale(
        Math.max(0, ...data.daily.map((d) => d.seconds / 60)),
        limitMinutes,
    );
    const areaRows = data.areas.map((row) => ({
        key: row.area,
        label: areaLabel(row.area),
        color: areaColor(row),
        value: Math.round(row.seconds / 60),
    }));

    return (
        <Panel
            title={tr('Screen time of {0}', [data.user.name])}
            description={`${profileLine(data.user)} · ${tr('last {0} days', [days])}`}
            icon={UserRound}
            actions={
                <button
                    type="button"
                    onClick={onClose}
                    aria-label={tr('Close')}
                    className="inline-flex size-8 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground"
                    data-testid="screen-time-drilldown-close"
                >
                    <X className="size-4" />
                </button>
            }
        >
            <div
                className="flex flex-col gap-5"
                data-testid="screen-time-drilldown"
            >
                <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                    <Fact label="Avg / day">
                        {formatScreenTime(data.summary.avg_seconds)}
                    </Fact>
                    <Fact label="Max day">
                        {formatScreenTime(data.summary.max_day_seconds)}
                    </Fact>
                    <Fact label="Days over limit">
                        <OverBadge count={data.summary.over_days} />
                    </Fact>
                    <Fact label="Active days">{data.summary.active_days}</Fact>
                </dl>
                <div className="grid grid-cols-1 gap-6 lg:grid-cols-5">
                    <div className="h-56 min-w-0 lg:col-span-3">
                        <ResponsiveContainer width="100%" height="100%">
                            <BarChart
                                data={chartData}
                                margin={{
                                    top: 8,
                                    right: 4,
                                    left: -14,
                                    bottom: 0,
                                }}
                            >
                                <CartesianGrid
                                    vertical={false}
                                    stroke="var(--border)"
                                />
                                <XAxis
                                    dataKey="date"
                                    tick={axisTick}
                                    tickLine={false}
                                    axisLine={false}
                                    minTickGap={18}
                                    tickFormatter={shortDate}
                                />
                                <YAxis
                                    tick={axisTick}
                                    tickLine={false}
                                    axisLine={false}
                                    allowDecimals={false}
                                    domain={[
                                        0,
                                        scale.ticks[scale.ticks.length - 1],
                                    ]}
                                    ticks={scale.ticks}
                                />
                                <Tooltip
                                    contentStyle={chartTooltipStyle}
                                    cursor={{ fill: 'var(--muted)' }}
                                    labelFormatter={(value) =>
                                        shortDate(String(value))
                                    }
                                    formatter={(value, name) => [
                                        `${value}m`,
                                        tr(
                                            CATEGORIES.find(
                                                (c) => c.key === name,
                                            )?.label ?? String(name),
                                        ),
                                    ]}
                                />
                                {scale.showLimit && (
                                    <ReferenceLine
                                        y={limitMinutes}
                                        stroke="#ef4444"
                                        strokeDasharray="4 4"
                                        label={{
                                            value: formatScreenTime(
                                                limitSeconds,
                                            ),
                                            position: 'insideTopRight',
                                            fill: 'var(--muted-foreground)',
                                            fontSize: 11,
                                        }}
                                    />
                                )}
                                {CATEGORIES.map((category, index) => (
                                    <Bar
                                        key={category.key}
                                        dataKey={category.key}
                                        stackId="day"
                                        fill={category.color}
                                        radius={
                                            index === CATEGORIES.length - 1
                                                ? [4, 4, 0, 0]
                                                : undefined
                                        }
                                    />
                                ))}
                            </BarChart>
                        </ResponsiveContainer>
                    </div>
                    <div className="min-w-0 lg:col-span-2">
                        <ShareBars
                            rows={areaRows}
                            emptyLabel={tr('No screen time recorded yet')}
                        />
                    </div>
                </div>
            </div>
        </Panel>
    );
}

function Fact({ label, children }: { label: string; children: ReactNode }) {
    return (
        <div className="flex flex-col gap-0.5 rounded-xl border border-border bg-muted/30 px-3 py-2">
            <dt className="text-[11px] font-semibold tracking-wide text-muted-foreground uppercase">
                {tr(label)}
            </dt>
            <dd className="font-semibold text-foreground tabular-nums">
                {children}
            </dd>
        </div>
    );
}

ScreenTime.layout = (page: ReactNode) => (
    <AdminLayout title={tr('Screen Time')}>{page}</AdminLayout>
);
