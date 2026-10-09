import {
    axisTick,
    chartTooltipStyle,
    Delta,
    GAME_COLORS,
    GameDot,
    KpiCard,
    LEVEL_COLORS,
    LEVEL_SHORT,
    SectionHeading,
    ShareBars,
    smoothLine,
    timeAgo,
    UserAvatar,
} from '@/components/admin/dashboard-kit';
import {
    DashboardLeaderboard,
    type DashboardLeaderboards,
} from '@/components/admin/dashboard-leaderboard';
import {
    type DeviceSummary,
    DeviceUsagePanels,
} from '@/components/admin/device-usage';
import {
    EmptyState,
    formatNumber,
    formatPercent,
    gameLabel,
    Panel,
    rateTone,
} from '@/components/admin/game-stats';
import AdminLayout from '@/layouts/admin-layout';
import { tr } from '@/lib/admin-i18n';
import { cn } from '@/lib/utils';
import { type SharedData } from '@/types';
import { Head, Link, usePage } from '@inertiajs/react';
import {
    Activity,
    ArrowRight,
    ArrowUpRight,
    Cake,
    ChartColumnBig,
    Gamepad2,
    GraduationCap,
    ListChecks,
    Puzzle,
    Radio,
    School,
    Sparkles,
    Target,
    Trophy,
    UserPlus,
    Users,
    UsersRound,
} from 'lucide-react';
import { type ReactNode, useState } from 'react';
import {
    Area,
    AreaChart,
    Bar,
    BarChart,
    CartesianGrid,
    Cell,
    ResponsiveContainer,
    Tooltip,
    XAxis,
    YAxis,
} from 'recharts';

interface Kpis {
    users: number;
    signups_today: number;
    signups_7d: number;
    signups_delta: number | null;
    plays: number;
    plays_today: number;
    plays_7d: number;
    plays_delta: number | null;
    players: number;
    active_players_7d: number;
    active_delta: number | null;
    points: number;
    accuracy: number | null;
    online_15m: number;
    profile_complete: number;
    profiles: number;
    schools: number;
}

interface GameCatalogSummary {
    total: number;
    multiplayer: number;
    awards_points: number;
    categories: number;
    by_category: { key: string; count: number; accent: string }[];
    played_7d: number;
}

interface DashboardProps {
    kpis: Kpis;
    gameCatalog: GameCatalogSummary;
    devices: DeviceSummary;
    daily: {
        date: string;
        signups: number;
        plays: number;
        players: number;
        points: number;
    }[];
    games: {
        key: string;
        accent: string;
        plays: number;
        players: number;
        success_rate: number | null;
        tracked: boolean;
    }[];
    levels: { key: string; users: number }[];
    grades: { grade: number; users: number }[];
    ages: { label: string; users: number }[];
    /** Deferred: leaderboard per period (week, month, all time). */
    leaderboards?: DashboardLeaderboards;
    recentPlays: {
        id: number;
        user_id: number;
        name: string | null;
        game: string;
        points: number;
        accuracy: number | null;
        played_at: string;
    }[];
    recentUsers: {
        id: number;
        name: string;
        email: string;
        avatar_url: string | null;
        grade: number | null;
        age: number | null;
        school_name: string | null;
        created_at: string;
    }[];
    recentActivity: {
        id: number;
        description: string;
        subject_type: string | null;
        causer_name: string | null;
        created_at: string;
    }[];
}

type Metric = 'plays' | 'players' | 'signups' | 'points';

const METRICS: { key: Metric; label: string; color: string }[] = [
    { key: 'plays', label: 'Plays', color: 'var(--color-bubble-blue)' },
    {
        key: 'players',
        label: 'Active players',
        color: 'var(--color-bubble-green)',
    },
    { key: 'signups', label: 'Sign-ups', color: 'var(--color-bubble-orange)' },
    {
        key: 'points',
        label: 'Points earned',
        color: 'var(--color-bubble-purple)',
    },
];

