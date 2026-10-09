import {
    axisTick,
    chartTooltipStyle,
    GAME_COLORS,
    GameDot,
    KpiCard,
    timeAgo,
} from '@/components/admin/dashboard-kit';
import {
    EmptyState,
    fieldClass,
    formatNumber,
    gameLabel,
    LEVEL_LABELS,
    Panel,
} from '@/components/admin/game-stats';
import { ResponsiveTable } from '@/components/responsive-table';
import AdminLayout from '@/layouts/admin-layout';
import { tr } from '@/lib/admin-i18n';
import { cn } from '@/lib/utils';
import { Head, Link, router } from '@inertiajs/react';
import {
    ChevronDown,
    Clock,
    Gamepad2,
    Hourglass,
    RotateCcw,
    Search,
    Timer,
    UsersRound,
} from 'lucide-react';
import { type ReactNode, useEffect, useRef, useState } from 'react';
import {
    Bar,
    BarChart,
    CartesianGrid,
    ResponsiveContainer,
    Tooltip,
    XAxis,
    YAxis,
} from 'recharts';

interface GameShare {
    key: string;
    seconds: number;
    plays: number;
    share: number;
}

interface PlayerRow {
    user_id: number;
    name: string;
    account_name: string;
    email: string;
    grade: number | null;
    school_name: string | null;
    seconds: number;
    plays: number;
    timed_plays: number;
    avg_session: number | null;
    top_game: string | null;
    games: GameShare[];
    last_played_at: string;
}

interface GameRow {
    key: string;
    accent: string;
    seconds: number;
    plays: number;
    timed_plays: number;
    players: number;
    avg_session: number | null;
    longest: number | null;
}

interface Filters {
    days: number;
    game: string | null;
    search: string | null;
}

interface Props {
    filters: Filters;
    games: { key: string; accent: string }[];
    report: {
        summary: {
            seconds: number;
            plays: number;
            timed_plays: number;
            untimed_plays: number;
            players: number;
            avg_session: number | null;
            avg_per_player: number | null;
        };
        games: GameRow[];
        daily: { date: string; seconds: number; players: number }[];
        players: PlayerRow[];
    };
    playerLimit: number;
}

const RANGES = [
    { value: 0, label: 'All time' },
    { value: 1, label: 'Today' },
    { value: 7, label: '7 days' },
    { value: 30, label: '30 days' },
    { value: 90, label: '90 days' },
];

const plural = (count: number, word: string) =>
    tr(count === 1 ? `{0} ${word}` : `{0} ${word}s`, [formatNumber(count)]);

/** 4h 05m · 12m 30s · 45s */
export function formatPlayTime(seconds: number | null | undefined): string {
    if (seconds === null || seconds === undefined) return '—';
    const total = Math.max(0, Math.round(seconds));
    const h = Math.floor(total / 3600);
    const m = Math.floor((total % 3600) / 60);
    const s = total % 60;
    if (h > 0) return `${h}h ${String(m).padStart(2, '0')}m`;
    if (m > 0) return `${m}m ${String(s).padStart(2, '0')}s`;
    return `${s}s`;
}

const gameColor = (key: string, accent?: string) =>
    GAME_COLORS[key] ?? accent ?? 'var(--primary)';

