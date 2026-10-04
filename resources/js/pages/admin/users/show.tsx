import {
    axisTick,
    chartTooltipStyle,
    GameDot,
    KpiCard,
    timeAgo,
    UserAvatar,
} from '@/components/admin/dashboard-kit';
import {
    EmptyState,
    formatDateTime,
    formatDuration,
    formatNumber,
    formatPercent,
    gameLabel,
    Panel,
    rateTone,
    SUBJECT_LABELS,
} from '@/components/admin/game-stats';
import AdminLayout from '@/layouts/admin-layout';
import { cn } from '@/lib/utils';
import { Head, Link, router } from '@inertiajs/react';
import {
    Activity,
    ArrowLeft,
    BookOpenCheck,
    Cake,
    Calendar,
    CircleCheck,
    CircleX,
    Clock,
    Coins,
    Edit,
    Eye,
    Gamepad2,
    GraduationCap,
    History,
    KeyRound,
    LogIn,
    Mail,
    Medal,
    School,
    Shield,
    ShieldCheck,
    ShieldOff,
    Target,
    Trash2,
    Trophy,
    UserRound,
} from 'lucide-react';
import { type ReactNode, useState } from 'react';
import {
    Bar,
    BarChart,
    CartesianGrid,
    Line,
    LineChart,
    ReferenceLine,
    ResponsiveContainer,
    Tooltip,
    XAxis,
    YAxis,
} from 'recharts';

interface UserDetail {
    id: number;
    name: string;
    email: string;
    avatar_url: string | null;
    is_superadmin: boolean;
    created_at: string;
    last_seen_at: string | null;
    email_verified_at: string | null;
    disabled_at: string | null;
    onboarded_at: string | null;
    password_updated_at: string | null;
    status: 'active' | 'suspended';
    two_factor_enabled: boolean;
    roles: { id: number; name: string; slug: string }[];
    providers: { provider: string; linked_at: string | null }[];
    player_profile: {
        nickname: string | null;
        grade: number | null;
        birth_date: string | null;
        age: number | null;
        school_name: string | null;
        color: string | null;
        accessory: string | null;
    } | null;
}

interface PlayRow {
    id: number;
    game_key: string;
    mission: string | null;
    grade: number | null;
    points: number;
    correct: number | null;
    wrong: number | null;
    accuracy: number | null;
    duration_seconds: number | null;
    played_at: string;
}

interface Props {
    user: UserDetail;
    stats: {
        plays: number;
        game_points: number;
        points: number;
        best: number;
        accuracy: number | null;
        success_rate: number | null;
        correct: number;
        wrong: number;
        play_seconds: number;
        first_played_at: string | null;
        last_played_at: string | null;
        rank: number | null;
        logins: number;
        failed_logins: number;
    };
    perGame: {
        key: string;
        plays: number;
        points: number;
        best: number;
        accuracy: number | null;
        last_played_at: string;
    }[];
    daily: { date: string; plays: number; points: number }[];
    trend: {
        id: number;
        game: string;
        points: number;
        accuracy: number | null;
        played_at: string;
    }[];
    subjects: { subject: string; answered: number; accuracy: number | null }[];
    ledger: {
        id: number;
        points: number;
        reason: string;
        created_at: string | null;
    }[];
    logins: {
        id: number;
        ip_address: string | null;
        device: string;
        is_successful: boolean;
        login_at: string;
    }[];
    activityLog: {
        id: number;
        description: string;
        event: string | null;
        subject_type: string | null;
        by_self: boolean;
        causer_name: string | null;
        changes: { field: string; old: unknown; new: unknown }[];
        created_at: string | null;
    }[];
    impersonationLogs: {
        id: number;
        impersonator: string | null;
        ip_address: string | null;
        started_at: string | null;
        ended_at: string | null;
    }[];
    plays: {
        data: PlayRow[];
        current_page: number;
        last_page: number;
        total: number;
        prev_page_url: string | null;
        next_page_url: string | null;
    };
    passPercent: number;
}

type Tab = 'games' | 'activity' | 'logins';

function formatDate(
    value: string | null | undefined,
    withTime = false,
): string {
    if (!value) return '—';
    return new Date(value).toLocaleDateString(undefined, {
        day: 'numeric',
        month: 'short',
        year: 'numeric',
        ...(withTime ? { hour: '2-digit', minute: '2-digit' } : {}),
    });
}

function formatBirthDate(value: string): string {
    return new Date(`${value}T00:00:00`).toLocaleDateString(undefined, {
        day: 'numeric',
        month: 'long',
        year: 'numeric',
    });
}