function greeting(): string {
    const hour = new Date().getHours();
    if (hour < 11) return tr('Good morning');
    if (hour < 15) return tr('Good afternoon');
    if (hour < 19) return tr('Good evening');
    return tr('Good night');
}

export default function Dashboard(props: DashboardProps) {
    const { auth } = usePage<SharedData>().props;
    const { kpis, daily, gameCatalog } = props;
    const superadmin = Boolean(auth.user.is_superadmin);
    const [metric, setMetric] = useState<Metric>('plays');
    const active = METRICS.find((m) => m.key === metric)!;
    const completeRate =
        kpis.profiles > 0
            ? Math.round((kpis.profile_complete / kpis.profiles) * 100)
            : 0;
    const today = new Date().toLocaleDateString(undefined, {
        weekday: 'long',
        day: 'numeric',
        month: 'long',
        year: 'numeric',
    });
    const periodTotal = daily.reduce((sum, day) => sum + day[metric], 0);

    return (
        <>
            <Head title={tr('Admin Dashboard')} />
            <div className="flex flex-col gap-6">
                {/* Pulse header */}
                <section className="relative overflow-hidden rounded-3xl border border-border bg-card p-6 shadow-sm md:p-8">
                    <div
                        className="pointer-events-none absolute inset-0 opacity-70 dark:opacity-40"
                        aria-hidden="true"
                        style={{
                            background:
                                'radial-gradient(circle at 12% 0%, color-mix(in oklab, var(--color-bubble-orange) 22%, transparent) 0, transparent 42%), radial-gradient(circle at 88% 20%, color-mix(in oklab, var(--color-bubble-blue) 20%, transparent) 0, transparent 40%), radial-gradient(circle at 60% 120%, color-mix(in oklab, var(--color-bubble-green) 18%, transparent) 0, transparent 45%)',
                        }}
                    />
                    <div className="relative flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
                        <div className="flex flex-col gap-2">
                            <span className="inline-flex w-fit items-center gap-1.5 rounded-full border border-border bg-background/70 px-3 py-1 text-xs font-medium text-muted-foreground backdrop-blur">
                                <span className="relative flex size-2">
                                    <span className="absolute inline-flex size-full animate-ping rounded-full bg-emerald-400 opacity-75" />
                                    <span className="relative inline-flex size-2 rounded-full bg-emerald-500" />
                                </span>
                                {today}
                            </span>
                            <h2 className="font-display text-3xl font-bold text-foreground md:text-4xl">
                                {greeting()}, {auth.user.name.split(' ')[0]}
                            </h2>
                            <p className="max-w-2xl text-sm text-muted-foreground">
                                {tr(
                                    'Today: {0} {1} played and {2} new {3} joined.',
                                    [
                                        formatNumber(kpis.plays_today),
                                        tr(
                                            kpis.plays_today === 1
                                                ? 'game'
                                                : 'games',
                                        ),
                                        formatNumber(kpis.signups_today),
                                        tr(
                                            kpis.signups_today === 1
                                                ? 'learner'
                                                : 'learners',
                                        ),
                                    ],
                                )}
                                {kpis.profiles - kpis.profile_complete > 0 && (
                                    <span className="mt-1 block">
                                        {formatNumber(
                                            kpis.profiles -
                                                kpis.profile_complete,
                                        )}{' '}
                                        {kpis.profiles -
                                            kpis.profile_complete ===
                                        1
                                            ? tr('player still needs')
                                            : tr('players still need')}{' '}
                                        {tr('to complete their profile.')}
                                    </span>
                                )}
                            </p>
                        </div>
                        <div className="grid grid-cols-3 gap-2 sm:gap-3">
                            <PulseStat
                                icon={Gamepad2}
                                label={tr('Plays today')}
                                value={kpis.plays_today}
                                color="var(--color-bubble-blue)"
                                href={
                                    superadmin
                                        ? '/admin/playing-time?days=1'
                                        : undefined
                                }
                                testId="dashboard-pulse-plays"
                            />
                            <PulseStat
                                icon={UserPlus}
                                label={tr('New today')}
                                value={kpis.signups_today}
                                color="var(--color-bubble-orange)"
                                href="/admin/users?activity=joined_today"
                                testId="dashboard-pulse-signups"
                            />
                            <PulseStat
                                icon={Radio}
                                label={tr('Online')}
                                value={kpis.online_15m}
                                color="var(--color-bubble-green)"
                                href="/admin/users?activity=online&sort=last_seen_at&direction=desc"
                                testId="dashboard-pulse-online"
                            />
                        </div>
                    </div>
                </section>

                {/* KPI row */}
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-5">
                    <KpiCard
                        label={tr('Games')}
                        value={formatNumber(gameCatalog.total)}
                        icon={Puzzle}
                        accent="var(--color-bubble-pink)"
                        visual={
                            <div
                                className="flex h-full w-full flex-col justify-center gap-1.5"
                                title={gameCatalog.by_category
                                    .map((c) => `${c.key}: ${c.count}`)
                                    .join(' · ')}
                            >
                                <span className="flex h-2.5 w-full gap-0.5 overflow-hidden rounded-full">
                                    {gameCatalog.by_category.map((category) => (
                                        <span
                                            key={category.key}
                                            style={{
                                                flex: category.count,
                                                background: category.accent,
                                            }}
                                        />
                                    ))}
                                </span>
                                <span className="text-[11px] text-muted-foreground">
                                    {tr('Games per category')}
                                </span>
                            </div>
                        }
                        footer={
                            <span
                                className="inline-flex min-w-0 items-center gap-1 text-xs"
                                data-testid="kpi-games"
                            >
                                <span className="shrink-0 rounded-full bg-muted px-1.5 py-0.5 font-semibold text-foreground tabular-nums">
                                    {gameCatalog.played_7d} {tr('played · 7d')}
                                </span>
                                <span className="truncate text-muted-foreground">
                                    {gameCatalog.categories}{' '}
                                    {tr('categories ·')}{' '}
                                    {gameCatalog.multiplayer}{' '}
                                    {tr('multiplayer')}
                                </span>
                            </span>
                        }
                        href={superadmin ? '/admin/games' : undefined}
                    />
                    <KpiCard
                        label={tr('Registered users')}
                        value={formatNumber(kpis.users)}
                        icon={Users}
                        accent="var(--color-bubble-orange)"
                        spark={{ data: daily, dataKey: 'signups' }}
                        footer={
                            <Delta
                                value={kpis.signups_delta}
                                suffix={tr('{0} this week', [kpis.signups_7d])}
                            />
                        }
                        href="/admin/users"
                    />
                    <KpiCard
                        label={tr('Active players · 7d')}
                        value={formatNumber(kpis.active_players_7d)}
                        icon={UsersRound}
                        accent="var(--color-bubble-green)"
                        spark={{ data: daily, dataKey: 'players' }}
                        footer={<Delta value={kpis.active_delta} />}
                        href={superadmin ? '/admin/user-statistics' : undefined}
                    />
                    <KpiCard
                        label={tr('Games played')}
                        value={formatNumber(kpis.plays)}
                        icon={Gamepad2}
                        accent="var(--color-bubble-blue)"
                        spark={{ data: daily, dataKey: 'plays' }}
                        footer={
                            <Delta
                                value={kpis.plays_delta}
                                suffix={tr('{0} this week', [kpis.plays_7d])}
                            />
                        }
                        href={superadmin ? '/admin/games' : undefined}
                    />
                    <KpiCard
                        label={tr('Answer accuracy')}
                        value={
                            <span className={rateTone(kpis.accuracy)}>
                                {formatPercent(kpis.accuracy)}
                            </span>
                        }
                        icon={Target}
                        accent="var(--color-bubble-purple)"
                        spark={{ data: daily, dataKey: 'points' }}
                        footer={
                            <span className="text-xs text-muted-foreground">
                                {formatNumber(kpis.points)}{' '}
                                {tr('points earned ·')}{' '}
                                {formatNumber(kpis.players)}{' '}
                                {tr('players all-time')}
                            </span>
                        }
                        href={superadmin ? '/admin/leaderboard' : undefined}
                    />
                </div>

                {/* Trend + games */}
                <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
                    <Panel
                        title={tr('Last 30 days')}
                        description={tr('{0} {1} in this period', [
                            formatNumber(periodTotal),
                            tr(active.label).toLowerCase(),
                        ])}
                        icon={ChartColumnBig}
                        className="xl:col-span-2"
                        actions={
                            <div
                                className="inline-flex flex-wrap rounded-lg border border-border bg-background p-1"
                                role="group"
                                aria-label={tr('Chart metric')}
                            >
                                {METRICS.map((m) => (
                                    <button
                                        key={m.key}
                                        type="button"
                                        aria-pressed={metric === m.key}
                                        onClick={() => setMetric(m.key)}
                                        className={cn(
                                            'inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-medium transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none',
                                            metric === m.key
                                                ? 'bg-muted text-foreground'
                                                : 'text-muted-foreground hover:text-foreground',
                                        )}
                                    >
                                        <span
                                            className="size-2 rounded-full"
                                            style={{ background: m.color }}
                                        />
                                        {tr(m.label)}
                                    </button>
                                ))}
                            </div>
                        }
                    >
                        <div className="h-72">
                            <ResponsiveContainer width="100%" height="100%">
                                <AreaChart
                                    data={daily}
                                    margin={{ left: -18, right: 8, top: 8 }}
                                >
                                    <defs>
                                        <linearGradient
                                            id="trend-fill"
                                            x1="0"
                                            y1="0"
                                            x2="0"
                                            y2="1"
                                        >
                                            <stop
                                                offset="0%"
                                                stopColor={active.color}
                                                stopOpacity={0.35}
                                            />
                                            <stop
                                                offset="100%"
                                                stopColor={active.color}
                                                stopOpacity={0}
                                            />
                                        </linearGradient>
                                    </defs>
                                    <CartesianGrid
                                        strokeDasharray="3 3"
                                        stroke="var(--border)"
                                        vertical={false}
                                    />
                                    <XAxis
                                        dataKey="date"
                                        tick={axisTick}
                                        tickFormatter={(v: string) =>
                                            new Date(v).toLocaleDateString(
                                                undefined,
                                                {
                                                    day: 'numeric',
                                                    month: 'short',
                                                },
                                            )
                                        }
                                        minTickGap={24}
                                        axisLine={false}
                                        tickLine={false}
                                    />
                                    <YAxis
                                        allowDecimals={false}
                                        domain={[
                                            0,
                                            (max: number) =>
                                                Math.max(
                                                    4,
                                                    Math.ceil(max * 1.2),
                                                ),
                                        ]}
                                        tick={axisTick}
                                        axisLine={false}
                                        tickLine={false}
                                    />
                                    <Tooltip
                                        contentStyle={chartTooltipStyle}
                                        labelFormatter={(v) =>
                                            new Date(
                                                String(v),
                                            ).toLocaleDateString(undefined, {
                                                weekday: 'short',
                                                day: 'numeric',
                                                month: 'short',
                                            })
                                        }
                                    />
                                    <Area
                                        {...smoothLine}
                                        dataKey={metric}
                                        name={active.label}
                                        stroke={active.color}
                                        strokeWidth={2.5}
                                        fill="url(#trend-fill)"
                                    />
                                </AreaChart>
                            </ResponsiveContainer>
                        </div>
                    </Panel>

                    <Panel
                        title={tr('Games')}
                        description={tr(
                            'Top 5 most played games · all-time plays and success rate',
                        )}
                        icon={Gamepad2}
                        actions={
                            superadmin ? (
                                <PanelLink href="/admin/games">
                                    {tr('Details')}
                                </PanelLink>
                            ) : undefined
                        }
                    >
                        <ul className="flex flex-col gap-4">
                            {props.games.map((game) => {
                                const max = Math.max(
                                    1,
                                    ...props.games.map((g) => g.plays),
                                );
                                return (
                                    <li
                                        key={game.key}
                                        className="flex flex-col gap-1.5"
                                    >
                                        <div className="flex items-center justify-between gap-2 text-sm">
                                            {superadmin ? (
                                                <Link
                                                    href={`/admin/games/${game.key}`}
                                                    className="font-medium text-foreground hover:underline"
                                                >
                                                    <GameDot game={game.key} />
                                                </Link>
                                            ) : (
                                                <span className="font-medium text-foreground">
                                                    <GameDot game={game.key} />
                                                </span>
                                            )}
                                            <span className="text-xs text-muted-foreground">
                                                {game.tracked ? (
                                                    <>
                                                        {formatNumber(
                                                            game.players,
                                                        )}{' '}
                                                        {tr('players ·')}{' '}
                                                        <span
                                                            className={cn(
                                                                'font-semibold',
                                                                rateTone(
                                                                    game.success_rate,
                                                                ),
                                                            )}
                                                        >
                                                            {formatPercent(
                                                                game.success_rate,
                                                            )}
                                                        </span>
                                                    </>
                                                ) : (
                                                    <span className="rounded-full bg-secondary px-2 py-0.5 font-medium text-secondary-foreground">
                                                        {tr(
                                                            'Demo · not tracked',
                                                        )}
                                                    </span>
                                                )}
                                            </span>
                                        </div>
                                        {game.tracked && (
                                            <div className="flex items-center gap-2">
                                                <div className="h-2.5 flex-1 overflow-hidden rounded-full bg-muted">
                                                    <div
                                                        className="h-full rounded-full transition-all"
                                                        style={{
                                                            width: `${(game.plays / max) * 100}%`,
                                                            background:
                                                                GAME_COLORS[
                                                                    game.key
                                                                ] ??
                                                                game.accent,
                                                        }}
                                                    />
                                                </div>
                                                <span className="w-12 text-right text-sm font-semibold text-foreground tabular-nums">
                                                    {formatNumber(game.plays)}
                                                </span>
                                            </div>
                                        )}
                                    </li>
                                );
                            })}
                        </ul>
                        <div className="mt-5 grid grid-cols-2 gap-3 border-t border-border pt-4">
                            <MiniStat
                                label={tr('Profile complete')}
                                value={`${completeRate}%`}
                                hint={tr('{0}/{1} players', [
                                    kpis.profile_complete,
                                    kpis.profiles,
                                ])}
                            />
                            <MiniStat
                                label={tr('Schools')}
                                value={formatNumber(kpis.schools)}
                                hint={tr('distinct names')}
                            />
                        </div>
                    </Panel>
                </div>

                {/* Demographics */}
                <SectionHeading
                    title={tr('Who is learning')}
                    description={tr(
                        'Player profiles by school level, grade and age',
                    )}
                    actions={
                        superadmin ? (
                            <PanelLink href="/admin/user-statistics">
                                {tr('Open user statistics')}
                            </PanelLink>
                        ) : undefined
                    }
                />
                <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
                    <Panel title={tr('School level')} icon={School}>
                        <ShareBars
                            rows={props.levels.map((level) => ({
                                key: level.key,
                                label: LEVEL_SHORT[level.key],
                                value: level.users,
                                color: LEVEL_COLORS[level.key],
                            }))}
                            emptyLabel={tr('No player profiles yet')}
                        />
                    </Panel>
                    <Panel
                        title={tr('Grade')}
                        icon={GraduationCap}
                        actions={
                            <span className="flex items-center gap-2 text-xs text-muted-foreground">
                                {(['sd', 'smp', 'sma'] as const).map(
                                    (level) => (
                                        <span
                                            key={level}
                                            className="inline-flex items-center gap-1"
                                        >
                                            <span
                                                className="size-2 rounded-full"
                                                style={{
                                                    background:
                                                        LEVEL_COLORS[level],
                                                }}
                                            />
                                            {tr(LEVEL_SHORT[level])}
                                        </span>
                                    ),
                                )}
                            </span>
                        }
                    >
                        <div className="h-48">
                            <ResponsiveContainer width="100%" height="100%">
                                <BarChart
                                    data={props.grades}
                                    margin={{ left: -24, right: 4, top: 4 }}
                                >
                                    <CartesianGrid
                                        strokeDasharray="3 3"
                                        stroke="var(--border)"
                                        vertical={false}
                                    />
                                    <XAxis
                                        dataKey="grade"
                                        tick={axisTick}
                                        axisLine={false}
                                        tickLine={false}
                                    />
                                    <YAxis
                                        allowDecimals={false}
                                        domain={[
                                            0,
                                            (max: number) =>
                                                Math.max(
                                                    4,
                                                    Math.ceil(max * 1.2),
                                                ),
                                        ]}
                                        tick={axisTick}
                                        axisLine={false}
                                        tickLine={false}
                                    />
                                    <Tooltip
                                        contentStyle={chartTooltipStyle}
                                        cursor={{ fill: 'var(--muted)' }}
                                        labelFormatter={(v) =>
                                            tr('Grade {0}', [v])
                                        }
                                    />
                                    <Bar
                                        dataKey="users"
                                        name="Users"
                                        radius={[6, 6, 0, 0]}
                                    >
                                        {props.grades.map((row) => (
                                            <Cell
                                                key={row.grade}
                                                fill={
                                                    row.grade <= 6
                                                        ? LEVEL_COLORS.sd
                                                        : row.grade <= 9
                                                          ? LEVEL_COLORS.smp
                                                          : LEVEL_COLORS.sma
                                                }
                                            />
                                        ))}
                                    </Bar>
                                </BarChart>
                            </ResponsiveContainer>
                        </div>
                    </Panel>
                    <Panel title={tr('Age')} icon={Cake}>
                        <div className="h-48">
                            <ResponsiveContainer width="100%" height="100%">
                                <BarChart
                                    data={props.ages}
                                    margin={{ left: -24, right: 4, top: 4 }}
                                >
                                    <CartesianGrid
                                        strokeDasharray="3 3"
                                        stroke="var(--border)"
                                        vertical={false}
                                    />
                                    <XAxis
                                        dataKey="label"
                                        tick={axisTick}
                                        axisLine={false}
                                        tickLine={false}
                                    />
                                    <YAxis
                                        allowDecimals={false}
                                        domain={[
                                            0,
                                            (max: number) =>
                                                Math.max(
                                                    4,
                                                    Math.ceil(max * 1.2),
                                                ),
                                        ]}
                                        tick={axisTick}
                                        axisLine={false}
                                        tickLine={false}
                                    />
                                    <Tooltip
                                        contentStyle={chartTooltipStyle}
                                        cursor={{ fill: 'var(--muted)' }}
                                        labelFormatter={(v) =>
                                            tr('Age {0}', [v])
                                        }
                                    />
                                    <Bar
                                        dataKey="users"
                                        name="Users"
                                        radius={[6, 6, 0, 0]}
                                        fill="var(--color-bubble-orange)"
                                    />
                                </BarChart>
                            </ResponsiveContainer>
                        </div>
                    </Panel>
                </div>

                {/* Devices */}
                <SectionHeading
                    title={tr('How they play')}
                    description={tr(
                        'Device type, operating system and browser used to open games',
                    )}
                />
                <DeviceUsagePanels devices={props.devices} />

                {/* Leaderboard (deferred) */}
                <DashboardLeaderboard
                    leaderboards={props.leaderboards}
                    showFullLink={superadmin}
                />

                {/* Live feeds */}
                <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
                    <Panel title={tr('Latest plays')} icon={Gamepad2}>
                        {props.recentPlays.length === 0 ? (
                            <EmptyState
                                icon={Gamepad2}
                                title={tr('No games played yet')}
                            />
                        ) : (
                            <ul className="flex flex-col divide-y divide-border">
                                {props.recentPlays.map((play) => (
                                    <li
                                        key={play.id}
                                        className="flex items-center gap-3 py-2.5 first:pt-0 last:pb-0"
                                    >
                                        <span
                                            className="flex size-9 shrink-0 items-center justify-center rounded-xl text-white"
                                            style={{
                                                background:
                                                    GAME_COLORS[play.game] ??
                                                    'var(--primary)',
                                            }}
                                        >
                                            <Gamepad2 className="size-4" />
                                        </span>
                                        <span className="flex min-w-0 flex-1 flex-col">
                                            <Link
                                                href={`/admin/users/${play.user_id}`}
                                                className="truncate text-sm font-medium text-foreground hover:underline"
                                            >
                                                {play.name ??
                                                    tr('Deleted user')}
                                            </Link>
                                            <span className="truncate text-xs text-muted-foreground">
                                                {gameLabel(play.game)} ·{' '}
                                                {timeAgo(play.played_at)}
                                            </span>
                                        </span>
                                        <span className="flex flex-col items-end">
                                            <span className="text-sm font-bold text-foreground tabular-nums">
                                                +{play.points}
                                            </span>
                                            <span
                                                className={cn(
                                                    'text-xs font-medium tabular-nums',
                                                    rateTone(play.accuracy),
                                                )}
                                            >
                                                {formatPercent(play.accuracy)}
                                            </span>
                                        </span>
                                    </li>
                                ))}
                            </ul>
                        )}
                    </Panel>
                    <Panel
                        title={tr('New learners')}
                        icon={Sparkles}
                        actions={
                            <PanelLink href="/admin/users">
                                {tr('All users')}
                            </PanelLink>
                        }
                    >
                        {props.recentUsers.length === 0 ? (
                            <EmptyState
                                icon={UserPlus}
                                title={tr('No users yet')}
                            />
                        ) : (
                            <ul className="flex flex-col divide-y divide-border">
                                {props.recentUsers.map((user) => (
                                    <li key={user.id}>
                                        <Link
                                            href={`/admin/users/${user.id}`}
                                            className="flex items-center gap-3 py-2.5 transition-colors hover:text-primary"
                                        >
                                            <UserAvatar
                                                name={user.name}
                                                src={user.avatar_url}
                                                userId={user.id}
                                            />
                                            <span className="flex min-w-0 flex-1 flex-col">
                                                <span className="truncate text-sm font-medium text-foreground">
                                                    {user.name}
                                                </span>
                                                <span className="truncate text-xs text-muted-foreground">
                                                    {[
                                                        user.grade
                                                            ? `Grade ${user.grade}`
                                                            : null,
                                                        user.age !== null
                                                            ? `${user.age} y/o`
                                                            : null,
                                                        user.school_name,
                                                    ]
                                                        .filter(Boolean)
                                                        .join(' · ') ||
                                                        tr(
                                                            'Profile not completed',
                                                        )}
                                                </span>
                                            </span>
                                            <span className="shrink-0 text-xs text-muted-foreground">
                                                {timeAgo(user.created_at)}
                                            </span>
                                        </Link>
                                    </li>
                                ))}
                            </ul>
                        )}
                    </Panel>
                    <Panel
                        title={tr('Admin activity')}
                        icon={Activity}
                        actions={
                            <PanelLink href="/admin/activity-log">
                                {tr('Log')}
                            </PanelLink>
                        }
                    >
                        {props.recentActivity.length === 0 ? (
                            <EmptyState
                                icon={Activity}
                                title={tr('No recent activity')}
                            />
                        ) : (
                            <ol className="relative flex flex-col gap-4 border-l border-border pl-4">
                                {props.recentActivity.map((log) => (
                                    <li key={log.id} className="relative">
                                        <span className="absolute top-1.5 -left-[21px] size-2.5 rounded-full border-2 border-card bg-primary" />
                                        <p className="text-sm text-foreground">
                                            <span className="font-medium">
                                                {log.causer_name ??
                                                    tr('System')}
                                            </span>{' '}
                                            <span className="text-muted-foreground">
                                                {log.description.toLowerCase()}
                                            </span>
                                            {log.subject_type && (
                                                <span className="text-muted-foreground">
                                                    {' '}
                                                    · {log.subject_type}
                                                </span>
                                            )}
                                        </p>
                                        <p className="text-xs text-muted-foreground">
                                            {timeAgo(log.created_at)}
                                        </p>
                                    </li>
                                ))}
                            </ol>
                        )}
                    </Panel>
                </div>

                {superadmin && (
                    <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
                        <QuickLink
                            href="/admin/users/create"
                            icon={UserPlus}
                            label={tr('Add user')}
                            color="var(--color-bubble-orange)"
                        />
                        <QuickLink
                            href="/admin/questions/create"
                            icon={ListChecks}
                            label={tr('Add question')}
                            color="var(--color-bubble-blue)"
                        />
                        <QuickLink
                            href="/admin/user-statistics"
                            icon={UsersRound}
                            label={tr('User statistics')}
                            color="var(--color-bubble-green)"
                        />
                        <QuickLink
                            href="/admin/leaderboard"
                            icon={Trophy}
                            label={tr('Leaderboard')}
                            color="var(--color-bubble-purple)"
                        />
                    </div>
                )}
            </div>
        </>
    );
}