export default function PlayingTime({
    filters,
    games,
    report,
    playerLimit,
}: Props) {
    const { summary } = report;
    const [search, setSearch] = useState(filters.search ?? '');
    const [open, setOpen] = useState<Set<number>>(new Set());
    const debounce = useRef<ReturnType<typeof setTimeout> | null>(null);
    const firstRender = useRef(true);
    const accents = Object.fromEntries(games.map((g) => [g.key, g.accent]));

    const apply = (changes: Partial<Filters>) => {
        const next = { ...filters, ...changes };
        router.get(
            '/admin/playing-time',
            Object.fromEntries(
                Object.entries(next).filter(
                    ([, value]) =>
                        value !== null && value !== '' && value !== 0,
                ),
            ),
            { preserveScroll: true, preserveState: true },
        );
    };

    useEffect(() => {
        if (firstRender.current) {
            firstRender.current = false;
            return;
        }
        if (debounce.current) clearTimeout(debounce.current);
        debounce.current = setTimeout(
            () => apply({ search: search.trim() || null }),
            400,
        );
        return () => {
            if (debounce.current) clearTimeout(debounce.current);
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [search]);

    const toggle = (id: number) =>
        setOpen((current) => {
            const next = new Set(current);
            if (next.has(id)) {
                next.delete(id);
            } else {
                next.add(id);
            }
            return next;
        });

    const maxGame = Math.max(1, ...report.games.map((g) => g.seconds));
    const filtered = Boolean(filters.days || filters.game || filters.search);

    return (
        <>
            <Head title={tr('Playing Time')} />
            <div className="flex flex-col gap-6">
                <div className="flex flex-col gap-1">
                    <h2 className="font-display text-2xl font-bold text-foreground">
                        {tr('Playing Time')}
                    </h2>
                    <p className="text-sm text-muted-foreground">
                        {tr(
                            'How long each player plays, and in which games. Time comes from finished games reported by the game server.',
                        )}
                    </p>
                </div>

                <div
                    className="flex flex-wrap items-center gap-2 rounded-2xl border border-border bg-card p-3 shadow-sm"
                    data-testid="playing-time-filters"
                >
                    <div
                        className="inline-flex rounded-lg border border-border bg-background p-1"
                        role="group"
                        aria-label={tr('Time range')}
                    >
                        {RANGES.map((range) => (
                            <button
                                key={range.value}
                                type="button"
                                onClick={() => apply({ days: range.value })}
                                aria-pressed={filters.days === range.value}
                                className={cn(
                                    'rounded-md px-3 py-1 text-sm font-medium transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none',
                                    filters.days === range.value
                                        ? 'bg-primary text-primary-foreground'
                                        : 'text-muted-foreground hover:text-foreground',
                                )}
                            >
                                {tr(range.label)}
                            </button>
                        ))}
                    </div>
                    <select
                        aria-label={tr('Game')}
                        value={filters.game ?? ''}
                        onChange={(event) =>
                            apply({ game: event.target.value || null })
                        }
                        className={fieldClass}
                        data-testid="playing-time-game"
                    >
                        <option value="">{tr('All games')}</option>
                        {games.map((game) => (
                            <option key={game.key} value={game.key}>
                                {gameLabel(game.key)}
                            </option>
                        ))}
                    </select>
                    <div className="relative min-w-0 flex-1 sm:max-w-xs">
                        <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
                        <input
                            value={search}
                            onChange={(event) => setSearch(event.target.value)}
                            placeholder={tr('Search player, nickname or email')}
                            aria-label={tr('Search players')}
                            className={`${fieldClass} w-full pl-9`}
                            data-testid="playing-time-search"
                        />
                    </div>
                    {filtered && (
                        <button
                            type="button"
                            onClick={() => {
                                setSearch('');
                                router.get(
                                    '/admin/playing-time',
                                    {},
                                    { preserveScroll: true },
                                );
                            }}
                            className="inline-flex h-9 items-center gap-1.5 rounded-lg px-3 text-sm font-medium text-muted-foreground hover:bg-accent hover:text-foreground"
                        >
                            <RotateCcw className="size-4" />
                            {tr('Reset')}
                        </button>
                    )}
                </div>

                <div className="grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4">
                    <KpiCard
                        label={tr('Total playing time')}
                        value={formatPlayTime(summary.seconds)}
                        icon={Clock}
                        accent="#6366f1"
                        footer={
                            <span className="text-xs text-muted-foreground">
                                {plural(summary.timed_plays, 'timed play')}
                            </span>
                        }
                    />
                    <KpiCard
                        label={tr('Avg per player')}
                        value={formatPlayTime(summary.avg_per_player)}
                        icon={UsersRound}
                        accent="#10b981"
                        footer={
                            <span className="text-xs text-muted-foreground">
                                {plural(summary.players, 'player')}
                            </span>
                        }
                    />
                    <KpiCard
                        label={tr('Avg session')}
                        value={formatPlayTime(summary.avg_session)}
                        icon={Timer}
                        accent="#f59e0b"
                        footer={
                            <span className="text-xs text-muted-foreground">
                                {tr('per finished game')}
                            </span>
                        }
                    />
                    <KpiCard
                        label={tr('Untimed plays')}
                        value={formatNumber(summary.untimed_plays)}
                        icon={Hourglass}
                        accent="#94a3b8"
                        footer={
                            <span className="text-xs text-muted-foreground">
                                {tr('no duration reported')}
                            </span>
                        }
                    />
                </div>

                <div className="grid grid-cols-1 gap-6 lg:grid-cols-5">
                    <Panel
                        title={tr('Daily playing time')}
                        description={tr(
                            'Minutes played per day · last {0} days',
                            [report.daily.length],
                        )}
                        icon={Clock}
                        className="lg:col-span-3"
                    >
                        <div className="h-56" data-testid="playing-time-daily">
                            <ResponsiveContainer width="100%" height="100%">
                                <BarChart
                                    data={report.daily.map((day) => ({
                                        ...day,
                                        minutes:
                                            Math.round(day.seconds / 6) / 10,
                                    }))}
                                    margin={{
                                        top: 4,
                                        right: 4,
                                        left: -18,
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
                                        tickFormatter={(value: string) =>
                                            new Date(value).toLocaleDateString(
                                                undefined,
                                                {
                                                    day: 'numeric',
                                                    month: 'short',
                                                },
                                            )
                                        }
                                    />
                                    <YAxis
                                        tick={axisTick}
                                        tickLine={false}
                                        axisLine={false}
                                        allowDecimals={false}
                                    />
                                    <Tooltip
                                        contentStyle={chartTooltipStyle}
                                        cursor={{ fill: 'var(--muted)' }}
                                        formatter={(_value, _name, item) => [
                                            formatPlayTime(
                                                (
                                                    item.payload as {
                                                        seconds: number;
                                                    }
                                                ).seconds,
                                            ),
                                            'Playing time',
                                        ]}
                                    />
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
                        title={tr('By game')}
                        description={tr('Total time · avg session · players')}
                        icon={Gamepad2}
                        className="lg:col-span-2"
                    >
                        {report.games.length === 0 ? (
                            <EmptyState
                                icon={Gamepad2}
                                title={tr('No games played in this range')}
                            />
                        ) : (
                            <ul
                                className="flex flex-col gap-3.5"
                                data-testid="playing-time-games"
                            >
                                {report.games.map((game) => (
                                    <li
                                        key={game.key}
                                        className="flex flex-col gap-1.5"
                                    >
                                        <div className="flex items-center justify-between gap-2 text-sm">
                                            <Link
                                                href={`/admin/games/${game.key}`}
                                                className="font-medium text-foreground hover:underline"
                                            >
                                                <GameDot game={game.key} />
                                            </Link>
                                            <span className="font-semibold text-foreground tabular-nums">
                                                {formatPlayTime(game.seconds)}
                                            </span>
                                        </div>
                                        <div className="h-2 overflow-hidden rounded-full bg-muted">
                                            <div
                                                className="h-full rounded-full"
                                                style={{
                                                    width: `${(game.seconds / maxGame) * 100}%`,
                                                    background: gameColor(
                                                        game.key,
                                                        game.accent,
                                                    ),
                                                }}
                                            />
                                        </div>
                                        <p className="text-xs text-muted-foreground">
                                            {tr('avg')}{' '}
                                            {formatPlayTime(game.avg_session)}{' '}
                                            {tr('· longest')}{' '}
                                            {formatPlayTime(game.longest)} ·{' '}
                                            {plural(game.players, 'player')} ·{' '}
                                            {plural(game.plays, 'play')}
                                        </p>
                                    </li>
                                ))}
                            </ul>
                        )}
                    </Panel>
                </div>

                <Panel
                    title={tr('Players')}
                    description={tr(
                        'Ranked by total playing time · top {0}. Open a row to see the time per game.',
                        [playerLimit],
                    )}
                    icon={UsersRound}
                >
                    {report.players.length === 0 ? (
                        <EmptyState
                            icon={UsersRound}
                            title={tr('No players found')}
                            description={tr(
                                'Change the range, game or search.',
                            )}
                        />
                    ) : (
                        <ul
                            className="-mx-5 -my-5 divide-y divide-border"
                            data-testid="playing-time-players"
                        >
                            {report.players.map((player, index) => {
                                const expanded = open.has(player.user_id);
                                const panelId = `pt-player-${player.user_id}`;
                                return (
                                    <li
                                        key={player.user_id}
                                        data-testid={`playing-time-player-${player.user_id}`}
                                    >
                                        <button
                                            type="button"
                                            onClick={() =>
                                                toggle(player.user_id)
                                            }
                                            aria-expanded={expanded}
                                            aria-controls={panelId}
                                            className="flex w-full items-center gap-3 px-5 py-3 text-left hover:bg-muted/40 focus-visible:bg-muted/40 focus-visible:outline-none"
                                        >
                                            <span className="w-6 shrink-0 text-right text-sm font-semibold text-muted-foreground tabular-nums">
                                                {index + 1}
                                            </span>
                                            <span className="flex min-w-0 flex-1 flex-col gap-1.5">
                                                <span className="flex flex-wrap items-baseline gap-x-2">
                                                    <span className="truncate font-medium text-foreground">
                                                        {player.name}
                                                    </span>
                                                    <span className="truncate text-xs text-muted-foreground">
                                                        {[
                                                            player.grade !==
                                                            null
                                                                ? `Grade ${player.grade}`
                                                                : null,
                                                            player.school_name,
                                                        ]
                                                            .filter(Boolean)
                                                            .join(' · ') ||
                                                            player.email}
                                                    </span>
                                                </span>
                                                <ShareStrip
                                                    games={player.games}
                                                    accents={accents}
                                                />
                                            </span>
                                            <span className="hidden w-32 shrink-0 text-right text-xs text-muted-foreground sm:block">
                                                {player.top_game ? (
                                                    <GameDot
                                                        game={player.top_game}
                                                    />
                                                ) : (
                                                    '—'
                                                )}
                                            </span>
                                            <span className="flex w-20 shrink-0 flex-col items-end">
                                                <span className="font-semibold text-foreground tabular-nums">
                                                    {formatPlayTime(
                                                        player.seconds,
                                                    )}
                                                </span>
                                                <span className="text-xs text-muted-foreground tabular-nums">
                                                    {plural(
                                                        player.plays,
                                                        'play',
                                                    )}
                                                </span>
                                            </span>
                                            <ChevronDown
                                                className={cn(
                                                    'size-4 shrink-0 text-muted-foreground transition-transform duration-300 motion-reduce:transition-none',
                                                    expanded && 'rotate-180',
                                                )}
                                            />
                                        </button>
                                        <div
                                            id={panelId}
                                            className={cn(
                                                'grid transition-[grid-template-rows,opacity] duration-300 ease-out motion-reduce:transition-none',
                                                expanded
                                                    ? 'grid-rows-[1fr] opacity-100'
                                                    : 'grid-rows-[0fr] opacity-0',
                                            )}
                                            aria-hidden={!expanded}
                                            inert={!expanded}
                                        >
                                            <div className="min-h-0 overflow-hidden">
                                                <PlayerBreakdown
                                                    player={player}
                                                    accents={accents}
                                                />
                                            </div>
                                        </div>
                                    </li>
                                );
                            })}
                        </ul>
                    )}
                </Panel>
            </div>
        </>
    );
}

/** One thin stacked bar: share of the player's time per game. */
function ShareStrip({
    games,
    accents,
}: {
    games: GameShare[];
    accents: Record<string, string>;
}) {
    const timed = games.filter((game) => game.seconds > 0);
    if (timed.length === 0) {
        return <span className="h-1.5 w-full rounded-full bg-muted" />;
    }
    return (
        <span
            className="flex h-1.5 w-full overflow-hidden rounded-full bg-muted"
            aria-hidden="true"
        >
            {timed.map((game) => (
                <span
                    key={game.key}
                    className="h-full"
                    style={{
                        width: `${game.share}%`,
                        background: gameColor(game.key, accents[game.key]),
                    }}
                />
            ))}
        </span>
    );
}

function PlayerBreakdown({
    player,
    accents,
}: {
    player: PlayerRow;
    accents: Record<string, string>;
}) {
    return (
        <div className="flex flex-col gap-3 border-t border-dashed border-border bg-muted/20 px-5 py-4 sm:pl-14">
            <dl className="grid grid-cols-2 gap-x-6 gap-y-1 text-xs sm:grid-cols-4">
                <Fact label={tr('Avg session')}>
                    {formatPlayTime(player.avg_session)}
                </Fact>
                <Fact label={tr('Timed plays')}>
                    {player.timed_plays} / {player.plays}
                </Fact>
                <Fact label={tr('Last played')}>
                    {timeAgo(player.last_played_at)}
                </Fact>
                <Fact label={tr('Level')}>
                    {player.grade !== null
                        ? (LEVEL_LABELS[
                              player.grade <= 6
                                  ? 'sd'
                                  : player.grade <= 9
                                    ? 'smp'
                                    : 'sma'
                          ] ?? '—')
                        : '—'}
                </Fact>
            </dl>
            <ResponsiveTable
                testId={`playing-time-player-games-${player.user_id}`}
                rows={player.games}
                rowKey={(game) => game.key}
                columns={[
                    {
                        key: 'game',
                        header: tr('Game'),
                        primary: true,
                        cellClassName: 'py-1.5 text-foreground',
                        cell: (game) => <GameDot game={game.key} />,
                    },
                    {
                        key: 'time',
                        header: tr('Time'),
                        align: 'right',
                        summary: true,
                        cellClassName:
                            'py-1.5 font-medium text-foreground tabular-nums',
                        cell: (game) => formatPlayTime(game.seconds),
                    },
                    {
                        key: 'plays',
                        header: tr('Plays'),
                        align: 'right',
                        cellClassName:
                            'py-1.5 text-muted-foreground tabular-nums',
                        cell: (game) => game.plays,
                    },
                    {
                        key: 'share',
                        header: tr('Share'),
                        headerClassName: 'w-2/5',
                        cellClassName: 'py-1.5',
                        cell: (game) => (
                            <span className="flex w-full min-w-32 items-center gap-2">
                                <span className="h-2 flex-1 overflow-hidden rounded-full bg-muted">
                                    <span
                                        className="block h-full rounded-full"
                                        style={{
                                            width: `${game.share}%`,
                                            background: gameColor(
                                                game.key,
                                                accents[game.key],
                                            ),
                                        }}
                                    />
                                </span>
                                <span className="w-10 text-right text-xs text-muted-foreground tabular-nums">
                                    {game.share}%
                                </span>
                            </span>
                        ),
                    },
                ]}
            />
            <Link
                href={`/admin/users/${player.user_id}`}
                className="w-fit text-xs font-medium text-foreground underline decoration-border underline-offset-4 hover:decoration-foreground"
            >
                {tr('Open profile of')} {player.account_name}
            </Link>
        </div>
    );
}

function Fact({ label, children }: { label: string; children: ReactNode }) {
    return (
        <div className="flex items-baseline justify-between gap-2 sm:flex-col sm:items-start sm:gap-0">
            <dt className="text-muted-foreground uppercase">{tr(label)}</dt>
            <dd className="font-semibold text-foreground tabular-nums">
                {children}
            </dd>
        </div>
    );
}

PlayingTime.layout = (page: ReactNode) => (
    <AdminLayout title={tr('Playing Time')}>{page}</AdminLayout>
);
