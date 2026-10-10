import { useAdminBreadcrumbs } from '@/components/admin/admin-breadcrumbs';
import {
    GAME_COLORS,
    GameDot,
    KpiCard,
} from '@/components/admin/dashboard-kit';
import {
    EmptyState,
    formatDuration,
    formatNumber,
    formatPercent,
    GAME_LABELS,
    Panel,
    rateTone,
} from '@/components/admin/game-stats';
import {
    DayNavigator,
    formatDay,
    formatTime,
    HOT_GAMES_URL,
    type HotDayProps,
    RankBadge,
} from '@/components/admin/hot-games';
import { ResponsiveTable } from '@/components/responsive-table';
import AdminLayout from '@/layouts/admin-layout';
import { tr } from '@/lib/admin-i18n';
import { cn } from '@/lib/utils';
import { Head, Link } from '@inertiajs/react';
import {
    CalendarClock,
    ChevronRight,
    Flame,
    Gamepad2,
    History,
    Trophy,
    UsersRound,
} from 'lucide-react';
import { type ReactNode } from 'react';

interface RankingRow {
    rank: number;
    game: string;
    name: string;
    in_catalog: boolean;
    plays: number;
    players: number;
    points: number;
    accuracy: number | null;
    avg_duration: number | null;
    first_at: string;
    last_at: string;
}

interface HistoryDay {
    date: string;
    plays: number;
    players: number;
    games: number;
    top: {
        game: string;
        name: string;
        in_catalog: boolean;
        plays: number;
        players: number;
    }[];
}

interface HotGamesProps extends HotDayProps {
    ranking: RankingRow[];
    totals: { plays: number; players: number; games: number };
    history: HistoryDay[];
}

function detailHref(game: string, date: string, today: string): string {
    return `${HOT_GAMES_URL}/${game}${date === today ? '' : `?date=${date}`}`;
}

/** Catalog label, or the recorded name for games no longer in the catalog. */
function GameName({ game, name }: { game: string; name: string }) {
    return GAME_LABELS[game] ? (
        <GameDot game={game} />
    ) : (
        <span className="inline-flex items-center gap-1.5">
            <span className="size-2 shrink-0 rounded-full bg-muted-foreground/50" />
            {name || game}
        </span>
    );
}

