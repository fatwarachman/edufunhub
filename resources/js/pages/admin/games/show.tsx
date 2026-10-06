import { smoothLine } from '@/components/admin/dashboard-kit';
import {
    BAND_LABELS,
    BucketTable,
    EmptyState,
    formatDateTime,
    formatDuration,
    formatNumber,
    formatPercent,
    gameLabel,
    LEVEL_LABELS,
    Panel,
    rateTone,
    StatTile,
    useSubjectLabel,
    type Bucket,
} from '@/components/admin/game-stats';
import { GameTabs } from '@/components/admin/game-tabs';
import { ResponsiveTable } from '@/components/responsive-table';
import AdminLayout from '@/layouts/admin-layout';
import { tr } from '@/lib/admin-i18n';
import { cn } from '@/lib/utils';
import { Head, Link, router } from '@inertiajs/react';
import {
    ArrowLeft,
    Cake,
    ChartColumnBig,
    Clock,
    Coins,
    GraduationCap,
    History,
    Lightbulb,
    ListChecks,
    Map,
    School,
    Target,
    Trophy,
    UsersRound,
} from 'lucide-react';
import { type ReactNode } from 'react';
import {
    Area,
    AreaChart,
    Bar,
    BarChart,
    CartesianGrid,
    ResponsiveContainer,
    Tooltip,
    XAxis,
    YAxis,
} from 'recharts';

const NUMERIC_CELL = 'text-foreground tabular-nums';

interface PlayerRow {
    user_id: number;
    name: string;
    grade: number | null;
    age: number | null;
    school_name: string | null;
    plays: number;
    points: number;
    best: number;
    accuracy: number | null;
    last_played_at: string;
}

interface RecentRow {
    id: number;
    user_id: number;
    name: string | null;
    mission: string | null;
    grade: number | null;
    age: number | null;
    points: number;
    correct: number | null;
    wrong: number | null;
    accuracy: number | null;
    duration_seconds: number | null;
    played_at: string;
}

interface QuestionRow {
    id: number;
    key: string;
    subject: string;
    band: number | null;
    prompt: string;
    answered: number;
    success_rate: number | null;
}

interface Stats {
    summary: {
        plays: number;
        players: number;
        points: number;
        avg_points: number;
        avg_duration: number | null;
        total_duration: number;
        accuracy: number | null;
        success_rate: number | null;
        plays_per_player: number;
    };
    daily: { date: string; plays: number; players: number }[];
    byAge: Bucket[];
    byGrade: Bucket[];
    byLevel: Bucket[];
    byMission: Bucket[];
    bySchool: Bucket[];
    outcomes: { label: string; count: number }[];
    players: PlayerRow[];
    recent: RecentRow[];
    questions: { hardest: QuestionRow[]; total_answers: number };
}

interface ShowProps {
    game: {
        key: string;
        accent: string;
        tracked: boolean;
        awardsPoints: boolean;
        minPlayers: number;
        maxPlayers: number;
    };
    days: number;
    stats: Stats;
    passPercent: number;
}

/** Player count label in admin copy (host/projector screens excluded). */
function adminPlayerCount(min: number, max: number): string {
    if (max <= 1) {
        return tr('Solo');
    }

    if (min === max) {
        return tr('{0} players', [max]);
    }

    return min <= 1
        ? tr('{0}–{1} players', [min, max])
        : tr('Min. {0} · max {1} players', [min, max]);
}

const RANGES = [
    { value: 0, label: 'All time' },
    { value: 7, label: '7 days' },
    { value: 30, label: '30 days' },
    { value: 90, label: '90 days' },
];

const tooltipStyle = {
    background: 'var(--popover)',
    border: '1px solid var(--border)',
    borderRadius: 12,
    color: 'var(--popover-foreground)',
    fontSize: 12,
};

