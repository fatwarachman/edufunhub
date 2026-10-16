import { SimplePagination, type Paginated } from '@/components/admin/admin-kit';
import { KpiCard, timeAgo, UserAvatar } from '@/components/admin/dashboard-kit';
import {
    EmptyState,
    fieldClass,
    formatNumber,
    rateTone,
} from '@/components/admin/game-stats';
import AdminLayout from '@/layouts/admin-layout';
import { tr } from '@/lib/admin-i18n';
import { cn } from '@/lib/utils';
import { Head, Link, router } from '@inertiajs/react';
import {
    ArrowDown,
    ArrowUp,
    BrainCircuit,
    ChevronDown,
    ChevronsUpDown,
    Gamepad2,
    ListChecks,
    RotateCcw,
    Search,
    Target,
    UsersRound,
} from 'lucide-react';
import { useEffect, useId, useRef, useState, type ReactNode } from 'react';

type AiStatus = 'none' | 'pending' | 'done' | 'failed';
type Sort = 'last_played' | 'plays' | 'answered' | 'points' | 'name';

interface PlayerRow {
    id: number;
    name: string;
    nickname: string | null;
    avatar_url: string | null;
    grade: number | null;
    school_name: string | null;
    disabled: boolean;
    joined_at: string | null;
    last_seen_at: string | null;
    plays: number;
    games: number;
    answered: number;
    correct: number;
    wrong: number;
    accuracy: number | null;
    seconds: number;
    game_points: number;
    account_points: number;
    classrooms: number;
    badges: number;
    last_played_at: string | null;
    ai: {
        status: AiStatus;
        analyses: number;
        analyzed_at: string | null;
        summary: string | null;
        confidence: string | null;
    };
}

interface Filters {
    search: string | null;
    ai: string | null;
    activity: string | null;
    sort: Sort;
    direction: 'asc' | 'desc';
}

interface Props {
    filters: Filters;
    summary: {
        accounts: number;
        played: number;
        never_played: number;
        analyzed: number;
        not_analyzed: number;
        pending: number;
        plays: number;
        answered: number;
        correct: number;
        accuracy: number | null;
    };
    players: Paginated<PlayerRow>;
}

const AI_FILTERS = [
    { value: '', label: 'All AI statuses' },
    { value: 'analyzed', label: 'Analyzed' },
    { value: 'not_analyzed', label: 'Not analyzed' },
    { value: 'pending', label: 'Analysis running' },
    { value: 'failed', label: 'Last analysis failed' },
];

const ACTIVITY_FILTERS = [
    { value: '', label: 'All accounts' },
    { value: 'played', label: 'Has played' },
    { value: 'never_played', label: 'Never played' },
];

const SORTS: { value: Sort; label: string }[] = [
    { value: 'last_played', label: 'Last played' },
    { value: 'plays', label: 'Games played' },
    { value: 'answered', label: 'Questions answered' },
    { value: 'points', label: 'Account points' },
    { value: 'name', label: 'Name' },
];

const AI_STYLES: Record<AiStatus, string> = {
    done: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300',
    pending:
        'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300',
    failed: 'bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300',
    none: 'bg-muted text-muted-foreground',
};

const AI_LABELS: Record<AiStatus, string> = {
    done: 'Analyzed',
    pending: 'Analysis running',
    failed: 'Analysis failed',
    none: 'Not analyzed',
};

/** 4h 05m · 12m 30s · 45s */
function formatPlayTime(seconds: number): string {
    const total = Math.max(0, Math.round(seconds));
    const h = Math.floor(total / 3600);
    const m = Math.floor((total % 3600) / 60);
    const s = total % 60;
    if (h > 0) return `${h}h ${String(m).padStart(2, '0')}m`;
    if (m > 0) return `${m}m ${String(s).padStart(2, '0')}s`;
    return `${s}s`;
}

const gradeText = (grade: number | null) =>
    grade === null
        ? null
        : grade === 0
          ? tr('Kindergarten')
          : tr('Grade {0}', [grade]);