export default function HotGamesIndex(props: HotGamesProps) {
    const { ranking, totals, history, date, today, isToday, timezone } = props;
    useAdminBreadcrumbs([{ title: tr('Hottest games') }]);
    const max = Math.max(1, ...ranking.map((row) => row.plays));
    const top = ranking[0];

    return (
        <>
            <Head title={tr('Hottest games')} />

            <div className="flex min-w-0 flex-col gap-4">
                <div className="flex flex-wrap items-end justify-between gap-4">
                    <div className="min-w-0">
                        <h2 className="flex items-center gap-2 font-display text-2xl font-bold text-foreground">
                            <Flame
                                className="size-6 shrink-0 text-rose-500"
                                aria-hidden
                            />
                            {isToday
                                ? tr('Hottest games today')
                                : tr('Hottest games')}
                        </h2>
                        <p
                            className="text-sm text-muted-foreground"
                            data-testid="hot-games-day-label"
                        >
                            {formatDay(date)} · {tr('Timezone {0}', [timezone])}
                        </p>
                    </div>
                    <DayNavigator day={props} url={HOT_GAMES_URL} />
                </div>

                <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
                    <KpiCard
                        label="Plays"
                        value={formatNumber(totals.plays)}
                        icon={Gamepad2}
                        accent="#6366f1"
                    />
                    <KpiCard
                        label="Players"
                        value={formatNumber(totals.players)}
                        icon={UsersRound}
                        accent="#10b981"
                    />
                    <KpiCard
                        label="Games played"
                        value={formatNumber(totals.games)}
                        icon={CalendarClock}
                        accent="#f59e0b"
                    />
                    <KpiCard
                        label="Top game"
                        value={
                            <span className="block truncate text-xl">
                                {top
                                    ? (GAME_LABELS[top.game] ?? top.name)
                                    : '—'}
                            </span>
                        }
                        icon={Trophy}
                        accent="#f43f5e"
                        href={
                            top?.in_catalog
                                ? detailHref(top.game, date, today)
                                : undefined
                        }
                    />
                </div>

                <Panel
                    title="Game ranking"
                    description={tr(
                        'Most played first · click a game for that day’s detail',
                    )}
                    icon={Trophy}
                >
                    {ranking.length === 0 ? (
                        <EmptyState
                            icon={Gamepad2}
                            title={tr('No games played on this day')}
                            description={tr(
                                'Plays are counted when a player finishes a game.',
                            )}
                        />
                    ) : (
                        <ResponsiveTable
                            testId="hot-games-ranking"
                            rows={ranking}
                            rowKey={(row) => row.game}
                            columns={[
                                {
                                    key: 'rank',
                                    header: '#',
                                    cell: (row) => (
                                        <RankBadge rank={row.rank} />
                                    ),
                                },
                                {
                                    key: 'game',
                                    header: tr('Game'),
                                    primary: true,
                                    cellClassName: 'min-w-48',
                                    cell: (row) => {
                                        const body = (
                                            <>
                                                <span className="flex items-center gap-1 font-medium text-foreground group-hover:underline">
                                                    <GameName
                                                        game={row.game}
                                                        name={row.name}
                                                    />
                                                    {row.in_catalog ? (
                                                        <ChevronRight
                                                            className="size-3.5 text-muted-foreground"
                                                            aria-hidden
                                                        />
                                                    ) : (
                                                        <span className="text-xs font-normal text-muted-foreground">
                                                            ·{' '}
                                                            {tr(
                                                                'No longer in the catalog',
                                                            )}
                                                        </span>
                                                    )}
                                                </span>
                                                <span className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
                                                    <span
                                                        className="block h-full rounded-full"
                                                        style={{
                                                            width: `${(row.plays / max) * 100}%`,
                                                            background:
                                                                GAME_COLORS[
                                                                    row.game
                                                                ] ??
                                                                'var(--primary)',
                                                        }}
                                                    />
                                                </span>
                                            </>
                                        );
                                        return row.in_catalog ? (
                                            <Link
                                                href={detailHref(
                                                    row.game,
                                                    date,
                                                    today,
                                                )}
                                                className="group flex min-w-0 flex-col gap-1.5 rounded-md focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                                                data-testid="hot-games-row"
                                                data-game={row.game}
                                            >
                                                {body}
                                            </Link>
                                        ) : (
                                            <span
                                                className="flex min-w-0 flex-col gap-1.5"
                                                data-testid="hot-games-row"
                                                data-game={row.game}
                                            >
                                                {body}
                                            </span>
                                        );
                                    },
                                },
                                {
                                    key: 'plays',
                                    header: tr('Plays'),
                                    summary: true,
                                    align: 'right',
                                    cellClassName:
                                        'whitespace-nowrap font-semibold text-foreground tabular-nums',
                                    cell: (row) =>
                                        tr('{0} plays', [
                                            formatNumber(row.plays),
                                        ]),
                                },
                                {
                                    key: 'players',
                                    header: tr('Players'),
                                    summary: true,
                                    align: 'right',
                                    cellClassName:
                                        'whitespace-nowrap text-foreground tabular-nums',
                                    cell: (row) =>
                                        tr('{0} players', [
                                            formatNumber(row.players),
                                        ]),
                                },
                                {
                                    key: 'accuracy',
                                    header: tr('Accuracy'),
                                    align: 'right',
                                    cellClassName:
                                        'whitespace-nowrap tabular-nums',
                                    cell: (row) => (
                                        <span
                                            className={rateTone(row.accuracy)}
                                        >
                                            {formatPercent(row.accuracy)}
                                        </span>
                                    ),
                                },
                                {
                                    key: 'duration',
                                    header: tr('Avg. duration'),
                                    align: 'right',
                                    cellClassName:
                                        'whitespace-nowrap text-muted-foreground tabular-nums',
                                    cell: (row) =>
                                        formatDuration(row.avg_duration),
                                },
                                {
                                    key: 'last',
                                    header: tr('Last played'),
                                    align: 'right',
                                    cellClassName:
                                        'whitespace-nowrap text-muted-foreground tabular-nums',
                                    cell: (row) =>
                                        formatTime(row.last_at, timezone),
                                },
                            ]}
                        />
                    )}
                </Panel>

                <Panel
                    title="Previous days"
                    description={tr(
                        'Top {0} games per day · click a day to see its full ranking',
                        [3],
                    )}
                    icon={History}
                >
                    <ul
                        className="flex flex-col divide-y divide-border"
                        data-testid="hot-games-history"
                    >
                        {history.map((day) => (
                            <li
                                key={day.date}
                                className="flex flex-col gap-2 py-3 first:pt-0 last:pb-0 sm:flex-row sm:items-center sm:gap-4"
                                data-testid="hot-games-history-day"
                                data-date={day.date}
                            >
                                <Link
                                    href={`${HOT_GAMES_URL}?date=${day.date}`}
                                    className="flex min-w-0 shrink-0 flex-col rounded-md hover:underline focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none sm:w-48"
                                >
                                    <span className="text-sm font-medium text-foreground">
                                        {formatDay(day.date, 'short')}
                                    </span>
                                    <span className="text-xs text-muted-foreground tabular-nums">
                                        {tr('{0} plays · {1} players', [
                                            formatNumber(day.plays),
                                            formatNumber(day.players),
                                        ])}
                                    </span>
                                </Link>
                                {day.top.length === 0 ? (
                                    <span className="text-xs text-muted-foreground">
                                        {tr('No games played')}
                                    </span>
                                ) : (
                                    <ol className="flex min-w-0 flex-wrap gap-2">
                                        {day.top.map((game, index) => {
                                            const chip = (
                                                <>
                                                    <span className="font-bold text-muted-foreground tabular-nums">
                                                        {index + 1}
                                                    </span>
                                                    <GameName
                                                        game={game.game}
                                                        name={game.name}
                                                    />
                                                    <span className="text-muted-foreground tabular-nums">
                                                        {tr('{0} plays', [
                                                            formatNumber(
                                                                game.plays,
                                                            ),
                                                        ])}
                                                    </span>
                                                </>
                                            );
                                            const chipClass =
                                                'inline-flex items-center gap-2 rounded-full border border-border px-2.5 py-1 text-xs text-foreground';
                                            return (
                                                <li key={game.game}>
                                                    {game.in_catalog ? (
                                                        <Link
                                                            href={detailHref(
                                                                game.game,
                                                                day.date,
                                                                today,
                                                            )}
                                                            className={cn(
                                                                chipClass,
                                                                'hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none',
                                                            )}
                                                        >
                                                            {chip}
                                                        </Link>
                                                    ) : (
                                                        <span
                                                            className={
                                                                chipClass
                                                            }
                                                        >
                                                            {chip}
                                                        </span>
                                                    )}
                                                </li>
                                            );
                                        })}
                                        {day.games > day.top.length && (
                                            <li className="inline-flex items-center px-1 text-xs text-muted-foreground">
                                                {tr('+{0} more', [
                                                    day.games - day.top.length,
                                                ])}
                                            </li>
                                        )}
                                    </ol>
                                )}
                            </li>
                        ))}
                    </ul>
                </Panel>
            </div>
        </>
    );
}

HotGamesIndex.layout = (page: ReactNode) => (
    <AdminLayout title={tr('Hottest games')}>{page}</AdminLayout>
);
