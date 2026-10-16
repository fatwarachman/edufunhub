import {
    axisTick,
    chartTooltipStyle,
    UserAvatar,
} from '@/components/admin/dashboard-kit';
import { DEVICE_META, type DeviceType } from '@/components/admin/device-usage';
import { EmptyState, formatNumber, Panel } from '@/components/admin/game-stats';
import { ResponsiveTable } from '@/components/responsive-table';
import AdminLayout from '@/layouts/admin-layout';
import { adminLocale, tr } from '@/lib/admin-i18n';
import { Head, Link, router } from '@inertiajs/react';
import {
    AppWindow,
    Globe,
    LineChart as LineChartIcon,
    MonitorSmartphone,
    Users,
    X,
} from 'lucide-react';
import { type ReactNode } from 'react';
import {
    Bar,
    BarChart,
    CartesianGrid,
    Cell,
    Line,
    LineChart,
    Pie,
    PieChart,
    ResponsiveContainer,
    Tooltip,
    XAxis,
    YAxis,
} from 'recharts';

interface ChartRow {
    name: string;
    accesses: number;
    users?: number;
}

interface DeviceUser {
    id: number;
    name: string;
    email: string;
    avatar_url: string | null;
    accesses: number;
    roles: string[];
    latest: {
        os: string;
        device_type: string;
        browser: string;
        accessed_at: string;
    } | null;
}

interface Props {
    days: number;
    filters: { os: string | null; device: string | null; role: string | null };
    options: { os: string[]; roles: { name: string; slug: string }[] };
    totals: { accesses: number; users: number };
    charts: {
        daily: { date: string; accesses: number; users: number }[];
        os: ChartRow[];
        devices: ChartRow[];
        browsers: ChartRow[];
    };
    users: {
        data: DeviceUser[];
        current_page: number;
        last_page: number;
        total: number;
        from: number | null;
        to: number | null;
    };
}

const PALETTE = [
    '#2563eb',
    '#16a34a',
    '#f59e0b',
    '#db2777',
    '#7c3aed',
    '#0891b2',
    '#dc2626',
    '#65a30d',
];
const DAY_OPTIONS = [7, 30, 90];
const fieldClass =
    'h-10 min-w-0 rounded-lg border border-input bg-background px-3 text-sm text-foreground';

function deviceLabel(name: string): string {
    return DEVICE_META[name as DeviceType]
        ? tr(DEVICE_META[name as DeviceType].label)
        : name;
}

function deviceColor(name: string, index: number): string {
    return (
        DEVICE_META[name as DeviceType]?.color ??
        PALETTE[index % PALETTE.length]
    );
}

function shortDate(value: string): string {
    return new Date(`${value}T00:00:00`).toLocaleDateString(adminLocale(), {
        day: 'numeric',
        month: 'short',
    });
}

function dateTime(value: string): string {
    return new Date(value).toLocaleString(adminLocale(), {
        day: 'numeric',
        month: 'short',
        hour: '2-digit',
        minute: '2-digit',
    });
}

function SharePie({
    rows,
    label,
    testId,
}: {
    rows: { name: string; value: number; color: string }[];
    label: string;
    testId: string;
}) {
    const total = rows.reduce((sum, row) => sum + row.value, 0);
    if (total === 0) {
        return (
            <EmptyState
                icon={AppWindow}
                title={tr('No data in this range')}
                description={tr(
                    'Try a longer time range or clear the filters.',
                )}
            />
        );
    }

    return (
        <div
            className="flex flex-col gap-4 sm:flex-row sm:items-center"
            data-testid={testId}
        >
            <div className="mx-auto h-44 w-44 shrink-0">
                <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                        <Pie
                            data={rows}
                            dataKey="value"
                            nameKey="name"
                            innerRadius="55%"
                            outerRadius="95%"
                            paddingAngle={2}
                            stroke="none"
                        >
                            {rows.map((row) => (
                                <Cell key={row.name} fill={row.color} />
                            ))}
                        </Pie>
                        <Tooltip
                            contentStyle={chartTooltipStyle}
                            formatter={(value) => [
                                formatNumber(Number(value)),
                                label,
                            ]}
                        />
                    </PieChart>
                </ResponsiveContainer>
            </div>
            <ul className="flex min-w-0 flex-1 flex-col gap-2">
                {rows.map((row) => (
                    <li
                        key={row.name}
                        className="flex items-center gap-2 text-sm"
                    >
                        <span
                            className="size-2.5 shrink-0 rounded-full"
                            style={{ background: row.color }}
                        />
                        <span className="min-w-0 flex-1 truncate text-foreground">
                            {row.name}
                        </span>
                        <span className="text-xs text-muted-foreground tabular-nums">
                            {Math.round((row.value / total) * 100)}%
                        </span>
                        <span className="w-12 text-right font-semibold text-foreground tabular-nums">
                            {formatNumber(row.value)}
                        </span>
                    </li>
                ))}
            </ul>
        </div>
    );
}

