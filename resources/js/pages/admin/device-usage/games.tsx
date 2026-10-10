import { useAdminBreadcrumbs } from '@/components/admin/admin-breadcrumbs';
import { KpiCard } from '@/components/admin/dashboard-kit';
import {
    DEVICE_GAMES_URL,
    DEVICE_META,
    DEVICE_ORDER,
    DeviceLegend,
    type DeviceType,
    share,
    SplitBar,
} from '@/components/admin/device-usage';
import {
    EmptyState,
    formatNumber,
    gameLabel,
    Panel,
} from '@/components/admin/game-stats';
import { ResponsiveTable } from '@/components/responsive-table';
import AdminLayout from '@/layouts/admin-layout';
import { tr } from '@/lib/admin-i18n';
import { cn } from '@/lib/utils';
import { Head, router } from '@inertiajs/react';
import {
    Gamepad2,
    Laptop,
    MonitorSmartphone,
    Search,
    Smartphone,
    X,
} from 'lucide-react';
import { type ReactNode, useMemo, useState } from 'react';

interface GameDeviceRow extends Record<DeviceType, number> {
    game: string;
    accesses: number;
    users: number;
    browsers: { name: string; accesses: number }[];
}

interface DeviceGamesProps {
    days: number;
    dayOptions: number[];
    games: GameDeviceRow[];
    totals: { accesses: number; games: number } & Record<DeviceType, number>;
}

const TOP_BROWSERS = 3;

function DeviceCounts({ row }: { row: GameDeviceRow }) {
    return (
        <div className="flex min-w-0 flex-col gap-1.5">
            <SplitBar row={row} total={row.accesses} />
            <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-muted-foreground tabular-nums">
                {DEVICE_ORDER.map((type) => (
                    <span
                        key={type}
                        className="inline-flex items-center gap-1 whitespace-nowrap"
                        data-testid={`device-games-${type}`}
                    >
                        <span
                            className="size-2 shrink-0 rounded-full"
                            style={{ background: DEVICE_META[type].color }}
                            aria-hidden="true"
                        />
                        {tr(DEVICE_META[type].label)}{' '}
                        <span className="font-semibold text-foreground">
                            {formatNumber(row[type])}
                        </span>
                        <span>({share(row[type], row.accesses)})</span>
                    </span>
                ))}
            </div>
        </div>
    );
}

function BrowserChips({ row }: { row: GameDeviceRow }) {
    const shown = row.browsers.slice(0, TOP_BROWSERS);
    const rest = row.browsers.length - shown.length;
    return (
        <div className="flex flex-wrap gap-1.5">
            {shown.map((browser) => (
                <span
                    key={browser.name}
                    className="inline-flex items-center gap-1.5 rounded-full border border-border px-2 py-0.5 text-xs whitespace-nowrap text-foreground"
                >
                    {browser.name}
                    <span className="text-muted-foreground tabular-nums">
                        {share(browser.accesses, row.accesses)}
                    </span>
                </span>
            ))}
            {rest > 0 && (
                <span className="inline-flex items-center rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">
                    {tr('+{0} more', [rest])}
                </span>
            )}
        </div>
    );
}

