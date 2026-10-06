import { UserAvatar } from '@/components/admin/dashboard-kit';
import { EmptyState, formatNumber } from '@/components/admin/game-stats';
import { tr } from '@/lib/admin-i18n';
import { cn } from '@/lib/utils';
import { Deferred, Link } from '@inertiajs/react';
import { ArrowRight, Crown, Medal, School, Trophy } from 'lucide-react';
import { useState } from 'react';

export type LeaderboardPeriod = 'week' | 'month' | 'all';

export interface DashboardLeaderboardPlayer {
    rank: number;
    user_id: number;
    name: string;
    avatar_url: string | null;
    grade: number | null;
    school_name: string | null;
    points: number;
    plays: number;
}

export interface DashboardLeaderboardBoard {
    days: number;
    players: DashboardLeaderboardPlayer[];
    schools: {
        school: string;
        players: number;
        points: number;
        plays: number;
    }[];
}

export type DashboardLeaderboards = Record<
    LeaderboardPeriod,
    DashboardLeaderboardBoard
>;

const PERIODS: { key: LeaderboardPeriod; label: string }[] = [
    { key: 'week', label: 'This week' },
    { key: 'month', label: 'This month' },
    { key: 'all', label: 'All time' },
];

/** Medal colours for ranks 1–3 (badge, avatar ring, podium step). */
const MEDALS: Record<number, { badge: string; ring: string; step: string }> = {
    1: {
        badge: 'bg-amber-400 text-amber-950',
        ring: 'ring-amber-400',
        step: 'bg-amber-50 border-amber-200 dark:bg-amber-500/10 dark:border-amber-500/30',
    },
    2: {
        badge: 'bg-slate-400 text-slate-950',
        ring: 'ring-slate-300 dark:ring-slate-400',
        step: 'bg-slate-50 border-slate-200 dark:bg-slate-500/10 dark:border-slate-500/30',
    },
    3: {
        badge: 'bg-orange-400 text-orange-950',
        ring: 'ring-orange-400',
        step: 'bg-orange-50 border-orange-200 dark:bg-orange-500/10 dark:border-orange-500/30',
    },
};

function playerMeta(player: DashboardLeaderboardPlayer): string {
    return (
        [
            player.grade ? tr('Grade {0}', [player.grade]) : null,
            player.school_name,
        ]
            .filter(Boolean)
            .join(' · ') || '—'
    );
}

/**
 * Admin dashboard leaderboard: period tabs, top-3 podium, ranks 4–10 and
 * top schools. Data arrives as a deferred prop, so a skeleton shows first.
 */
export function DashboardLeaderboard({
    leaderboards,
    showFullLink,
}: {
    leaderboards?: DashboardLeaderboards;
    showFullLink: boolean;
}) {
    const [period, setPeriod] = useState<LeaderboardPeriod>('week');

    return (
        <section
            className="flex min-w-0 flex-col rounded-2xl border border-border bg-card shadow-sm"
            aria-labelledby="dashboard-leaderboard-title"
            data-testid="dashboard-leaderboard"
        >
            <header className="flex flex-wrap items-start justify-between gap-3 border-b border-border px-4 py-4 sm:px-5">
                <div className="flex min-w-0 flex-col gap-0.5">
                    <h3
                        id="dashboard-leaderboard-title"
                        className="flex items-center gap-2 font-semibold text-foreground"
                    >
                        <Trophy className="size-4 shrink-0 text-muted-foreground" />
                        {tr('Leaderboard')}
                    </h3>
                    <p className="text-xs text-muted-foreground">
                        {tr('Points earned by active players')}
                    </p>
                </div>
                <div className="flex w-full flex-wrap items-center justify-between gap-3 sm:w-auto sm:justify-end">
                    <div
                        className="flex w-full rounded-lg border border-border bg-background p-1 sm:inline-flex sm:w-auto"
                        role="tablist"
                        aria-label={tr('Leaderboard period')}
                    >
                        {PERIODS.map((item) => (
                            <button
                                key={item.key}
                                type="button"
                                role="tab"
                                aria-selected={period === item.key}
                                data-testid={`dashboard-leaderboard-tab-${item.key}`}
                                onClick={() => setPeriod(item.key)}
                                className={cn(
                                    'flex-auto rounded-md px-1.5 py-1 text-xs font-medium whitespace-nowrap transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none sm:flex-none sm:px-2.5',
                                    period === item.key
                                        ? 'bg-muted text-foreground'
                                        : 'text-muted-foreground hover:text-foreground',
                                )}
                            >
                                {tr(item.label)}
                            </button>
                        ))}
                    </div>
                    {showFullLink && (
                        <Link
                            href="/admin/leaderboard"
                            className="inline-flex items-center gap-1 link text-xs"
                            data-testid="dashboard-leaderboard-all"
                        >
                            {tr('View all')}
                            <ArrowRight className="size-3" />
                        </Link>
                    )}
                </div>
            </header>
            <div className="min-w-0 p-4 sm:p-5" role="tabpanel">
                <Deferred
                    data="leaderboards"
                    fallback={<LeaderboardSkeleton />}
                >
                    {leaderboards ? (
                        <LeaderboardBody board={leaderboards[period]} />
                    ) : (
                        <LeaderboardSkeleton />
                    )}
                </Deferred>
            </div>
        </section>
    );
}

