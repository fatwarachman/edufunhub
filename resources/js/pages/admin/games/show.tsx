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
    SUBJECT_LABELS,
    type Bucket,
} from '@/components/admin/game-stats';
import AdminLayout from '@/layouts/admin-layout';
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
    };
    days: number;
    stats: Stats;
    passPercent: number;
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
    const { summary } = stats;
    const hasPlays = summary.plays > 0;

    return (
        <>
            <Head title={`${gameLabel(game.key)} · Statistics`} />
            <div className="flex flex-col gap-6">
                <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
                    <div className="flex flex-col gap-2">
                        <Link
                            href="/admin/games"
                            className="inline-flex w-fit items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
                        >
                            <ArrowLeft className="size-4" />
                            All games
                        </Link>
                        <div className="flex items-center gap-3">
                            <span
                                className="size-3 shrink-0 rounded-full"
                                style={{ background: game.accent }}
                            />
                            <h2 className="font-display text-2xl font-bold text-foreground">
                                {gameLabel(game.key)}
                            </h2>
                        </div>
                        <p className="text-sm text-muted-foreground">
                            A play counts as successful when more than{' '}
                            {passPercent}% of its answers are correct.
                        </p>
                    </div>
                    <div
                        className="inline-flex w-fit rounded-lg border border-border bg-card p-1"
                        role="group"
                        aria-label="Time range"
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
                                {range.label}
                            </button>
                        ))}
                    </div>
                </div>

                {!game.tracked && (
                    <div className="rounded-2xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900 dark:border-amber-500/40 dark:bg-amber-500/10 dark:text-amber-200">
                        This game is a client-side practice demo. Its results
                        are not reported to the server, so no statistics are
                        collected yet.
                    </div>
                )}

                <div className="grid grid-cols-2 gap-4 lg:grid-cols-3 xl:grid-cols-6">
                    <StatTile
                        label="Times played"
                        value={formatNumber(summary.plays)}
                        hint={`${summary.plays_per_player} per player`}
                        icon={ChartColumnBig}
                        color="bg-bubble-blue"
                    />
                    <StatTile
                        label="Unique players"
                        value={formatNumber(summary.players)}
                        icon={UsersRound}
                        color="bg-bubble-green"
                    />
                    <StatTile
                        label="Success rate"
                        value={
                            <span className={rateTone(summary.success_rate)}>
                                {formatPercent(summary.success_rate)}
                            </span>
                        }
                        icon={Trophy}
                        color="bg-bubble-purple"
                    />
                    <StatTile
                        label="Answer accuracy"
                        value={
                            <span className={rateTone(summary.accuracy)}>
                                {formatPercent(summary.accuracy)}
                            </span>
                        }
                        icon={Target}
                        color="bg-bubble-orange"
                    />
                    <StatTile
                        label="Avg points / play"
                        value={summary.avg_points}
                        hint={`${formatNumber(summary.points)} total`}
                        icon={Coins}
                        color="bg-bubble-ink"
                    />
                    <StatTile
                        label="Avg duration"
                        value={formatDuration(summary.avg_duration)}
                        icon={Clock}
                        color="bg-bubble-pink"
                    />
                </div>

                {!hasPlays ? (
                    <Panel title="No plays yet" icon={ChartColumnBig}>
                        <EmptyState
                            icon={ChartColumnBig}
                            title="No recorded plays in this period"
                            description="Statistics appear after signed-in players finish this game."
                        />
                    </Panel>
                ) : (
                    <>
                        <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
                            <Panel
                                title="Daily activity"
                                description="Plays and unique players per day"
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
                                                type="monotone"
                                                dataKey="plays"
                                                name="Plays"
                                                stroke="var(--chart-5)"
                                                fill="var(--chart-5)"
                                                fillOpacity={0.2}
                                                strokeWidth={2}
                                            />
                                            <Area
                                                type="monotone"
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
                                title="Score distribution"
                                description="Plays by share of correct answers"
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
                                title="By age"
                                description="Player age when the game was played"
                                icon={Cake}
                            >
                                <BucketTable
                                    rows={stats.byAge}
                                    labelHeader="Age"
                                    labelFor={(label) =>
                                        label === 'unknown'
                                            ? 'Unknown'
                                            : `${label} yrs`
                                    }
                                />
                            </Panel>
                            <Panel
                                title="By education level"
                                description="Grade used by the game"
                                icon={School}
                            >
                                <BucketTable
                                    rows={stats.byLevel}
                                    labelHeader="Level"
                                    labelFor={(label) =>
                                        LEVEL_LABELS[label] ?? label
                                    }
                                />
                            </Panel>
                            <Panel title="By grade" icon={GraduationCap}>
                                <BucketTable
                                    rows={stats.byGrade}
                                    labelHeader="Grade"
                                    labelFor={(label) => `Grade ${label}`}
                                />
                            </Panel>
                            <Panel title="By mission" icon={Map}>
                                <BucketTable
                                    rows={stats.byMission}
                                    labelHeader="Mission"
                                    labelFor={(label) =>
                                        label === 'unknown'
                                            ? 'Unknown'
                                            : label.charAt(0).toUpperCase() +
                                              label.slice(1)
                                    }
                                />
                            </Panel>
                        </div>

                        <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
                            <Panel
                                title="Top schools"
                                description="Most active schools in this game"
                                icon={School}
                            >
                                {stats.bySchool.length === 0 ? (
                                    <EmptyState
                                        icon={School}
                                        title="No school data yet"
                                    />
                                ) : (
                                    <BucketTable
                                        rows={stats.bySchool}
                                        labelHeader="School"
                                    />
                                )}
                            </Panel>
                            <Panel
                                title="Hardest questions"
                                description={`${formatNumber(stats.questions.total_answers)} bank answers recorded`}
                                icon={Lightbulb}
                                actions={
                                    <Link
                                        href={`/admin/questions?game=${game.key}&sort=hardest`}
                                        className="text-xs text-primary hover:underline"
                                    >
                                        Manage questions
                                    </Link>
                                }
                            >
                                {stats.questions.hardest.length === 0 ? (
                                    <EmptyState
                                        icon={ListChecks}
                                        title="No per-question data yet"
                                        description="Per-question results are recorded for plays finished after this release."
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
                                                            {SUBJECT_LABELS[
                                                                question.subject
                                                            ] ??
                                                                question.subject}
                                                            {question.band !==
                                                                null &&
                                                                ` · ${BAND_LABELS[question.band]}`}{' '}
                                                            ·{' '}
                                                            {question.answered}{' '}
                                                            answers
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
                            title="Who played"
                            description="Top 50 players by number of plays"
                            icon={UsersRound}
                        >
                            <div className="overflow-x-auto">
                                <table className="w-full min-w-[760px] text-sm">
                                    <thead>
                                        <tr className="border-b border-border text-xs tracking-wider text-muted-foreground uppercase">
                                            <th className="py-2 pr-3 text-left font-medium">
                                                Player
                                            </th>
                                            <th className="px-3 py-2 text-left font-medium">
                                                School
                                            </th>
                                            <th className="px-3 py-2 text-right font-medium">
                                                Age
                                            </th>
                                            <th className="px-3 py-2 text-right font-medium">
                                                Grade
                                            </th>
                                            <th className="px-3 py-2 text-right font-medium">
                                                Plays
                                            </th>
                                            <th className="px-3 py-2 text-right font-medium">
                                                Points
                                            </th>
                                            <th className="px-3 py-2 text-right font-medium">
                                                Best
                                            </th>
                                            <th className="px-3 py-2 text-right font-medium">
                                                Accuracy
                                            </th>
                                            <th className="py-2 pl-3 text-right font-medium">
                                                Last played
                                            </th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-border">
                                        {stats.players.map((player) => (
                                            <tr key={player.user_id}>
                                                <td className="py-2.5 pr-3">
                                                    <Link
                                                        href={`/admin/users/${player.user_id}`}
                                                        className="font-medium text-foreground hover:underline"
                                                    >
                                                        {player.name}
                                                    </Link>
                                                </td>
                                                <td
                                                    className="max-w-48 truncate px-3 py-2.5 text-muted-foreground"
                                                    title={
                                                        player.school_name ??
                                                        undefined
                                                    }
                                                >
                                                    {player.school_name ?? '—'}
                                                </td>
                                                <Cell>{player.age ?? '—'}</Cell>
                                                <Cell>
                                                    {player.grade ?? '—'}
                                                </Cell>
                                                <Cell>
                                                    {formatNumber(player.plays)}
                                                </Cell>
                                                <Cell>
                                                    {formatNumber(
                                                        player.points,
                                                    )}
                                                </Cell>
                                                <Cell>
                                                    {formatNumber(player.best)}
                                                </Cell>
                                                <Cell
                                                    className={rateTone(
                                                        player.accuracy,
                                                    )}
                                                >
                                                    {formatPercent(
                                                        player.accuracy,
                                                    )}
                                                </Cell>
                                                <td className="py-2.5 pl-3 text-right whitespace-nowrap text-muted-foreground">
                                                    {formatDateTime(
                                                        player.last_played_at,
                                                    )}
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </Panel>

                        <Panel title="Recent plays" icon={History}>
                            <div className="overflow-x-auto">
                                <table className="w-full min-w-[720px] text-sm">
                                    <thead>
                                        <tr className="border-b border-border text-xs tracking-wider text-muted-foreground uppercase">
                                            <th className="py-2 pr-3 text-left font-medium">
                                                Player
                                            </th>
                                            <th className="px-3 py-2 text-left font-medium">
                                                Mission
                                            </th>
                                            <th className="px-3 py-2 text-right font-medium">
                                                Grade
                                            </th>
                                            <th className="px-3 py-2 text-right font-medium">
                                                Correct
                                            </th>
                                            <th className="px-3 py-2 text-right font-medium">
                                                Accuracy
                                            </th>
                                            <th className="px-3 py-2 text-right font-medium">
                                                Points
                                            </th>
                                            <th className="px-3 py-2 text-right font-medium">
                                                Duration
                                            </th>
                                            <th className="py-2 pl-3 text-right font-medium">
                                                Played
                                            </th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-border">
                                        {stats.recent.map((play) => (
                                            <tr key={play.id}>
                                                <td className="py-2.5 pr-3">
                                                    <Link
                                                        href={`/admin/users/${play.user_id}`}
                                                        className="font-medium text-foreground hover:underline"
                                                    >
                                                        {play.name ??
                                                            `#${play.user_id}`}
                                                    </Link>
                                                </td>
                                                <td className="px-3 py-2.5 text-muted-foreground capitalize">
                                                    {play.mission ?? '—'}
                                                </td>
                                                <Cell>{play.grade ?? '—'}</Cell>
                                                <Cell>
                                                    {play.correct === null
                                                        ? '—'
                                                        : `${play.correct}/${(play.correct ?? 0) + (play.wrong ?? 0)}`}
                                                </Cell>
                                                <Cell
                                                    className={rateTone(
                                                        play.accuracy,
                                                    )}
                                                >
                                                    {formatPercent(
                                                        play.accuracy,
                                                    )}
                                                </Cell>
                                                <Cell>
                                                    {formatNumber(play.points)}
                                                </Cell>
                                                <Cell>
                                                    {formatDuration(
                                                        play.duration_seconds,
                                                    )}
                                                </Cell>
                                                <td className="py-2.5 pl-3 text-right whitespace-nowrap text-muted-foreground">
                                                    {formatDateTime(
                                                        play.played_at,
                                                    )}
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </Panel>
                    </>
                )}
            </div>
        </>
    );
}

function Cell({
    children,
    className,
}: {
    children: ReactNode;
    className?: string;
}) {
    return (
        <td
            className={cn(
                'px-3 py-2.5 text-right text-foreground tabular-nums',
                className,
            )}
        >
            {children}
        </td>
    );
}

GameShow.layout = (page: ReactNode) => (
    <AdminLayout title="Game Statistics">{page}</AdminLayout>
);
