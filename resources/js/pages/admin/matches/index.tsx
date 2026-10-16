import { type Paginated, SimplePagination } from '@/components/admin/admin-kit';
import {
    EmptyState,
    Panel,
    StatTile,
    fieldClass,
    formatNumber,
    gameLabel,
} from '@/components/admin/game-stats';
import {
    MODE_LABELS,
    MatchCard,
    type MatchRow,
    phaseLabel,
} from '@/components/admin/match-history';
import { useVisibleInterval } from '@/hooks/use-visible-interval';
import AdminLayout from '@/layouts/admin-layout';
import { tr } from '@/lib/admin-i18n';
import { Head, Link, router } from '@inertiajs/react';
import {
    CalendarDays,
    DoorOpen,
    Eye,
    Search,
    Swords,
    Users,
} from 'lucide-react';
import { type FormEvent, useState } from 'react';

interface Props {
    matches: Paginated<MatchRow>;
    filters: { game?: string; mode?: string; search?: string };
    games: string[];
    modes: string[];
    liveRooms: LiveRoom[];
    summary: {
        matches: number;
        multiplayer: number;
        rooms: number;
        today: number;
    };
}

interface LiveRoom {
    game: string;
    pin: string;
    phase: string;
    players: number;
}

export default function MatchesIndex({
    matches,
    filters,
    games,
    modes,
    liveRooms: initialLiveRooms,
    summary,
}: Props) {
    const [search, setSearch] = useState(filters.search ?? '');

    useVisibleInterval(() => {
        router.reload({ only: ['liveRooms'] });
    }, 5000);

    const watchUrl = (room: LiveRoom): string =>
        `/admin/matches/live/${room.game}/${room.pin}`;

    const liveRooms = initialLiveRooms;

    const apply = (next: Record<string, string | undefined>) =>
        router.get(
            '/admin/matches',
            Object.fromEntries(
                Object.entries({ ...filters, ...next }).filter(
                    ([, value]) => value,
                ),
            ),
            { preserveScroll: true, preserveState: true },
        );

    const submit = (event: FormEvent) => {
        event.preventDefault();
        apply({ search });
    };

    return (
        <AdminLayout title="Match History">
            <Head title={tr('Match History')} />
            <div className="flex flex-col gap-6">
                <div>
                    <h1 className="text-2xl font-bold text-foreground">
                        {tr('Match History')}
                    </h1>
                    <p className="text-sm text-muted-foreground">
                        {tr(
                            'Every recorded room and duel: who played together, at which level and how they ranked.',
                        )}
                    </p>
                </div>

                <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
                    <StatTile
                        label={tr('Matches')}
                        value={formatNumber(summary.matches)}
                        icon={Swords}
                        color="bg-indigo-500"
                    />
                    <StatTile
                        label={tr('With 2+ players')}
                        value={formatNumber(summary.multiplayer)}
                        icon={Users}
                        color="bg-emerald-500"
                    />
                    <StatTile
                        label={tr('Invite rooms')}
                        value={formatNumber(summary.rooms)}
                        icon={DoorOpen}
                        color="bg-sky-500"
                    />
                    <StatTile
                        label={tr('Today')}
                        value={formatNumber(summary.today)}
                        icon={CalendarDays}
                        color="bg-amber-500"
                    />
                </div>

                <Panel title={tr('Live matches')} icon={Swords}>
                    {liveRooms.length === 0 ? (
                        <p className="text-sm text-muted-foreground">
                            {tr('No ongoing rooms')}
                        </p>
                    ) : (
                        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                            {liveRooms.map((room) => (
                                <div
                                    key={`${room.game}-${room.pin}`}
                                    className="flex items-center justify-between gap-3 rounded-lg border border-border bg-muted/30 p-4"
                                >
                                    <div className="min-w-0">
                                        <p className="truncate font-semibold text-foreground">
                                            {gameLabel(room.game)}
                                        </p>
                                        <p className="text-sm text-muted-foreground">
                                            PIN {room.pin} ·{' '}
                                            {phaseLabel(room.phase)} ·{' '}
                                            {room.players} {tr('players')}
                                        </p>
                                    </div>
                                    <Link
                                        href={watchUrl(room)}
                                        data-testid={`live-watch-${room.game}-${room.pin}`}
                                        className="inline-flex h-9 shrink-0 items-center gap-2 rounded-lg bg-primary px-3 text-sm font-medium text-primary-foreground hover:bg-primary/90"
                                    >
                                        <Eye
                                            className="size-4"
                                            aria-hidden="true"
                                        />
                                        {tr('Watch')}
                                    </Link>
                                </div>
                            ))}
                        </div>
                    )}
                </Panel>

                <Panel
                    title={tr('Matches')}
                    icon={Swords}
                    actions={
                        <div className="flex flex-wrap items-center gap-2">
                            <form
                                onSubmit={submit}
                                className="relative"
                                role="search"
                            >
                                <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
                                <input
                                    value={search}
                                    onChange={(event) =>
                                        setSearch(event.target.value)
                                    }
                                    placeholder={tr('Player name or PIN')}
                                    className={`${fieldClass} w-52 pl-9`}
                                    aria-label={tr('Search matches')}
                                />
                            </form>
                            <select
                                value={filters.game ?? ''}
                                onChange={(event) =>
                                    apply({
                                        game: event.target.value || undefined,
                                    })
                                }
                                className={fieldClass}
                                aria-label={tr('Game')}
                            >
                                <option value="">{tr('All games')}</option>
                                {games.map((game) => (
                                    <option key={game} value={game}>
                                        {gameLabel(game)}
                                    </option>
                                ))}
                            </select>
                            <select
                                value={filters.mode ?? ''}
                                onChange={(event) =>
                                    apply({
                                        mode: event.target.value || undefined,
                                    })
                                }
                                className={fieldClass}
                                aria-label={tr('Mode')}
                            >
                                <option value="">{tr('All modes')}</option>
                                {modes.map((mode) => (
                                    <option key={mode} value={mode}>
                                        {MODE_LABELS[mode] ?? mode}
                                    </option>
                                ))}
                            </select>
                        </div>
                    }
                >
                    {matches.data.length === 0 ? (
                        <EmptyState
                            icon={Swords}
                            title={tr('No matches yet')}
                            description={tr(
                                'Room games and duels are recorded when they end.',
                            )}
                        />
                    ) : (
                        <div className="flex flex-col gap-3">
                            {matches.data.map((match) => (
                                <MatchCard key={match.id} match={match} />
                            ))}
                            <SimplePagination {...matches} />
                        </div>
                    )}
                </Panel>
            </div>
        </AdminLayout>
    );
}