function PulseStat({
    icon: Icon,
    label,
    value,
    color,
    href,
    testId,
}: {
    icon: React.ElementType;
    label: string;
    value: number;
    color: string;
    href?: string;
    testId?: string;
}) {
    const classes =
        'group flex min-w-24 flex-col gap-1 rounded-2xl border border-border bg-background/80 px-3 py-3 backdrop-blur sm:min-w-28 sm:px-4';
    const body = (
        <>
            <span className="flex items-center justify-between gap-2">
                <Icon className="size-4" style={{ color }} />
                {href && (
                    <ArrowUpRight
                        className="size-3.5 text-foreground/60 transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5 group-hover:text-foreground"
                        aria-hidden="true"
                    />
                )}
            </span>
            <span className="font-display text-2xl leading-none font-bold text-foreground tabular-nums">
                {formatNumber(value)}
            </span>
            <span className="text-xs font-medium text-foreground/70">
                {tr(label)}
            </span>
        </>
    );

    return href ? (
        <Link
            href={href}
            className={cn(
                classes,
                'transition-all hover:-translate-y-0.5 hover:border-foreground/20 hover:bg-background hover:shadow-md focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none',
            )}
            data-testid={testId}
        >
            {body}
        </Link>
    ) : (
        <div className={classes} data-testid={testId}>
            {body}
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
    hint: string;
}) {
    return (
        <div className="flex flex-col gap-0.5 rounded-xl bg-muted/50 px-3 py-2.5">
            <span className="text-xs text-muted-foreground">{tr(label)}</span>
            <span className="font-display text-xl font-bold text-foreground tabular-nums">
                {value}
            </span>
            <span className="text-xs text-muted-foreground">{tr(hint)}</span>
        </div>
    );
}

function PanelLink({ href, children }: { href: string; children: ReactNode }) {
    return (
        <Link
            href={href}
            className="inline-flex items-center gap-1 link text-xs"
        >
            {children}
            <ArrowRight className="size-3" />
        </Link>
    );
}

function QuickLink({
    href,
    icon: Icon,
    label,
    color,
}: {
    href: string;
    icon: React.ElementType;
    label: string;
    color: string;
}) {
    return (
        <Link
            href={href}
            className="group flex items-center gap-3 rounded-2xl border border-border bg-card px-4 py-3 text-sm font-medium text-foreground shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-md focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
        >
            <span
                className="flex size-9 items-center justify-center rounded-xl"
                style={{
                    background: `color-mix(in oklab, ${color} 16%, transparent)`,
                    color,
                }}
            >
                <Icon className="size-4" />
            </span>
            {tr(label)}
            <ArrowRight className="ml-auto size-4 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
        </Link>
    );
}

Dashboard.layout = (page: ReactNode) => (
    <AdminLayout title={tr('Dashboard')}>{page}</AdminLayout>
);
