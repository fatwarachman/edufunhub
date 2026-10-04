import {
    EmptyState,
    LEVEL_LABELS,
    Panel,
    fieldClass,
    formatDateTime,
    formatNumber,
    formatPercent,
    gameLabel,
    rateTone,
} from '@/components/admin/game-stats';
import AdminLayout from '@/layouts/admin-layout';
import { cn } from '@/lib/utils';
import { Head, Link, router } from '@inertiajs/react';
import { Crown, Medal, RotateCcw, School, Search, Trophy } from 'lucide-react';
import { type ReactNode, useEffect, useRef, useState } from 'react';

interface Entry {
    rank: number;
    user_id: number;
    name: string;
    account_name: string;
    email: string;
    grade: number | null;
    age: number | null;
    school_name: string | null;
    points: number;
    plays: number;
    accuracy: number | null;
    last_played_at: string;
}

interface Filters {
    game: string | null;
    level: string | null;
    grade: number | null;
    age: string | null;
    school: string | null;
    days: number;
}

interface LeaderboardProps {
    filters: Filters;
    games: { key: string; tracked: boolean }[];
    ageGroups: string[];
    levels: string[];
    entries: Entry[];
    schools: {
        school: string;
        players: number;
        points: number;
        plays: number;
    }[];
}

const RANK_STYLES: Record<number, string> = {
    1: 'bg-amber-400 text-amber-950',
    2: 'bg-slate-300 text-slate-900',
    3: 'bg-orange-300 text-orange-950',
};