function stringify(value: unknown): string {
    if (value === null || value === undefined || value === '') return '—';
    if (typeof value === 'object') return JSON.stringify(value);
    return String(value);
}

export default function ShowUser(props: Props) {
    const { user, stats } = props;
    const profile = user.player_profile;
    const [tab, setTab] = useState<Tab>('games');
    const [confirmDelete, setConfirmDelete] = useState(false);
    const [deleting, setDeleting] = useState(false);
    const suspended = user.status === 'suspended';
    const completeness = [
        profile?.grade,
        profile?.birth_date,
        profile?.school_name,
        user.email_verified_at,
    ].filter(Boolean).length;

    return (
        <>
            <Head title={user.name} />
            <div className="flex flex-col gap-6">
                <Link
                    href="/admin/users"
                    className="inline-flex w-fit items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
                >
                    <ArrowLeft className="size-4" />
                    Back to users
                </Link>

                {/* Identity card */}
                <section className="relative overflow-hidden rounded-3xl border border-border bg-card shadow-sm">
                    <div
                        className="h-24 md:h-28"
                        aria-hidden="true"
                        style={{
                            background:
                                'linear-gradient(120deg, color-mix(in oklab, var(--color-bubble-orange) 55%, transparent), color-mix(in oklab, var(--color-bubble-purple) 45%, transparent) 55%, color-mix(in oklab, var(--color-bubble-blue) 50%, transparent))',
                        }}
                    />
                    <div className="flex flex-col gap-5 px-6 pb-6 md:flex-row md:items-end md:justify-between">
                        <div className="-mt-12 flex flex-col gap-4 sm:flex-row sm:items-start">
                            <UserAvatar
                                name={user.name}
                                src={user.avatar_url}
                                className="size-24 border-4 border-card bg-primary text-2xl text-primary-foreground shadow-md"
                            />
                            <div className="flex min-w-0 flex-col gap-1.5 sm:pt-14">
                                <div className="flex flex-wrap items-center gap-2">
                                    <h2 className="font-display text-2xl font-bold text-foreground">
                                        {user.name}
                                    </h2>
                                    {profile?.nickname && (
                                        <span className="text-sm text-muted-foreground">
                                            “{profile.nickname}”
                                        </span>
                                    )}
                                </div>
                                <p className="flex items-center gap-1.5 text-sm text-muted-foreground">
                                    <Mail className="size-3.5" />
                                    {user.email}
                                </p>
                                <div className="flex flex-wrap items-center gap-1.5 text-xs">
                                    <Pill tone={suspended ? 'red' : 'green'}>
                                        <span
                                            className={cn(
                                                'size-1.5 rounded-full',
                                                suspended
                                                    ? 'bg-red-500'
                                                    : 'bg-green-500',
                                            )}
                                        />
                                        {suspended ? 'Suspended' : 'Active'}
                                    </Pill>
                                    {user.is_superadmin && (
                                        <Pill tone="purple">Super admin</Pill>
                                    )}
                                    {user.roles.map((role) => (
                                        <Pill key={role.id}>{role.name}</Pill>
                                    ))}
                                    {user.providers.map((account) => (
                                        <Pill
                                            key={account.provider}
                                            tone="blue"
                                        >
                                            {account.provider
                                                .charAt(0)
                                                .toUpperCase() +
                                                account.provider.slice(1)}{' '}
                                            sign-in
                                        </Pill>
                                    ))}
                                    {stats.rank && (
                                        <Pill tone="amber">
                                            <Trophy className="size-3" />
                                            Rank #{stats.rank}
                                        </Pill>
                                    )}
                                </div>
                            </div>
                        </div>
                        <div className="flex flex-wrap gap-2">
                            <Link
                                href={`/admin/users/${user.id}/edit`}
                                className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-2 text-sm font-medium text-foreground hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                            >
                                <Edit className="size-4" />
                                Edit
                            </Link>
                            {!user.is_superadmin && (
                                <>
                                    <button
                                        type="button"
                                        onClick={() =>
                                            router.patch(
                                                `/admin/users/${user.id}/toggle-status`,
                                                {},
                                                { preserveScroll: true },
                                            )
                                        }
                                        className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-2 text-sm font-medium text-foreground hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                                    >
                                        {suspended ? (
                                            <Shield className="size-4" />
                                        ) : (
                                            <ShieldOff className="size-4" />
                                        )}
                                        {suspended ? 'Activate' : 'Suspend'}
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => setConfirmDelete(true)}
                                        className="inline-flex items-center gap-1.5 rounded-lg border border-destructive/30 px-3 py-2 text-sm font-medium text-destructive hover:bg-destructive/5 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                                    >
                                        <Trash2 className="size-4" />
                                        Delete
                                    </button>
                                </>
                            )}
                        </div>
                    </div>
                </section>

                {/* KPIs */}
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
                    <KpiCard
                        label="Total points"
                        value={formatNumber(stats.points)}
                        icon={Coins}
                        accent="var(--color-bubble-orange)"
                        footer={
                            <span className="text-xs text-muted-foreground">
                                Best single game: {formatNumber(stats.best)}
                            </span>
                        }
                    />
                    <KpiCard
                        label="Games played"
                        value={formatNumber(stats.plays)}
                        icon={Gamepad2}
                        accent="var(--color-bubble-blue)"
                        spark={
                            stats.plays > 0
                                ? { data: props.daily, dataKey: 'plays' }
                                : undefined
                        }
                        footer={
                            <span className="text-xs text-muted-foreground">
                                Last played {timeAgo(stats.last_played_at)}
                            </span>
                        }
                    />
                    <KpiCard
                        label="Accuracy"
                        value={
                            <span className={rateTone(stats.accuracy)}>
                                {formatPercent(stats.accuracy)}
                            </span>
                        }
                        icon={Target}
                        accent="var(--color-bubble-green)"
                        footer={
                            <span className="text-xs text-muted-foreground">
                                {formatNumber(stats.correct)} correct ·{' '}
                                {formatNumber(stats.wrong)} wrong
                            </span>
                        }
                    />
                    <KpiCard
                        label={`Success rate (>${props.passPercent}%)`}
                        value={
                            <span className={rateTone(stats.success_rate)}>
                                {formatPercent(stats.success_rate)}
                            </span>
                        }
                        icon={Medal}
                        accent="var(--color-bubble-purple)"
                        footer={
                            <span className="text-xs text-muted-foreground">
                                Time played{' '}
                                {formatDuration(stats.play_seconds || null)}
                            </span>
                        }
                    />
                </div>

                <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
                    {/* Profile facts */}
                    <div className="flex flex-col gap-6">
                        <Panel
                            title="Learner profile"
                            icon={UserRound}
                            actions={
                                <span className="text-xs text-muted-foreground">
                                    {completeness}/4 complete
                                </span>
                            }
                        >
                            <dl className="flex flex-col gap-3 text-sm">
                                <Fact
                                    icon={GraduationCap}
                                    label="Grade"
                                    value={
                                        profile?.grade
                                            ? `Grade ${profile.grade}`
                                            : null
                                    }
                                />
                                <Fact
                                    icon={Cake}
                                    label="Age"
                                    value={
                                        profile?.birth_date
                                            ? `${profile.age} years · ${formatBirthDate(profile.birth_date)}`
                                            : null
                                    }
                                />
                                <Fact
                                    icon={School}
                                    label="Last school"
                                    value={profile?.school_name}
                                />
                                <Fact
                                    icon={UserRound}
                                    label="Character"
                                    value={
                                        profile
                                            ? `${profile.color ?? '—'} · ${profile.accessory ?? 'none'}`
                                            : null
                                    }
                                />
                            </dl>
                        </Panel>
                        <Panel title="Account" icon={KeyRound}>
                            <dl className="flex flex-col gap-3 text-sm">
                                <Fact
                                    icon={Calendar}
                                    label="Joined"
                                    value={formatDate(user.created_at, true)}
                                />
                                <Fact
                                    icon={Eye}
                                    label="Last seen"
                                    value={
                                        user.last_seen_at
                                            ? `${timeAgo(user.last_seen_at)}`
                                            : 'Never'
                                    }
                                />
                                <Fact
                                    icon={Mail}
                                    label="Email verified"
                                    value={
                                        user.email_verified_at
                                            ? formatDate(user.email_verified_at)
                                            : 'Not verified'
                                    }
                                />
                                <Fact
                                    icon={ShieldCheck}
                                    label="Two-factor"
                                    value={
                                        user.two_factor_enabled
                                            ? 'Enabled'
                                            : 'Off'
                                    }
                                />
                                <Fact
                                    icon={LogIn}
                                    label="Logins"
                                    value={`${formatNumber(stats.logins)} successful · ${formatNumber(stats.failed_logins)} failed`}
                                />
                                <Fact
                                    icon={Clock}
                                    label="First game"
                                    value={formatDate(
                                        stats.first_played_at,
                                        true,
                                    )}
                                />
                            </dl>
                        </Panel>
                    </div>

                    {/* Learning insight */}
                    <div className="flex flex-col gap-6 xl:col-span-2">
                        <Panel
                            title="Accuracy trend"
                            description={`Up to the last 20 scored games · dashed line = ${props.passPercent}% pass mark`}
                            icon={Target}
                        >
                            {props.trend.length === 0 ? (
                                <EmptyState
                                    icon={Target}
                                    title="No scored games yet"
                                />
                            ) : (
                                <div className="h-56">
                                    <ResponsiveContainer
                                        width="100%"
                                        height="100%"
                                    >
                                        <LineChart
                                            data={props.trend}
                                            margin={{
                                                left: -12,
                                                right: 12,
                                                top: 8,
                                            }}
                                        >
                                            <CartesianGrid
                                                strokeDasharray="3 3"
                                                stroke="var(--border)"
                                                vertical={false}
                                            />
                                            <XAxis
                                                dataKey="played_at"
                                                tick={axisTick}
                                                tickFormatter={(v: string) =>
                                                    new Date(
                                                        v,
                                                    ).toLocaleDateString(
                                                        undefined,
                                                        {
                                                            day: 'numeric',
                                                            month: 'short',
                                                        },
                                                    )
                                                }
                                                axisLine={false}
                                                tickLine={false}
                                                minTickGap={20}
                                            />
                                            <YAxis
                                                domain={[0, 100]}
                                                tick={axisTick}
                                                axisLine={false}
                                                tickLine={false}
                                                unit="%"
                                            />
                                            <Tooltip
                                                contentStyle={chartTooltipStyle}
                                                labelFormatter={(v) =>
                                                    formatDateTime(String(v))
                                                }
                                                formatter={(
                                                    value,
                                                    _name,
                                                    item,
                                                ) => [
                                                    `${value}% · ${gameLabel(item.payload.game)} · +${item.payload.points}`,
                                                    'Accuracy',
                                                ]}
                                            />
                                            <ReferenceLine
                                                y={props.passPercent}
                                                stroke="var(--color-bubble-green)"
                                                strokeDasharray="4 4"
                                                label={{
                                                    value: `Pass ${props.passPercent}%`,
                                                    position: 'insideTopRight',
                                                    fill: 'var(--muted-foreground)',
                                                    fontSize: 11,
                                                }}
                                            />
                                            <Line
                                                type="monotone"
                                                dataKey="accuracy"
                                                stroke="var(--color-bubble-orange)"
                                                strokeWidth={2.5}
                                                dot={{ r: 3 }}
                                            />
                                        </LineChart>
                                    </ResponsiveContainer>
                                </div>
                            )}
                        </Panel>
                        <div className="grid grid-cols-1 items-start gap-6 md:grid-cols-2">
                            <Panel title="Per game" icon={Gamepad2}>
                                {props.perGame.length === 0 ? (
                                    <EmptyState
                                        icon={Gamepad2}
                                        title="Has not played yet"
                                    />
                                ) : (
                                    <ul className="flex flex-col gap-3">
                                        {props.perGame.map((game) => (
                                            <li
                                                key={game.key}
                                                className="flex flex-col gap-1 rounded-xl border border-border p-3"
                                            >
                                                <div className="flex items-center justify-between gap-2 text-sm">
                                                    <span className="font-medium text-foreground">
                                                        <GameDot
                                                            game={game.key}
                                                        />
                                                    </span>
                                                    <span
                                                        className={cn(
                                                            'font-semibold tabular-nums',
                                                            rateTone(
                                                                game.accuracy,
                                                            ),
                                                        )}
                                                    >
                                                        {formatPercent(
                                                            game.accuracy,
                                                        )}
                                                    </span>
                                                </div>
                                                <div className="flex flex-wrap gap-x-3 text-xs text-muted-foreground">
                                                    <span>
                                                        {game.plays} plays
                                                    </span>
                                                    <span>
                                                        {formatNumber(
                                                            game.points,
                                                        )}{' '}
                                                        pts
                                                    </span>
                                                    <span>
                                                        best {game.best}
                                                    </span>
                                                    <span>
                                                        {timeAgo(
                                                            game.last_played_at,
                                                        )}
                                                    </span>
                                                </div>
                                            </li>
                                        ))}
                                    </ul>
                                )}
                            </Panel>
                            <Panel
                                title="Subject mastery"
                                description="From bank questions answered in games"
                                icon={BookOpenCheck}
                            >
                                {props.subjects.length === 0 ? (
                                    <EmptyState
                                        icon={BookOpenCheck}
                                        title="No bank questions answered yet"
                                    />
                                ) : (
                                    <ul className="flex flex-col gap-3">
                                        {props.subjects.map((row) => (
                                            <li
                                                key={row.subject}
                                                className="flex flex-col gap-1"
                                            >
                                                <div className="flex items-center justify-between text-sm">
                                                    <span className="font-medium text-foreground">
                                                        {SUBJECT_LABELS[
                                                            row.subject
                                                        ] ?? row.subject}
                                                    </span>
                                                    <span className="text-xs text-muted-foreground">
                                                        {row.answered} answered
                                                        ·{' '}
                                                        <span
                                                            className={cn(
                                                                'font-semibold',
                                                                rateTone(
                                                                    row.accuracy,
                                                                ),
                                                            )}
                                                        >
                                                            {formatPercent(
                                                                row.accuracy,
                                                            )}
                                                        </span>
                                                    </span>
                                                </div>
                                                <div className="h-2 overflow-hidden rounded-full bg-muted">
                                                    <div
                                                        className={cn(
                                                            'h-full rounded-full',
                                                            (row.accuracy ??
                                                                0) >= 70
                                                                ? 'bg-emerald-500'
                                                                : (row.accuracy ??
                                                                        0) >= 40
                                                                  ? 'bg-amber-500'
                                                                  : 'bg-red-500',
                                                        )}
                                                        style={{
                                                            width: `${Math.max(row.accuracy ?? 0, 2)}%`,
                                                        }}
                                                    />
                                                </div>
                                            </li>
                                        ))}
                                    </ul>
                                )}
                            </Panel>
                        </div>
                        <Panel title="Activity · last 30 days" icon={Calendar}>
                            <div className="h-36">
                                <ResponsiveContainer width="100%" height="100%">
                                    <BarChart
                                        data={props.daily}
                                        margin={{ left: -24, right: 4, top: 4 }}
                                    >
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
                                            axisLine={false}
                                            tickLine={false}
                                            minTickGap={24}
                                        />
                                        <YAxis
                                            allowDecimals={false}
                                            tick={axisTick}
                                            axisLine={false}
                                            tickLine={false}
                                        />
                                        <Tooltip
                                            contentStyle={chartTooltipStyle}
                                            cursor={{ fill: 'var(--muted)' }}
                                            labelFormatter={(v) =>
                                                formatDate(String(v))
                                            }
                                        />
                                        <Bar
                                            dataKey="plays"
                                            name="Plays"
                                            radius={[4, 4, 0, 0]}
                                            fill="var(--color-bubble-blue)"
                                        />
                                    </BarChart>
                                </ResponsiveContainer>
                            </div>
                        </Panel>
                    </div>
                </div>

                {/* Logs */}
                <section className="flex flex-col rounded-2xl border border-border bg-card shadow-sm">
                    <header className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-5 py-3">
                        <div
                            className="inline-flex rounded-lg border border-border bg-background p-1"
                            role="tablist"
                            aria-label="User history"
                        >
                            {(
                                [
                                    {
                                        key: 'games',
                                        label: `Game history (${props.plays.total})`,
                                        icon: History,
                                    },
                                    {
                                        key: 'activity',
                                        label: `Activity log (${props.activityLog.length})`,
                                        icon: Activity,
                                    },
                                    {
                                        key: 'logins',
                                        label: `Logins (${props.logins.length})`,
                                        icon: LogIn,
                                    },
                                ] as {
                                    key: Tab;
                                    label: string;
                                    icon: React.ElementType;
                                }[]
                            ).map((item) => (
                                <button
                                    key={item.key}
                                    type="button"
                                    role="tab"
                                    aria-selected={tab === item.key}
                                    onClick={() => setTab(item.key)}
                                    className={cn(
                                        'inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none',
                                        tab === item.key
                                            ? 'bg-muted text-foreground'
                                            : 'text-muted-foreground hover:text-foreground',
                                    )}
                                >
                                    <item.icon className="size-4" />
                                    {item.label}
                                </button>
                            ))}
                        </div>
                    </header>
                    <div className="p-5">
                        {tab === 'games' && <GameHistory plays={props.plays} />}
                        {tab === 'activity' && (
                            <ActivityTimeline
                                rows={props.activityLog}
                                impersonations={props.impersonationLogs}
                                ledger={props.ledger}
                            />
                        )}
                        {tab === 'logins' && <LoginTable rows={props.logins} />}
                    </div>
                </section>
            </div>

            {confirmDelete && (
                <div
                    className="fixed inset-0 z-50 flex items-center justify-center p-4"
                    role="dialog"
                    aria-modal="true"
                    aria-labelledby="delete-user-title"
                >
                    <div
                        className="fixed inset-0 bg-black/50"
                        onClick={() => !deleting && setConfirmDelete(false)}
                    />
                    <div className="relative z-10 w-full max-w-md rounded-2xl border border-border bg-card p-6 shadow-xl dark:border-white/15 dark:shadow-[0_0_24px_rgba(255,255,255,0.06)]">
                        <h3
                            id="delete-user-title"
                            className="text-lg font-semibold text-foreground"
                        >
                            Delete user
                        </h3>
                        <p className="mt-2 text-sm text-muted-foreground">
                            Delete{' '}
                            <strong className="text-foreground">
                                {user.name}
                            </strong>
                            ? The account is soft-deleted and can no longer sign
                            in.
                        </p>
                        <div className="mt-6 flex items-center justify-end gap-3">
                            <button
                                type="button"
                                onClick={() => setConfirmDelete(false)}
                                disabled={deleting}
                                className="rounded-lg px-4 py-2 text-sm font-medium text-muted-foreground hover:text-foreground"
                            >
                                Cancel
                            </button>
                            <button
                                type="button"
                                disabled={deleting}
                                onClick={() => {
                                    setDeleting(true);
                                    router.delete(`/admin/users/${user.id}`, {
                                        onFinish: () => setDeleting(false),
                                    });
                                }}
                                className="rounded-lg bg-destructive px-4 py-2 text-sm font-medium text-white hover:bg-destructive/90 disabled:opacity-50"
                            >
                                Delete user
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </>
    );
}

function Pill({
    children,
    tone = 'default',
}: {
    children: ReactNode;
    tone?: 'default' | 'green' | 'red' | 'purple' | 'blue' | 'amber';
}) {
    return (
        <span
            className={cn(
                'inline-flex items-center gap-1 rounded-full px-2 py-0.5 font-medium',
                tone === 'default' && 'bg-secondary text-secondary-foreground',
                tone === 'green' &&
                    'bg-green-100 text-green-700 dark:bg-green-500/15 dark:text-green-300',
                tone === 'red' &&
                    'bg-red-100 text-red-700 dark:bg-red-500/15 dark:text-red-300',
                tone === 'purple' &&
                    'bg-violet-100 text-violet-700 dark:bg-violet-500/15 dark:text-violet-300',
                tone === 'blue' &&
                    'bg-sky-100 text-sky-700 dark:bg-sky-500/15 dark:text-sky-300',
                tone === 'amber' &&
                    'bg-amber-100 text-amber-800 dark:bg-amber-500/15 dark:text-amber-300',
            )}
        >
            {children}
        </span>
    );
}

function Fact({
    icon: Icon,
    label,
    value,
}: {
    icon: React.ElementType;
    label: string;
    value: ReactNode;
}) {
    return (
        <div className="flex items-start gap-2">
            <Icon className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
            <dt className="shrink-0 text-muted-foreground">{label}</dt>
            <dd
                className={cn(
                    'ml-auto min-w-0 text-right font-medium break-words',
                    value ? 'text-foreground' : 'text-muted-foreground',
                )}
            >
                {value || 'Not set'}
            </dd>
        </div>
    );
}

function GameHistory({ plays }: { plays: Props['plays'] }) {
    if (plays.data.length === 0) {
        return <EmptyState icon={Gamepad2} title="No games played yet" />;
    }

    return (
        <div className="flex flex-col gap-4">
            <div className="overflow-x-auto">
                <table className="w-full min-w-[720px] text-sm">
                    <thead>
                        <tr className="border-b border-border text-xs tracking-wider text-muted-foreground uppercase">
                            <th className="py-2 pr-3 text-left font-medium">
                                Played
                            </th>
                            <th className="px-3 py-2 text-left font-medium">
                                Game
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
                                Duration
                            </th>
                            <th className="py-2 pl-3 text-right font-medium">
                                Points
                            </th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                        {plays.data.map((play) => (
                            <tr key={play.id}>
                                <td className="py-2.5 pr-3 whitespace-nowrap text-muted-foreground">
                                    {formatDateTime(play.played_at)}
                                </td>
                                <td className="px-3 py-2.5 whitespace-nowrap text-foreground">
                                    <GameDot game={play.game_key} />
                                </td>
                                <td className="px-3 py-2.5 text-muted-foreground capitalize">
                                    {play.mission ?? '—'}
                                </td>
                                <td className="px-3 py-2.5 text-right text-foreground tabular-nums">
                                    {play.grade ?? '—'}
                                </td>
                                <td className="px-3 py-2.5 text-right text-foreground tabular-nums">
                                    {play.correct === null ? (
                                        '—'
                                    ) : (
                                        <span className="inline-flex items-center gap-2">
                                            <span className="inline-flex items-center gap-0.5 text-emerald-600 dark:text-emerald-400">
                                                <CircleCheck className="size-3.5" />
                                                {play.correct}
                                            </span>
                                            <span className="inline-flex items-center gap-0.5 text-red-600 dark:text-red-400">
                                                <CircleX className="size-3.5" />
                                                {play.wrong}
                                            </span>
                                        </span>
                                    )}
                                </td>
                                <td
                                    className={cn(
                                        'px-3 py-2.5 text-right font-medium tabular-nums',
                                        rateTone(play.accuracy),
                                    )}
                                >
                                    {formatPercent(play.accuracy)}
                                </td>
                                <td className="px-3 py-2.5 text-right text-muted-foreground tabular-nums">
                                    {formatDuration(play.duration_seconds)}
                                </td>
                                <td className="py-2.5 pl-3 text-right font-semibold text-foreground tabular-nums">
                                    +{formatNumber(play.points)}
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
            {plays.last_page > 1 && (
                <div className="flex items-center justify-between text-sm text-muted-foreground">
                    <span>
                        Page {plays.current_page} of {plays.last_page}
                    </span>
                    <div className="flex gap-2">
                        {[
                            { url: plays.prev_page_url, label: 'Previous' },
                            { url: plays.next_page_url, label: 'Next' },
                        ].map((link) =>
                            link.url ? (
                                <Link
                                    key={link.label}
                                    href={link.url}
                                    preserveScroll
                                    preserveState
                                    only={['plays']}
                                    className="rounded-lg border border-border px-3 py-1.5 text-foreground hover:bg-muted"
                                >
                                    {link.label}
                                </Link>
                            ) : (
                                <span
                                    key={link.label}
                                    className="rounded-lg border border-border px-3 py-1.5 opacity-40"
                                >
                                    {link.label}
                                </span>
                            ),
                        )}
                    </div>
                </div>
            )}
        </div>
    );
}

function ActivityTimeline({
    rows,
    impersonations,
    ledger,
}: {
    rows: Props['activityLog'];
    impersonations: Props['impersonationLogs'];
    ledger: Props['ledger'];
}) {
    return (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
            <div className="lg:col-span-2">
                {rows.length === 0 ? (
                    <EmptyState icon={Activity} title="No activity recorded" />
                ) : (
                    <ol className="relative flex flex-col gap-4 border-l border-border pl-5">
                        {rows.map((row) => (
                            <li key={row.id} className="relative">
                                <span
                                    className={cn(
                                        'absolute top-1 -left-[26px] flex size-3 rounded-full border-2 border-card',
                                        row.by_self
                                            ? 'bg-bubble-blue'
                                            : 'bg-primary',
                                    )}
                                />
                                <p className="text-sm text-foreground">
                                    <span className="font-medium">
                                        {row.by_self
                                            ? 'User'
                                            : (row.causer_name ?? 'System')}
                                    </span>{' '}
                                    <span className="text-muted-foreground">
                                        {row.description.toLowerCase()}
                                    </span>
                                    {row.subject_type &&
                                        row.subject_type !== 'User' && (
                                            <span className="text-muted-foreground">
                                                {' '}
                                                · {row.subject_type}
                                            </span>
                                        )}
                                </p>
                                {row.changes.length > 0 && (
                                    <ul className="mt-1 flex flex-col gap-0.5 rounded-lg bg-muted/50 px-3 py-2 text-xs">
                                        {row.changes.map((change) => (
                                            <li
                                                key={change.field}
                                                className="flex flex-wrap gap-1 text-muted-foreground"
                                            >
                                                <span className="font-mono text-foreground">
                                                    {change.field}
                                                </span>
                                                <span className="line-through opacity-70">
                                                    {stringify(change.old)}
                                                </span>
                                                <span>→</span>
                                                <span className="text-foreground">
                                                    {stringify(change.new)}
                                                </span>
                                            </li>
                                        ))}
                                    </ul>
                                )}
                                <p
                                    className="mt-0.5 text-xs text-muted-foreground"
                                    title={formatDateTime(row.created_at)}
                                >
                                    {timeAgo(row.created_at)}
                                </p>
                            </li>
                        ))}
                    </ol>
                )}
            </div>
            <div className="flex flex-col gap-6">
                <div className="flex flex-col gap-2">
                    <h4 className="flex items-center gap-1.5 text-sm font-semibold text-foreground">
                        <Coins className="size-4 text-muted-foreground" />
                        Points ledger
                    </h4>
                    {ledger.length === 0 ? (
                        <p className="text-sm text-muted-foreground">
                            No points yet
                        </p>
                    ) : (
                        <ul className="flex flex-col divide-y divide-border rounded-xl border border-border">
                            {ledger.map((entry) => (
                                <li
                                    key={entry.id}
                                    className="flex items-center justify-between gap-2 px-3 py-2 text-xs"
                                >
                                    <span
                                        className="min-w-0 truncate font-mono text-muted-foreground"
                                        title={entry.reason}
                                    >
                                        {entry.reason}
                                    </span>
                                    <span className="flex shrink-0 flex-col items-end">
                                        <span
                                            className={cn(
                                                'font-semibold tabular-nums',
                                                entry.points >= 0
                                                    ? 'text-emerald-600 dark:text-emerald-400'
                                                    : 'text-red-600',
                                            )}
                                        >
                                            {entry.points >= 0 ? '+' : ''}
                                            {entry.points}
                                        </span>
                                        <span className="text-muted-foreground">
                                            {timeAgo(entry.created_at)}
                                        </span>
                                    </span>
                                </li>
                            ))}
                        </ul>
                    )}
                </div>
                <div className="flex flex-col gap-2">
                    <h4 className="flex items-center gap-1.5 text-sm font-semibold text-foreground">
                        <Eye className="size-4 text-muted-foreground" />
                        Impersonation sessions
                    </h4>
                    {impersonations.length === 0 ? (
                        <p className="text-sm text-muted-foreground">
                            Never impersonated
                        </p>
                    ) : (
                        <ul className="flex flex-col gap-1 text-xs">
                            {impersonations.map((log) => (
                                <li
                                    key={log.id}
                                    className="rounded-lg bg-muted/50 px-3 py-2 text-muted-foreground"
                                >
                                    <span className="font-medium text-foreground">
                                        {log.impersonator ?? 'Unknown'}
                                    </span>{' '}
                                    · {formatDateTime(log.started_at)}
                                    {log.ended_at
                                        ? ` – ${formatDateTime(log.ended_at)}`
                                        : ' (active)'}
                                </li>
                            ))}
                        </ul>
                    )}
                </div>
            </div>
        </div>
    );
}

function LoginTable({ rows }: { rows: Props['logins'] }) {
    if (rows.length === 0) {
        return <EmptyState icon={LogIn} title="No logins recorded" />;
    }

    return (
        <div className="overflow-x-auto">
            <table className="w-full min-w-[520px] text-sm">
                <thead>
                    <tr className="border-b border-border text-xs tracking-wider text-muted-foreground uppercase">
                        <th className="py-2 pr-3 text-left font-medium">
                            Time
                        </th>
                        <th className="px-3 py-2 text-left font-medium">
                            Result
                        </th>
                        <th className="px-3 py-2 text-left font-medium">
                            Device
                        </th>
                        <th className="py-2 pl-3 text-left font-medium">
                            IP address
                        </th>
                    </tr>
                </thead>
                <tbody className="divide-y divide-border">
                    {rows.map((row) => (
                        <tr key={row.id}>
                            <td className="py-2.5 pr-3 whitespace-nowrap text-foreground">
                                {formatDateTime(row.login_at)}
                            </td>
                            <td className="px-3 py-2.5">
                                <Pill
                                    tone={row.is_successful ? 'green' : 'red'}
                                >
                                    {row.is_successful ? 'Success' : 'Failed'}
                                </Pill>
                            </td>
                            <td className="px-3 py-2.5 text-muted-foreground">
                                {row.device}
                            </td>
                            <td className="py-2.5 pl-3 font-mono text-xs text-muted-foreground">
                                {row.ip_address ?? '—'}
                            </td>
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    );
}

ShowUser.layout = (page: ReactNode) => (
    <AdminLayout title="User Profile">{page}</AdminLayout>
);