export default function DeviceGamesPage({
    days,
    dayOptions,
    games,
    totals,
}: DeviceGamesProps) {
    useAdminBreadcrumbs([{ title: tr('Devices per game') }]);
    const [search, setSearch] = useState('');

    const rows = useMemo(() => {
        const needle = search.trim().toLowerCase();
        if (!needle) {
            return games;
        }
        return games.filter(
            (row) =>
                gameLabel(row.game).toLowerCase().includes(needle) ||
                row.game.toLowerCase().includes(needle),
        );
    }, [games, search]);

    const setDays = (value: number) =>
        router.get(
            DEVICE_GAMES_URL,
            { days: value },
            { preserveScroll: true, preserveState: true },
        );

    return (
        <>
            <Head title={tr('Devices per game')} />

            <div className="flex min-w-0 flex-col gap-4">
                <div>
                    <h2 className="font-display text-2xl font-bold text-foreground">
                        {tr('Devices per game')}
                    </h2>
                    <p className="text-sm text-muted-foreground">
                        {tr(
                            'Device split and browsers for every game opened in the last {0} days',
                            [days],
                        )}
                    </p>
                </div>

                <div
                    className="flex flex-col gap-3 rounded-2xl border border-border bg-card p-4 shadow-sm sm:flex-row sm:flex-wrap sm:items-center"
                    data-testid="device-games-filters"
                >
                    <div
                        className="inline-flex self-start rounded-lg border border-border bg-background p-1"
                        role="group"
                        aria-label={tr('Time range')}
                    >
                        {dayOptions.map((option) => (
                            <button
                                key={option}
                                type="button"
                                onClick={() => setDays(option)}
                                aria-pressed={days === option}
                                data-testid={`device-games-days-${option}`}
                                className={cn(
                                    'rounded-md px-3 py-1 text-sm font-medium transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none',
                                    days === option
                                        ? 'bg-primary text-primary-foreground'
                                        : 'text-muted-foreground hover:text-foreground',
                                )}
                            >
                                {tr('{0} days', [option])}
                            </button>
                        ))}
                    </div>
                    <div className="relative min-w-0 flex-1 sm:max-w-xs">
                        <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
                        <input
                            type="search"
                            value={search}
                            onChange={(event) => setSearch(event.target.value)}
                            placeholder={tr('Search games…')}
                            aria-label={tr('Search games…')}
                            data-testid="device-games-search"
                            className="h-9 w-full rounded-lg border border-input bg-background pr-3 pl-9 text-sm text-foreground placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                        />
                    </div>
                    {search && (
                        <button
                            type="button"
                            onClick={() => setSearch('')}
                            className="inline-flex items-center gap-1 self-start text-sm text-muted-foreground hover:text-foreground sm:self-auto"
                        >
                            <X className="size-3.5" />
                            {tr('Clear')}
                        </button>
                    )}
                </div>

                <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
                    <KpiCard
                        label="Game opens"
                        value={formatNumber(totals.accesses)}
                        icon={MonitorSmartphone}
                        accent="#6366f1"
                    />
                    <KpiCard
                        label="Games"
                        value={formatNumber(totals.games)}
                        icon={Gamepad2}
                        accent="#f59e0b"
                    />
                    <KpiCard
                        label="Mobile/tablet share"
                        value={share(
                            totals.mobile + totals.tablet,
                            totals.accesses,
                        )}
                        icon={Smartphone}
                        accent="#3b82f6"
                    />
                    <KpiCard
                        label="Desktop share"
                        value={share(totals.desktop, totals.accesses)}
                        icon={Laptop}
                        accent="#f97316"
                    />
                </div>

                <Panel
                    title={tr('All games')}
                    description={tr('Busiest first · {0} games', [
                        formatNumber(rows.length),
                    ])}
                    icon={Gamepad2}
                    actions={<DeviceLegend />}
                >
                    {games.length === 0 ? (
                        <EmptyState
                            icon={MonitorSmartphone}
                            title={tr('No game opens recorded yet')}
                            description={tr(
                                'Device and OS data is collected each time a player opens a game page.',
                            )}
                        />
                    ) : rows.length === 0 ? (
                        <EmptyState
                            icon={Search}
                            title={tr('No games match your search')}
                        />
                    ) : (
                        <ResponsiveTable
                            testId="device-games-table"
                            rows={rows}
                            rowKey={(row) => row.game}
                            columns={[
                                {
                                    key: 'game',
                                    header: tr('Game'),
                                    primary: true,
                                    cellClassName:
                                        'font-medium text-foreground',
                                    cell: (row) => (
                                        <span
                                            data-testid="device-games-row"
                                            data-game={row.game}
                                        >
                                            {gameLabel(row.game)}
                                        </span>
                                    ),
                                },
                                {
                                    key: 'opens',
                                    header: tr('Opens'),
                                    summary: true,
                                    align: 'right',
                                    cellClassName:
                                        'whitespace-nowrap tabular-nums',
                                    cell: (row) => (
                                        <span>
                                            {tr('{0} opens', [
                                                formatNumber(row.accesses),
                                            ])}
                                        </span>
                                    ),
                                },
                                {
                                    key: 'users',
                                    header: tr('Players'),
                                    summary: true,
                                    align: 'right',
                                    cellClassName:
                                        'whitespace-nowrap tabular-nums text-muted-foreground',
                                    cell: (row) =>
                                        tr('{0} users', [
                                            formatNumber(row.users),
                                        ]),
                                },
                                {
                                    key: 'devices',
                                    header: tr('Device split'),
                                    cellClassName: 'min-w-56',
                                    cell: (row) => <DeviceCounts row={row} />,
                                },
                                {
                                    key: 'browsers',
                                    header: tr('Top browsers'),
                                    cellClassName: 'min-w-40',
                                    cell: (row) => <BrowserChips row={row} />,
                                },
                            ]}
                        />
                    )}
                </Panel>
            </div>
        </>
    );
}

DeviceGamesPage.layout = (page: ReactNode) => (
    <AdminLayout title={tr('Devices per game')}>{page}</AdminLayout>
);