/** Pill showing whether the player has an AI ability analysis. */
function AiStatusPill({ ai }: { ai: PlayerRow['ai'] }) {
    return (
        <span
            className={cn(
                'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium whitespace-nowrap',
                AI_STYLES[ai.status],
            )}
            data-testid="player-progress-ai"
            data-status={ai.status}
        >
            <BrainCircuit className="size-3" aria-hidden="true" />
            {tr(AI_LABELS[ai.status])}
            {ai.analyses > 1 && (
                <span className="tabular-nums">×{ai.analyses}</span>
            )}
        </span>
    );
}

function PlayerName({ player }: { player: PlayerRow }) {
    const meta = [gradeText(player.grade), player.school_name]
        .filter(Boolean)
        .join(' · ');

    return (
        <span className="flex min-w-0 items-center gap-2.5">
            <UserAvatar
                name={player.nickname || player.name}
                src={player.avatar_url}
                userId={player.id}
            />
            <span className="flex min-w-0 flex-col">
                <span className="flex min-w-0 items-center gap-1.5">
                    <span className="font-medium break-words text-foreground">
                        {player.nickname || player.name}
                    </span>
                    {player.disabled && (
                        <span className="rounded-full bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
                            {tr('Disabled')}
                        </span>
                    )}
                </span>
                <span className="text-xs break-words text-muted-foreground">
                    {meta || player.name}
                </span>
            </span>
        </span>
    );
}

