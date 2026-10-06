import { EmptyState, formatNumber, Panel } from '@/components/admin/game-stats';
import { ResponsiveTable } from '@/components/responsive-table';
import AdminLayout from '@/layouts/admin-layout';
import { tr } from '@/lib/admin-i18n';
import { cn } from '@/lib/utils';
import { Head, router, usePoll } from '@inertiajs/react';
import {
    Box,
    Cpu,
    Gamepad2,
    HardDrive,
    MemoryStick,
    Pause,
    Play,
    RefreshCw,
    Server,
    Timer,
} from 'lucide-react';
import { type ReactNode, useState } from 'react';

interface Usage {
    total: number;
    used: number;
    percent: number | null;
}

interface HostStats {
    available: boolean;
    hostname?: string | null;
    cpus?: number;
    cpu_percent?: number | null;
    load?: number[];
    uptime_seconds?: number;
    memory?: Usage;
    swap?: Usage;
    disk?: Usage;
}

interface ContainerRow {
    id: string;
    name: string;
    service: string;
    image: string;
    state: string;
    status: string;
    is_game: boolean;
    cpu_percent: number | null;
    memory: Usage | null;
    network: { rx_bytes: number; tx_bytes: number } | null;
    block: { read_bytes: number; write_bytes: number } | null;
    pids: number | null;
}

interface GameRuntime {
    available: boolean;
    error?: string;
    go_version?: string;
    uptime_seconds?: number;
    goroutines?: number;
    heap_alloc_bytes?: number;
    sys_bytes?: number;
    gc_cycles?: number;
    games?: { game: string; connections: number; sessions: number }[];
}

interface Props {
    monitor: {
        host: HostStats;
        containers: {
            available: boolean;
            error?: string;
            items: ContainerRow[];
        };
        game: GameRuntime;
        sampled_at: string;
    };
    refreshSeconds: number;
}

const GAME_NAMES: Record<string, string> = {
    'flag-quest': 'Flag Quest',
    'sky-quiz': 'Sky Quiz',
    'quiz-duel': 'Class Quiz Duel',
    'knowledge-train': 'Knowledge Train',
    'port-sorter': 'Port Sorter',
    'snakes-and-ladders': 'Snakes & Ladders (rooms)',
    crossword: 'Crossword (rooms)',
    'market-math': 'Market Math (rooms)',
    'number-garden': 'Number & Letter Garden (rooms)',
    'explore-indonesia': 'Explore Indonesia (rooms)',
    'mini-lab': 'Mini Lab (rooms)',
    'floor-drop': 'Floor Drop (rooms)',
    'economy-heist': 'Economy Heist (rooms)',
    'order-rush': 'Order Rush TKJ (rooms)',
    'turbo-trivia': 'Turbo Trivia (rooms)',
};

function formatBytes(bytes: number | null | undefined): string {
    if (bytes === null || bytes === undefined) return '—';
    const units = ['B', 'KB', 'MB', 'GB', 'TB'];
    let value = bytes;
    let unit = 0;
    while (value >= 1024 && unit < units.length - 1) {
        value /= 1024;
        unit++;
    }
    return `${value.toFixed(value >= 100 || unit === 0 ? 0 : 1)} ${units[unit]}`;
}