function Stat({
    icon: Icon,
    label,
    value,
}: {
    icon: typeof Users;
    label: string;
    value: ReactNode;
}) {
    return (
        <div className="flex min-w-0 items-center gap-3 rounded-2xl border border-border bg-card p-3 sm:p-4">
            <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary">
                <Icon className="size-5" aria-hidden="true" />
            </span>
            <div className="min-w-0">
                <p className="truncate text-xs text-muted-foreground">
                    {label}
                </p>
                <div className="font-display text-xl font-bold text-foreground tabular-nums">
                    {value}
                </div>
            </div>
        </div>
    );
}

export default function DeviceUsagePage({
    days,
    filters,
    options,
    totals,
    charts,
    users,
}: Props) {
    const query = (patch: Record<string, string | number | null>) =>
        router.get(
            '/admin/device-usage',
            { days, ...filters, users_page: null, ...patch },
            { preserveState: true, preserveScroll: true },
        );
    const hasFilter = Boolean(filters.os || filters.device || filters.role);
    const topOs = charts.os[0]?.name ?? '—';
    const topDevice = charts.devices[0]
        ? deviceLabel(charts.devices[0].name)
        : '—';

    return (
        <>
            <Head title={tr('Device and OS analytics')} />
            <div
                className="flex min-w-0 flex-col gap-6"
                data-testid="device-analytics"
            >
                <div className="flex flex-wrap items-end justify-between gap-4">
                    <div>
                        <h1 className="text-2xl font-bold text-foreground">
                            {tr('Device and OS analytics')}
                        </h1>
                        <p className="max-w-2xl text-sm text-muted-foreground">
                            {tr(
                                'Detailed game access trends and users by device, OS, period and role',
                            )}
                        </p>
                    </div>
                    <Link
                        href="/admin/device-usage/games"
                        className="inline-flex h-9 items-center gap-2 rounded-lg border border-border px-3 text-sm font-medium text-foreground hover:bg-muted"
                    >
                        {tr('Per game & browser')}
                    </Link>
                </div>

                <div
                    className="grid grid-cols-1 gap-3 rounded-2xl border border-border bg-card p-3 sm:grid-cols-2 sm:p-4 lg:grid-cols-[repeat(4,minmax(0,1fr))_auto]"
                    data-testid="device-filters"
                >
                    <select
                        aria-label={tr('Time range')}
                        value={days}
                        onChange={(e) =>
                            query({ days: Number(e.target.value) })
                        }
                        className={fieldClass}
                    >
                        {DAY_OPTIONS.map((option) => (
                            <option key={option} value={option}>
                                {tr('{0} days', [option])}
                            </option>
                        ))}
                    </select>
                    <select
                        aria-label={tr('Operating system')}
                        value={filters.os ?? ''}
                        onChange={(e) => query({ os: e.target.value || null })}
                        className={fieldClass}
                        data-testid="device-filter-os"
                    >
                        <option value="">{tr('All operating systems')}</option>
                        {options.os.map((os) => (
                            <option key={os} value={os}>
                                {os}
                            </option>
                        ))}
                    </select>
                    <select
                        aria-label={tr('Device type')}
                        value={filters.device ?? ''}
                        onChange={(e) =>
                            query({ device: e.target.value || null })
                        }
                        className={fieldClass}
                        data-testid="device-filter-device"
                    >
                        <option value="">{tr('All device types')}</option>
                        {(['mobile', 'tablet', 'desktop'] as DeviceType[]).map(
                            (device) => (
                                <option key={device} value={device}>
                                    {deviceLabel(device)}
                                </option>
                            ),
                        )}
                    </select>
                    <select
                        aria-label={tr('Role')}
                        value={filters.role ?? ''}
                        onChange={(e) =>
                            query({ role: e.target.value || null })
                        }
                        className={fieldClass}
                    >
                        <option value="">{tr('All roles')}</option>
                        {options.roles.map((role) => (
                            <option key={role.slug} value={role.slug}>
                                {role.name}
                            </option>
                        ))}
                    </select>
                    {hasFilter && (
                        <button
                            type="button"
                            onClick={() =>
                                query({ os: null, device: null, role: null })
                            }
                            className="inline-flex h-10 items-center justify-center gap-1.5 rounded-lg px-3 text-sm font-medium text-muted-foreground hover:bg-muted hover:text-foreground"
                        >
                            <X className="size-4" aria-hidden="true" />
                            {tr('Clear filters')}
                        </button>
                    )}
                </div>

                <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
                    <Stat
                        icon={MonitorSmartphone}
                        label={tr('Game opens')}
                        value={formatNumber(totals.accesses)}
                    />
                    <Stat
                        icon={Users}
                        label={tr('Users')}
                        value={formatNumber(totals.users)}
                    />
                    <Stat
                        icon={AppWindow}
                        label={tr('Top operating system')}
                        value={
                            <span className="block truncate text-base sm:text-xl">
                                {topOs}
                            </span>
                        }
                    />
                    <Stat
                        icon={Globe}
                        label={tr('Top device type')}
                        value={
                            <span className="block truncate text-base sm:text-xl">
                                {topDevice}
                            </span>
                        }
                    />
                </div>

                <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
                    <Panel
                        title={tr('Operating systems')}
                        description={tr('Share of game opens per OS')}
                        icon={AppWindow}
                    >
                        <SharePie
                            testId="device-os-pie"
                            label={tr('Opens')}
                            rows={charts.os.map((row, index) => ({
                                name: row.name,
                                value: row.accesses,
                                color: PALETTE[index % PALETTE.length],
                            }))}
                        />
                    </Panel>
                    <Panel
                        title={tr('Device types')}
                        description={tr('Share of game opens per device type')}
                        icon={MonitorSmartphone}
                    >
                        <SharePie
                            testId="device-type-pie"
                            label={tr('Opens')}
                            rows={charts.devices.map((row, index) => ({
                                name: deviceLabel(row.name),
                                value: row.accesses,
                                color: deviceColor(row.name, index),
                            }))}
                        />
                    </Panel>
                </div>

                <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
                    <Panel
                        title={tr('Access trend')}
                        description={tr('Daily game opens and unique users')}
                        icon={LineChartIcon}
                        className="xl:col-span-2"
                    >
                        <div className="h-64">
                            <ResponsiveContainer width="100%" height="100%">
                                <LineChart
                                    data={charts.daily}
                                    margin={{
                                        top: 8,
                                        right: 8,
                                        left: -16,
                                        bottom: 0,
                                    }}
                                >
                                    <CartesianGrid
                                        strokeDasharray="3 3"
                                        stroke="var(--border)"
                                    />
                                    <XAxis
                                        dataKey="date"
                                        tick={axisTick}
                                        tickFormatter={shortDate}
                                        minTickGap={24}
                                    />
                                    <YAxis
                                        allowDecimals={false}
                                        tick={axisTick}
                                    />
                                    <Tooltip
                                        contentStyle={chartTooltipStyle}
                                        labelFormatter={(value) =>
                                            shortDate(String(value))
                                        }
                                    />
                                    <Line
                                        type="monotone"
                                        name={tr('Opens')}
                                        dataKey="accesses"
                                        stroke="#2563eb"
                                        strokeWidth={2.5}
                                        dot={false}
                                    />
                                    <Line
                                        type="monotone"
                                        name={tr('Users')}
                                        dataKey="users"
                                        stroke="#16a34a"
                                        strokeWidth={2.5}
                                        dot={false}
                                    />
                                </LineChart>
                            </ResponsiveContainer>
                        </div>
                    </Panel>
                    <Panel
                        title={tr('Browsers')}
                        description={tr('Top browsers in this selection')}
                        icon={Globe}
                    >
                        <div className="h-64">
                            <ResponsiveContainer width="100%" height="100%">
                                <BarChart
                                    data={charts.browsers}
                                    layout="vertical"
                                    margin={{
                                        top: 4,
                                        right: 12,
                                        left: 8,
                                        bottom: 0,
                                    }}
                                >
                                    <XAxis
                                        type="number"
                                        allowDecimals={false}
                                        tick={axisTick}
                                    />
                                    <YAxis
                                        type="category"
                                        dataKey="name"
                                        width={84}
                                        tick={axisTick}
                                    />
                                    <Tooltip contentStyle={chartTooltipStyle} />
                                    <Bar
                                        dataKey="accesses"
                                        name={tr('Opens')}
                                        fill="#7c3aed"
                                        radius={[0, 6, 6, 0]}
                                    />
                                </BarChart>
                            </ResponsiveContainer>
                        </div>
                    </Panel>
                </div>

                <Panel
                    title={tr('Users')}
                    description={tr('{0} matching users', [
                        formatNumber(users.total),
                    ])}
                    icon={Users}
                >
                    {users.data.length === 0 ? (
                        <EmptyState
                            icon={Users}
                            title={tr('No users match these filters')}
                            description={tr(
                                'Try a longer time range or clear the filters.',
                            )}
                        />
                    ) : (
                        <ResponsiveTable
                            testId="device-users"
                            variant="admin"
                            rows={users.data}
                            rowKey={(user) => user.id}
                            onRowClick={(user) =>
                                router.visit(
                                    `/admin/users/${user.id}?tab=devices`,
                                )
                            }
                            rowAriaLabel={(user) => tr('Open {0}', [user.name])}
                            columns={[
                                {
                                    key: 'user',
                                    header: tr('User'),
                                    primary: true,
                                    cell: (user) => (
                                        <div className="flex min-w-0 items-center gap-3">
                                            <UserAvatar
                                                name={user.name}
                                                src={user.avatar_url}
                                                userId={user.id}
                                            />
                                            <div className="min-w-0">
                                                <p className="truncate font-medium text-foreground">
                                                    {user.name}
                                                </p>
                                                <p className="truncate text-xs text-muted-foreground">
                                                    {user.email}
                                                </p>
                                            </div>
                                        </div>
                                    ),
                                },
                                {
                                    key: 'role',
                                    header: tr('Role'),
                                    cell: (user) => (
                                        <span className="text-muted-foreground">
                                            {user.roles.join(', ') || '—'}
                                        </span>
                                    ),
                                },
                                {
                                    key: 'accesses',
                                    header: tr('Opens'),
                                    align: 'right',
                                    summary: true,
                                    cell: (user) => (
                                        <span className="tabular-nums">
                                            {formatNumber(user.accesses)}
                                        </span>
                                    ),
                                },
                                {
                                    key: 'latest',
                                    header: tr('Latest device'),
                                    cell: (user) =>
                                        user.latest ? (
                                            <div className="text-xs">
                                                <p className="text-foreground">
                                                    {user.latest.os} ·{' '}
                                                    {deviceLabel(
                                                        user.latest.device_type,
                                                    )}{' '}
                                                    · {user.latest.browser}
                                                </p>
                                                <p className="text-muted-foreground">
                                                    {dateTime(
                                                        user.latest.accessed_at,
                                                    )}
                                                </p>
                                            </div>
                                        ) : (
                                            '—'
                                        ),
                                },
                            ]}
                        />
                    )}
                    {users.last_page > 1 && (
                        <div className="mt-4 flex flex-wrap items-center justify-between gap-2 text-sm text-muted-foreground">
                            <span>
                                {tr('{0}–{1} of {2}', [
                                    users.from ?? 0,
                                    users.to ?? 0,
                                    formatNumber(users.total),
                                ])}
                            </span>
                            <div className="flex gap-2">
                                <button
                                    type="button"
                                    disabled={users.current_page <= 1}
                                    className="inline-flex h-9 items-center rounded-lg border border-border px-3 font-medium disabled:opacity-40"
                                    onClick={() =>
                                        query({
                                            users_page: users.current_page - 1,
                                        })
                                    }
                                >
                                    {tr('Previous')}
                                </button>
                                <button
                                    type="button"
                                    disabled={
                                        users.current_page >= users.last_page
                                    }
                                    className="inline-flex h-9 items-center rounded-lg border border-border px-3 font-medium disabled:opacity-40"
                                    onClick={() =>
                                        query({
                                            users_page: users.current_page + 1,
                                        })
                                    }
                                >
                                    {tr('Next')}
                                </button>
                            </div>
                        </div>
                    )}
                </Panel>
            </div>
        </>
    );
}

DeviceUsagePage.layout = (page: ReactNode) => (
    <AdminLayout title="Device and OS analytics">{page}</AdminLayout>
);