export default function GameShow({
    game,
    days,
    stats,
    passPercent,
}: ShowProps) {
    const subjectLabel = useSubjectLabel();
    const { summary } = stats;
    const hasPlays = summary.plays > 0;

    return (
        <>
            <Head title={tr('{0} · Statistics', [gameLabel(game.key)])} />
            <div className="flex flex-col gap-6">
                <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
                    <div className="flex flex-col gap-2">
                        <Link
                            href="/admin/games"
                            className="inline-flex w-fit items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
                        >
                            <ArrowLeft className="size-4" />
                            {tr('All games')}
                        </Link>
                        <div className="flex flex-wrap items-center gap-3">
                            <span
                                className="size-3 shrink-0 rounded-full"
                                style={{ background: game.accent }}
                            />
                            <h2 className="font-display text-2xl font-bold text-foreground">
                                {gameLabel(game.key)}
                            </h2>
                            <span
                                className="inline-flex items-center gap-1 rounded-full border border-border bg-muted px-2 py-0.5 text-xs font-medium whitespace-nowrap text-muted-foreground"
                                data-testid="admin-game-players"
                            >
                                <UsersRound className="size-3.5" aria-hidden />
                                {adminPlayerCount(
                                    game.minPlayers,
                                    game.maxPlayers,
                                )}
                            </span>
                        </div>
                        <p className="text-sm text-muted-foreground">
                            {tr('A play counts as successful when more than')}{' '}
                            {passPercent}
                            {tr('% of its answers are correct.')}
                        </p>
                    </div>
                    <div
                        className="inline-flex w-fit rounded-lg border border-border bg-card p-1"
                        role="group"
                        aria-label={tr('Time range')}
                    >
                        {RANGES.map((range) => (
                            <button
                                key={range.value}
                                type="button"
                                onClick={() =>
                                    router.get(
                                        `/admin/games/${game.key}`,
                                        range.value
                                            ? { days: range.value }
                                            : {},
                                        {
                                            preserveScroll: true,
                                            preserveState: true,
                                        },
                                    )
                                }
                                aria-pressed={days === range.value}
                                className={cn(
                                    'rounded-md px-3 py-1.5 text-sm font-medium transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none',
                                    days === range.value
                                        ? 'bg-primary text-primary-foreground'
                                        : 'text-muted-foreground hover:text-foreground',
                                )}
                            >
                                {tr(range.label)}
                            </button>
                        ))}
                    </div>
                </div>

                <GameTabs game={game.key} active="analytics" />

                {!game.tracked && (
                    <div className="rounded-2xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900 dark:border-amber-500/40 dark:bg-amber-500/10 dark:text-amber-200">
                        {tr(
                            'This game is a client-side practice demo. Its results are not reported to the server, so no statistics are collected yet.',
                        )}
                    </div>
                )}

                <div className="grid grid-cols-2 gap-4 lg:grid-cols-3 xl:grid-cols-6">
                    <StatTile
                        label={tr('Times played')}
                        value={formatNumber(summary.plays)}
                        hint={tr('{0} per player', [summary.plays_per_player])}
                        icon={ChartColumnBig}
                        color="bg-bubble-blue"
                    />
                    <StatTile
                        label={tr('Unique players')}
                        value={formatNumber(summary.players)}
                        icon={UsersRound}
                        color="bg-bubble-green"
                    />
                    <StatTile
                        label={tr('Success rate')}
                        value={
                            <span className={rateTone(summary.success_rate)}>
                                {formatPercent(summary.success_rate)}
                            </span>
                        }
                        icon={Trophy}
                        color="bg-bubble-purple"
                    />
                    <StatTile
                        label={tr('Answer accuracy')}
                        value={
                            <span className={rateTone(summary.accuracy)}>
                                {formatPercent(summary.accuracy)}
                            </span>
                        }
                        icon={Target}
                        color="bg-bubble-orange"
                    />
                    <StatTile
                        label={tr('Avg points / play')}
                        value={summary.avg_points}
                        hint={tr('{0} total', [formatNumber(summary.points)])}
                        icon={Coins}
                        color="bg-bubble-ink"
                    />
                    <StatTile
                        label={tr('Avg duration')}
                        value={formatDuration(summary.avg_duration)}
                        hint={
                            <Link
                                href={`/admin/playing-time?game=${game.key}`}
                                className="hover:text-foreground hover:underline"
                            >
                                {formatDuration(summary.total_duration || null)}{' '}
                                {tr('total · per player')}
                            </Link>
                        }
                        icon={Clock}
                        color="bg-bubble-pink"
                    />
                </div>

                {!hasPlays ? (
                    <Panel title={tr('No plays yet')} icon={ChartColumnBig}>
                        <EmptyState
                            icon={ChartColumnBig}
                            title={tr('No recorded plays in this period')}
                            description={tr(
                                'Statistics appear after signed-in players finish this game.',
                            )}
                        />
                    </Panel>
                ) : (
                    <>
                        <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
                            <Panel
                                title={tr('Daily activity')}
                                description={tr(
                                    'Plays and unique players per day',
                                )}
                                icon={ChartColumnBig}
                                className="xl:col-span-2"
                            >
                                <div className="h-64">
                                    <ResponsiveContainer
                                        width="100%"
                                        height="100%"
                                    >
                                        <AreaChart
                                            data={stats.daily}
                                            margin={{
                                                left: -20,
                                                right: 8,
                                                top: 8,
                                            }}
                                        >
                                            <CartesianGrid
                                                strokeDasharray="3 3"
                                                stroke="var(--border)"
                                            />
                                            <XAxis
                                                dataKey="date"
                                                tickFormatter={(
                                                    value: string,
                                                ) => value.slice(5)}
                                                tick={{
                                                    fill: 'var(--muted-foreground)',
                                                    fontSize: 11,
                                                }}
                                                minTickGap={16}
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
                                            />
                                            <Area
                                                {...smoothLine}
                                                dataKey="plays"
                                                name="Plays"
                                                stroke="var(--chart-5)"
                                                fill="var(--chart-5)"
                                                fillOpacity={0.2}
                                                strokeWidth={2}
                                            />
                                            <Area
                                                {...smoothLine}
                                                dataKey="players"
                                                name="Players"
                                                stroke="var(--chart-4)"
                                                fill="var(--chart-4)"
                                                fillOpacity={0.15}
                                                strokeWidth={2}
                                            />
                                        </AreaChart>
                                    </ResponsiveContainer>
                                </div>
                            </Panel>
                            <Panel
                                title={tr('Score distribution')}
                                description={tr(
                                    'Plays by share of correct answers',
                                )}
                                icon={Target}
                            >
                                <div className="h-64">
                                    <ResponsiveContainer
                                        width="100%"
                                        height="100%"
                                    >
                                        <BarChart
                                            data={stats.outcomes}
                                            margin={{
                                                left: -20,
                                                right: 8,
                                                top: 8,
                                            }}
                                        >
                                            <CartesianGrid
                                                strokeDasharray="3 3"
                                                stroke="var(--border)"
                                                vertical={false}
                                            />
                                            <XAxis
                                                dataKey="label"
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
                                                contentStyle={tooltipStyle}
                                                cursor={{
                                                    fill: 'var(--muted)',
                                                }}
                                            />
                                            <Bar
                                                dataKey="count"
                                                name="Plays"
                                                fill="var(--chart-2)"
                                                radius={[6, 6, 0, 0]}
                                            />
                                        </BarChart>
                                    </ResponsiveContainer>
                                </div>
                            </Panel>
                        </div>

                        <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
                            <Panel
                                title={tr('By age')}
                                description={tr(
                                    'Player age when the game was played',
                                )}
                                icon={Cake}
                            >
                                <BucketTable
                                    rows={stats.byAge}
                                    labelHeader={tr('Age')}
                                    labelFor={(label) =>
                                        label === 'unknown'
                                            ? tr('Unknown')
                                            : tr('{0} yrs', [label])
                                    }
                                />
                            </Panel>
                            <Panel
                                title={tr('By education level')}
                                description={tr('Grade used by the game')}
                                icon={School}
                            >
                                <BucketTable
                                    rows={stats.byLevel}
                                    labelHeader={tr('Level')}
                                    labelFor={(label) =>
                                        LEVEL_LABELS[label] ?? label
                                    }
                                />
                            </Panel>
                            <Panel title={tr('By grade')} icon={GraduationCap}>
                                <BucketTable
                                    rows={stats.byGrade}
                                    labelHeader={tr('Grade')}
                                    labelFor={(label) =>
                                        tr('Grade {0}', [label])
                                    }
                                />
                            </Panel>
                            <Panel title={tr('By mission')} icon={Map}>
                                <BucketTable
                                    rows={stats.byMission}
                                    labelHeader={tr('Mission')}
                                    labelFor={(label) =>
                                        label === 'unknown'
                                            ? tr('Unknown')
                                            : label.charAt(0).toUpperCase() +
                                              label.slice(1)
                                    }
                                />
                            </Panel>
                        </div>

                        <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
                            <Panel
                                title={tr('Top schools')}
                                description={tr(
                                    'Most active schools in this game',
                                )}
                                icon={School}
                            >
                                {stats.bySchool.length === 0 ? (
                                    <EmptyState
                                        icon={School}
                                        title={tr('No school data yet')}
                                    />
                                ) : (
                                    <BucketTable
                                        rows={stats.bySchool}
                                        labelHeader={tr('School')}
                                    />
                                )}
                            </Panel>
                            <Panel
                                title={tr('Hardest questions')}
                                description={tr('{0} bank answers recorded', [
                                    formatNumber(stats.questions.total_answers),
                                ])}
                                icon={Lightbulb}
                                actions={
                                    <Link
                                        href={`/admin/questions?game=${game.key}&sort=hardest`}
                                        className="link text-xs"
                                    >
                                        {tr('Manage questions')}
                                    </Link>
                                }
                            >
                                {stats.questions.hardest.length === 0 ? (
                                    <EmptyState
                                        icon={ListChecks}
                                        title={tr('No per-question data yet')}
                                        description={tr(
                                            'Per-question results are recorded for plays finished after this release.',
                                        )}
                                    />
                                ) : (
                                    <ul className="flex flex-col divide-y divide-border">
                                        {stats.questions.hardest.map(
                                            (question) => (
                                                <li
                                                    key={question.id}
                                                    className="flex items-start justify-between gap-4 py-2.5"
                                                >
                                                    <div className="flex min-w-0 flex-col gap-0.5">
                                                        <Link
                                                            href={`/admin/questions/${question.id}`}
                                                            className="line-clamp-2 text-sm font-medium text-foreground hover:underline"
                                                        >
                                                            {question.prompt}
                                                        </Link>
                                                        <span className="text-xs text-muted-foreground">
                                                            {subjectLabel(
                                                                question.subject,
                                                            )}
                                                            {question.band !==
                                                                null &&
                                                                ` · ${BAND_LABELS[question.band]}`}{' '}
                                                            ·{' '}
                                                            {question.answered}{' '}
                                                            {tr('answers')}
                                                        </span>
                                                    </div>
                                                    <span
                                                        className={cn(
                                                            'shrink-0 text-sm font-semibold tabular-nums',
                                                            rateTone(
                                                                question.success_rate,
                                                            ),
                                                        )}
                                                    >
                                                        {formatPercent(
                                                            question.success_rate,
                                                        )}
                                                    </span>
                                                </li>
                                            ),
                                        )}
                                    </ul>
                                )}
                            </Panel>
                        </div>

                        <Panel
                            title={tr('Who played')}
                            description={tr(
                                'Top 50 players by number of plays',
                            )}
                            icon={UsersRound}
                        >
                            <ResponsiveTable
                                testId="admin-game-players-table"
                                rows={stats.players}
                                rowKey={(row) => row.user_id}
                                columns={[
                                    {
                                        key: 'player',
                                        header: tr('Player'),
                                        primary: true,
                                        cell: (row) => (
                                            <Link
                                                href={`/admin/users/${row.user_id}`}
                                                className="font-medium text-foreground hover:underline"
                                            >
                                                {row.name}
                                            </Link>
                                        ),
                                    },
                                    {
                                        key: 'school',
                                        header: tr('School'),
                                        cellClassName:
                                            'max-w-48 truncate text-muted-foreground',
                                        cell: (row) => (
                                            <span
                                                title={
                                                    row.school_name ?? undefined
                                                }
                                            >
                                                {row.school_name ?? '—'}
                                            </span>
                                        ),
                                    },
                                    {
                                        key: 'age',
                                        header: tr('Age'),
                                        align: 'right',
                                        cellClassName: NUMERIC_CELL,
                                        cell: (row) => row.age ?? '—',
                                    },
                                    {
                                        key: 'grade',
                                        header: tr('Grade'),
                                        align: 'right',
                                        cellClassName: NUMERIC_CELL,
                                        cell: (row) => row.grade ?? '—',
                                    },
                                    {
                                        key: 'plays',
                                        header: tr('Plays'),
                                        align: 'right',
                                        summary: true,
                                        cellClassName: NUMERIC_CELL,
                                        cell: (row) => formatNumber(row.plays),
                                    },
                                    {
                                        key: 'points',
                                        header: tr('Points'),
                                        align: 'right',
                                        summary: true,
                                        cellClassName: NUMERIC_CELL,
                                        cell: (row) => formatNumber(row.points),
                                    },
                                    {
                                        key: 'best',
                                        header: tr('Best'),
                                        align: 'right',
                                        cellClassName: NUMERIC_CELL,
                                        cell: (row) => formatNumber(row.best),
                                    },
                                    {
                                        key: 'accuracy',
                                        header: tr('Accuracy'),
                                        align: 'right',
                                        cell: (row) => (
                                            <span
                                                className={cn(
                                                    'text-foreground tabular-nums',
                                                    rateTone(row.accuracy),
                                                )}
                                            >
                                                {formatPercent(row.accuracy)}
                                            </span>
                                        ),
                                    },
                                    {
                                        key: 'last_played',
                                        header: tr('Last played'),
                                        align: 'right',
                                        cellClassName:
                                            'whitespace-nowrap text-muted-foreground',
                                        cell: (row) =>
                                            formatDateTime(row.last_played_at),
                                    },
                                ]}
                            />
                        </Panel>

                        <Panel title={tr('Recent plays')} icon={History}>
                            <ResponsiveTable
                                testId="admin-game-recent-table"
                                rows={stats.recent}
                                rowKey={(row) => row.id}
                                columns={[
                                    {
                                        key: 'player',
                                        header: tr('Player'),
                                        primary: true,
                                        cell: (row) => (
                                            <Link
                                                href={`/admin/users/${row.user_id}`}
                                                className="font-medium text-foreground hover:underline"
                                            >
                                                {row.name ?? `#${row.user_id}`}
                                            </Link>
                                        ),
                                    },
                                    {
                                        key: 'mission',
                                        header: tr('Mission'),
                                        cellClassName:
                                            'text-muted-foreground capitalize',
                                        cell: (row) => row.mission ?? '—',
                                    },
                                    {
                                        key: 'grade',
                                        header: tr('Grade'),
                                        align: 'right',
                                        cellClassName: NUMERIC_CELL,
                                        cell: (row) => row.grade ?? '—',
                                    },
                                    {
                                        key: 'correct',
                                        header: tr('Correct'),
                                        align: 'right',
                                        cellClassName: NUMERIC_CELL,
                                        cell: (row) =>
                                            row.correct === null
                                                ? '—'
                                                : `${row.correct}/${(row.correct ?? 0) + (row.wrong ?? 0)}`,
                                    },
                                    {
                                        key: 'accuracy',
                                        header: tr('Accuracy'),
                                        align: 'right',
                                        cell: (row) => (
                                            <span
                                                className={cn(
                                                    'text-foreground tabular-nums',
                                                    rateTone(row.accuracy),
                                                )}
                                            >
                                                {formatPercent(row.accuracy)}
                                            </span>
                                        ),
                                    },
                                    {
                                        key: 'points',
                                        header: tr('Points'),
                                        align: 'right',
                                        summary: true,
                                        cellClassName: NUMERIC_CELL,
                                        cell: (row) => formatNumber(row.points),
                                    },
                                    {
                                        key: 'duration',
                                        header: tr('Duration'),
                                        align: 'right',
                                        cellClassName: NUMERIC_CELL,
                                        cell: (row) =>
                                            formatDuration(
                                                row.duration_seconds,
                                            ),
                                    },
                                    {
                                        key: 'played',
                                        header: tr('Played'),
                                        align: 'right',
                                        summary: true,
                                        cellClassName:
                                            'whitespace-nowrap text-muted-foreground',
                                        cell: (row) =>
                                            formatDateTime(row.played_at),
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

GameShow.layout = (page: ReactNode) => (
    <AdminLayout title={tr('Game Statistics')}>{page}</AdminLayout>
);
