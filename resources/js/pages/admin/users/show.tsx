import {
    AbilityAssessmentPanel,
    type AbilityAssessments,
    AbilityAssessmentSkeleton,
} from '@/components/admin/ability-assessment';
import {
    ActivityEventBadge,
    type ActivityProperties,
    activitySummary,
} from '@/components/admin/activity-entry';
import {
    FlashMessages,
    type Paginated,
    SimplePagination,
} from '@/components/admin/admin-kit';
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
import {
    adminGradeLabel,
    PlayerSchoolGradeDialog,
} from '@/components/admin/player-school-grade-dialog';
import { BadgeMedal, type BadgeProgress } from '@/components/badges';
import PlayerCharacter from '@/components/player-character';
import { ResponsiveTable } from '@/components/responsive-table';
import AdminLayout from '@/layouts/admin-layout';
import { adminLocale, tr } from '@/lib/admin-i18n';
import { type CharacterLook } from '@/lib/character/draw-character';
import { hasGrade } from '@/lib/grade';
import { cn } from '@/lib/utils';
import { Deferred, Head, Link, router } from '@inertiajs/react';
import {
    Activity,
    ArrowLeft,
    ArrowRight,
    BookOpenCheck,
    BrainCircuit,
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
import { type ReactNode, useEffect, useRef, useState } from 'react';
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
        school_city: string | null;
        school_level: string | null;
        school_npsn: string | null;
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
    viewerIsSuperadmin: boolean;
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
        properties: ActivityProperties;
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
    hasAbilityAssessment: boolean;
    abilityAssessments?: AbilityAssessments;
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

type Tab = 'games' | 'perGame' | 'ability' | 'matches' | 'activity' | 'logins';

const TABS: Tab[] = [
    'games',
    'perGame',
    'ability',
    'matches',
    'activity',
    'logins',
];

const PER_GAME_PREVIEW = 5;

function initialTab(): Tab {
    if (typeof window === 'undefined') return 'games';
    const value = new URLSearchParams(window.location.search).get('tab');
    return TABS.includes(value as Tab) ? (value as Tab) : 'games';
}

function writeTabToUrl(tab: Tab): void {
    const url = new URL(window.location.href);
    if (url.searchParams.get('tab') === tab) return;
    url.searchParams.set('tab', tab);
    window.history.replaceState(window.history.state, '', url);
}

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
    const [tab, setTabState] = useState<Tab>(initialTab);
    const tabsRef = useRef<HTMLElement>(null);
    const setTab = (next: Tab) => {
        setTabState(next);
        writeTabToUrl(next);
    };
    useEffect(
        () =>
            // Deferred props load through a partial reload that rewrites the
            // URL, so re-apply the open tab after every Inertia navigation.
            router.on('navigate', () => writeTabToUrl(tab)),
        [tab],
    );
    const [scrollRequest, setScrollRequest] = useState(0);
    const openTab = (next: Tab) => {
        setTab(next);
        setScrollRequest((count) => count + 1);
    };
    useEffect(() => {
        // Scroll after the new tab has rendered so the target is not clamped
        // to the shorter page of the previous tab.
        if (scrollRequest === 0) return;
        tabsRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, [scrollRequest]);
    const [confirmDelete, setConfirmDelete] = useState(false);
    const [editingSchool, setEditingSchool] = useState(false);
    const [deleting, setDeleting] = useState(false);
    const suspended = user.status === 'suspended';
    const completeness = [
        hasGrade(profile?.grade),
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

                <FlashMessages />

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
                    <div className="flex flex-col gap-5 px-6 pb-6 xl:flex-row xl:items-end xl:justify-between">
                        <div className="-mt-12 flex flex-col gap-4 sm:flex-row sm:items-start">
                            <UserAvatar
                                name={user.name}
                                src={user.avatar_url}
                                userId={user.id}
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
                            {props.hasAbilityAssessment && (
                                <a
                                    href="?tab=ability"
                                    onClick={(event) => {
                                        event.preventDefault();
                                        openTab('ability');
                                    }}
                                    data-testid="user-open-ability"
                                    className="inline-flex items-center gap-1.5 rounded-lg border border-violet-500/40 bg-violet-500/10 px-3 py-2 text-sm font-medium whitespace-nowrap text-violet-700 hover:bg-violet-500/15 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none dark:text-violet-300"
                                >
                                    <BrainCircuit className="size-4" />
                                    {tr('AI ability analysis')}
                                </a>
                            )}
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
                                <div className="flex items-center gap-2">
                                    <span className="text-xs text-muted-foreground">
                                        {completeness}
                                        {tr('/4 complete')}
                                    </span>
                                    {props.viewerIsSuperadmin && profile && (
                                        <button
                                            type="button"
                                            onClick={() =>
                                                setEditingSchool(true)
                                            }
                                            className="inline-flex min-h-10 items-center gap-1.5 rounded-lg border border-border px-3 text-sm font-medium text-foreground hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                                            data-testid="user-edit-school-grade"
                                        >
                                            <Edit className="size-4" />
                                            {tr('Edit')}
                                        </button>
                                    )}
                                </div>
                            }
                        >
                            <dl className="flex flex-col gap-3 text-sm">
                                <Fact
                                    icon={GraduationCap}
                                    label={tr('Grade')}
                                    value={
                                        hasGrade(profile?.grade)
                                            ? adminGradeLabel(profile.grade)
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
                                    value={
                                        profile?.school_name
                                            ? [
                                                  profile.school_name,
                                                  profile.school_city,
                                              ]
                                                  .filter(Boolean)
                                                  .join(' · ')
                                            : null
                                    }
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
                            <Panel
                                title={tr('Per game')}
                                icon={Gamepad2}
                                actions={
                                    props.perGame.length > 0 && (
                                        <span className="text-xs text-muted-foreground">
                                            {tr('{0} games', [
                                                props.perGame.length,
                                            ])}
                                        </span>
                                    )
                                }
                            >
                                {props.perGame.length === 0 ? (
                                    <EmptyState
                                        icon={Gamepad2}
                                        title={tr('Has not played yet')}
                                    />
                                ) : (
                                    <div className="flex flex-col gap-3">
                                        <ul
                                            className="flex flex-col gap-3"
                                            data-testid="user-per-game-preview"
                                        >
                                            {props.perGame
                                                .slice(0, PER_GAME_PREVIEW)
                                                .map((game) => (
                                                    <li
                                                        key={game.key}
                                                        className="flex flex-col gap-1 rounded-xl border border-border p-3"
                                                    >
                                                        <div className="flex items-center justify-between gap-2 text-sm">
                                                            <span className="font-medium text-foreground">
                                                                <GameDot
                                                                    game={
                                                                        game.key
                                                                    }
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
                                                                {tr('best')}{' '}
                                                                {game.best}
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
                                        {props.perGame.length >
                                            PER_GAME_PREVIEW && (
                                            <button
                                                type="button"
                                                onClick={() =>
                                                    openTab('perGame')
                                                }
                                                data-testid="user-per-game-more"
                                                className="inline-flex h-9 items-center justify-center gap-1.5 rounded-lg border border-border px-3 text-sm font-medium text-foreground hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                                            >
                                                {tr('Show more ({0})', [
                                                    props.perGame.length -
                                                        PER_GAME_PREVIEW,
                                                ])}
                                                <ArrowRight className="size-4" />
                                            </button>
                                        )}
                                    </div>
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
                <section
                    ref={tabsRef}
                    className="flex min-w-0 scroll-mt-20 flex-col rounded-2xl border border-border bg-card shadow-sm"
                >
                    <header className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-5 py-3">
                        <div
                            className="inline-flex max-w-full flex-wrap rounded-lg border border-border bg-background p-1"
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
                                        key: 'perGame',
                                        label: tr('All games ({0})', [
                                            props.perGame.length,
                                        ]),
                                        icon: Gamepad2,
                                    },
                                    {
                                        key: 'ability',
                                        label: tr('AI ability analysis'),
                                        icon: BrainCircuit,
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
                                    data-testid={`user-tab-${item.key}`}
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
                        {tab === 'perGame' && (
                            <PerGameTable rows={props.perGame} />
                        )}
                        {tab === 'ability' && (
                            <Deferred
                                data="abilityAssessments"
                                fallback={<AbilityAssessmentSkeleton />}
                            >
                                {props.abilityAssessments ? (
                                    <AbilityAssessmentPanel
                                        userId={user.id}
                                        data={props.abilityAssessments}
                                    />
                                ) : (
                                    <AbilityAssessmentSkeleton />
                                )}
                            </Deferred>
                        )}
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

            {editingSchool && profile && (
                <PlayerSchoolGradeDialog
                    userId={user.id}
                    profile={profile}
                    open={editingSchool}
                    onClose={() => setEditingSchool(false)}
                />
            )}

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
            <ResponsiveTable
                testId="user-plays-table"
                rows={plays.data}
                rowKey={(play) => play.id}
                columns={[
                    {
                        key: 'game',
                        header: tr('Game'),
                        primary: true,
                        cellClassName: 'whitespace-nowrap text-foreground',
                        cell: (play) => <GameDot game={play.game_key} />,
                    },
                    {
                        key: 'played',
                        header: tr('Played'),
                        summary: true,
                        cellClassName:
                            'whitespace-nowrap text-muted-foreground',
                        cell: (play) => formatDateTime(play.played_at),
                    },
                    {
                        key: 'mission',
                        header: tr('Mission'),
                        cellClassName: 'text-muted-foreground capitalize',
                        cell: (play) => play.mission ?? '—',
                    },
                    {
                        key: 'grade',
                        header: tr('Grade'),
                        align: 'right',
                        cellClassName: 'text-foreground tabular-nums',
                        cell: (play) => play.grade ?? '—',
                    },
                    {
                        key: 'correct',
                        header: tr('Correct'),
                        align: 'right',
                        cellClassName: 'text-foreground tabular-nums',
                        cell: (play) =>
                            play.correct === null ? (
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
                            ),
                    },
                    {
                        key: 'accuracy',
                        header: tr('Accuracy'),
                        align: 'right',
                        cellClassName: 'font-medium tabular-nums',
                        cell: (play) => (
                            <span className={rateTone(play.accuracy)}>
                                {formatPercent(play.accuracy)}
                            </span>
                        ),
                    },
                    {
                        key: 'duration',
                        header: tr('Duration'),
                        align: 'right',
                        cellClassName: 'text-muted-foreground tabular-nums',
                        cell: (play) => formatDuration(play.duration_seconds),
                    },
                    {
                        key: 'points',
                        header: tr('Points'),
                        align: 'right',
                        summary: true,
                        cellClassName:
                            'font-semibold text-foreground tabular-nums',
                        cell: (play) => <>+{formatNumber(play.points)}</>,
                    },
                ]}
            />
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

function PerGameTable({ rows }: { rows: Props['perGame'] }) {
    if (rows.length === 0) {
        return <EmptyState icon={Gamepad2} title={tr('Has not played yet')} />;
    }

    return (
        <ResponsiveTable
            testId="user-per-game-table"
            rows={rows}
            rowKey={(game) => game.key}
            columns={[
                {
                    key: 'game',
                    header: tr('Game'),
                    primary: true,
                    cellClassName: 'whitespace-nowrap text-foreground',
                    cell: (game) => <GameDot game={game.key} />,
                },
                {
                    key: 'plays',
                    header: tr('Plays'),
                    align: 'right',
                    cellClassName: 'text-foreground tabular-nums',
                    cell: (game) => formatNumber(game.plays),
                },
                {
                    key: 'points',
                    header: tr('Points'),
                    align: 'right',
                    summary: true,
                    cellClassName: 'font-semibold text-foreground tabular-nums',
                    cell: (game) => formatNumber(game.points),
                },
                {
                    key: 'best',
                    header: tr('Best'),
                    align: 'right',
                    cellClassName: 'text-foreground tabular-nums',
                    cell: (game) => formatNumber(game.best),
                },
                {
                    key: 'accuracy',
                    header: tr('Accuracy'),
                    align: 'right',
                    summary: true,
                    cellClassName: 'font-medium tabular-nums',
                    cell: (game) => (
                        <span className={rateTone(game.accuracy)}>
                            {formatPercent(game.accuracy)}
                        </span>
                    ),
                },
                {
                    key: 'time',
                    header: tr('Time played'),
                    align: 'right',
                    cellClassName: 'text-muted-foreground tabular-nums',
                    cell: (game) => formatDuration(game.play_seconds || null),
                },
                {
                    key: 'last',
                    header: tr('Last played'),
                    align: 'right',
                    cellClassName: 'whitespace-nowrap text-muted-foreground',
                    cell: (game) => (
                        <span title={formatDateTime(game.last_played_at)}>
                            {timeAgo(game.last_played_at)}
                        </span>
                    ),
                },
            ]}
        />
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
                                <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-foreground">
                                    <span className="font-medium">
                                        {row.by_self
                                            ? tr('User')
                                            : (row.causer_name ?? tr('System'))}
                                    </span>
                                    <ActivityEventBadge event={row.event} />
                                </div>
                                <p
                                    className="mt-0.5 text-sm [overflow-wrap:anywhere] text-muted-foreground"
                                    data-testid="user-activity-summary"
                                >
                                    {activitySummary(
                                        row.event,
                                        row.description,
                                        row.properties,
                                    )}
                                    {row.subject_type &&
                                        !['User', 'GameHistory'].includes(
                                            row.subject_type,
                                        ) && <> · {row.subject_type}</>}
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
        <ResponsiveTable
            testId="user-logins-table"
            rows={rows}
            rowKey={(row) => row.id}
            columns={[
                {
                    key: 'time',
                    header: tr('Time'),
                    primary: true,
                    cellClassName: 'whitespace-nowrap text-foreground',
                    cell: (row) => formatDateTime(row.login_at),
                },
                {
                    key: 'result',
                    header: tr('Result'),
                    summary: true,
                    cell: (row) => (
                        <Pill tone={row.is_successful ? 'green' : 'red'}>
                            {row.is_successful ? tr('Success') : tr('Failed')}
                        </Pill>
                    ),
                },
                {
                    key: 'device',
                    header: tr('Device'),
                    cellClassName: 'text-muted-foreground',
                    cell: (row) => row.device,
                },
                {
                    key: 'ip',
                    header: tr('IP address'),
                    cellClassName: 'font-mono text-xs text-muted-foreground',
                    cell: (row) => row.ip_address ?? '—',
                },
            ]}
        />
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
                            <ResponsiveTable
                                testId="match-monthly-table"
                                rows={monthly}
                                rowKey={(row) => row.month}
                                columns={[
                                    {
                                        key: 'month',
                                        header: tr('Month'),
                                        primary: true,
                                        cellClassName: 'text-foreground',
                                        cell: (row) =>
                                            new Date(
                                                `${row.month}-01T00:00:00`,
                                            ).toLocaleDateString(
                                                adminLocale(),
                                                {
                                                    month: 'short',
                                                    year: 'numeric',
                                                },
                                            ),
                                    },
                                    {
                                        key: 'matches',
                                        header: tr('Matches'),
                                        align: 'right',
                                        summary: true,
                                        cellClassName: 'tabular-nums',
                                        cell: (row) => row.matches,
                                    },
                                    {
                                        key: 'win_rate',
                                        header: tr('Win rate'),
                                        align: 'right',
                                        cellClassName: 'tabular-nums',
                                        cell: (row) =>
                                            formatPercent(row.win_rate),
                                    },
                                    {
                                        key: 'accuracy',
                                        header: tr('Accuracy'),
                                        align: 'right',
                                        cellClassName: 'tabular-nums',
                                        cell: (row) => (
                                            <span
                                                className={rateTone(
                                                    row.accuracy,
                                                )}
                                            >
                                                {formatPercent(row.accuracy)}
                                            </span>
                                        ),
                                    },
                                    {
                                        key: 'avg_level',
                                        header: tr('Avg level'),
                                        align: 'right',
                                        cellClassName: 'tabular-nums',
                                        cell: (row) => row.avg_level ?? '—',
                                    },
                                ]}
                            />
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
