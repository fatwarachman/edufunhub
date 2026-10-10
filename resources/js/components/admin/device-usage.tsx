import { ShareBars } from '@/components/admin/dashboard-kit';
import {
    EmptyState,
    formatNumber,
    gameLabel,
    Panel,
} from '@/components/admin/game-stats';
import { tr } from '@/lib/admin-i18n';
import { Link } from '@inertiajs/react';
import {
    AppWindow,
    ArrowRight,
    Laptop,
    MonitorSmartphone,
    Smartphone,
    Tablet,
} from 'lucide-react';

export type DeviceType = 'mobile' | 'tablet' | 'desktop';

export interface DeviceSummary {
    days: number;
    total: number;
    users: number;
    guests: number;
    types: { key: DeviceType; accesses: number; users: number }[];
    os: ({
        name: string;
        accesses: number;
        users: number;
    } & Record<DeviceType, number>)[];
    browsers: { name: string; accesses: number }[];
    games: ({ game: string } & Record<DeviceType, number>)[];
}

export const DEVICE_META: Record<
    DeviceType,
    { label: string; color: string; icon: React.ElementType }
> = {
    mobile: {
        label: 'Mobile',
        color: 'var(--color-bubble-blue)',
        icon: Smartphone,
    },
    tablet: {
        label: 'Tablet',
        color: 'var(--color-bubble-purple)',
        icon: Tablet,
    },
    desktop: {
        label: 'Desktop',
        color: 'var(--color-bubble-orange)',
        icon: Laptop,
    },
};

export const DEVICE_ORDER: DeviceType[] = ['mobile', 'tablet', 'desktop'];

const OS_COLORS = [
    'var(--color-bubble-green)',
    'var(--color-bubble-blue)',
    'var(--color-bubble-orange)',
    'var(--color-bubble-purple)',
    'var(--color-bubble-pink)',
    'var(--muted-foreground)',
];

export function share(part: number, whole: number): string {
    return whole > 0 ? `${Math.round((part / whole) * 100)}%` : '0%';
}

/** Games shown in the dashboard panel; the rest is on the "See all" page. */
export const DASHBOARD_GAME_LIMIT = 5;

export const DEVICE_GAMES_URL = '/admin/device-usage/games';

function deviceTotal(row: Record<DeviceType, number>): number {
    return row.mobile + row.tablet + row.desktop;
}

