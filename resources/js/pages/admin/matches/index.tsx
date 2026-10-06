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
} from '@/components/admin/match-history';
import AdminLayout from '@/layouts/admin-layout';
import { tr } from '@/lib/admin-i18n';
import { Head, router } from '@inertiajs/react';
import { CalendarDays, DoorOpen, Search, Swords, Users } from 'lucide-react';
import { type FormEvent, useState } from 'react';

interface Props {
    matches: Paginated<MatchRow>;
    filters: { game?: string; mode?: string; search?: string };
    games: string[];
    modes: string[];
    summary: {
        matches: number;
        multiplayer: number;
        rooms: number;
        today: number;
    };
}

export default function MatchesIndex({
    matches,
    filters,
    games,
    modes,
    summary,
}: Props) {
    const [search, setSearch] = useState(filters.search ?? '');

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
        <AdminLayout>
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