export default function PlayerProgress({ filters, summary, players }: Props) {
    const [search, setSearch] = useState(filters.search ?? '');
    const [open, setOpen] = useState<Set<number>>(new Set());
    const firstRender = useRef(true);
    const baseId = useId();

    const apply = (changes: Partial<Filters>) => {
        const next = { ...filters, ...changes };
        router.get(
            '/admin/player-progress',
            Object.fromEntries(
                Object.entries(next).filter(
                    ([key, value]) =>
                        value !== null &&
                        value !== '' &&
                        !(key === 'sort' && value === 'last_played') &&
                        !(key === 'direction' && value === 'desc'),
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
        const timer = setTimeout(
            () => apply({ search: search.trim() || null }),
            400,
        );
        return () => clearTimeout(timer);
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

    const sortBy = (sort: Sort) =>
        apply({
            sort,
            direction:
                filters.sort === sort && filters.direction === 'desc'
                    ? 'asc'
                    : 'desc',
        });

    const filtered = Boolean(
        filters.search ||
        filters.ai ||
        filters.activity ||
        filters.sort !== 'last_played' ||
        filters.direction !== 'desc',
    );
    const allOpen =
        players.data.length > 0 &&
        players.data.every((player) => open.has(player.id));

    const sortHeader = (sort: Sort, label: string, align = 'text-right') => {
        const active = filters.sort === sort;
        const Icon = !active
            ? ChevronsUpDown
            : filters.direction === 'desc'
              ? ArrowDown
              : ArrowUp;
        return (
            <th
                scope="col"
                className={cn('px-3 py-2.5 font-medium', align)}
                aria-sort={
                    active
                        ? filters.direction === 'desc'
                            ? 'descending'
                            : 'ascending'
                        : 'none'
                }
            >
                <button
                    type="button"
                    onClick={() => sortBy(sort)}
                    className={cn(
                        'inline-flex items-center gap-1 rounded uppercase hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none',
                        active && 'text-foreground',
                    )}
                >
                    {tr(label)}
                    <Icon className="size-3.5" aria-hidden="true" />
                </button>
            </th>
        );
    };

    return (
        <>
            <Head title={tr('Player Progress')} />
            <div className="flex flex-col gap-6">
                <div className="flex flex-col gap-1">
                    <h2 className="font-display text-2xl font-bold text-foreground">
                        {tr('Player Progress')}
                    </h2>
                    <p className="text-sm text-muted-foreground">
                        {tr(
                            'Games played, questions answered and AI ability analysis status for every account.',
                        )}
                    </p>
                </div>

                <div
                    className="grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4"
                    data-testid="player-progress-summary"
                >
                    <KpiCard
                        label={tr('Accounts')}
                        value={formatNumber(summary.accounts)}
                        icon={UsersRound}
                        accent="#6366f1"
                        footer={
                            <span className="text-xs text-muted-foreground">
                                {tr('{0} played · {1} never', [
                                    formatNumber(summary.played),
                                    formatNumber(summary.never_played),
                                ])}
                            </span>
                        }
                    />
                    <KpiCard
                        label={tr('Games played')}
                        value={formatNumber(summary.plays)}
                        icon={Gamepad2}
                        accent="#10b981"
                        footer={
                            <span className="text-xs text-muted-foreground">
                                {tr('finished games, all time')}
                            </span>
                        }
                    />
                    <KpiCard
                        label={tr('Questions answered')}
                        value={formatNumber(summary.answered)}
                        icon={ListChecks}
                        accent="#f59e0b"
                        footer={
                            <span
                                className={cn(
                                    'text-xs font-medium',
                                    rateTone(summary.accuracy),
                                )}
                            >
                                {summary.accuracy === null
                                    ? tr('No answers yet')
                                    : tr('{0}% correct', [summary.accuracy])}
                            </span>
                        }
                    />
                    <KpiCard
                        label={tr('AI analyzed')}
                        value={`${formatNumber(summary.analyzed)} / ${formatNumber(summary.accounts)}`}
                        icon={BrainCircuit}
                        accent="#8b5cf6"
                        footer={
                            <span className="text-xs text-muted-foreground">
                                {summary.pending > 0
                                    ? tr('{0} running now', [summary.pending])
                                    : tr('{0} without analysis', [
                                          formatNumber(summary.not_analyzed),
                                      ])}
                            </span>
                        }
                    />
                </div>

                <div
                    className="flex flex-wrap items-center gap-2 rounded-2xl border border-border bg-card p-3 shadow-sm"
                    data-testid="player-progress-filters"
                >
                    <div className="relative w-full min-w-0 sm:w-auto sm:flex-1 lg:max-w-sm">
                        <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
                        <input
                            value={search}
                            onChange={(event) => setSearch(event.target.value)}
                            placeholder={tr('Search name, nickname or school')}
                            aria-label={tr('Search players')}
                            className={`${fieldClass} w-full pl-9`}
                            data-testid="player-progress-search"
                        />
                    </div>
                    <select
                        aria-label={tr('AI analysis')}
                        value={filters.ai ?? ''}
                        onChange={(event) =>
                            apply({ ai: event.target.value || null })
                        }
                        className={cn(
                            fieldClass,
                            'min-w-0 flex-1 sm:flex-none',
                        )}
                        data-testid="player-progress-ai-filter"
                    >
                        {AI_FILTERS.map((option) => (
                            <option key={option.value} value={option.value}>
                                {tr(option.label)}
                            </option>
                        ))}
                    </select>
                    <select
                        aria-label={tr('Activity')}
                        value={filters.activity ?? ''}
                        onChange={(event) =>
                            apply({ activity: event.target.value || null })
                        }
                        className={cn(
                            fieldClass,
                            'min-w-0 flex-1 sm:flex-none',
                        )}
                        data-testid="player-progress-activity-filter"
                    >
                        {ACTIVITY_FILTERS.map((option) => (
                            <option key={option.value} value={option.value}>
                                {tr(option.label)}
                            </option>
                        ))}
                    </select>
                    <select
                        aria-label={tr('Sort by')}
                        value={filters.sort}
                        onChange={(event) =>
                            apply({
                                sort: event.target.value as Sort,
                                direction:
                                    event.target.value === 'name'
                                        ? 'asc'
                                        : 'desc',
                            })
                        }
                        className={cn(
                            fieldClass,
                            'min-w-0 flex-1 sm:flex-none lg:hidden',
                        )}
                        data-testid="player-progress-sort"
                    >
                        {SORTS.map((option) => (
                            <option key={option.value} value={option.value}>
                                {tr('Sort: {0}', [tr(option.label)])}
                            </option>
                        ))}
                    </select>
                    {filtered && (
                        <button
                            type="button"
                            onClick={() => {
                                setSearch('');
                                router.get(
                                    '/admin/player-progress',
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

                {players.data.length === 0 ? (
                    <div className="rounded-2xl border border-border bg-card shadow-sm">
                        <EmptyState
                            icon={UsersRound}
                            title={tr('No players found')}
                            description={tr('Change the search or filters.')}
                        />
                    </div>
                ) : (
                    <>
                        <div
                            className="hidden overflow-hidden rounded-2xl border border-border bg-card shadow-sm lg:block"
                            data-testid="player-progress-table"
                        >
                            <table className="w-full text-sm">
                                <caption className="sr-only">
                                    {tr('Player Progress')}
                                </caption>
                                <thead>
                                    <tr className="border-b border-border text-xs tracking-wider text-muted-foreground uppercase">
                                        {sortHeader(
                                            'name',
                                            'Player',
                                            'pl-4 text-left',
                                        )}
                                        {sortHeader('plays', 'Games played')}
                                        {sortHeader(
                                            'answered',
                                            'Questions answered',
                                        )}
                                        <th
                                            scope="col"
                                            className="px-3 py-2.5 text-right font-medium"
                                        >
                                            {tr('Accuracy')}
                                        </th>
                                        {sortHeader('points', 'Points')}
                                        <th
                                            scope="col"
                                            className="px-3 py-2.5 text-left font-medium"
                                        >
                                            {tr('AI analysis')}
                                        </th>
                                        {sortHeader(
                                            'last_played',
                                            'Last played',
                                            'pr-4 text-right',
                                        )}
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-border">
                                    {players.data.map((player) => (
                                        <tr
                                            key={player.id}
                                            className="hover:bg-muted/30"
                                            data-testid="player-progress-row"
                                        >
                                            <td className="py-2.5 pr-3 pl-4 align-middle">
                                                <Link
                                                    href={`/admin/users/${player.id}`}
                                                    className="block rounded-lg hover:underline focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                                                >
                                                    <PlayerName
                                                        player={player}
                                                    />
                                                </Link>
                                            </td>
                                            <td className="px-3 py-2.5 text-right align-middle tabular-nums">
                                                <span className="font-semibold text-foreground">
                                                    {formatNumber(player.plays)}
                                                </span>
                                                <span className="block text-xs text-muted-foreground">
                                                    {tr('{0} games', [
                                                        player.games,
                                                    ])}
                                                </span>
                                            </td>
                                            <td className="px-3 py-2.5 text-right align-middle tabular-nums">
                                                <span className="font-semibold text-foreground">
                                                    {formatNumber(
                                                        player.answered,
                                                    )}
                                                </span>
                                                <span className="block text-xs text-muted-foreground">
                                                    {tr(
                                                        '{0} right · {1} wrong',
                                                        [
                                                            formatNumber(
                                                                player.correct,
                                                            ),
                                                            formatNumber(
                                                                player.wrong,
                                                            ),
                                                        ],
                                                    )}
                                                </span>
                                            </td>
                                            <td
                                                className={cn(
                                                    'px-3 py-2.5 text-right align-middle font-semibold tabular-nums',
                                                    rateTone(player.accuracy),
                                                )}
                                            >
                                                {player.accuracy === null
                                                    ? '—'
                                                    : `${player.accuracy}%`}
                                            </td>
                                            <td className="px-3 py-2.5 text-right align-middle tabular-nums">
                                                <span className="font-semibold text-foreground">
                                                    {formatNumber(
                                                        player.account_points,
                                                    )}
                                                </span>
                                                <span className="block text-xs text-muted-foreground">
                                                    {tr('score {0}', [
                                                        formatNumber(
                                                            player.game_points,
                                                        ),
                                                    ])}
                                                </span>
                                            </td>
                                            <td className="px-3 py-2.5 align-middle">
                                                <span className="flex flex-col items-start gap-0.5">
                                                    <AiStatusPill
                                                        ai={player.ai}
                                                    />
                                                    {player.ai.analyzed_at && (
                                                        <span className="text-xs text-muted-foreground">
                                                            {timeAgo(
                                                                player.ai
                                                                    .analyzed_at,
                                                            )}
                                                        </span>
                                                    )}
                                                </span>
                                            </td>
                                            <td className="py-2.5 pr-4 pl-3 text-right align-middle text-xs whitespace-nowrap text-muted-foreground">
                                                {player.last_played_at
                                                    ? timeAgo(
                                                          player.last_played_at,
                                                      )
                                                    : tr('Never played')}
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>

                        <div className="flex flex-col gap-2 lg:hidden">
                            {players.data.length > 1 && (
                                <button
                                    type="button"
                                    onClick={() =>
                                        setOpen(
                                            allOpen
                                                ? new Set()
                                                : new Set(
                                                      players.data.map(
                                                          (player) => player.id,
                                                      ),
                                                  ),
                                        )
                                    }
                                    className="inline-flex h-8 w-fit items-center gap-1.5 self-end rounded-lg border border-border px-3 text-xs font-medium text-foreground hover:bg-accent"
                                    data-testid="player-progress-toggle-all"
                                >
                                    <ChevronsUpDown className="size-3.5" />
                                    {allOpen
                                        ? tr('Collapse all')
                                        : tr('Expand all')}
                                </button>
                            )}
                            <ul
                                className="flex flex-col gap-2"
                                data-testid="player-progress-cards"
                            >
                                {players.data.map((player) => {
                                    const expanded = open.has(player.id);
                                    const panelId = `${baseId}-player-${player.id}`;
                                    return (
                                        <li
                                            key={player.id}
                                            className="min-w-0 overflow-hidden rounded-2xl border border-border bg-card shadow-sm"
                                            data-testid="player-progress-card"
                                        >
                                            <button
                                                type="button"
                                                onClick={() =>
                                                    toggle(player.id)
                                                }
                                                aria-expanded={expanded}
                                                aria-controls={panelId}
                                                className="flex w-full min-w-0 items-start gap-2 p-3 text-left hover:bg-muted/40 focus-visible:bg-muted/40 focus-visible:outline-none"
                                            >
                                                <span className="flex min-w-0 flex-1 flex-col gap-2">
                                                    <PlayerName
                                                        player={player}
                                                    />
                                                    <span className="flex flex-wrap items-center gap-1.5">
                                                        <AiStatusPill
                                                            ai={player.ai}
                                                        />
                                                        <span className="text-xs text-muted-foreground">
                                                            {player.last_played_at
                                                                ? timeAgo(
                                                                      player.last_played_at,
                                                                  )
                                                                : tr(
                                                                      'Never played',
                                                                  )}
                                                        </span>
                                                    </span>
                                                </span>
                                                <ChevronDown
                                                    className={cn(
                                                        'mt-2 size-4 shrink-0 text-muted-foreground transition-transform duration-300 motion-reduce:transition-none',
                                                        expanded &&
                                                            'rotate-180',
                                                    )}
                                                    aria-hidden="true"
                                                />
                                            </button>
                                            <div className="grid grid-cols-3 gap-2 px-3 pb-3">
                                                <Tile
                                                    label={tr('Games')}
                                                    value={formatNumber(
                                                        player.plays,
                                                    )}
                                                />
                                                <Tile
                                                    label={tr('Answered')}
                                                    value={formatNumber(
                                                        player.answered,
                                                    )}
                                                />
                                                <Tile
                                                    label={tr('Accuracy')}
                                                    value={
                                                        player.accuracy === null
                                                            ? '—'
                                                            : `${player.accuracy}%`
                                                    }
                                                    tone={rateTone(
                                                        player.accuracy,
                                                    )}
                                                />
                                            </div>
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
                                                data-testid={`player-progress-panel-${player.id}`}
                                            >
                                                <div className="min-h-0 overflow-hidden">
                                                    <PlayerDetails
                                                        player={player}
                                                    />
                                                </div>
                                            </div>
                                        </li>
                                    );
                                })}
                            </ul>
                        </div>
                    </>
                )}

                <SimplePagination
                    links={players.links}
                    from={players.from}
                    to={players.to}
                    total={players.total}
                />
            </div>
        </>
    );
}

function Tile({
    label,
    value,
    tone,
}: {
    label: string;
    value: ReactNode;
    tone?: string;
}) {
    return (
        <div className="flex min-w-0 flex-col items-center rounded-xl bg-muted/50 px-1 py-2 text-center">
            <span
                className={cn(
                    'text-base font-bold text-foreground tabular-nums',
                    tone,
                )}
            >
                {value}
            </span>
            <span className="w-full truncate text-[10px] text-muted-foreground min-[360px]:text-xs">
                {label}
            </span>
        </div>
    );
}

function PlayerDetails({ player }: { player: PlayerRow }) {
    return (
        <div className="flex flex-col gap-3 border-t border-dashed border-border bg-muted/20 p-3">
            <dl className="grid grid-cols-1 gap-x-8 gap-y-2 text-xs min-[400px]:grid-cols-2">
                <Fact label={tr('Different games')}>
                    {formatNumber(player.games)}
                </Fact>
                <Fact label={tr('Right / wrong')}>
                    {formatNumber(player.correct)} /{' '}
                    {formatNumber(player.wrong)}
                </Fact>
                <Fact label={tr('Playing time')}>
                    {formatPlayTime(player.seconds)}
                </Fact>
                <Fact label={tr('Account points')}>
                    {formatNumber(player.account_points)}
                </Fact>
                <Fact label={tr('Game score')}>
                    {formatNumber(player.game_points)}
                </Fact>
                <Fact label={tr('Classrooms')}>
                    {formatNumber(player.classrooms)}
                </Fact>
                <Fact label={tr('Badges')}>{formatNumber(player.badges)}</Fact>
                <Fact label={tr('Joined')}>{timeAgo(player.joined_at)}</Fact>
            </dl>
            <div className="flex flex-col gap-1 rounded-xl border border-border bg-card p-3">
                <span className="flex items-center gap-1.5 text-xs font-semibold text-foreground">
                    <Target
                        className="size-3.5 text-violet-500"
                        aria-hidden="true"
                    />
                    {tr('AI analysis')}
                </span>
                {player.ai.summary ? (
                    <p className="text-xs leading-relaxed text-muted-foreground">
                        {player.ai.summary}
                    </p>
                ) : (
                    <p className="text-xs text-muted-foreground">
                        {player.ai.status === 'pending'
                            ? tr('The analysis is running now.')
                            : player.plays === 0
                              ? tr(
                                    'Not played yet, so there is nothing to analyze.',
                                )
                              : tr(
                                    'No AI analysis yet. Run one from the user profile.',
                                )}
                    </p>
                )}
            </div>
            <Link
                href={`/admin/users/${player.id}`}
                className="w-fit text-xs font-medium text-foreground underline decoration-border underline-offset-4 hover:decoration-foreground"
            >
                {tr('Open profile of')} {player.name}
            </Link>
        </div>
    );
}

function Fact({ label, children }: { label: string; children: ReactNode }) {
    return (
        <div className="flex min-w-0 items-baseline justify-between gap-2">
            <dt className="truncate text-muted-foreground">{label}</dt>
            <dd className="font-semibold whitespace-nowrap text-foreground tabular-nums">
                {children}
            </dd>
        </div>
    );
}

PlayerProgress.layout = (page: ReactNode) => (
    <AdminLayout title={tr('Player Progress')}>{page}</AdminLayout>
);
