import { GameDot } from '@/components/admin/dashboard-kit';
import {
    formatDateTime,
    formatNumber,
    formatPercent,
    gameLabel,
    rateTone,
} from '@/components/admin/game-stats';
import AdminLayout from '@/layouts/admin-layout';
import { adminLocale, tr } from '@/lib/admin-i18n';
import { cn } from '@/lib/utils';
import { Head, Link, router } from '@inertiajs/react';
import {
    ArrowDown,
    ArrowUp,
    ArrowUpDown,
    ArrowUpRight,
    ChevronDown,
    ChevronRight,
    ChevronsDownUp,
    ChevronsUpDown,
} from 'lucide-react';
import { type ReactNode, useId, useMemo, useState } from 'react';

interface GameRow {
    key: string;
    accent: string;
    awardsPoints: boolean;
    tracked: boolean;
    questionBank: boolean;
    plays: number;
    players: number;
    points: number;
    accuracy: number | null;
    success_rate: number | null;
    last_played_at: string | null;
    questions: number;
}

type SortKey =
    | 'name'
    | 'plays'
    | 'players'
    | 'success_rate'
    | 'accuracy'
    | 'points'
    | 'questions'
    | 'last_played_at';

interface SortState {
    key: SortKey;
    desc: boolean;
}

const COLUMNS: { key: SortKey; label: string; numeric: boolean }[] = [
    { key: 'name', label: 'Game', numeric: false },
    { key: 'plays', label: 'Plays', numeric: true },
    { key: 'players', label: 'Players', numeric: true },
    { key: 'success_rate', label: 'Success rate', numeric: true },
    { key: 'accuracy', label: 'Accuracy', numeric: true },
    { key: 'points', label: 'Points given', numeric: true },
    { key: 'questions', label: 'Questions', numeric: true },
    { key: 'last_played_at', label: 'Last played', numeric: false },
];

function sortValue(game: GameRow, key: SortKey): number | string {
    switch (key) {
        case 'name':
            return gameLabel(game.key).toLowerCase();
        case 'last_played_at':
            return game.last_played_at
                ? new Date(game.last_played_at).getTime()
                : -1;
        case 'success_rate':
        case 'accuracy':
            return game[key] ?? -1;
        default:
            return game[key];
    }
}

function sortGames(games: GameRow[], sort: SortState): GameRow[] {
    const sorted = [...games].sort((a, b) => {
        const left = sortValue(a, sort.key);
        const right = sortValue(b, sort.key);
        if (left === right) {
            return 0;
        }
        return left < right ? -1 : 1;
    });
    return sort.desc ? sorted.reverse() : sorted;
}

export default function GamesIndex({ games }: { games: GameRow[] }) {
    const totalPlays = games.reduce((sum, game) => sum + game.plays, 0);
    const maxPlays = games.reduce((max, game) => Math.max(max, game.plays), 0);
    const [sort, setSort] = useState<SortState>({ key: 'plays', desc: true });
    const rows = useMemo(() => sortGames(games, sort), [games, sort]);

    const toggleSort = (key: SortKey) =>
        setSort((current) =>
            current.key === key
                ? { key, desc: !current.desc }
                : { key, desc: key !== 'name' },
        );

    return (
        <>
            <Head title={tr('Game Statistics')} />
            <div className="flex flex-col gap-6">
                <div className="flex min-w-0 flex-col gap-1">
                    <h2 className="font-display text-2xl font-bold text-foreground">
                        {tr('Game Statistics')}
                    </h2>
                    <p className="text-sm text-muted-foreground">
                        {formatNumber(totalPlays)} {tr('recorded plays across')}{' '}
                        {games.length}{' '}
                        {tr('games. Select a game for the full analysis.')}
                    </p>
                </div>

                <div className="hidden lg:block">
                    <GamesTable
                        rows={rows}
                        maxPlays={maxPlays}
                        sort={sort}
                        onSort={toggleSort}
                    />
                </div>
                <div className="lg:hidden">
                    <GamesCards rows={rows} maxPlays={maxPlays} />
                </div>
            </div>
        </>
    );
}