export default function Leaderboard({
    filters,
    games,
    ageGroups,
    levels,
    entries,
    schools,
}: LeaderboardProps) {
    const [school, setSchool] = useState(filters.school ?? '');
    const debounce = useRef<ReturnType<typeof setTimeout> | null>(null);
    const firstRender = useRef(true);

    const apply = (changes: Partial<Filters>) => {
        const next = { ...filters, ...changes };
        if (changes.level !== undefined && changes.level !== null)
            next.grade = null;
        if (changes.grade !== undefined && changes.grade !== null)
            next.level = null;
        const query = Object.fromEntries(
            Object.entries(next).filter(
                ([, value]) => value !== null && value !== '' && value !== 0,
            ),
        );
        router.get('/admin/leaderboard', query, {
            preserveScroll: true,
            preserveState: true,
        });
    };

    useEffect(() => {
        if (firstRender.current) {
            firstRender.current = false;
            return;
        }
        if (debounce.current) clearTimeout(debounce.current);
        debounce.current = setTimeout(
            () => apply({ school: school.trim() || null }),
            400,
        );
        return () => {
            if (debounce.current) clearTimeout(debounce.current);
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [school]);

    const filtered = Boolean(
        filters.game ||
        filters.level ||
        filters.grade ||
        filters.age ||
        filters.school ||
        filters.days,
    );
    const podium = entries.slice(0, 3);

    return (
        <>
            <Head title="Leaderboard" />
            <div className="flex flex-col gap-6">
                <div className="flex flex-col gap-1">
                    <h2 className="font-display text-2xl font-bold text-foreground">
                        Leaderboard
                    </h2>
                    <p className="text-sm text-muted-foreground">
                        Top 100 active players by points. Filter by game,
                        education level, grade, age or school.
                    </p>
                </div>

                <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-border bg-card p-3 shadow-sm">
                    <select
                        aria-label="Game"
                        value={filters.game ?? ''}
                        onChange={(e) =>
                            apply({ game: e.target.value || null })
                        }
                        className={fieldClass}
                    >
                        <option value="">All games</option>
                        {games
                            .filter((game) => game.tracked)
                            .map((game) => (
                                <option key={game.key} value={game.key}>
                                    {gameLabel(game.key)}
                                </option>
                            ))}
                    </select>
                    <select
                        aria-label="Education level"
                        value={filters.level ?? ''}
                        onChange={(e) =>
                            apply({ level: e.target.value || null })
                        }
                        className={fieldClass}
                    >
                        <option value="">All levels</option>
                        {levels.map((level) => (
                            <option key={level} value={level}>
                                {LEVEL_LABELS[level] ?? level}
                            </option>
                        ))}
                    </select>
                    <select
                        aria-label="Grade"
                        value={filters.grade ?? ''}
                        onChange={(e) =>
                            apply({
                                grade: e.target.value
                                    ? Number(e.target.value)
                                    : null,
                            })
                        }
                        className={fieldClass}
                    >
                        <option value="">All grades</option>
                        {Array.from({ length: 12 }, (_, i) => i + 1).map(
                            (grade) => (
                                <option key={grade} value={grade}>
                                    Grade {grade}
                                </option>
                            ),
                        )}
                    </select>
                    <select
                        aria-label="Age group"
                        value={filters.age ?? ''}
                        onChange={(e) => apply({ age: e.target.value || null })}
                        className={fieldClass}
                    >
                        <option value="">All ages</option>
                        {ageGroups.map((group) => (
                            <option key={group} value={group}>
                                {group} yrs
                            </option>
                        ))}
                    </select>
                    <select
                        aria-label="Period"
                        value={filters.days}
                        onChange={(e) =>
                            apply({ days: Number(e.target.value) })
                        }
                        className={fieldClass}
                    >
                        <option value={0}>All time</option>
                        <option value={7}>Last 7 days</option>
                        <option value={30}>Last 30 days</option>
                        <option value={90}>Last 90 days</option>
                    </select>
                    <div className="relative min-w-48 flex-1">
                        <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
                        <input
                            type="search"
                            aria-label="School"
                            value={school}
                            onChange={(e) => setSchool(e.target.value)}
                            placeholder="Filter by school…"
                            className={cn(fieldClass, 'w-full pl-9')}
                        />
                    </div>
                    {filtered && (
                        <button
                            type="button"
                            onClick={() => {
                                setSchool('');
                                router.get(
                                    '/admin/leaderboard',
                                    {},
                                    { preserveScroll: true },
                                );
                            }}
                            className="inline-flex h-9 items-center gap-1.5 rounded-lg px-3 text-sm font-medium text-muted-foreground hover:bg-muted hover:text-foreground"
                        >
                            <RotateCcw className="size-4" />
                            Reset
                        </button>
                    )}
                </div>

                {entries.length === 0 ? (
                    <Panel title="Rankings" icon={Trophy}>
                        <EmptyState
                            icon={Trophy}
                            title="No players match these filters"
                            description="Try another game, level or period."
                        />
                    </Panel>
                ) : (
                    <>
                        <ol className="grid grid-cols-1 gap-4 md:grid-cols-3">
                            {podium.map((entry) => (
                                <li
                                    key={entry.user_id}
                                    className="flex items-center gap-4 rounded-2xl border border-border bg-card p-5 shadow-sm"
                                >
                                    <span
                                        className={cn(
                                            'flex size-12 shrink-0 items-center justify-center rounded-full text-lg font-bold',
                                            RANK_STYLES[entry.rank],
                                        )}
                                    >
                                        {entry.rank === 1 ? (
                                            <Crown className="size-6" />
                                        ) : (
                                            entry.rank
                                        )}
                                    </span>
                                    <div className="flex min-w-0 flex-col">
                                        <Link
                                            href={`/admin/users/${entry.user_id}`}
                                            className="truncate font-semibold text-foreground hover:underline"
                                        >
                                            {entry.name}
                                        </Link>
                                        <span className="truncate text-xs text-muted-foreground">
                                            {[
                                                entry.school_name,
                                                entry.grade
                                                    ? `Grade ${entry.grade}`
                                                    : null,
                                            ]
                                                .filter(Boolean)
                                                .join(' · ') || '—'}
                                        </span>
                                        <span className="mt-1 text-lg font-bold text-foreground tabular-nums">
                                            {formatNumber(entry.points)} pts
                                        </span>
                                    </div>
                                </li>
                            ))}
                        </ol>

                        <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
                            <Panel
                                title="Rankings"
                                description={`${entries.length} players`}
                                icon={Medal}
                                className="xl:col-span-2"
                            >
                                <div className="overflow-x-auto">
                                    <table className="w-full min-w-[760px] text-sm">
                                        <thead>
                                            <tr className="border-b border-border text-xs tracking-wider text-muted-foreground uppercase">
                                                <th className="py-2 pr-3 text-left font-medium">
                                                    #
                                                </th>
                                                <th className="px-3 py-2 text-left font-medium">
                                                    Player
                                                </th>
                                                <th className="px-3 py-2 text-left font-medium">
                                                    School
                                                </th>
                                                <th className="px-3 py-2 text-right font-medium">
                                                    Age
                                                </th>
                                                <th className="px-3 py-2 text-right font-medium">
                                                    Grade
                                                </th>
                                                <th className="px-3 py-2 text-right font-medium">
                                                    Plays
                                                </th>
                                                <th className="px-3 py-2 text-right font-medium">
                                                    Accuracy
                                                </th>
                                                <th className="px-3 py-2 text-right font-medium">
                                                    Points
                                                </th>
                                                <th className="py-2 pl-3 text-right font-medium">
                                                    Last played
                                                </th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-border">
                                            {entries.map((entry) => (
                                                <tr key={entry.user_id}>
                                                    <td className="py-2.5 pr-3">
                                                        <span
                                                            className={cn(
                                                                'inline-flex size-7 items-center justify-center rounded-full text-xs font-bold',
                                                                RANK_STYLES[
                                                                    entry.rank
                                                                ] ??
                                                                    'bg-muted text-muted-foreground',
                                                            )}
                                                        >
                                                            {entry.rank}
                                                        </span>
                                                    </td>
                                                    <td className="px-3 py-2.5">
                                                        <Link
                                                            href={`/admin/users/${entry.user_id}`}
                                                            className="font-medium text-foreground hover:underline"
                                                        >
                                                            {entry.name}
                                                        </Link>
                                                        {entry.name !==
                                                            entry.account_name && (
                                                            <p className="text-xs text-muted-foreground">
                                                                {
                                                                    entry.account_name
                                                                }
                                                            </p>
                                                        )}
                                                    </td>
                                                    <td
                                                        className="max-w-48 truncate px-3 py-2.5 text-muted-foreground"
                                                        title={
                                                            entry.school_name ??
                                                            undefined
                                                        }
                                                    >
                                                        {entry.school_name ??
                                                            '—'}
                                                    </td>
                                                    <td className="px-3 py-2.5 text-right text-foreground tabular-nums">
                                                        {entry.age ?? '—'}
                                                    </td>
                                                    <td className="px-3 py-2.5 text-right text-foreground tabular-nums">
                                                        {entry.grade ?? '—'}
                                                    </td>
                                                    <td className="px-3 py-2.5 text-right text-foreground tabular-nums">
                                                        {formatNumber(
                                                            entry.plays,
                                                        )}
                                                    </td>
                                                    <td
                                                        className={cn(
                                                            'px-3 py-2.5 text-right font-medium tabular-nums',
                                                            rateTone(
                                                                entry.accuracy,
                                                            ),
                                                        )}
                                                    >
                                                        {formatPercent(
                                                            entry.accuracy,
                                                        )}
                                                    </td>
                                                    <td className="px-3 py-2.5 text-right font-semibold text-foreground tabular-nums">
                                                        {formatNumber(
                                                            entry.points,
                                                        )}
                                                    </td>
                                                    <td className="py-2.5 pl-3 text-right whitespace-nowrap text-muted-foreground">
                                                        {formatDateTime(
                                                            entry.last_played_at,
                                                        )}
                                                    </td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            </Panel>

                            <Panel
                                title="Top schools"
                                description={
                                    filters.game
                                        ? gameLabel(filters.game)
                                        : 'All games'
                                }
                                icon={School}
                            >
                                {schools.length === 0 ? (
                                    <EmptyState
                                        icon={School}
                                        title="No school data yet"
                                    />
                                ) : (
                                    <ol className="flex flex-col divide-y divide-border">
                                        {schools.map((row, index) => (
                                            <li
                                                key={row.school}
                                                className="flex items-center gap-3 py-2.5"
                                            >
                                                <span
                                                    className={cn(
                                                        'inline-flex size-7 shrink-0 items-center justify-center rounded-full text-xs font-bold',
                                                        RANK_STYLES[
                                                            index + 1
                                                        ] ??
                                                            'bg-muted text-muted-foreground',
                                                    )}
                                                >
                                                    {index + 1}
                                                </span>
                                                <div className="flex min-w-0 flex-1 flex-col">
                                                    <span className="truncate text-sm font-medium text-foreground">
                                                        {row.school}
                                                    </span>
                                                    <span className="text-xs text-muted-foreground">
                                                        {row.players} players ·{' '}
                                                        {formatNumber(
                                                            row.plays,
                                                        )}{' '}
                                                        plays
                                                    </span>
                                                </div>
                                                <span className="text-sm font-semibold text-foreground tabular-nums">
                                                    {formatNumber(row.points)}
                                                </span>
                                            </li>
                                        ))}
                                    </ol>
                                )}
                            </Panel>
                        </div>
                    </>
                )}
            </div>
        </>
    );
}

Leaderboard.layout = (page: ReactNode) => (
    <AdminLayout title="Leaderboard">{page}</AdminLayout>
);