function LeaderboardBody({ board }: { board: DashboardLeaderboardBoard }) {
    const podium = board.players.slice(0, 3);
    const rest = board.players.slice(3);
    const maxSchool = Math.max(1, ...board.schools.map((s) => s.points));

    return (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
            <div className="flex min-w-0 flex-col gap-4 lg:col-span-2">
                {board.players.length === 0 ? (
                    <EmptyState
                        icon={Trophy}
                        title={tr('No ranked players yet')}
                        description={tr(
                            'No points were earned in this period.',
                        )}
                    />
                ) : (
                    <>
                        <ol
                            className="grid grid-cols-3 items-end gap-2 sm:gap-3"
                            data-testid="dashboard-leaderboard-podium"
                        >
                            {[podium[1], podium[0], podium[2]].map(
                                (player, index) =>
                                    player ? (
                                        <PodiumCard
                                            key={player.user_id}
                                            player={player}
                                        />
                                    ) : (
                                        <li
                                            key={`empty-${index}`}
                                            aria-hidden="true"
                                        />
                                    ),
                            )}
                        </ol>
                        {rest.length > 0 && (
                            <ol
                                className="flex flex-col divide-y divide-border"
                                start={4}
                                data-testid="dashboard-leaderboard-list"
                            >
                                {rest.map((player) => (
                                    <li key={player.user_id}>
                                        <Link
                                            href={`/admin/users/${player.user_id}`}
                                            className="flex items-center gap-3 rounded-xl px-2 py-2 transition-colors hover:bg-muted/60"
                                        >
                                            <span className="w-6 shrink-0 text-center text-xs font-bold text-muted-foreground tabular-nums">
                                                {player.rank}
                                            </span>
                                            <UserAvatar
                                                name={player.name}
                                                src={player.avatar_url}
                                                className="size-8"
                                            />
                                            <span className="flex min-w-0 flex-1 flex-col">
                                                <span className="truncate text-sm font-medium text-foreground">
                                                    {player.name}
                                                </span>
                                                <span
                                                    className="truncate text-xs text-muted-foreground"
                                                    title={playerMeta(player)}
                                                >
                                                    {playerMeta(player)}
                                                </span>
                                            </span>
                                            <span className="flex shrink-0 flex-col items-end">
                                                <span className="text-sm font-bold text-foreground tabular-nums">
                                                    {formatNumber(
                                                        player.points,
                                                    )}
                                                </span>
                                                <span className="text-xs text-muted-foreground">
                                                    {formatNumber(player.plays)}{' '}
                                                    {tr('plays')}
                                                </span>
                                            </span>
                                        </Link>
                                    </li>
                                ))}
                            </ol>
                        )}
                    </>
                )}
            </div>

            <div className="flex min-w-0 flex-col gap-3 border-t border-border pt-5 lg:border-t-0 lg:border-l lg:pt-0 lg:pl-6">
                <h4 className="flex items-center gap-2 text-sm font-semibold text-foreground">
                    <Medal className="size-4 shrink-0 text-muted-foreground" />
                    {tr('Top schools')}
                </h4>
                {board.schools.length === 0 ? (
                    <EmptyState
                        icon={School}
                        title={tr('No school results yet')}
                    />
                ) : (
                    <ol
                        className="flex flex-col gap-3"
                        data-testid="dashboard-leaderboard-schools"
                    >
                        {board.schools.map((school, index) => (
                            <li
                                key={school.school}
                                className="flex flex-col gap-1.5"
                            >
                                <div className="flex items-center justify-between gap-2 text-sm">
                                    <span className="flex min-w-0 items-center gap-2">
                                        <span className="w-5 shrink-0 text-xs font-bold text-muted-foreground tabular-nums">
                                            #{index + 1}
                                        </span>
                                        <span
                                            className="truncate font-medium text-foreground"
                                            title={school.school}
                                        >
                                            {school.school}
                                        </span>
                                    </span>
                                    <span className="shrink-0 text-xs text-muted-foreground">
                                        <span className="font-semibold text-foreground tabular-nums">
                                            {formatNumber(school.points)}
                                        </span>{' '}
                                        {tr('pts')}
                                    </span>
                                </div>
                                <div className="h-1.5 overflow-hidden rounded-full bg-muted">
                                    <div
                                        className="h-full rounded-full bg-primary"
                                        style={{
                                            width: `${Math.max(2, (school.points / maxSchool) * 100)}%`,
                                        }}
                                    />
                                </div>
                                <span className="text-[11px] text-muted-foreground">
                                    {tr('{0} players · {1} plays', [
                                        formatNumber(school.players),
                                        formatNumber(school.plays),
                                    ])}
                                </span>
                            </li>
                        ))}
                    </ol>
                )}
            </div>
        </div>
    );
}

