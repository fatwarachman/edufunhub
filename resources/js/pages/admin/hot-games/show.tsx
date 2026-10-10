import { useAdminBreadcrumbs } from '@/components/admin/admin-breadcrumbs';
import {
    chartEvents,
    chartTooltipStyle,
    GAME_COLORS,
    KpiCard,
    UserAvatar,
} from '@/components/admin/dashboard-kit';
import {
    EmptyState,
    formatDuration,
    formatNumber,
    formatPercent,
    gameLabel,
    Panel,
    rateTone,
} from '@/components/admin/game-stats';
import {
    DayNavigator,
    formatDay,
    formatTime,
    HOT_GAMES_URL,
    type HotDayProps,
} from '@/components/admin/hot-games';
import { ResponsiveTable } from '@/components/responsive-table';
import AdminLayout from '@/layouts/admin-layout';
import { tr } from '@/lib/admin-i18n';
import { Head, Link } from '@inertiajs/react';
import {
    ArrowLeft,
    ChartColumnBig,
    Clock,
    Gamepad2,
    History,
    School,
    Target,
    Trophy,
    UsersRound,
} from 'lucide-react';
import { type ReactNode } from 'react';
import {
    Bar,
    BarChart,
    CartesianGrid,
    ResponsiveContainer,
    Tooltip,
    XAxis,
    YAxis,
} from 'recharts';

interface PlayerRow {
    user_id: number;
    name: string | null;
    avatar_url: string | null;
    grade: number | null;
    school_name: string | null;
    plays: number;
    points: number;
    best: number;
    accuracy: number | null;
    last_played_at: string;
}

interface PlayRow {
    id: number;
    user_id: number;
    name: string | null;
    mission: string | null;
    points: number;
    correct: number | null;
    wrong: number | null;
    accuracy: number | null;
    duration_seconds: number | null;
    played_at: string;
}

interface HotGameShowProps extends HotDayProps {
    game: { key: string; titleKey: string; category: string };
    summary: {
        rank: number | null;
        games_played: number;
        plays: number;
        players: number;
        points: number;
        accuracy: number | null;
        avg_duration: number | null;
        plays_per_player: number;
        peak_hour: number | null;
    };
    hourly: { hour: number; plays: number; players: number }[];
    players: PlayerRow[];
    plays: PlayRow[];
    schools: { school: string; plays: number; players: number }[];
}

const hourLabel = (hour: number) => `${String(hour).padStart(2, '0')}:00`;

