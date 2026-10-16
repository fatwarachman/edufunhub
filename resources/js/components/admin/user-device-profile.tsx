import { chartTooltipStyle } from '@/components/admin/dashboard-kit';
import { DEVICE_META, type DeviceType } from '@/components/admin/device-usage';
import { formatNumber } from '@/components/admin/game-stats';
import { ResponsiveTable } from '@/components/responsive-table';
import { adminLocale, tr } from '@/lib/admin-i18n';
import { AppWindow, MonitorSmartphone } from 'lucide-react';
import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from 'recharts';

export interface UserDeviceSummary {
    total: number;
    os: { name: string; accesses: number }[];
    devices: { name: string; accesses: number }[];
    combos: {
        os: string;
        device_type: string;
        browser: string;
        accesses: number;
        first_at: string | null;
        last_at: string | null;
    }[];
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

export function deviceTypeLabel(name: string): string {
    return DEVICE_META[name as DeviceType]
        ? tr(DEVICE_META[name as DeviceType].label)
        : name;
}

function when(value: string | null): string {
    return value
        ? new Date(value).toLocaleString(adminLocale(), {
              day: 'numeric',
              month: 'short',
              year: 'numeric',
              hour: '2-digit',
              minute: '2-digit',
          })
        : '—';
}

function Donut({
    title,
    icon: Icon,
    rows,
    total,
    testId,
}: {
    title: string;
    icon: typeof AppWindow;
    rows: { name: string; value: number; color: string }[];
    total: number;
    testId: string;
}) {
    return (
        <div
            className="flex min-w-0 flex-col gap-3 rounded-xl border border-border p-3"
            data-testid={testId}
        >
            <p className="flex items-center gap-1.5 text-sm font-semibold text-foreground">
                <Icon
                    className="size-4 text-muted-foreground"
                    aria-hidden="true"
                />
                {title}
            </p>
            <div className="flex items-center gap-3">
                <div className="size-24 shrink-0">
                    <ResponsiveContainer width="100%" height="100%">
                        <PieChart>
                            <Pie
                                data={rows}
                                dataKey="value"
                                nameKey="name"
                                innerRadius="55%"
                                outerRadius="100%"
                                stroke="none"
                            >
                                {rows.map((row) => (
                                    <Cell key={row.name} fill={row.color} />
                                ))}
                            </Pie>
                            <Tooltip contentStyle={chartTooltipStyle} />
                        </PieChart>
                    </ResponsiveContainer>
                </div>
                <ul className="flex min-w-0 flex-1 flex-col gap-1">
                    {rows.slice(0, 5).map((row) => (
                        <li
                            key={row.name}
                            className="flex items-center gap-2 text-xs"
                        >
                            <span
                                className="size-2 shrink-0 rounded-full"
                                style={{ background: row.color }}
                            />
                            <span className="min-w-0 flex-1 truncate text-foreground">
                                {row.name}
                            </span>
                            <span className="text-muted-foreground tabular-nums">
                                {total > 0
                                    ? Math.round((row.value / total) * 100)
                                    : 0}
                                %
                            </span>
                        </li>
                    ))}
                </ul>
            </div>
        </div>
    );
}

/**
 * Device, OS and browser profile of one user (admin user detail): two donuts
 * plus, when `detailed`, every OS/device/browser combination with first and last use.
 */
export function UserDeviceProfile({
    summary,
    detailed = false,
}: {
    summary: UserDeviceSummary;
    detailed?: boolean;
}) {
    if (summary.total === 0) {
        return (
            <p
                className="text-sm text-muted-foreground"
                data-testid="user-device-empty"
            >
                {tr('No device history yet')}
            </p>
        );
    }
    const latest = [...summary.combos].sort((a, b) =>
        (b.last_at ?? '').localeCompare(a.last_at ?? ''),
    )[0];

    return (
        <div className="flex flex-col gap-3" data-testid="user-device-profile">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
                <p className="text-sm font-semibold text-foreground">
                    {tr('Devices & operating systems')}
                </p>
                {latest && (
                    <p className="text-xs text-muted-foreground">
                        {tr('Latest: {0}', [
                            `${latest.os} · ${deviceTypeLabel(latest.device_type)} · ${latest.browser}`,
                        ])}
                    </p>
                )}
            </div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <Donut
                    testId="user-device-os"
                    title={tr('Operating system')}
                    icon={AppWindow}
                    total={summary.total}
                    rows={summary.os.map((row, index) => ({
                        name: row.name,
                        value: row.accesses,
                        color: PALETTE[index % PALETTE.length],
                    }))}
                />
                <Donut
                    testId="user-device-type"
                    title={tr('Device type')}
                    icon={MonitorSmartphone}
                    total={summary.total}
                    rows={summary.devices.map((row, index) => ({
                        name: deviceTypeLabel(row.name),
                        value: row.accesses,
                        color:
                            DEVICE_META[row.name as DeviceType]?.color ??
                            PALETTE[index % PALETTE.length],
                    }))}
                />
            </div>
            {detailed && (
                <ResponsiveTable
                    testId="user-device-combos"
                    variant="admin"
                    rows={summary.combos}
                    rowKey={(row) =>
                        `${row.os}-${row.device_type}-${row.browser}`
                    }
                    columns={[
                        {
                            key: 'device',
                            header: tr('Device'),
                            primary: true,
                            cell: (row) => (
                                <span className="font-medium text-foreground">{`${row.os} · ${deviceTypeLabel(row.device_type)}`}</span>
                            ),
                        },
                        {
                            key: 'browser',
                            header: tr('Browser'),
                            cell: (row) => row.browser,
                        },
                        {
                            key: 'opens',
                            header: tr('Opens'),
                            align: 'right',
                            summary: true,
                            cell: (row) => (
                                <span className="tabular-nums">
                                    {formatNumber(row.accesses)}
                                </span>
                            ),
                        },
                        {
                            key: 'first',
                            header: tr('First seen'),
                            cell: (row) => (
                                <span className="text-xs text-muted-foreground">
                                    {when(row.first_at)}
                                </span>
                            ),
                        },
                        {
                            key: 'last',
                            header: tr('Last seen'),
                            cell: (row) => (
                                <span className="text-xs text-muted-foreground">
                                    {when(row.last_at)}
                                </span>
                            ),
                        },
                    ]}
                />
            )}
        </div>
    );
}
