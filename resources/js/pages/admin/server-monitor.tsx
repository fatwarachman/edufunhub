import { EmptyState, formatNumber, Panel } from '@/components/admin/game-stats';
import AdminLayout from '@/layouts/admin-layout';
import { cn } from '@/lib/utils';
import { Head, router, usePoll } from '@inertiajs/react';
import {
    Box,
    ChevronDown,
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
    'snakes-and-ladders': 'Snakes & Ladders (rooms)',
    crossword: 'Crossword (rooms)',
    'market-math': 'Market Math (rooms)',
    'number-garden': 'Number & Letter Garden (rooms)',
    'explore-indonesia': 'Explore Indonesia (rooms)',
    'mini-lab': 'Mini Lab (rooms)',
    'floor-drop': 'Floor Drop (rooms)',
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
                    {label}
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
                {detail}
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
            title={`${what} unavailable`}
            description="The monitoring source did not respond. Check that the read-only Docker proxy and game service are running."
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
            <Head title="Server Monitor" />
            <div className="flex flex-col gap-4 sm:gap-6">
                <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="flex min-w-0 flex-col gap-0.5">
                        <h2 className="font-display text-xl font-bold text-foreground">
                            {host.hostname ?? 'Server'}
                        </h2>
                        <p className="text-sm text-muted-foreground">
                            Sampled{' '}
                            {new Date(monitor.sampled_at).toLocaleTimeString()}
                            {' · '}
                            {live
                                ? `refreshing every ${refreshSeconds}s`
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
                            {live ? 'Pause' : 'Resume'}
                        </button>
                        <button
                            type="button"
                            onClick={() => router.reload({ only: ['monitor'] })}
                            className="inline-flex h-9 items-center gap-2 rounded-xl border border-border bg-card px-3 text-sm font-medium text-foreground shadow-sm transition-colors hover:bg-muted"
                        >
                            <RefreshCw className="size-4" />
                            Refresh
                        </button>
                    </div>
                </div>

                {/* Host */}
                {host.available ? (
                    <div className="grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4">
                        <HostCard
                            testId="host-cpu"
                            label="CPU"
                            icon={Cpu}
                            percent={host.cpu_percent}
                            detail={`${host.cpus} cores · load ${(host.load ?? []).map((l) => l.toFixed(2)).join(' / ')}`}
                        />
                        <HostCard
                            testId="host-memory"
                            label="Memory"
                            icon={MemoryStick}
                            percent={host.memory?.percent}
                            detail={`${formatBytes(host.memory?.used)} of ${formatBytes(host.memory?.total)}`}
                        />
                        <HostCard
                            testId="host-disk"
                            label="Disk"
                            icon={HardDrive}
                            percent={host.disk?.percent}
                            detail={`${formatBytes(host.disk?.used)} of ${formatBytes(host.disk?.total)}`}
                        />
                        <HostCard
                            testId="host-swap"
                            label="Swap"
                            icon={Timer}
                            percent={host.swap?.percent}
                            detail={`${formatBytes(host.swap?.used)} of ${formatBytes(host.swap?.total)} · up ${formatUptime(host.uptime_seconds)}`}
                        />
                    </div>
                ) : (
                    <Panel title="Host" icon={Server}>
                        <Unavailable what="Host metrics" />
                    </Panel>
                )}

                {/* Game runtime */}
                <Panel
                    title="Game runtime (Go)"
                    description="Live WebSocket connections and memory of the game service"
                    icon={Gamepad2}
                >
                    {game.available ? (
                        <div
                            className="flex flex-col gap-3 sm:gap-5"
                            data-testid="game-runtime"
                        >
                            <div className="grid grid-cols-3 gap-2 sm:gap-3 md:grid-cols-5">
                                <MiniStat
                                    label="Heap"
                                    value={formatBytes(game.heap_alloc_bytes)}
                                />
                                <MiniStat
                                    label="Reserved"
                                    value={formatBytes(game.sys_bytes)}
                                />
                                <MiniStat
                                    label="Goroutines"
                                    value={formatNumber(game.goroutines)}
                                />
                                <MiniStat
                                    label="GC cycles"
                                    value={formatNumber(game.gc_cycles)}
                                />
                                <MiniStat
                                    label="Uptime"
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
                                                    online
                                                </span>
                                            </span>
                                            <span>
                                                <span className="font-semibold text-foreground">
                                                    {row.sessions}
                                                </span>{' '}
                                                <span className="text-muted-foreground">
                                                    sessions
                                                </span>
                                            </span>
                                        </span>
                                    </div>
                                ))}
                            </div>
                        </div>
                    ) : (
                        <Unavailable what="Game runtime stats" />
                    )}
                </Panel>

                {/* Containers */}
                <Panel
                    title="Containers"
                    description={
                        containers.available
                            ? `${containers.items.filter((c) => c.state === 'running').length} of ${containers.items.length} running · ${gameContainers.length} game`
                            : undefined
                    }
                    icon={Box}
                >
                    {!containers.available ? (
                        <Unavailable what="Container metrics" />
                    ) : (
                        <>
                            <ContainerAccordion items={containers.items} />
                            <div className="-mx-5 -my-4 hidden overflow-x-auto md:block">
                                <table
                                    className="w-full min-w-[760px] text-sm"
                                    data-testid="container-table"
                                >
                                    <thead>
                                        <tr className="border-b border-border text-left text-xs text-muted-foreground uppercase">
                                            <th className="px-5 py-3 font-semibold">
                                                Container
                                            </th>
                                            <th className="px-3 py-3 font-semibold">
                                                State
                                            </th>
                                            <th className="w-40 px-3 py-3 font-semibold">
                                                CPU
                                            </th>
                                            <th className="w-48 px-3 py-3 font-semibold">
                                                Memory
                                            </th>
                                            <th className="px-3 py-3 font-semibold">
                                                Net rx / tx
                                            </th>
                                            <th className="px-5 py-3 text-right font-semibold">
                                                PIDs
                                            </th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {containers.items.map((c) => (
                                            <tr
                                                key={c.id}
                                                className="border-b border-border last:border-0"
                                            >
                                                <td className="px-5 py-3">
                                                    <div className="flex min-w-0 items-center gap-2">
                                                        <span className="truncate font-medium text-foreground">
                                                            {c.name}
                                                        </span>
                                                        {c.is_game && (
                                                            <span className="rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">
                                                                game
                                                            </span>
                                                        )}
                                                    </div>
                                                    <span className="block truncate text-xs text-muted-foreground">
                                                        {c.image}
                                                    </span>
                                                </td>
                                                <td className="px-3 py-3">
                                                    <StateBadge
                                                        state={c.state}
                                                    />
                                                    <span className="mt-1 block text-xs text-muted-foreground">
                                                        {c.status}
                                                    </span>
                                                </td>
                                                <td className="px-3 py-3">
                                                    <div className="flex flex-col gap-1.5">
                                                        <span className="font-semibold text-foreground tabular-nums">
                                                            {c.cpu_percent ===
                                                            null
                                                                ? '—'
                                                                : `${c.cpu_percent}%`}
                                                        </span>
                                                        {c.cpu_percent !==
                                                            null && (
                                                            <Meter
                                                                percent={
                                                                    c.cpu_percent
                                                                }
                                                            />
                                                        )}
                                                    </div>
                                                </td>
                                                <td className="px-3 py-3">
                                                    <div className="flex flex-col gap-1.5">
                                                        <span className="text-foreground tabular-nums">
                                                            {c.memory
                                                                ? `${formatBytes(c.memory.used)} / ${formatBytes(c.memory.total)}`
                                                                : '—'}
                                                        </span>
                                                        {c.memory && (
                                                            <Meter
                                                                percent={
                                                                    c.memory
                                                                        .percent
                                                                }
                                                            />
                                                        )}
                                                    </div>
                                                </td>
                                                <td className="px-3 py-3 text-muted-foreground tabular-nums">
                                                    {c.network
                                                        ? `${formatBytes(c.network.rx_bytes)} / ${formatBytes(c.network.tx_bytes)}`
                                                        : '—'}
                                                </td>
                                                <td className="px-5 py-3 text-right text-foreground tabular-nums">
                                                    {c.pids ?? '—'}
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </>
                    )}
                </Panel>
            </div>
        </>
    );
}

function ContainerAccordion({ items }: { items: ContainerRow[] }) {
    const [openIds, setOpenIds] = useState<Set<string>>(() => new Set());

    const toggle = (id: string) =>
        setOpenIds((current) => {
            const next = new Set(current);
            if (next.has(id)) {
                next.delete(id);
            } else {
                next.add(id);
            }
            return next;
        });

    return (
        <ul
            className="-mx-5 -my-4 divide-y divide-border md:hidden"
            data-testid="container-accordion"
        >
            {items.map((c) => {
                const open = openIds.has(c.id);
                const panelId = `container-panel-${c.id}`;
                return (
                    <li key={c.id}>
                        <button
                            type="button"
                            onClick={() => toggle(c.id)}
                            aria-expanded={open}
                            aria-controls={panelId}
                            className="flex w-full items-center gap-3 px-5 py-3.5 text-left transition-colors hover:bg-muted/40 focus-visible:bg-muted/40 focus-visible:outline-none"
                        >
                            <span
                                className={cn(
                                    'size-2 shrink-0 rounded-full',
                                    c.state === 'running'
                                        ? 'bg-emerald-500'
                                        : 'bg-red-500',
                                )}
                                aria-hidden="true"
                            />
                            <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                                <span className="flex min-w-0 items-center gap-2">
                                    <span className="truncate text-sm font-medium text-foreground">
                                        {c.name}
                                    </span>
                                    {c.is_game && (
                                        <span className="shrink-0 rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">
                                            game
                                        </span>
                                    )}
                                </span>
                                <span className="truncate text-xs text-muted-foreground tabular-nums">
                                    CPU{' '}
                                    {c.cpu_percent === null
                                        ? '—'
                                        : `${c.cpu_percent}%`}{' '}
                                    · RAM {formatBytes(c.memory?.used)}
                                </span>
                            </span>
                            <ChevronDown
                                className={cn(
                                    'size-4 shrink-0 text-muted-foreground transition-transform duration-300 ease-out motion-reduce:transition-none',
                                    open && 'rotate-180',
                                )}
                                aria-hidden="true"
                            />
                        </button>
                        <div
                            id={panelId}
                            className={cn(
                                'grid transition-[grid-template-rows,opacity] duration-300 ease-out motion-reduce:transition-none',
                                open
                                    ? 'grid-rows-[1fr] opacity-100'
                                    : 'grid-rows-[0fr] opacity-0',
                            )}
                            aria-hidden={!open}
                            inert={!open}
                        >
                            <div className="min-h-0 overflow-hidden">
                                <dl className="flex flex-col gap-3 px-5 pt-1 pb-4 text-sm">
                                    <AccordionRow label="State">
                                        <span className="flex flex-col items-end gap-1">
                                            <StateBadge state={c.state} />
                                            <span className="text-xs text-muted-foreground">
                                                {c.status}
                                            </span>
                                        </span>
                                    </AccordionRow>
                                    <AccordionRow label="Image">
                                        <span className="truncate text-foreground">
                                            {c.image}
                                        </span>
                                    </AccordionRow>
                                    <div className="flex flex-col gap-1.5">
                                        <AccordionRow label="CPU">
                                            <span className="font-semibold text-foreground tabular-nums">
                                                {c.cpu_percent === null
                                                    ? '—'
                                                    : `${c.cpu_percent}%`}
                                            </span>
                                        </AccordionRow>
                                        {c.cpu_percent !== null && (
                                            <Meter percent={c.cpu_percent} />
                                        )}
                                    </div>
                                    <div className="flex flex-col gap-1.5">
                                        <AccordionRow label="Memory">
                                            <span className="text-foreground tabular-nums">
                                                {c.memory
                                                    ? `${formatBytes(c.memory.used)} / ${formatBytes(c.memory.total)}`
                                                    : '—'}
                                            </span>
                                        </AccordionRow>
                                        {c.memory && (
                                            <Meter percent={c.memory.percent} />
                                        )}
                                    </div>
                                    <AccordionRow label="Net rx / tx">
                                        <span className="text-foreground tabular-nums">
                                            {c.network
                                                ? `${formatBytes(c.network.rx_bytes)} / ${formatBytes(c.network.tx_bytes)}`
                                                : '—'}
                                        </span>
                                    </AccordionRow>
                                    <AccordionRow label="Disk r / w">
                                        <span className="text-foreground tabular-nums">
                                            {c.block
                                                ? `${formatBytes(c.block.read_bytes)} / ${formatBytes(c.block.write_bytes)}`
                                                : '—'}
                                        </span>
                                    </AccordionRow>
                                    <AccordionRow label="PIDs">
                                        <span className="text-foreground tabular-nums">
                                            {c.pids ?? '—'}
                                        </span>
                                    </AccordionRow>
                                </dl>
                            </div>
                        </div>
                    </li>
                );
            })}
        </ul>
    );
}

function AccordionRow({
    label,
    children,
}: {
    label: string;
    children: ReactNode;
}) {
    return (
        <div className="flex min-w-0 items-start justify-between gap-4">
            <dt className="shrink-0 text-xs font-semibold tracking-wide text-muted-foreground uppercase">
                {label}
            </dt>
            <dd className="flex min-w-0 justify-end text-right">{children}</dd>
        </div>
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
                {label}
            </span>
            <span className="truncate font-display text-base font-bold text-foreground tabular-nums sm:text-xl">
                {value}
            </span>
            {hint && (
                <span className="truncate text-[11px] text-muted-foreground sm:text-xs">
                    {hint}
                </span>
            )}
        </div>
    );
}

ServerMonitor.layout = (page: ReactNode) => (
    <AdminLayout title="Server Monitor">{page}</AdminLayout>
);