/** Small inline bar showing plays relative to the most played game. */
function PlaysBar({
    plays,
    maxPlays,
    className,
}: {
    plays: number;
    maxPlays: number;
    className?: string;
}) {
    const width = maxPlays > 0 ? Math.max((plays / maxPlays) * 100, 2) : 0;
    return (
        <span
            aria-hidden="true"
            className={cn(
                'block h-1.5 overflow-hidden rounded-full bg-muted',
                className,
            )}
        >
            <span
                className="block h-full rounded-full bg-primary"
                style={{ width: `${plays > 0 ? width : 0}%` }}
            />
        </span>
    );
}

function GamesTable({
    rows,
    maxPlays,
    sort,
    onSort,
}: {
    rows: GameRow[];
    maxPlays: number;
    sort: SortState;
    onSort: (key: SortKey) => void;
}) {
    const cells: Record<SortKey, (game: GameRow) => ReactNode> = {
        name: (game) => (
            <span className="flex min-w-0 flex-col gap-0.5">
                <Link
                    href={`/admin/games/${game.key}`}
                    onClick={(event) => event.stopPropagation()}
                    className="truncate font-semibold text-foreground hover:underline focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                >
                    <GameDot game={game.key} />
                </Link>
                <span className="text-xs font-normal text-muted-foreground">
                    {game.tracked ? tr('Server-scored') : tr('Practice demo')}
                </span>
            </span>
        ),
        plays: (game) => (
            <span className="flex flex-col items-end gap-1">
                <span className="text-lg font-bold text-foreground tabular-nums">
                    {formatNumber(game.plays)}
                </span>
                <PlaysBar
                    plays={game.plays}
                    maxPlays={maxPlays}
                    className="w-20"
                />
            </span>
        ),
        players: (game) => formatNumber(game.players),
        success_rate: (game) => (
            <span className={tableTone(game.success_rate)}>
                {formatPercent(game.success_rate)}
            </span>
        ),
        accuracy: (game) => (
            <span className={tableTone(game.accuracy)}>
                {formatPercent(game.accuracy)}
            </span>
        ),
        points: (game) => formatNumber(game.points),
        questions: (game) =>
            game.questionBank ? formatNumber(game.questions) : '—',
        last_played_at: (game) => (
            <span className="flex items-center justify-between gap-2">
                <LastPlayed value={game.last_played_at} />
                <ChevronRight
                    className="size-4 shrink-0 text-foreground/50"
                    aria-hidden="true"
                />
            </span>
        ),
    };

    return (
        <div className="overflow-x-auto rounded-2xl border border-border bg-card shadow-sm">
            <table className="w-full text-sm" data-testid="games-table">
                <thead className="border-b border-border bg-muted/40">
                    <tr>
                        {COLUMNS.map((column) => {
                            const active = sort.key === column.key;
                            const Icon = active
                                ? sort.desc
                                    ? ArrowDown
                                    : ArrowUp
                                : ArrowUpDown;
                            return (
                                <th
                                    key={column.key}
                                    scope="col"
                                    aria-sort={
                                        active
                                            ? sort.desc
                                                ? 'descending'
                                                : 'ascending'
                                            : 'none'
                                    }
                                    className={cn(
                                        'h-11 px-4 font-normal',
                                        column.numeric
                                            ? 'text-right'
                                            : 'text-left',
                                        column.key === 'plays' &&
                                            'bg-primary/5',
                                    )}
                                >
                                    <button
                                        type="button"
                                        onClick={() => onSort(column.key)}
                                        aria-label={`${tr('Sort by')} ${tr(column.label)}`}
                                        className={cn(
                                            'inline-flex items-center gap-1 rounded-md text-[11px] font-semibold tracking-wide text-muted-foreground uppercase hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none',
                                            active && 'text-foreground',
                                        )}
                                    >
                                        {tr(column.label)}
                                        <Icon
                                            className={cn(
                                                'size-3.5',
                                                !active && 'opacity-80',
                                            )}
                                            aria-hidden="true"
                                        />
                                    </button>
                                </th>
                            );
                        })}
                    </tr>
                </thead>
                <tbody className="divide-y divide-border">
                    {rows.map((game) => (
                        <tr
                            key={game.key}
                            data-testid="games-row"
                            data-game={game.key}
                            onClick={() =>
                                router.visit(`/admin/games/${game.key}`)
                            }
                            className="cursor-pointer transition-colors hover:bg-muted/40"
                        >
                            {COLUMNS.map((column) => (
                                <td
                                    key={column.key}
                                    className={cn(
                                        'px-4 py-3 align-middle',
                                        column.key === 'name' && 'max-w-56',
                                        column.numeric &&
                                            'text-right font-medium text-foreground tabular-nums',
                                        column.key === 'plays' &&
                                            'bg-primary/5',
                                    )}
                                >
                                    {cells[column.key](game)}
                                </td>
                            ))}
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    );
}

function GamesCards({ rows, maxPlays }: { rows: GameRow[]; maxPlays: number }) {
    const baseId = useId();
    const [open, setOpen] = useState<Set<string>>(() => new Set());
    const allOpen = rows.length > 0 && open.size === rows.length;

    const toggle = (key: string) =>
        setOpen((current) => {
            const next = new Set(current);
            if (next.has(key)) {
                next.delete(key);
            } else {
                next.add(key);
            }
            return next;
        });

    return (
        <div className="flex flex-col gap-3">
            <div className="flex justify-end">
                <button
                    type="button"
                    onClick={() =>
                        setOpen(
                            allOpen
                                ? new Set()
                                : new Set(rows.map((game) => game.key)),
                        )
                    }
                    className="inline-flex h-9 items-center gap-1.5 rounded-xl border border-border bg-card px-3 text-sm font-medium text-foreground shadow-sm hover:bg-muted/50 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                    data-testid="games-cards-toggle-all"
                >
                    {allOpen ? (
                        <ChevronsDownUp className="size-4" aria-hidden="true" />
                    ) : (
                        <ChevronsUpDown className="size-4" aria-hidden="true" />
                    )}
                    {allOpen ? tr('Collapse all') : tr('Expand all')}
                </button>
            </div>

            <ul className="flex flex-col gap-3" data-testid="games-cards">
                {rows.map((game) => {
                    const expanded = open.has(game.key);
                    const panelId = `${baseId}-game-${game.key}`;
                    return (
                        <li
                            key={game.key}
                            data-testid="games-card"
                            data-game={game.key}
                            className="min-w-0 overflow-hidden rounded-2xl border border-border bg-card shadow-sm"
                        >
                            <button
                                type="button"
                                onClick={() => toggle(game.key)}
                                aria-expanded={expanded}
                                aria-controls={panelId}
                                className="flex w-full min-w-0 items-center gap-3 p-4 text-left hover:bg-muted/40 focus-visible:bg-muted/40 focus-visible:outline-none"
                            >
                                <span className="flex min-w-0 flex-1 flex-col gap-1">
                                    <span className="truncate font-semibold text-foreground">
                                        <GameDot game={game.key} />
                                    </span>
                                    <span className="text-xs text-muted-foreground">
                                        {tr('{0} players', [
                                            formatNumber(game.players),
                                        ])}
                                    </span>
                                </span>
                                <span className="flex shrink-0 flex-col items-end gap-1">
                                    <span
                                        className="text-2xl leading-none font-bold text-foreground tabular-nums"
                                        data-testid="games-card-plays"
                                    >
                                        {formatNumber(game.plays)}
                                    </span>
                                    <span className="text-[11px] font-medium tracking-wide text-muted-foreground uppercase">
                                        {tr('Plays')}
                                    </span>
                                    <PlaysBar
                                        plays={game.plays}
                                        maxPlays={maxPlays}
                                        className="w-16"
                                    />
                                </span>
                                <ChevronDown
                                    className={cn(
                                        'size-4 shrink-0 text-muted-foreground transition-transform duration-300 motion-reduce:transition-none',
                                        expanded && 'rotate-180',
                                    )}
                                    aria-hidden="true"
                                />
                            </button>
                            <div
                                id={panelId}
                                inert={!expanded}
                                aria-hidden={!expanded}
                                className={cn(
                                    'grid transition-[grid-template-rows,opacity] duration-300 motion-reduce:transition-none',
                                    expanded
                                        ? 'grid-rows-[1fr] opacity-100'
                                        : 'grid-rows-[0fr] opacity-0',
                                )}
                            >
                                <div className="min-h-0 overflow-hidden">
                                    <GameCardDetails game={game} />
                                </div>
                            </div>
                        </li>
                    );
                })}
            </ul>
        </div>
    );
}

function GameCardDetails({ game }: { game: GameRow }) {
    return (
        <div className="flex flex-col gap-3 border-t border-border p-4">
            <dl className="grid grid-cols-2 gap-2 text-sm">
                <Metric label={tr('Points given')}>
                    {formatNumber(game.points)}
                </Metric>
                <Metric label={tr('Accuracy')}>
                    <span className={rateTone(game.accuracy)}>
                        {formatPercent(game.accuracy)}
                    </span>
                </Metric>
                <Metric label={tr('Success rate')}>
                    <span className={rateTone(game.success_rate)}>
                        {formatPercent(game.success_rate)}
                    </span>
                </Metric>
                <Metric label={tr('Questions')}>
                    {game.questionBank ? formatNumber(game.questions) : '—'}
                </Metric>
            </dl>
            <p className="text-xs text-muted-foreground">
                {tr('Last played')} {formatDateTime(game.last_played_at)}
            </p>
            <div className="flex flex-wrap gap-1.5">
                <Flag active={game.tracked}>
                    {game.tracked
                        ? tr('Server-scored · results tracked')
                        : tr('Practice demo · not tracked')}
                </Flag>
                <Flag active={game.awardsPoints}>
                    {game.awardsPoints ? tr('Awards points') : tr('No points')}
                </Flag>
                <Flag active={game.questionBank}>
                    {game.questionBank
                        ? tr('{0} active questions', [game.questions])
                        : tr('Uses its own game content')}
                </Flag>
            </div>
            <Link
                href={`/admin/games/${game.key}`}
                className="inline-flex h-9 items-center justify-center gap-1.5 self-start rounded-xl bg-primary px-3 text-sm font-semibold text-primary-foreground hover:bg-primary/90 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
            >
                {tr('Open full analysis')}
                <ArrowUpRight className="size-4" aria-hidden="true" />
            </Link>
        </div>
    );
}

function Flag({ active, children }: { active: boolean; children: ReactNode }) {
    return (
        <span
            className={cn(
                'inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium',
                active
                    ? 'bg-primary/10 text-primary'
                    : 'bg-muted text-muted-foreground',
            )}
        >
            {children}
        </span>
    );
}

/** Last play on two short lines so the column never clips. */
function LastPlayed({ value }: { value: string | null }) {
    if (!value) {
        return <span className="text-muted-foreground">—</span>;
    }
    const date = new Date(value);
    return (
        <time
            dateTime={value}
            className="flex flex-col text-xs leading-tight whitespace-nowrap"
        >
            <span className="font-medium text-foreground">
                {date.toLocaleDateString(adminLocale(), {
                    day: 'numeric',
                    month: 'short',
                    year: 'numeric',
                })}
            </span>
            <span className="text-muted-foreground">
                {date.toLocaleTimeString(adminLocale(), {
                    hour: '2-digit',
                    minute: '2-digit',
                })}
            </span>
        </time>
    );
}

/** Darker rate colours for dense table text (AA contrast on white). */
function tableTone(value: number | null): string {
    if (value === null) {
        return 'text-muted-foreground';
    }
    if (value >= 70) {
        return 'text-green-700 dark:text-green-400';
    }
    if (value >= 40) {
        return 'text-amber-700 dark:text-amber-400';
    }
    return 'text-red-700 dark:text-red-400';
}

function Metric({ label, children }: { label: string; children: ReactNode }) {
    return (
        <div className="flex flex-col gap-0.5 rounded-xl bg-muted/50 px-3 py-2">
            <dt className="text-xs text-muted-foreground">{label}</dt>
            <dd className="text-base font-semibold text-foreground tabular-nums">
                {children}
            </dd>
        </div>
    );
}

GamesIndex.layout = (page: ReactNode) => (
    <AdminLayout title={tr('Game Statistics')}>{page}</AdminLayout>
);
