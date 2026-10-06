import {
    formatDateTime,
    formatNumber,
    formatPercent,
    gameLabel,
    rateTone,
} from '@/components/admin/game-stats';
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from '@/components/ui/table';
import AdminLayout from '@/layouts/admin-layout';
import { tr } from '@/lib/admin-i18n';
import { cn } from '@/lib/utils';
import { Head, Link, router } from '@inertiajs/react';
import {
    ArrowDown,
    ArrowUp,
    ArrowUpDown,
    ArrowUpRight,
    ChartColumnBig,
    ChevronRight,
    Coins,
    Gamepad2,
    LayoutGrid,
    ListChecks,
    Rows3,
    Target,
    UsersRound,
} from 'lucide-react';
import { type ReactNode, useMemo, useState, useSyncExternalStore } from 'react';

interface GameRow {
    key: string;
    accent: string;
    awardsPoints: boolean;
    tracked: boolean;
    plays: number;
    players: number;
    points: number;
    accuracy: number | null;
    success_rate: number | null;
    last_played_at: string | null;
    questions: number;
}

type View = 'cards' | 'table';
type SortKey =
    | 'name'
    | 'plays'
    | 'players'
    | 'success_rate'
    | 'accuracy'
    | 'points'
    | 'questions'
    | 'last_played_at';

const VIEW_KEY = 'admin.games.view';
const VIEW_EVENT = 'admin-games-view';

function readView(): View {
    if (typeof window === 'undefined') {
        return 'cards';
    }
    return window.localStorage.getItem(VIEW_KEY) === 'table'
        ? 'table'
        : 'cards';
}

function subscribeView(callback: () => void): () => void {
    window.addEventListener(VIEW_EVENT, callback);
    window.addEventListener('storage', callback);
    return () => {
        window.removeEventListener(VIEW_EVENT, callback);
        window.removeEventListener('storage', callback);
    };
}

function saveView(view: View): void {
    window.localStorage.setItem(VIEW_KEY, view);
    window.dispatchEvent(new Event(VIEW_EVENT));
}

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

export default function GamesIndex({ games }: { games: GameRow[] }) {
    const totalPlays = games.reduce((sum, game) => sum + game.plays, 0);
    const view = useSyncExternalStore(subscribeView, readView, () => 'cards');

    return (
        <>
            <Head title={tr('Game Statistics')} />
            <div className="flex flex-col gap-6">
                <div className="flex flex-wrap items-end justify-between gap-3">
                    <div className="flex min-w-0 flex-col gap-1">
                        <h2 className="font-display text-2xl font-bold text-foreground">
                            {tr('Game Statistics')}
                        </h2>
                        <p className="text-sm text-muted-foreground">
                            {formatNumber(totalPlays)}{' '}
                            {tr('recorded plays across')} {games.length}{' '}
                            {tr('games. Select a game for the full analysis.')}
                        </p>
                    </div>
                    <ViewSwitch view={view} onChange={saveView} />
                </div>

                {view === 'table' ? (
                    <GamesTable games={games} />
                ) : (
                    <GamesCards games={games} />
                )}
            </div>
        </>
    );
}

function ViewSwitch({
    view,
    onChange,
}: {
    view: View;
    onChange: (view: View) => void;
}) {
    const options: { value: View; label: string; icon: React.ElementType }[] = [
        { value: 'cards', label: tr('Cards'), icon: LayoutGrid },
        { value: 'table', label: tr('Table'), icon: Rows3 },
    ];

    return (
        <div
            role="group"
            aria-label={tr('Display mode')}
            className="inline-flex h-9 shrink-0 items-center gap-0.5 rounded-xl border border-border bg-muted/60 p-0.5"
        >
            {options.map(({ value, label, icon: Icon }) => (
                <button
                    key={value}
                    type="button"
                    aria-pressed={view === value}
                    onClick={() => onChange(value)}
                    data-testid={`admin-games-view-${value}`}
                    className={cn(
                        'inline-flex h-8 items-center gap-1.5 rounded-[10px] px-3 text-sm font-medium transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none',
                        view === value
                            ? 'bg-card text-foreground shadow-sm'
                            : 'text-muted-foreground hover:text-foreground',
                    )}
                >
                    <Icon className="size-4" aria-hidden="true" />
                    {tr(label)}
                </button>
            ))}
        </div>
    );
}

