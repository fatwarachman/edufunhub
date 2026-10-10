import { tooltipStyle } from '@/components/admin/ads/shared';
import { chartEvents } from '@/components/admin/dashboard-kit';
import { Panel, formatNumber, gameLabel } from '@/components/admin/game-stats';
import { ResponsiveTable } from '@/components/responsive-table';
import { tr } from '@/lib/admin-i18n';
import {
    BarChart3,
    Clock,
    Gauge,
    GraduationCap,
    MonitorSmartphone,
    Users,
} from 'lucide-react';
import {
    Bar,
    BarChart,
    CartesianGrid,
    ResponsiveContainer,
    Tooltip,
    XAxis,
    YAxis,
} from 'recharts';

export interface AnalyticsRow {
    impressions: number;
    clicks: number;
    plays: number;
    ctr: number | null;
}

export interface CampaignAnalytics {
    placements: (AnalyticsRow & { placement: string })[];
    games: (AnalyticsRow & { game: string })[];
    audience: {
        reach: number;
        frequency: number | null;
        unique_clickers: number;
        unique_listeners: number;
        guest_impressions: number;
    };
    frequency_buckets: { bucket: string; users: number }[];
    devices: (AnalyticsRow & { device: string })[];
    grades: (AnalyticsRow & { grade: string })[];
    hours: { hour: number; impressions: number }[];
}

const DEVICE_LABELS: Record<string, string> = {
    mobile: 'Phone',
    tablet: 'Tablet',
    desktop: 'Desktop',
    unknown: 'Unknown',
};

function pct(value: number | null): string {
    return value === null ? '—' : `${value.toFixed(2)}%`;
}

/**
 * Campaign analytics: reach and frequency, performance per placement and
 * game with CTR, audience by device and grade, and delivery by hour.
 */
export function CampaignAnalyticsPanels({
    analytics,
    labelOf,
    totals,
}: {
    analytics: CampaignAnalytics;
    labelOf: (key: string) => string;
    totals: { impressions: number; clicks: number; plays: number };
}) {
    const { audience } = analytics;
    const clickRate =
        audience.reach > 0
            ? (audience.unique_clickers / audience.reach) * 100
            : null;

    return (
        <div className="flex flex-col gap-6" data-testid="campaign-analytics">
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
                <Metric
                    label={tr('Reach (unique players)')}
                    value={formatNumber(audience.reach)}
                    hint={tr('{0} guest impressions', [
                        formatNumber(audience.guest_impressions),
                    ])}
                    testId="analytics-reach"
                />
                <Metric
                    label={tr('Avg. frequency')}
                    value={
                        audience.frequency === null
                            ? '—'
                            : `${audience.frequency}×`
                    }
                    hint={tr('Impressions per player')}
                    testId="analytics-frequency"
                />
                <Metric
                    label={tr('Unique clickers')}
                    value={formatNumber(audience.unique_clickers)}
                    hint={tr('{0} of reached players', [pct(clickRate)])}
                />
                <Metric
                    label={tr('Jingle listeners')}
                    value={formatNumber(audience.unique_listeners)}
                    hint={tr('{0} plays in total', [
                        formatNumber(totals.plays),
                    ])}
                />
                <Metric
                    label={tr('Click-through rate')}
                    value={pct(
                        totals.impressions > 0
                            ? (totals.clicks / totals.impressions) * 100
                            : null,
                    )}
                    hint={tr('{0} clicks / {1} impressions', [
                        formatNumber(totals.clicks),
                        formatNumber(totals.impressions),
                    ])}
                    testId="analytics-ctr"
                />
            </div>

            <div className="grid gap-6 xl:grid-cols-2">
                <Panel
                    title={tr('Performance by placement')}
                    icon={BarChart3}
                    className="min-w-0"
                >
                    <PerformanceTable
                        rows={analytics.placements.map((r) => ({
                            ...r,
                            label: labelOf(r.placement),
                        }))}
                        testId="analytics-placements"
                    />
                </Panel>
                <Panel
                    title={tr('Performance by game')}
                    icon={BarChart3}
                    className="min-w-0"
                >
                    <PerformanceTable
                        rows={analytics.games.map((r) => ({
                            ...r,
                            label: r.game
                                ? gameLabel(r.game)
                                : tr('Character shop'),
                        }))}
                        testId="analytics-games"
                    />
                </Panel>
            </div>

            <div className="grid items-start gap-6 xl:grid-cols-3">
                <Panel
                    title={tr('Devices')}
                    description={tr('Impressions by device class')}
                    icon={MonitorSmartphone}
                >
                    <ShareList
                        rows={analytics.devices.map((r) => ({
                            label: DEVICE_LABELS[r.device] ?? r.device,
                            value: r.impressions,
                            hint: `CTR ${pct(r.ctr)}`,
                            unit: 'impressions',
                        }))}
                        testId="analytics-devices"
                    />
                </Panel>
                <Panel
                    title={tr('Grades')}
                    description={tr('Impressions by player grade')}
                    icon={GraduationCap}
                >
                    <ShareList
                        rows={analytics.grades.map((r) => ({
                            label: `Grade ${r.grade}`,
                            value: r.impressions,
                            hint: `CTR ${pct(r.ctr)}`,
                            unit: 'impressions',
                        }))}
                        testId="analytics-grades"
                    />
                </Panel>
                <Panel
                    title={tr('Frequency')}
                    description={tr(
                        'How many times each player saw the campaign',
                    )}
                    icon={Users}
                >
                    <ShareList
                        rows={analytics.frequency_buckets.map((r) => ({
                            label: `${r.bucket} view${r.bucket === '1' ? '' : 's'}`,
                            value: r.users,
                            hint: '',
                            unit: 'players',
                        }))}
                        testId="analytics-frequency-buckets"
                    />
                </Panel>
            </div>

            <Panel
                title={tr('Impressions by hour of day')}
                description={tr('Server time')}
                icon={Clock}
            >
                <div className="h-48">
                    <ResponsiveContainer width="100%" height="100%">
                        <BarChart
                            {...chartEvents}
                            data={analytics.hours}
                            margin={{ left: -20, right: 8, top: 8 }}
                        >
                            <CartesianGrid
                                strokeDasharray="3 3"
                                stroke="var(--border)"
                            />
                            <XAxis
                                dataKey="hour"
                                tickFormatter={(h: number) =>
                                    `${String(h).padStart(2, '0')}`
                                }
                                tick={{
                                    fill: 'var(--muted-foreground)',
                                    fontSize: 11,
                                }}
                                interval={0}
                            />
                            <YAxis
                                allowDecimals={false}
                                tick={{
                                    fill: 'var(--muted-foreground)',
                                    fontSize: 11,
                                }}
                            />
                            <Tooltip
                                contentStyle={tooltipStyle}
                                cursor={{ fill: 'var(--muted)' }}
                                labelFormatter={(h) =>
                                    `${String(h).padStart(2, '0')}:00`
                                }
                            />
                            <Bar
                                dataKey="impressions"
                                name="Impressions"
                                fill="var(--chart-1)"
                                radius={[3, 3, 0, 0]}
                            />
                        </BarChart>
                    </ResponsiveContainer>
                </div>
            </Panel>
        </div>
    );
}

