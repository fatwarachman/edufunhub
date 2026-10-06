import { type Paginated, SimplePagination } from '@/components/admin/admin-kit';
import {
    axisTick,
    chartTooltipStyle,
    GameDot,
    KpiCard,
    smoothLine,
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
    useSubjectLabel,
} from '@/components/admin/game-stats';
import { MatchCard, type MatchRow } from '@/components/admin/match-history';
import { BadgeMedal, type BadgeProgress } from '@/components/badges';
import PlayerCharacter from '@/components/player-character';
import AdminLayout from '@/layouts/admin-layout';
import { adminLocale, tr } from '@/lib/admin-i18n';
import { type CharacterLook } from '@/lib/character/draw-character';
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
    ShoppingBag,
    Swords,
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
    is_teacher: boolean;
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
    badges: {
        stats: Record<string, number>;
        badges: (BadgeProgress & { name: string; description: string })[];
    };
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
        spent_points: number;
        balance: number;
    };
    perGame: {
        key: string;
        plays: number;
        points: number;
        best: number;
        accuracy: number | null;
        play_seconds: number;
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
    matchHistory: {
        summary: {
            matches: number;
            wins: number;
            multiplayer_matches: number;
            multiplayer_wins: number;
            win_rate: number | null;
            accuracy: number | null;
            left_early: number;
            opponents: number;
        };
        opponents: {
            user_id: number;
            name: string;
            account: string | null;
            grade: number;
            matches: number;
            wins: number;
            losses: number;
            draws: number;
            last_played_at: string;
        }[];
        monthly: {
            month: string;
            matches: number;
            wins: number;
            win_rate: number | null;
            accuracy: number | null;
            avg_level: number | null;
        }[];
        byGame: {
            game_key: string;
            matches: number;
            wins: number;
            best_level: number | null;
            avg_rank: number;
        }[];
    };
    matches: Paginated<MatchRow>;
    shop: {
        items: {
            id: number;
            name: string;
            slot: string;
            price_paid: number;
            bought_at: string | null;
        }[];
        character: CharacterLook | null;
    };
}