export default function HotGameShow(props: HotGameShowProps) {
    const {
        game,
        summary,
        hourly,
        players,
        plays,
        schools,
        date,
        today,
        timezone,
    } = props;
    const title = gameLabel(game.key);
    const backHref =
        date === today ? HOT_GAMES_URL : `${HOT_GAMES_URL}?date=${date}`;
    useAdminBreadcrumbs([
        { title: tr('Hottest games'), href: backHref },
        { title: `${title} · ${formatDay(date, 'short')}` },
    ]);
    const color = GAME_COLORS[game.key] ?? 'var(--chart-2)';

    return (
        <>
            <Head title={`${title} · ${formatDay(date, 'short')}`} />

            <div className="flex min-w-0 flex-col gap-4">
                <Link
                    href={backHref}
                    className="inline-flex w-fit items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
                >
                    <ArrowLeft className="size-4" />
                    {tr('Hottest games')}
                </Link>
                <div className="flex flex-wrap items-end justify-between gap-4">
                    <div className="min-w-0">
                        <h2 className="flex flex-wrap items-center gap-2 font-display text-2xl font-bold text-foreground">
                            <span
                                className="size-3 shrink-0 rounded-full"
                                style={{ background: color }}
                                aria-hidden
                            />
                            {title}
                            {summary.rank !== null && (
                                <span
                                    className="rounded-full bg-primary/10 px-2.5 py-0.5 text-sm font-semibold text-primary"
                                    data-testid="hot-game-rank"
                                >
                                    {tr('Rank {0} of {1}', [
                                        summary.rank,
                                        summary.games_played,
                                    ])}
                                </span>
                            )}
                        </h2>
                        <p className="text-sm text-muted-foreground">
                            {formatDay(date)} · {tr('Timezone {0}', [timezone])}
                            {' · '}
                            <Link
                                href={`/admin/games/${game.key}`}
                                className="underline-offset-2 hover:text-foreground hover:underline"
                            >
                                {tr('All-time statistics')}
                            </Link>
                        </p>
                    </div>
                    <DayNavigator
                        day={props}
                        url={`${HOT_GAMES_URL}/${game.key}`}
                    />
                </div>

                <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
                    <KpiCard
                        label="Plays"
                        value={formatNumber(summary.plays)}
                        icon={ChartColumnBig}
                        accent="#6366f1"
                        footer={
                            <span className="text-xs text-muted-foreground">
                                {tr('{0} per player', [
                                    summary.plays_per_player,
                                ])}
                            </span>
                        }
                    />
                    <KpiCard
                        label="Players"
                        value={formatNumber(summary.players)}
                        icon={UsersRound}
                        accent="#10b981"
                        footer={
                            <span className="text-xs text-muted-foreground">
                                {tr('{0} points earned', [
                                    formatNumber(summary.points),
                                ])}
                            </span>
                        }
                    />
                    <KpiCard
                        label="Accuracy"
                        value={
                            <span className={rateTone(summary.accuracy)}>
                                {formatPercent(summary.accuracy)}
                            </span>
                        }
                        icon={Target}
                        accent="#f59e0b"
                    />
                    <KpiCard
                        label="Peak hour"
                        value={
                            summary.peak_hour === null
                                ? '—'
                                : hourLabel(summary.peak_hour)
                        }
                        icon={Clock}
                        accent="#f43f5e"
                        footer={
                            <span className="text-xs text-muted-foreground">
                                {tr('Avg. duration {0}', [
                                    formatDuration(summary.avg_duration),
                                ])}
                            </span>
                        }
                    />
                </div>

                {summary.plays === 0 ? (
                    <Panel title="Plays" icon={Gamepad2}>
                        <EmptyState
                            icon={Gamepad2}
                            title={tr('Nobody played this game on this day')}
                        />
                    </Panel>
                ) : (
                    <>
                        <Panel
                            title="Plays per hour"
                            description={tr('Local time ({0})', [timezone])}
                            icon={Clock}
                        >
                            <div
                                className="h-56 w-full"
                                data-testid="hot-game-hourly"
                            >
                                <ResponsiveContainer width="100%" height="100%">
                                    <BarChart
                                        {...chartEvents}
                                        data={hourly.map((slot) => ({
                                            ...slot,
                                            label: hourLabel(slot.hour),
                                        }))}
                                        margin={{ left: -20, right: 8, top: 8 }}
                                    >
                                        <CartesianGrid
                                            strokeDasharray="3 3"
                                            stroke="var(--border)"
                                            vertical={false}
                                        />
                                        <XAxis
                                            dataKey="label"
                                            interval={2}
                                            tick={{
                                                fill: 'var(--muted-foreground)',
                                                fontSize: 11,
                                            }}
                                        />
                                        <YAxis
                                            allowDecimals={false}
                                            tick={{
                                                fill: 'var(--muted-foreground)',
                                                fontSize: 11,
                                            }}
                                        />
                                        <Tooltip
                                            contentStyle={chartTooltipStyle}
                                            cursor={{ fill: 'var(--muted)' }}
                                        />
                                        <Bar
                                            dataKey="plays"
                                            name={tr('Plays')}
                                            fill={color}
                                            radius={[6, 6, 0, 0]}
                                        />
                                        <Bar
                                            dataKey="players"
                                            name={tr('Players')}
                                            fill="var(--chart-2)"
                                            radius={[6, 6, 0, 0]}
                                        />
                                    </BarChart>
                                </ResponsiveContainer>
                            </div>
                        </Panel>

                        <div className="grid min-w-0 grid-cols-1 gap-4 xl:grid-cols-3">
                            <Panel
                                title="Players"
                                description={tr(
                                    'Who played this game on this day',
                                )}
                                icon={Trophy}
                                className="xl:col-span-2"
                            >
                                <ResponsiveTable
                                    testId="hot-game-players"
                                    rows={players}
                                    rowKey={(row) => row.user_id}
                                    columns={[
                                        {
                                            key: 'player',
                                            header: tr('Player'),
                                            primary: true,
                                            cell: (row) => (
                                                <Link
                                                    href={`/admin/users/${row.user_id}`}
                                                    className="flex min-w-0 items-center gap-2 font-medium text-foreground hover:underline"
                                                >
                                                    <UserAvatar
                                                        name={row.name}
                                                        src={row.avatar_url}
                                                        userId={row.user_id}
                                                    />
                                                    <span className="flex min-w-0 flex-col">
                                                        <span className="truncate">
                                                            {row.name ?? '—'}
                                                        </span>
                                                        <span className="truncate text-xs font-normal text-muted-foreground">
                                                            {row.school_name ??
                                                                '—'}
                                                        </span>
                                                    </span>
                                                </Link>
                                            ),
                                        },
                                        {
                                            key: 'plays',
                                            header: tr('Plays'),
                                            summary: true,
                                            align: 'right',
                                            cellClassName:
                                                'whitespace-nowrap font-semibold text-foreground tabular-nums',
                                            cell: (row) =>
                                                formatNumber(row.plays),
                                        },
                                        {
                                            key: 'points',
                                            header: tr('Points'),
                                            align: 'right',
                                            cellClassName:
                                                'whitespace-nowrap text-foreground tabular-nums',
                                            cell: (row) =>
                                                formatNumber(row.points),
                                        },
                                        {
                                            key: 'accuracy',
                                            header: tr('Accuracy'),
                                            align: 'right',
                                            cellClassName:
                                                'whitespace-nowrap tabular-nums',
                                            cell: (row) => (
                                                <span
                                                    className={rateTone(
                                                        row.accuracy,
                                                    )}
                                                >
                                                    {formatPercent(
                                                        row.accuracy,
                                                    )}
                                                </span>
                                            ),
                                        },
                                        {
                                            key: 'last',
                                            header: tr('Last played'),
                                            align: 'right',
                                            cellClassName:
                                                'whitespace-nowrap text-muted-foreground tabular-nums',
                                            cell: (row) =>
                                                formatTime(
                                                    row.last_played_at,
                                                    timezone,
                                                ),
                                        },
                                    ]}
                                />
                            </Panel>
                            <Panel
                                title="Schools"
                                description={tr('Top 10 by plays')}
                                icon={School}
                            >
                                {schools.length === 0 ? (
                                    <EmptyState
                                        icon={School}
                                        title={tr('No school recorded')}
                                    />
                                ) : (
                                    <ul className="flex flex-col gap-2.5">
                                        {schools.map((row) => (
                                            <li
                                                key={row.school}
                                                className="flex items-center justify-between gap-3 text-sm"
                                            >
                                                <span className="min-w-0 truncate text-foreground">
                                                    {row.school}
                                                </span>
                                                <span className="shrink-0 text-xs text-muted-foreground tabular-nums">
                                                    {tr(
                                                        '{0} plays · {1} players',
                                                        [
                                                            formatNumber(
                                                                row.plays,
                                                            ),
                                                            formatNumber(
                                                                row.players,
                                                            ),
                                                        ],
                                                    )}
                                                </span>
                                            </li>
                                        ))}
                                    </ul>
                                )}
                            </Panel>
                        </div>

                        <Panel
                            title="Every play"
                            description={tr(
                                'Newest first · open a play for its questions',
                            )}
                            icon={History}
                        >
                            <ResponsiveTable
                                testId="hot-game-plays"
                                rows={plays}
                                rowKey={(row) => row.id}
                                columns={[
                                    {
                                        key: 'time',
                                        header: tr('Time'),
                                        cellClassName:
                                            'whitespace-nowrap text-muted-foreground tabular-nums',
                                        cell: (row) =>
                                            formatTime(row.played_at, timezone),
                                    },
                                    {
                                        key: 'player',
                                        header: tr('Player'),
                                        primary: true,
                                        cell: (row) => (
                                            <Link
                                                href={`/admin/users/${row.user_id}/plays/${row.id}`}
                                                className="font-medium text-foreground hover:underline"
                                            >
                                                {row.name ?? '—'}
                                            </Link>
                                        ),
                                    },
                                    {
                                        key: 'points',
                                        header: tr('Points'),
                                        summary: true,
                                        align: 'right',
                                        cellClassName:
                                            'whitespace-nowrap font-semibold text-foreground tabular-nums',
                                        cell: (row) => formatNumber(row.points),
                                    },
                                    {
                                        key: 'answers',
                                        header: tr('Correct / wrong'),
                                        align: 'right',
                                        cellClassName:
                                            'whitespace-nowrap tabular-nums',
                                        cell: (row) =>
                                            row.correct === null ? (
                                                '—'
                                            ) : (
                                                <span
                                                    className={rateTone(
                                                        row.accuracy,
                                                    )}
                                                >
                                                    {row.correct} / {row.wrong}
                                                </span>
                                            ),
                                    },
                                    {
                                        key: 'duration',
                                        header: tr('Duration'),
                                        align: 'right',
                                        cellClassName:
                                            'whitespace-nowrap text-muted-foreground tabular-nums',
                                        cell: (row) =>
                                            formatDuration(
                                                row.duration_seconds,
                                            ),
                                    },
                                ]}
                            />
                        </Panel>
                    </>
                )}
            </div>
        </>
    );
}

HotGameShow.layout = (page: ReactNode) => (
    <AdminLayout title={tr('Hottest games')}>{page}</AdminLayout>
);