function Metric({
    label,
    value,
    hint,
    testId,
}: {
    label: string;
    value: string;
    hint: string;
    testId?: string;
}) {
    return (
        <div
            className="flex flex-col gap-1 rounded-2xl border border-border bg-card p-4 shadow-sm"
            data-testid={testId}
        >
            <span className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
                <Gauge className="size-3.5" />
                {tr(label)}
            </span>
            <span className="text-xl font-bold text-foreground tabular-nums">
                {value}
            </span>
            <span className="text-xs text-muted-foreground">{tr(hint)}</span>
        </div>
    );
}

function PerformanceTable({
    rows,
    testId,
}: {
    rows: (AnalyticsRow & { label: string })[];
    testId: string;
}) {
    if (rows.length === 0) {
        return (
            <p className="text-sm text-muted-foreground">
                {tr('No delivery yet.')}
            </p>
        );
    }
    return (
        <ResponsiveTable
            testId={testId}
            rows={rows}
            rowKey={(row) => row.label}
            columns={[
                {
                    key: 'name',
                    header: tr('Name'),
                    primary: true,
                    cellClassName: 'font-medium text-foreground',
                    cell: (row) => tr(row.label),
                },
                {
                    key: 'impressions',
                    header: tr('Impressions'),
                    align: 'right',
                    cellClassName: 'tabular-nums',
                    cell: (row) => formatNumber(row.impressions),
                },
                {
                    key: 'clicks',
                    header: tr('Clicks'),
                    align: 'right',
                    cellClassName: 'tabular-nums',
                    cell: (row) => formatNumber(row.clicks),
                },
                {
                    key: 'ctr',
                    header: tr('CTR'),
                    align: 'right',
                    cellClassName: 'tabular-nums',
                    cell: (row) => pct(row.ctr),
                },
                {
                    key: 'plays',
                    header: tr('Plays'),
                    align: 'right',
                    cellClassName: 'tabular-nums',
                    cell: (row) => formatNumber(row.plays),
                },
            ]}
        />
    );
}

function ShareList({
    rows,
    testId,
}: {
    rows: { label: string; value: number; hint: string; unit: string }[];
    testId: string;
}) {
    const total = rows.reduce((sum, row) => sum + row.value, 0);
    if (total === 0) {
        return (
            <p className="text-sm text-muted-foreground">
                {tr('No data yet.')}
            </p>
        );
    }
    return (
        <ul className="flex flex-col gap-3" data-testid={testId}>
            {rows.map((row) => {
                const share = (row.value / total) * 100;
                return (
                    <li key={row.label} className="flex flex-col gap-1">
                        <div className="flex justify-between gap-2 text-xs">
                            <span className="font-medium text-foreground">
                                {tr(row.label)}
                            </span>
                            <span className="text-muted-foreground tabular-nums">
                                {formatNumber(row.value)} {tr(row.unit)} ·{' '}
                                {share.toFixed(0)}%
                                {row.hint && ` · ${row.hint}`}
                            </span>
                        </div>
                        <span className="h-1.5 overflow-hidden rounded-full bg-muted-foreground/15">
                            <span
                                className="block h-full rounded-full bg-primary"
                                style={{ width: `${share}%` }}
                            />
                        </span>
                    </li>
                );
            })}
        </ul>
    );
}