/** Device class, operating system and browser mix of game page opens. */
export function DeviceUsagePanels({ devices }: { devices: DeviceSummary }) {
    if (devices.total === 0) {
        return (
            <Panel
                title={tr('Devices & operating systems')}
                description={tr('Game opens in the last {0} days', [
                    devices.days,
                ])}
                icon={MonitorSmartphone}
            >
                <EmptyState
                    icon={MonitorSmartphone}
                    title={tr('No game opens recorded yet')}
                    description={tr(
                        'Device and OS data is collected each time a player opens a game page.',
                    )}
                />
            </Panel>
        );
    }

    const topGames = [...devices.games]
        .sort((a, b) => deviceTotal(b) - deviceTotal(a))
        .slice(0, DASHBOARD_GAME_LIMIT);

    return (
        <div
            className="grid grid-cols-1 gap-6 lg:grid-cols-3"
            data-testid="device-usage"
        >
            <Panel
                title={tr('Device type')}
                description={tr('{0} game opens · last {1} days', [
                    formatNumber(devices.total),
                    devices.days,
                ])}
                icon={MonitorSmartphone}
            >
                <div className="flex flex-col gap-4">
                    <div className="grid grid-cols-3 gap-2">
                        {devices.types.map((type) => {
                            const meta = DEVICE_META[type.key];
                            const Icon = meta.icon;
                            return (
                                <div
                                    key={type.key}
                                    data-testid={`device-${type.key}`}
                                    className="flex min-w-0 flex-col gap-1 rounded-xl bg-muted/50 px-3 py-2.5"
                                >
                                    <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
                                        <Icon
                                            className="size-3.5 shrink-0"
                                            style={{ color: meta.color }}
                                        />
                                        <span className="truncate">
                                            {tr(meta.label)}
                                        </span>
                                    </span>
                                    <span className="font-display text-xl leading-none font-bold text-foreground tabular-nums">
                                        {share(type.accesses, devices.total)}
                                    </span>
                                    <span className="truncate text-xs text-muted-foreground tabular-nums">
                                        {formatNumber(type.users)} {tr('users')}
                                    </span>
                                </div>
                            );
                        })}
                    </div>
                    <ShareBars
                        rows={devices.types.map((type) => ({
                            key: type.key,
                            label: DEVICE_META[type.key].label,
                            value: type.accesses,
                            color: DEVICE_META[type.key].color,
                        }))}
                    />
                    <p className="text-xs text-muted-foreground">
                        {formatNumber(devices.users)}{' '}
                        {tr('signed-in players ·')}{' '}
                        {formatNumber(devices.guests)} {tr('guest opens')}
                    </p>
                </div>
            </Panel>

            <Panel
                title={tr('Operating system')}
                description={tr('Opens per OS, split by device type')}
                icon={AppWindow}
            >
                <ul className="flex flex-col gap-3" data-testid="device-os">
                    {devices.os.slice(0, 7).map((os, index) => (
                        <li key={os.name} className="flex flex-col gap-1.5">
                            <div className="flex items-center gap-2 text-sm">
                                <span
                                    className="size-2.5 shrink-0 rounded-full"
                                    style={{
                                        background:
                                            OS_COLORS[index % OS_COLORS.length],
                                    }}
                                />
                                <span className="min-w-0 flex-1 truncate font-medium text-foreground">
                                    {os.name}
                                </span>
                                <span className="text-xs text-muted-foreground tabular-nums">
                                    {formatNumber(os.users)} {tr('users')}
                                </span>
                                <span className="w-12 text-right font-semibold text-foreground tabular-nums">
                                    {formatNumber(os.accesses)}
                                </span>
                            </div>
                            <SplitBar row={os} total={os.accesses} />
                        </li>
                    ))}
                </ul>
            </Panel>

            <Panel
                title={tr('Per game & browser')}
                description={tr('Top {0} games by opens · device split', [
                    DASHBOARD_GAME_LIMIT,
                ])}
                icon={Smartphone}
                actions={
                    <Link
                        href={`${DEVICE_GAMES_URL}?days=${devices.days}`}
                        className="inline-flex items-center gap-1 link text-xs"
                        data-testid="device-games-all"
                    >
                        {tr('See all')}
                        <ArrowRight className="size-3" aria-hidden="true" />
                    </Link>
                }
            >
                <div className="flex flex-col gap-5">
                    <ul
                        className="flex flex-col gap-3"
                        data-testid="device-games"
                    >
                        {topGames.map((game) => {
                            const total = deviceTotal(game);
                            return (
                                <li
                                    key={game.game}
                                    className="flex flex-col gap-1.5"
                                    data-testid="device-game-row"
                                >
                                    <div className="flex items-center justify-between gap-2 text-sm">
                                        <span className="truncate font-medium text-foreground">
                                            {gameLabel(game.game)}
                                        </span>
                                        <span className="text-xs text-muted-foreground tabular-nums">
                                            {share(
                                                game.mobile + game.tablet,
                                                total,
                                            )}{' '}
                                            {tr('mobile/tablet')}
                                        </span>
                                    </div>
                                    <SplitBar row={game} total={total} />
                                </li>
                            );
                        })}
                    </ul>
                    <div className="flex flex-wrap gap-1.5">
                        {devices.browsers.map((browser) => (
                            <span
                                key={browser.name}
                                className="inline-flex items-center gap-1.5 rounded-full border border-border px-2.5 py-1 text-xs text-foreground"
                            >
                                {browser.name}
                                <span className="text-muted-foreground tabular-nums">
                                    {share(browser.accesses, devices.total)}
                                </span>
                            </span>
                        ))}
                    </div>
                    <DeviceLegend />
                </div>
            </Panel>
        </div>
    );
}

export function SplitBar({
    row,
    total,
}: {
    row: Record<DeviceType, number>;
    total: number;
}) {
    return (
        <div
            className="flex h-2 w-full overflow-hidden rounded-full bg-muted"
            role="img"
            aria-label={DEVICE_ORDER.map(
                (type) => `${DEVICE_META[type].label} ${row[type]}`,
            ).join(', ')}
        >
            {DEVICE_ORDER.map((type) =>
                row[type] > 0 ? (
                    <span
                        key={type}
                        className="h-full"
                        style={{
                            width: `${(row[type] / Math.max(1, total)) * 100}%`,
                            background: DEVICE_META[type].color,
                        }}
                    />
                ) : null,
            )}
        </div>
    );
}

export function DeviceLegend() {
    return (
        <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
            {DEVICE_ORDER.map((type) => (
                <span key={type} className="inline-flex items-center gap-1">
                    <span
                        className="size-2 rounded-full"
                        style={{ background: DEVICE_META[type].color }}
                    />
                    {tr(DEVICE_META[type].label)}
                </span>
            ))}
        </div>
    );
}