type Tab = 'games' | 'matches' | 'activity' | 'logins';

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
    const subjectLabel = useSubjectLabel();
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
                    {tr('Back to users')}
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
                                        {suspended
                                            ? tr('Suspended')
                                            : tr('Active')}
                                    </Pill>
                                    {user.is_superadmin && (
                                        <Pill tone="purple">
                                            {tr('Super admin')}
                                        </Pill>
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
                                            {tr('sign-in')}
                                        </Pill>
                                    ))}
                                    {stats.rank && (
                                        <Pill tone="amber">
                                            <Trophy className="size-3" />
                                            {tr('Rank #')}
                                            {stats.rank}
                                        </Pill>
                                    )}
                                </div>
                            </div>
                        </div>
                        <div className="flex flex-wrap gap-2">
                            <button
                                type="button"
                                onClick={() =>
                                    router.patch(
                                        `/admin/users/${user.id}/teacher`,
                                        {},
                                        { preserveScroll: true },
                                    )
                                }
                                data-testid="user-toggle-teacher"
                                aria-pressed={user.is_teacher}
                                className={cn(
                                    'inline-flex items-center gap-1.5 rounded-lg border px-3 py-2 text-sm font-medium focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none',
                                    user.is_teacher
                                        ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-700 hover:bg-emerald-500/15 dark:text-emerald-300'
                                        : 'border-border text-foreground hover:bg-accent',
                                )}
                            >
                                <GraduationCap className="size-4" />
                                {user.is_teacher
                                    ? tr('Remove teacher')
                                    : tr('Make teacher')}
                            </button>
                            <Link
                                href={`/admin/users/${user.id}/edit`}
                                className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-2 text-sm font-medium text-foreground hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                            >
                                <Edit className="size-4" />
                                {tr('Edit')}
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
                                        {suspended
                                            ? tr('Activate')
                                            : tr('Suspend')}
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => setConfirmDelete(true)}
                                        className="inline-flex items-center gap-1.5 rounded-lg border border-destructive/30 px-3 py-2 text-sm font-medium text-destructive hover:bg-destructive/5 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                                    >
                                        <Trash2 className="size-4" />
                                        {tr('Delete')}
                                    </button>
                                </>
                            )}
                        </div>
                    </div>
                </section>

                {/* KPIs */}
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
                    <KpiCard
                        label={tr('Total points')}
                        value={formatNumber(stats.points)}
                        icon={Coins}
                        accent="var(--color-bubble-orange)"
                        footer={
                            <span className="text-xs text-muted-foreground">
                                {tr('Spendable')} {formatNumber(stats.balance)}{' '}
                                {tr('· spent')}{' '}
                                {formatNumber(stats.spent_points)}{' '}
                                {tr('in shop')}
                            </span>
                        }
                    />
                    <KpiCard
                        label={tr('Games played')}
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
                                {tr('Last played')}{' '}
                                {timeAgo(stats.last_played_at)}
                            </span>
                        }
                    />
                    <KpiCard
                        label={tr('Accuracy')}
                        value={
                            <span className={rateTone(stats.accuracy)}>
                                {formatPercent(stats.accuracy)}
                            </span>
                        }
                        icon={Target}
                        accent="var(--color-bubble-green)"
                        footer={
                            <span className="text-xs text-muted-foreground">
                                {formatNumber(stats.correct)} {tr('correct ·')}{' '}
                                {formatNumber(stats.wrong)} {tr('wrong')}
                            </span>
                        }
                    />
                    <KpiCard
                        label={tr('Success rate (>{0}%)', [props.passPercent])}
                        value={
                            <span className={rateTone(stats.success_rate)}>
                                {formatPercent(stats.success_rate)}
                            </span>
                        }
                        icon={Medal}
                        accent="var(--color-bubble-purple)"
                        footer={
                            <span className="text-xs text-muted-foreground">
                                {tr('Time played')}{' '}
                                {formatDuration(stats.play_seconds || null)}
                            </span>
                        }
                    />
                </div>

                <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
                    {/* Profile facts */}
                    <div className="flex flex-col gap-6">
                        <Panel
                            title={tr('Learner profile')}
                            icon={UserRound}
                            actions={
                                <span className="text-xs text-muted-foreground">
                                    {completeness}
                                    {tr('/4 complete')}
                                </span>
                            }
                        >
                            <dl className="flex flex-col gap-3 text-sm">
                                <Fact
                                    icon={GraduationCap}
                                    label={tr('Grade')}
                                    value={
                                        profile?.grade
                                            ? `Grade ${profile.grade}`
                                            : null
                                    }
                                />
                                <Fact
                                    icon={Cake}
                                    label={tr('Age')}
                                    value={
                                        profile?.birth_date
                                            ? `${profile.age} years · ${formatBirthDate(profile.birth_date)}`
                                            : null
                                    }
                                />
                                <Fact
                                    icon={School}
                                    label={tr('Last school')}
                                    value={profile?.school_name}
                                />
                            </dl>
                        </Panel>
                        <Panel
                            title={tr('Character & items')}
                            icon={ShoppingBag}
                            actions={
                                <span className="text-xs text-muted-foreground">
                                    {props.shop.items.length} {tr('bought')}
                                </span>
                            }
                        >
                            <div className="flex items-start gap-4">
                                <div className="size-24 shrink-0 rounded-2xl bg-[#d8c7a4]/60">
                                    {props.shop.character && (
                                        <PlayerCharacter
                                            character={props.shop.character}
                                            backdrop={false}
                                            className="size-full"
                                        />
                                    )}
                                </div>
                                {props.shop.items.length === 0 ? (
                                    <p className="text-sm text-muted-foreground">
                                        {tr('No items bought yet.')}
                                    </p>
                                ) : (
                                    <ul
                                        className="flex min-w-0 flex-1 flex-col gap-1.5 text-sm"
                                        data-testid="user-items"
                                    >
                                        {props.shop.items.map((item) => (
                                            <li
                                                key={item.id}
                                                className="flex items-center justify-between gap-2"
                                            >
                                                <span className="truncate text-foreground">
                                                    {item.name}
                                                </span>
                                                <span className="shrink-0 text-xs text-muted-foreground tabular-nums">
                                                    {formatNumber(
                                                        item.price_paid,
                                                    )}{' '}
                                                    {tr('pts')}
                                                </span>
                                            </li>
                                        ))}
                                    </ul>
                                )}
                            </div>
                        </Panel>
                        <Panel title={tr('Account')} icon={KeyRound}>
                            <dl className="flex flex-col gap-3 text-sm">
                                <Fact
                                    icon={Calendar}
                                    label={tr('Joined')}
                                    value={formatDate(user.created_at, true)}
                                />
                                <Fact
                                    icon={Eye}
                                    label={tr('Last seen')}
                                    value={
                                        user.last_seen_at
                                            ? `${timeAgo(user.last_seen_at)}`
                                            : 'Never'
                                    }
                                />
                                <Fact
                                    icon={Mail}
                                    label={tr('Email verified')}
                                    value={
                                        user.email_verified_at
                                            ? formatDate(user.email_verified_at)
                                            : 'Not verified'
                                    }
                                />
                                <Fact
                                    icon={ShieldCheck}
                                    label={tr('Two-factor')}
                                    value={
                                        user.two_factor_enabled
                                            ? 'Enabled'
                                            : 'Off'
                                    }
                                />
                                <Fact
                                    icon={LogIn}
                                    label={tr('Logins')}
                                    value={`${formatNumber(stats.logins)} successful · ${formatNumber(stats.failed_logins)} failed`}
                                />
                                <Fact
                                    icon={Clock}
                                    label={tr('First game')}
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
                            title={tr('Accuracy trend')}
                            description={tr(
                                'Up to the last 20 scored games · dashed line = {0}% pass mark',
                                [props.passPercent],
                            )}
                            icon={Target}
                        >
                            {props.trend.length === 0 ? (
                                <EmptyState
                                    icon={Target}
                                    title={tr('No scored games yet')}
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
                                                {...smoothLine}
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
                            <Panel title={tr('Per game')} icon={Gamepad2}>
                                {props.perGame.length === 0 ? (
                                    <EmptyState
                                        icon={Gamepad2}
                                        title={tr('Has not played yet')}
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
                                                        {game.plays}{' '}
                                                        {tr('plays')}
                                                    </span>
                                                    <span>
                                                        {formatNumber(
                                                            game.points,
                                                        )}{' '}
                                                        {tr('pts')}
                                                    </span>
                                                    <span>
                                                        {tr('best')} {game.best}
                                                    </span>
                                                    <span className="inline-flex items-center gap-1">
                                                        <Clock className="size-3" />
                                                        {formatDuration(
                                                            game.play_seconds ||
                                                                null,
                                                        )}
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
                                title={tr('Subject mastery')}
                                description={tr(
                                    'From bank questions answered in games',
                                )}
                                icon={BookOpenCheck}
                            >
                                {props.subjects.length === 0 ? (
                                    <EmptyState
                                        icon={BookOpenCheck}
                                        title={tr(
                                            'No bank questions answered yet',
                                        )}
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
                                                        {subjectLabel(
                                                            row.subject,
                                                        )}
                                                    </span>
                                                    <span className="text-xs text-muted-foreground">
                                                        {row.answered}{' '}
                                                        {tr('answered ·')}{' '}
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
                        <Panel
                            title={tr('Activity · last 30 days')}
                            icon={Calendar}
                        >
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

                <BadgePanel badges={props.badges} />

                <MatchProgress history={props.matchHistory} />

                {/* Logs */}
                <section className="flex flex-col rounded-2xl border border-border bg-card shadow-sm">
                    <header className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-5 py-3">
                        <div
                            className="inline-flex rounded-lg border border-border bg-background p-1"
                            role="tablist"
                            aria-label={tr('User history')}
                        >
                            {(
                                [
                                    {
                                        key: 'games',
                                        label: `Game history (${props.plays.total})`,
                                        icon: History,
                                    },
                                    {
                                        key: 'matches',
                                        label: `Matches (${props.matches.total})`,
                                        icon: Swords,
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
                                    {tr(item.label)}
                                </button>
                            ))}
                        </div>
                    </header>
                    <div className="p-5">
                        {tab === 'games' && <GameHistory plays={props.plays} />}
                        {tab === 'matches' &&
                            (props.matches.data.length === 0 ? (
                                <EmptyState
                                    icon={Swords}
                                    title={tr('No room or duel matches yet')}
                                />
                            ) : (
                                <div className="flex flex-col gap-3">
                                    {props.matches.data.map((match) => (
                                        <MatchCard
                                            key={match.id}
                                            match={match}
                                        />
                                    ))}
                                    <SimplePagination {...props.matches} />
                                </div>
                            ))}
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
                            {tr('Delete user')}
                        </h3>
                        <p className="mt-2 text-sm text-muted-foreground">
                            {tr('Delete')}{' '}
                            <strong className="text-foreground">
                                {user.name}
                            </strong>
                            {tr(
                                '? The account is soft-deleted and can no longer sign in.',
                            )}
                        </p>
                        <div className="mt-6 flex items-center justify-end gap-3">
                            <button
                                type="button"
                                onClick={() => setConfirmDelete(false)}
                                disabled={deleting}
                                className="rounded-lg px-4 py-2 text-sm font-medium text-muted-foreground hover:text-foreground"
                            >
                                {tr('Cancel')}
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
                                {tr('Delete user')}
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
            <dt className="shrink-0 text-muted-foreground">{tr(label)}</dt>
            <dd
                className={cn(
                    'ml-auto min-w-0 text-right font-medium break-words',
                    value ? 'text-foreground' : 'text-muted-foreground',
                )}
            >
                {value || tr('Not set')}
            </dd>
        </div>
    );
}

function GameHistory({ plays }: { plays: Props['plays'] }) {
    if (plays.data.length === 0) {
        return <EmptyState icon={Gamepad2} title={tr('No games played yet')} />;
    }

    return (
        <div className="flex flex-col gap-4">
            <div className="overflow-x-auto">
                <table className="w-full min-w-[720px] text-sm">
                    <thead>
                        <tr className="border-b border-border text-xs tracking-wider text-muted-foreground uppercase">
                            <th className="py-2 pr-3 text-left font-medium">
                                {tr('Played')}
                            </th>
                            <th className="px-3 py-2 text-left font-medium">
                                {tr('Game')}
                            </th>
                            <th className="px-3 py-2 text-left font-medium">
                                {tr('Mission')}
                            </th>
                            <th className="px-3 py-2 text-right font-medium">
                                {tr('Grade')}
                            </th>
                            <th className="px-3 py-2 text-right font-medium">
                                {tr('Correct')}
                            </th>
                            <th className="px-3 py-2 text-right font-medium">
                                {tr('Accuracy')}
                            </th>
                            <th className="px-3 py-2 text-right font-medium">
                                {tr('Duration')}
                            </th>
                            <th className="py-2 pl-3 text-right font-medium">
                                {tr('Points')}
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
                        {tr('Page')} {plays.current_page} {tr('of')}{' '}
                        {plays.last_page}
                    </span>
                    <div className="flex gap-2">
                        {[
                            { url: plays.prev_page_url, label: tr('Previous') },
                            { url: plays.next_page_url, label: tr('Next') },
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
                                    {tr(link.label)}
                                </Link>
                            ) : (
                                <span
                                    key={link.label}
                                    className="rounded-lg border border-border px-3 py-1.5 opacity-40"
                                >
                                    {tr(link.label)}
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
                    <EmptyState
                        icon={Activity}
                        title={tr('No activity recorded')}
                    />
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
                                            ? tr('User')
                                            : (row.causer_name ?? tr('System'))}
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
                        {tr('Points ledger')}
                    </h4>
                    {ledger.length === 0 ? (
                        <p className="text-sm text-muted-foreground">
                            {tr('No points yet')}
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
                        {tr('Impersonation sessions')}
                    </h4>
                    {impersonations.length === 0 ? (
                        <p className="text-sm text-muted-foreground">
                            {tr('Never impersonated')}
                        </p>
                    ) : (
                        <ul className="flex flex-col gap-1 text-xs">
                            {impersonations.map((log) => (
                                <li
                                    key={log.id}
                                    className="rounded-lg bg-muted/50 px-3 py-2 text-muted-foreground"
                                >
                                    <span className="font-medium text-foreground">
                                        {log.impersonator ?? tr('Unknown')}
                                    </span>{' '}
                                    · {formatDateTime(log.started_at)}
                                    {log.ended_at
                                        ? ` – ${formatDateTime(log.ended_at)}`
                                        : tr(' (active)')}
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
        return <EmptyState icon={LogIn} title={tr('No logins recorded')} />;
    }

    return (
        <div className="overflow-x-auto">
            <table className="w-full min-w-[520px] text-sm">
                <thead>
                    <tr className="border-b border-border text-xs tracking-wider text-muted-foreground uppercase">
                        <th className="py-2 pr-3 text-left font-medium">
                            {tr('Time')}
                        </th>
                        <th className="px-3 py-2 text-left font-medium">
                            {tr('Result')}
                        </th>
                        <th className="px-3 py-2 text-left font-medium">
                            {tr('Device')}
                        </th>
                        <th className="py-2 pl-3 text-left font-medium">
                            {tr('IP address')}
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
                                    {row.is_successful
                                        ? tr('Success')
                                        : tr('Failed')}
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
    <AdminLayout title={tr('User Profile')}>{page}</AdminLayout>
);

function MatchProgress({ history }: { history: Props['matchHistory'] }) {
    const { summary, monthly, opponents, byGame } = history;

    return (
        <Panel
            title={tr('Matches & progress')}
            icon={Swords}
            actions={
                <span className="text-xs text-muted-foreground">
                    {tr('Rooms, invites and duels')}
                </span>
            }
        >
            {summary.matches === 0 ? (
                <EmptyState
                    icon={Swords}
                    title={tr('No recorded matches yet')}
                    description={tr(
                        'Ular Tangga, Teka-Teki Silang and duel matches appear here.',
                    )}
                />
            ) : (
                <div
                    className="flex flex-col gap-6"
                    data-testid="match-progress"
                >
                    <dl className="grid grid-cols-2 gap-3 md:grid-cols-4">
                        {[
                            ['Matches', formatNumber(summary.matches)],
                            [
                                'Wins vs others',
                                `${summary.multiplayer_wins} / ${summary.multiplayer_matches}`,
                            ],
                            ['Win rate', formatPercent(summary.win_rate)],
                            ['Players met', formatNumber(summary.opponents)],
                        ].map(([label, value]) => (
                            <div
                                key={label}
                                className="rounded-xl border border-border bg-muted/30 px-3 py-2.5"
                            >
                                <dt className="text-xs text-muted-foreground">
                                    {tr(label)}
                                </dt>
                                <dd className="text-lg font-semibold text-foreground tabular-nums">
                                    {value}
                                </dd>
                            </div>
                        ))}
                    </dl>

                    <div className="grid gap-6 lg:grid-cols-2">
                        <div className="flex min-w-0 flex-col gap-2">
                            <h4 className="text-sm font-semibold text-foreground">
                                {tr('Monthly progress')}
                            </h4>
                            <div className="overflow-x-auto">
                                <table className="w-full min-w-[420px] text-sm">
                                    <thead className="text-left text-xs text-muted-foreground">
                                        <tr>
                                            <th className="py-1.5 font-medium">
                                                {tr('Month')}
                                            </th>
                                            <th className="py-1.5 text-right font-medium">
                                                {tr('Matches')}
                                            </th>
                                            <th className="py-1.5 text-right font-medium">
                                                {tr('Win rate')}
                                            </th>
                                            <th className="py-1.5 text-right font-medium">
                                                {tr('Accuracy')}
                                            </th>
                                            <th className="py-1.5 text-right font-medium">
                                                {tr('Avg level')}
                                            </th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-border">
                                        {monthly.map((row) => (
                                            <tr key={row.month}>
                                                <td className="py-1.5 text-foreground">
                                                    {new Date(
                                                        `${row.month}-01T00:00:00`,
                                                    ).toLocaleDateString(
                                                        adminLocale(),
                                                        {
                                                            month: 'short',
                                                            year: 'numeric',
                                                        },
                                                    )}
                                                </td>
                                                <td className="py-1.5 text-right tabular-nums">
                                                    {row.matches}
                                                </td>
                                                <td className="py-1.5 text-right tabular-nums">
                                                    {formatPercent(
                                                        row.win_rate,
                                                    )}
                                                </td>
                                                <td
                                                    className={cn(
                                                        'py-1.5 text-right tabular-nums',
                                                        rateTone(row.accuracy),
                                                    )}
                                                >
                                                    {formatPercent(
                                                        row.accuracy,
                                                    )}
                                                </td>
                                                <td className="py-1.5 text-right tabular-nums">
                                                    {row.avg_level ?? '—'}
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                            <div className="mt-2 flex flex-wrap gap-2">
                                {byGame.map((game) => (
                                    <span
                                        key={game.game_key}
                                        className="rounded-full bg-muted px-2.5 py-1 text-xs text-muted-foreground"
                                    >
                                        {gameLabel(game.game_key)}:{' '}
                                        {game.matches} {tr('· avg rank')}{' '}
                                        {game.avg_rank}
                                        {game.best_level !== null &&
                                            tr(' · best level {0}', [
                                                game.best_level,
                                            ])}
                                    </span>
                                ))}
                            </div>
                        </div>

                        <div className="flex min-w-0 flex-col gap-2">
                            <h4 className="text-sm font-semibold text-foreground">
                                {tr('Played with most')}
                            </h4>
                            {opponents.length === 0 ? (
                                <p className="text-sm text-muted-foreground">
                                    {tr('Only solo or bot matches so far.')}
                                </p>
                            ) : (
                                <ul
                                    className="flex flex-col divide-y divide-border rounded-xl border border-border"
                                    data-testid="match-opponents"
                                >
                                    {opponents.map((opponent) => (
                                        <li
                                            key={opponent.user_id}
                                            className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 text-sm"
                                        >
                                            <span className="flex min-w-0 items-baseline gap-1.5">
                                                <Link
                                                    href={`/admin/users/${opponent.user_id}`}
                                                    className="truncate font-medium text-foreground hover:underline"
                                                >
                                                    {opponent.name}
                                                </Link>
                                                <span className="shrink-0 text-xs text-muted-foreground">
                                                    {opponent.grade === 0
                                                        ? tr('TK')
                                                        : tr('Grade {0}', [
                                                              opponent.grade,
                                                          ])}
                                                    {opponent.account &&
                                                        opponent.account !==
                                                            opponent.name &&
                                                        ` · ${opponent.account}`}
                                                </span>
                                            </span>
                                            <span className="text-xs text-muted-foreground tabular-nums">
                                                {opponent.matches}{' '}
                                                {tr('matches ·')}{' '}
                                                <span className="text-emerald-600 dark:text-emerald-400">
                                                    {opponent.wins}W
                                                </span>{' '}
                                                <span className="text-red-600 dark:text-red-400">
                                                    {opponent.losses}L
                                                </span>{' '}
                                                {opponent.draws}
                                                {tr('D ·')}{' '}
                                                {timeAgo(
                                                    opponent.last_played_at,
                                                )}
                                            </span>
                                        </li>
                                    ))}
                                </ul>
                            )}
                        </div>
                    </div>
                </div>
            )}
        </Panel>
    );
}

const BADGE_STATS: { key: string; label: string; percent?: boolean }[] = [
    { key: 'plays', label: 'Plays' },
    { key: 'completed', label: 'Challenges completed' },
    { key: 'success_rate', label: 'Success rate', percent: true },
    { key: 'games', label: 'Different games' },
    { key: 'active_days', label: 'Active days' },
    { key: 'wins', label: 'Wins' },
    { key: 'streak', label: 'Day streak' },
];

function BadgePanel({ badges }: { badges: Props['badges'] }) {
    const earned = badges.badges.filter((badge) => badge.earned);

    return (
        <section
            className="flex flex-col gap-4 rounded-2xl border border-border bg-card p-5 shadow-sm"
            data-testid="admin-user-badges"
        >
            <header className="flex flex-wrap items-center justify-between gap-2">
                <div>
                    <h3 className="font-semibold text-foreground">
                        {tr('Badges')}
                    </h3>
                    <p className="text-sm text-muted-foreground">
                        {tr(
                            'Earned from how often the player plays and how many challenges they complete.',
                        )}
                    </p>
                </div>
                <span className="rounded-full bg-muted px-2.5 py-1 text-xs font-semibold text-foreground tabular-nums">
                    {earned.length} / {badges.badges.length} {tr('earned')}
                </span>
            </header>
            <dl className="grid grid-cols-2 gap-2 sm:grid-cols-4 2xl:grid-cols-7">
                {BADGE_STATS.map((stat) => (
                    <div
                        key={stat.key}
                        className="flex min-w-0 flex-col gap-0.5 rounded-xl bg-muted/50 px-3 py-2"
                    >
                        <dt className="text-xs leading-tight text-muted-foreground">
                            {tr(stat.label)}
                        </dt>
                        <dd className="text-lg font-semibold text-foreground tabular-nums">
                            {badges.stats[stat.key] ?? 0}
                            {stat.percent ? '%' : ''}
                        </dd>
                    </div>
                ))}
            </dl>
            <ul className="grid grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-5">
                {badges.badges.map((badge) => (
                    <li
                        key={badge.key}
                        className="flex min-w-0 items-center gap-3 rounded-xl border border-border px-3 py-2.5"
                        title={tr(badge.description)}
                    >
                        <BadgeMedal
                            badge={badge}
                            size="md"
                            locked={!badge.earned}
                        />
                        <div className="flex min-w-0 flex-col">
                            <span
                                className={
                                    badge.earned
                                        ? 'truncate text-sm font-semibold text-foreground'
                                        : 'truncate text-sm font-semibold text-muted-foreground'
                                }
                            >
                                {badge.name}
                            </span>
                            <span className="text-xs text-foreground/70 tabular-nums">
                                {badge.earned && badge.earned_at
                                    ? formatDate(badge.earned_at)
                                    : tr('{0}% progress', [badge.progress])}
                            </span>
                        </div>
                    </li>
                ))}
            </ul>
        </section>
    );
}