function PodiumCard({ player }: { player: DashboardLeaderboardPlayer }) {
    const medal = MEDALS[player.rank];
    const first = player.rank === 1;

    return (
        <li className="min-w-0" data-rank={player.rank}>
            <Link
                href={`/admin/users/${player.user_id}`}
                className={cn(
                    'flex min-w-0 flex-col items-center gap-1.5 rounded-2xl border px-1.5 pb-3 text-center transition-colors hover:border-primary/40 sm:px-3',
                    medal.step,
                    first ? 'pt-6 sm:pt-7' : 'pt-3',
                )}
            >
                <span className="relative">
                    {first && (
                        <Crown
                            className="absolute -top-5 left-1/2 size-4 -translate-x-1/2 text-amber-500"
                            aria-hidden="true"
                        />
                    )}
                    <UserAvatar
                        name={player.name}
                        src={player.avatar_url}
                        className={cn(
                            'ring-2 ring-offset-2 ring-offset-card',
                            medal.ring,
                            first
                                ? 'size-12 text-sm sm:size-14'
                                : 'size-10 sm:size-12',
                        )}
                    />
                    <span
                        className={cn(
                            'absolute -right-1 -bottom-1 flex size-5 items-center justify-center rounded-full text-[11px] font-bold shadow-sm',
                            medal.badge,
                        )}
                    >
                        {player.rank}
                    </span>
                </span>
                <span className="mt-1 w-full truncate text-xs font-semibold text-foreground sm:text-sm">
                    {player.name}
                </span>
                <span className="flex w-full flex-col text-[11px] leading-tight text-muted-foreground">
                    <span>
                        {player.grade ? tr('Grade {0}', [player.grade]) : '—'}
                    </span>
                    {player.school_name && (
                        <span className="truncate" title={player.school_name}>
                            {player.school_name}
                        </span>
                    )}
                </span>
                <span className="mt-0.5 text-base font-bold text-foreground tabular-nums sm:text-lg">
                    {formatNumber(player.points)}{' '}
                    <span className="text-[11px] font-medium text-muted-foreground">
                        {tr('pts')}
                    </span>
                </span>
                <span className="-mt-1.5 text-[11px] whitespace-nowrap text-muted-foreground">
                    {formatNumber(player.plays)} {tr('plays')}
                </span>
            </Link>
        </li>
    );
}

function LeaderboardSkeleton() {
    return (
        <div
            className="grid grid-cols-1 gap-6 lg:grid-cols-3"
            aria-busy="true"
            data-testid="dashboard-leaderboard-skeleton"
        >
            <span className="sr-only">{tr('Loading leaderboard…')}</span>
            <div className="flex flex-col gap-4 lg:col-span-2">
                <div className="grid grid-cols-3 items-end gap-2 sm:gap-3">
                    {['h-36', 'h-40', 'h-32'].map((height) => (
                        <div
                            key={height}
                            className={cn(
                                'animate-pulse rounded-2xl bg-muted',
                                height,
                            )}
                        />
                    ))}
                </div>
                <div className="flex flex-col gap-2">
                    {[0, 1, 2, 3].map((row) => (
                        <div
                            key={row}
                            className="flex items-center gap-3 px-2 py-1.5"
                        >
                            <div className="size-8 animate-pulse rounded-full bg-muted" />
                            <div className="flex flex-1 flex-col gap-1.5">
                                <div className="h-3 w-2/5 animate-pulse rounded bg-muted" />
                                <div className="h-2.5 w-1/4 animate-pulse rounded bg-muted" />
                            </div>
                            <div className="h-4 w-12 animate-pulse rounded bg-muted" />
                        </div>
                    ))}
                </div>
            </div>
            <div className="flex flex-col gap-3">
                {[0, 1, 2, 3].map((row) => (
                    <div key={row} className="flex flex-col gap-1.5">
                        <div className="h-3 w-3/4 animate-pulse rounded bg-muted" />
                        <div className="h-1.5 animate-pulse rounded-full bg-muted" />
                    </div>
                ))}
            </div>
        </div>
    );
}