function GameMark({
    accent,
    size = 'md',
}: {
    accent: string;
    size?: 'sm' | 'md';
}) {
    return (
        <span
            className={cn(
                'flex shrink-0 items-center justify-center text-white shadow-sm',
                size === 'md' ? 'size-11 rounded-xl' : 'size-8 rounded-lg',
            )}
            style={{ background: accent }}
        >
            <Gamepad2 className={size === 'md' ? 'size-5' : 'size-4'} />
        </span>
    );
}

function GamesCards({ games }: { games: GameRow[] }) {
    return (
        <ul className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
            {games.map((game) => (
                <li key={game.key}>
                    <Link
                        href={`/admin/games/${game.key}`}
                        className="group flex h-full flex-col gap-4 rounded-2xl border border-border bg-card p-5 shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-md focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                        data-testid={`admin-game-${game.key}`}
                    >
                        <div className="flex items-start justify-between gap-3">
                            <div className="flex min-w-0 items-center gap-3">
                                <GameMark accent={game.accent} />
                                <div className="flex min-w-0 flex-col">
                                    <span className="truncate font-semibold text-foreground">
                                        {gameLabel(game.key)}
                                    </span>
                                    <span className="text-xs text-muted-foreground">
                                        {game.tracked
                                            ? tr(
                                                  'Server-scored · results tracked',
                                              )
                                            : tr('Practice demo · not tracked')}
                                    </span>
                                </div>
                            </div>
                            <ArrowUpRight className="size-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
                        </div>

                        <dl className="grid grid-cols-2 gap-3 text-sm">
                            <Metric icon={ChartColumnBig} label={tr('Plays')}>
                                {formatNumber(game.plays)}
                            </Metric>
                            <Metric icon={UsersRound} label={tr('Players')}>
                                {formatNumber(game.players)}
                            </Metric>
                            <Metric icon={Target} label={tr('Success rate')}>
                                <span className={rateTone(game.success_rate)}>
                                    {formatPercent(game.success_rate)}
                                </span>
                            </Metric>
                            <Metric icon={Coins} label={tr('Points given')}>
                                {formatNumber(game.points)}
                            </Metric>
                        </dl>

                        <div className="mt-auto flex flex-wrap items-center justify-between gap-2 border-t border-border pt-3 text-xs text-muted-foreground">
                            <span className="inline-flex items-center gap-1.5">
                                <ListChecks className="size-3.5" />
                                {game.tracked
                                    ? tr('{0} active questions', [
                                          game.questions,
                                      ])
                                    : tr('Uses local demo questions')}
                            </span>
                            <span>
                                {tr('Last played')}{' '}
                                {formatDateTime(game.last_played_at)}
                            </span>
                        </div>
                    </Link>
                </li>
            ))}
        </ul>
    );
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

function GamesTable({ games }: { games: GameRow[] }) {
    const [sort, setSort] = useState<{ key: SortKey; desc: boolean }>({
        key: 'plays',
        desc: true,
    });

    const rows = useMemo(() => {
        const sorted = [...games].sort((a, b) => {
            const left = sortValue(a, sort.key);
            const right = sortValue(b, sort.key);
            if (left === right) {
                return 0;
            }
            return left < right ? -1 : 1;
        });
        return sort.desc ? sorted.reverse() : sorted;
    }, [games, sort]);

    const toggle = (key: SortKey) =>
        setSort((current) =>
            current.key === key
                ? { key, desc: !current.desc }
                : { key, desc: key !== 'name' },
        );

    return (
        <div
            className="overflow-hidden rounded-2xl border border-border bg-card shadow-sm"
            data-testid="admin-games-table"
        >
            <Table className="min-w-[780px]">
                <TableHeader>
                    <TableRow className="bg-muted/40 hover:bg-muted/40">
                        {COLUMNS.map((column) => {
                            const active = sort.key === column.key;
                            const Icon = active
                                ? sort.desc
                                    ? ArrowDown
                                    : ArrowUp
                                : ArrowUpDown;
                            return (
                                <TableHead
                                    key={column.key}
                                    aria-sort={
                                        active
                                            ? sort.desc
                                                ? 'descending'
                                                : 'ascending'
                                            : 'none'
                                    }
                                    className={cn(
                                        'h-11 px-3 first:pl-4',
                                        column.numeric && 'text-right',
                                    )}
                                >
                                    <button
                                        type="button"
                                        onClick={() => toggle(column.key)}
                                        className={cn(
                                            'inline-flex items-center gap-1 rounded-md text-[11px] font-semibold tracking-wide whitespace-nowrap text-muted-foreground uppercase hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none',
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
                                </TableHead>
                            );
                        })}
                    </TableRow>
                </TableHeader>
                <TableBody>
                    {rows.map((game) => (
                        <TableRow
                            key={game.key}
                            className="cursor-pointer"
                            onClick={() =>
                                router.visit(`/admin/games/${game.key}`)
                            }
                            data-testid={`admin-game-row-${game.key}`}
                        >
                            <TableCell className="max-w-56 py-3 pr-3 pl-4">
                                <Link
                                    href={`/admin/games/${game.key}`}
                                    onClick={(event) => event.stopPropagation()}
                                    className="flex min-w-0 items-center gap-3 rounded-lg focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                                >
                                    <GameMark accent={game.accent} size="sm" />
                                    <span className="flex min-w-0 flex-col">
                                        <span className="truncate font-semibold text-foreground">
                                            {gameLabel(game.key)}
                                        </span>
                                        <span className="text-xs text-muted-foreground">
                                            {game.tracked
                                                ? tr('Server-scored')
                                                : tr('Practice demo')}
                                        </span>
                                    </span>
                                </Link>
                            </TableCell>
                            <NumberCell>{formatNumber(game.plays)}</NumberCell>
                            <NumberCell>
                                {formatNumber(game.players)}
                            </NumberCell>
                            <NumberCell>
                                <span className={tableTone(game.success_rate)}>
                                    {formatPercent(game.success_rate)}
                                </span>
                            </NumberCell>
                            <NumberCell>
                                <span className={tableTone(game.accuracy)}>
                                    {formatPercent(game.accuracy)}
                                </span>
                            </NumberCell>
                            <NumberCell>{formatNumber(game.points)}</NumberCell>
                            <NumberCell>
                                {game.tracked
                                    ? formatNumber(game.questions)
                                    : '—'}
                            </NumberCell>
                            <TableCell className="py-3 pr-4 pl-3">
                                <span className="flex items-center justify-between gap-2">
                                    <LastPlayed value={game.last_played_at} />
                                    <ChevronRight
                                        className="size-4 shrink-0 text-foreground/50"
                                        aria-hidden="true"
                                    />
                                </span>
                            </TableCell>
                        </TableRow>
                    ))}
                </TableBody>
            </Table>
        </div>
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
                {date.toLocaleDateString(undefined, {
                    day: 'numeric',
                    month: 'short',
                    year: 'numeric',
                })}
            </span>
            <span className="text-muted-foreground">
                {date.toLocaleTimeString(undefined, {
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

function NumberCell({ children }: { children: ReactNode }) {
    return (
        <TableCell className="px-3 py-3 text-right font-medium text-foreground tabular-nums">
            {children}
        </TableCell>
    );
}

function Metric({
    icon: Icon,
    label,
    children,
}: {
    icon: React.ElementType;
    label: string;
    children: ReactNode;
}) {
    return (
        <div className="flex flex-col gap-0.5 rounded-xl bg-muted/50 px-3 py-2">
            <dt className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <Icon className="size-3.5" />
                {tr(label)}
            </dt>
            <dd className="text-lg font-semibold text-foreground tabular-nums">
                {children}
            </dd>
        </div>
    );
}

GamesIndex.layout = (page: ReactNode) => (
    <AdminLayout title={tr('Game Statistics')}>{page}</AdminLayout>
);