function formatUptime(seconds: number | null | undefined): string {
    if (!seconds) return '—';
    const days = Math.floor(seconds / 86400);
    const hours = Math.floor((seconds % 86400) / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    if (days > 0) return `${days}d ${hours}h`;
    if (hours > 0) return `${hours}h ${minutes}m`;
    return `${minutes}m`;
}

function tone(percent: number | null | undefined): string {
    if (percent === null || percent === undefined)
        return 'var(--muted-foreground)';
    if (percent >= 90) return 'rgb(239 68 68)';
    if (percent >= 70) return 'rgb(245 158 11)';
    return 'var(--color-bubble-green)';
}

function Meter({ percent }: { percent: number | null | undefined }) {
    const value = Math.min(100, Math.max(0, percent ?? 0));
    return (
        <div
            className="h-2 w-full overflow-hidden rounded-full bg-muted"
            role="progressbar"
            aria-valuenow={Math.round(value)}
            aria-valuemin={0}
            aria-valuemax={100}
        >
            <div
                className="h-full rounded-full transition-[width] duration-500"
                style={{ width: `${value}%`, background: tone(percent) }}
            />
        </div>
    );
}

function HostCard({
    label,
    icon: Icon,
    percent,
    detail,
    testId,
}: {
    label: string;
    icon: React.ElementType;
    percent: number | null | undefined;
    detail: ReactNode;
    testId: string;
}) {
    return (
        <div
            data-testid={testId}
            className="flex min-w-0 flex-col gap-2 rounded-2xl border border-border bg-card p-3.5 shadow-sm sm:gap-3 sm:p-5"
        >
            <div className="flex items-center justify-between gap-2 sm:gap-3">
                <span className="truncate text-[11px] font-semibold tracking-wide text-muted-foreground uppercase sm:text-xs">
                    {tr(label)}
                </span>
                <Icon className="size-3.5 shrink-0 text-muted-foreground sm:size-4" />
            </div>
            <span
                className="font-display text-2xl leading-none font-bold tabular-nums sm:text-3xl"
                style={{ color: tone(percent) }}
            >
                {percent === null || percent === undefined
                    ? '—'
                    : `${percent}%`}
            </span>
            <Meter percent={percent} />
            <span className="line-clamp-2 text-[11px] leading-snug text-muted-foreground tabular-nums sm:truncate sm:text-xs">
                {tr(detail)}
            </span>
        </div>
    );
}

function StateBadge({ state }: { state: string }) {
    const running = state === 'running';
    return (
        <span
            className={cn(
                'inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-medium',
                running
                    ? 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300'
                    : 'bg-red-500/10 text-red-700 dark:text-red-300',
            )}
        >
            <span
                className={cn(
                    'size-1.5 rounded-full',
                    running ? 'bg-emerald-500' : 'bg-red-500',
                )}
            />
            {state}
        </span>
    );
}

function Unavailable({ what }: { what: string }) {
    return (
        <EmptyState
            icon={Server}
            title={tr('{0} unavailable', [what])}
            description={tr(
                'The monitoring source did not respond. Check that the read-only Docker proxy and game service are running.',
            )}
        />
    );
}

export default function ServerMonitor({ monitor, refreshSeconds }: Props) {
    const [live, setLive] = useState(true);
    const { start, stop } = usePoll(
        refreshSeconds * 1000,
        { only: ['monitor'] },
        { keepAlive: false },
    );
    const { host, containers, game } = monitor;
    const gameContainers = containers.items.filter((c) => c.is_game);

    const toggleLive = () => {
        if (live) {
            stop();
        } else {
            start();
        }
        setLive(!live);
    };

    return (
        <>
            <Head title={tr('Server Monitor')} />
            <div className="flex flex-col gap-4 sm:gap-6">
                <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="flex min-w-0 flex-col gap-0.5">
                        <h2 className="font-display text-xl font-bold text-foreground">
                            {host.hostname ?? tr('Server')}
                        </h2>
                        <p className="text-sm text-muted-foreground">
                            {tr('Sampled')}{' '}
                            {new Date(monitor.sampled_at).toLocaleTimeString()}
                            {' · '}
                            {live
                                ? tr('refreshing every {0}s', [refreshSeconds])
                                : 'paused'}
                        </p>
                    </div>
                    <div className="flex items-center gap-2">
                        <button
                            type="button"
                            onClick={toggleLive}
                            className="inline-flex h-9 items-center gap-2 rounded-xl border border-border bg-card px-3 text-sm font-medium text-foreground shadow-sm transition-colors hover:bg-muted"
                            data-testid="monitor-live-toggle"
                        >
                            {live ? (
                                <Pause className="size-4" />
                            ) : (
                                <Play className="size-4" />
                            )}
                            {live ? tr('Pause') : tr('Resume')}
                        </button>
                        <button
                            type="button"
                            onClick={() => router.reload({ only: ['monitor'] })}
                            className="inline-flex h-9 items-center gap-2 rounded-xl border border-border bg-card px-3 text-sm font-medium text-foreground shadow-sm transition-colors hover:bg-muted"
                        >
                            <RefreshCw className="size-4" />
                            {tr('Refresh')}
                        </button>
                    </div>
                </div>

                {/* Host */}
                {host.available ? (
                    <div className="grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4">
                        <HostCard
                            testId="host-cpu"
                            label={tr('CPU')}
                            icon={Cpu}
                            percent={host.cpu_percent}
                            detail={tr('{0} cores · load {1}', [
                                host.cpus,
                                (host.load ?? [])
                                    .map((l) => l.toFixed(2))
                                    .join(' / '),
                            ])}
                        />
                        <HostCard
                            testId="host-memory"
                            label={tr('Memory')}
                            icon={MemoryStick}
                            percent={host.memory?.percent}
                            detail={`${formatBytes(host.memory?.used)} of ${formatBytes(host.memory?.total)}`}
                        />
                        <HostCard
                            testId="host-disk"
                            label={tr('Disk')}
                            icon={HardDrive}
                            percent={host.disk?.percent}
                            detail={`${formatBytes(host.disk?.used)} of ${formatBytes(host.disk?.total)}`}
                        />
                        <HostCard
                            testId="host-swap"
                            label={tr('Swap')}
                            icon={Timer}
                            percent={host.swap?.percent}
                            detail={tr('{0} of {1} · up {2}', [
                                formatBytes(host.swap?.used),
                                formatBytes(host.swap?.total),
                                formatUptime(host.uptime_seconds),
                            ])}
                        />
                    </div>
                ) : (
                    <Panel title={tr('Host')} icon={Server}>
                        <Unavailable what={tr('Host metrics')} />
                    </Panel>
                )}

                {/* Game runtime */}
                <Panel
                    title={tr('Game runtime (Go)')}
                    description={tr(
                        'Live WebSocket connections and memory of the game service',
                    )}
                    icon={Gamepad2}
                >
                    {game.available ? (
                        <div
                            className="flex flex-col gap-3 sm:gap-5"
                            data-testid="game-runtime"
                        >
                            <div className="grid grid-cols-3 gap-2 sm:gap-3 md:grid-cols-5">
                                <MiniStat
                                    label={tr('Heap')}
                                    value={formatBytes(game.heap_alloc_bytes)}
                                />
                                <MiniStat
                                    label={tr('Reserved')}
                                    value={formatBytes(game.sys_bytes)}
                                />
                                <MiniStat
                                    label={tr('Goroutines')}
                                    value={formatNumber(game.goroutines)}
                                />
                                <MiniStat
                                    label={tr('GC cycles')}
                                    value={formatNumber(game.gc_cycles)}
                                />
                                <MiniStat
                                    label={tr('Uptime')}
                                    value={formatUptime(game.uptime_seconds)}
                                    hint={game.go_version}
                                />
                            </div>
                            <div className="grid grid-cols-1 gap-2 sm:gap-3 md:grid-cols-2">
                                {(game.games ?? []).map((row) => (
                                    <div
                                        key={row.game}
                                        className="flex items-center justify-between gap-3 rounded-xl border border-border px-3 py-2 text-sm sm:px-4 sm:py-3 sm:text-base"
                                    >
                                        <span className="font-medium text-foreground">
                                            {GAME_NAMES[row.game] ?? row.game}
                                        </span>
                                        <span className="flex shrink-0 items-center gap-3 text-xs tabular-nums sm:gap-4 sm:text-sm">
                                            <span>
                                                <span className="font-semibold text-foreground">
                                                    {row.connections}
                                                </span>{' '}
                                                <span className="text-muted-foreground">
                                                    {tr('online')}
                                                </span>
                                            </span>
                                            <span>
                                                <span className="font-semibold text-foreground">
                                                    {row.sessions}
                                                </span>{' '}
                                                <span className="text-muted-foreground">
                                                    {tr('sessions')}
                                                </span>
                                            </span>
                                        </span>
                                    </div>
                                ))}
                            </div>
                        </div>
                    ) : (
                        <Unavailable what={tr('Game runtime stats')} />
                    )}
                </Panel>

                {/* Containers */}
                <Panel
                    title={tr('Containers')}
                    description={
                        containers.available
                            ? tr('{0} of {1} running · {2} game', [
                                  containers.items.filter(
                                      (c) => c.state === 'running',
                                  ).length,
                                  containers.items.length,
                                  gameContainers.length,
                              ])
                            : undefined
                    }
                    icon={Box}
                >
                    {!containers.available ? (
                        <Unavailable what={tr('Container metrics')} />
                    ) : (
                        <ResponsiveTable
                            testId="container-table"
                            rows={containers.items}
                            rowKey={(c) => c.id}
                            columns={[
                                {
                                    key: 'container',
                                    header: tr('Container'),
                                    primary: true,
                                    cell: (c) => (
                                        <div className="min-w-0">
                                            <div className="flex min-w-0 items-center gap-2">
                                                <span
                                                    className={cn(
                                                        'size-2 shrink-0 rounded-full',
                                                        c.state === 'running'
                                                            ? 'bg-emerald-500'
                                                            : 'bg-red-500',
                                                    )}
                                                    aria-hidden="true"
                                                />
                                                <span className="font-medium [overflow-wrap:anywhere] text-foreground">
                                                    {c.name}
                                                </span>
                                                {c.is_game && (
                                                    <span className="shrink-0 rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">
                                                        {tr('game')}
                                                    </span>
                                                )}
                                            </div>
                                            <span className="block text-xs font-normal [overflow-wrap:anywhere] text-muted-foreground">
                                                {c.image}
                                            </span>
                                        </div>
                                    ),
                                },
                                {
                                    key: 'state',
                                    header: tr('State'),
                                    summary: true,
                                    cell: (c) => (
                                        <span className="inline-flex flex-col items-start gap-1">
                                            <StateBadge state={c.state} />
                                            <span className="text-xs text-muted-foreground">
                                                {c.status}
                                            </span>
                                        </span>
                                    ),
                                },
                                {
                                    key: 'cpu',
                                    header: tr('CPU'),
                                    headerClassName: 'w-40',
                                    cell: (c) => (
                                        <div className="flex w-full min-w-24 flex-col gap-1.5">
                                            <span className="font-semibold text-foreground tabular-nums">
                                                {c.cpu_percent === null
                                                    ? '—'
                                                    : `${c.cpu_percent}%`}
                                            </span>
                                            {c.cpu_percent !== null && (
                                                <Meter
                                                    percent={c.cpu_percent}
                                                />
                                            )}
                                        </div>
                                    ),
                                },
                                {
                                    key: 'memory',
                                    header: tr('Memory'),
                                    headerClassName: 'w-48',
                                    cell: (c) => (
                                        <div className="flex w-full min-w-24 flex-col gap-1.5">
                                            <span className="text-foreground tabular-nums">
                                                {c.memory
                                                    ? `${formatBytes(c.memory.used)} / ${formatBytes(c.memory.total)}`
                                                    : '—'}
                                            </span>
                                            {c.memory && (
                                                <Meter
                                                    percent={c.memory.percent}
                                                />
                                            )}
                                        </div>
                                    ),
                                },
                                {
                                    key: 'network',
                                    header: tr('Net rx / tx'),
                                    cellClassName:
                                        'text-muted-foreground tabular-nums',
                                    cell: (c) =>
                                        c.network
                                            ? `${formatBytes(c.network.rx_bytes)} / ${formatBytes(c.network.tx_bytes)}`
                                            : '—',
                                },
                                {
                                    key: 'disk',
                                    header: tr('Disk r / w'),
                                    cellClassName:
                                        'text-muted-foreground tabular-nums',
                                    cell: (c) =>
                                        c.block
                                            ? `${formatBytes(c.block.read_bytes)} / ${formatBytes(c.block.write_bytes)}`
                                            : '—',
                                },
                                {
                                    key: 'pids',
                                    header: tr('PIDs'),
                                    align: 'right',
                                    cellClassName:
                                        'text-foreground tabular-nums',
                                    cell: (c) => c.pids ?? '—',
                                },
                            ]}
                        />
                    )}
                </Panel>
            </div>
        </>
    );
}

function MiniStat({
    label,
    value,
    hint,
}: {
    label: string;
    value: string;
    hint?: string;
}) {
    return (
        <div className="flex min-w-0 flex-col gap-0.5 rounded-xl bg-muted/50 px-2.5 py-2 sm:px-3 sm:py-2.5">
            <span className="truncate text-[11px] text-muted-foreground sm:text-xs">
                {tr(label)}
            </span>
            <span className="truncate font-display text-base font-bold text-foreground tabular-nums sm:text-xl">
                {value}
            </span>
            {hint && (
                <span className="truncate text-[11px] text-muted-foreground sm:text-xs">
                    {tr(hint)}
                </span>
            )}
        </div>
    );
}

ServerMonitor.layout = (page: ReactNode) => (
    <AdminLayout title={tr('Server Monitor')}>{page}</AdminLayout>
);
