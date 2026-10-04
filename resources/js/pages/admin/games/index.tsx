import {
    formatDateTime,
    formatNumber,
    formatPercent,
    gameLabel,
    rateTone,
} from '@/components/admin/game-stats';
import AdminLayout from '@/layouts/admin-layout';
import { Head, Link } from '@inertiajs/react';
import {
    ArrowUpRight,
    ChartColumnBig,
    Coins,
    Gamepad2,
    ListChecks,
    Target,
    UsersRound,
} from 'lucide-react';
import { type ReactNode } from 'react';

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

export default function GamesIndex({ games }: { games: GameRow[] }) {
    const totalPlays = games.reduce((sum, game) => sum + game.plays, 0);

    return (
        <>
            <Head title="Game Statistics" />
            <div className="flex flex-col gap-6">
                <div className="flex flex-col gap-1">
                    <h2 className="font-display text-2xl font-bold text-foreground">
                        Game Statistics
                    </h2>
                    <p className="text-sm text-muted-foreground">
                        {formatNumber(totalPlays)} recorded plays across{' '}
                        {games.length} games. Select a game for the full
                        analysis.
                    </p>
                </div>

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
                                        <span
                                            className="flex size-11 shrink-0 items-center justify-center rounded-xl text-white shadow-sm"
                                            style={{ background: game.accent }}
                                        >
                                            <Gamepad2 className="size-5" />
                                        </span>
                                        <div className="flex min-w-0 flex-col">
                                            <span className="truncate font-semibold text-foreground">
                                                {gameLabel(game.key)}
                                            </span>
                                            <span className="text-xs text-muted-foreground">
                                                {game.tracked
                                                    ? 'Server-scored · results tracked'
                                                    : 'Practice demo · not tracked'}
                                            </span>
                                        </div>
                                    </div>
                                    <ArrowUpRight className="size-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
                                </div>

                                <dl className="grid grid-cols-2 gap-3 text-sm">
                                    <Metric icon={ChartColumnBig} label="Plays">
                                        {formatNumber(game.plays)}
                                    </Metric>
                                    <Metric icon={UsersRound} label="Players">
                                        {formatNumber(game.players)}
                                    </Metric>
                                    <Metric icon={Target} label="Success rate">
                                        <span
                                            className={rateTone(
                                                game.success_rate,
                                            )}
                                        >
                                            {formatPercent(game.success_rate)}
                                        </span>
                                    </Metric>
                                    <Metric icon={Coins} label="Points given">
                                        {formatNumber(game.points)}
                                    </Metric>
                                </dl>

                                <div className="mt-auto flex flex-wrap items-center justify-between gap-2 border-t border-border pt-3 text-xs text-muted-foreground">
                                    <span className="inline-flex items-center gap-1.5">
                                        <ListChecks className="size-3.5" />
                                        {game.tracked
                                            ? `${game.questions} active questions`
                                            : 'Uses local demo questions'}
                                    </span>
                                    <span>
                                        Last played{' '}
                                        {formatDateTime(game.last_played_at)}
                                    </span>
                                </div>
                            </Link>
                        </li>
                    ))}
                </ul>
            </div>
        </>
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
                {label}
            </dt>
            <dd className="text-lg font-semibold text-foreground tabular-nums">
                {children}
            </dd>
        </div>
    );
}

GamesIndex.layout = (page: ReactNode) => (
    <AdminLayout title="Game Statistics">{page}</AdminLayout>
);
