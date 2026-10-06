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
import { ResponsiveTable } from '@/components/responsive-table';
import AdminLayout from '@/layouts/admin-layout';
import { tr } from '@/lib/admin-i18n';
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
            <Head title={tr('Leaderboard')} />
            <div className="flex flex-col gap-6">
                <div className="flex flex-col gap-1">
                    <h2 className="font-display text-2xl font-bold text-foreground">
                        {tr('Leaderboard')}
                    </h2>
                    <p className="text-sm text-muted-foreground">
                        {tr(
                            'Top 100 active players by points. Filter by game, education level, grade, age or school.',
                        )}
                    </p>
                </div>

                <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-border bg-card p-3 shadow-sm">
                    <select
                        aria-label={tr('Game')}
                        value={filters.game ?? ''}
                        onChange={(e) =>
                            apply({ game: e.target.value || null })
                        }
                        className={fieldClass}
                    >
                        <option value="">{tr('All games')}</option>
                        {games
                            .filter((game) => game.tracked)
                            .map((game) => (
                                <option key={game.key} value={game.key}>
                                    {gameLabel(game.key)}
                                </option>
                            ))}
                    </select>
                    <select
                        aria-label={tr('Education level')}
                        value={filters.level ?? ''}
                        onChange={(e) =>
                            apply({ level: e.target.value || null })
                        }
                        className={fieldClass}
                    >
                        <option value="">{tr('All levels')}</option>
                        {levels.map((level) => (
                            <option key={level} value={level}>
                                {LEVEL_LABELS[level] ?? level}
                            </option>
                        ))}
                    </select>
                    <select
                        aria-label={tr('Grade')}
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
                        <option value="">{tr('All grades')}</option>
                        {Array.from({ length: 12 }, (_, i) => i + 1).map(
                            (grade) => (
                                <option key={grade} value={grade}>
                                    {tr('Grade')} {grade}
                                </option>
                            ),
                        )}
                    </select>
                    <select
                        aria-label={tr('Age group')}
                        value={filters.age ?? ''}
                        onChange={(e) => apply({ age: e.target.value || null })}
                        className={fieldClass}
                    >
                        <option value="">{tr('All ages')}</option>
                        {ageGroups.map((group) => (
                            <option key={group} value={group}>
                                {group} {tr('yrs')}
                            </option>
                        ))}
                    </select>
                    <select
                        aria-label={tr('Period')}
                        value={filters.days}
                        onChange={(e) =>
                            apply({ days: Number(e.target.value) })
                        }
                        className={fieldClass}
                    >
                        <option value={0}>{tr('All time')}</option>
                        <option value={7}>{tr('Last 7 days')}</option>
                        <option value={30}>{tr('Last 30 days')}</option>
                        <option value={90}>{tr('Last 90 days')}</option>
                    </select>
                    <div className="relative min-w-48 flex-1">
                        <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
                        <input
                            type="search"
                            aria-label={tr('School')}
                            value={school}
                            onChange={(e) => setSchool(e.target.value)}
                            placeholder={tr('Filter by school…')}
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
                            {tr('Reset')}
                        </button>
                    )}
                </div>

                {entries.length === 0 ? (
                    <Panel title={tr('Rankings')} icon={Trophy}>
                        <EmptyState
                            icon={Trophy}
                            title={tr('No players match these filters')}
                            description={tr(
                                'Try another game, level or period.',
                            )}
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
                                            {formatNumber(entry.points)}{' '}
                                            {tr('pts')}
                                        </span>
                                    </div>
                                </li>
                            ))}
                        </ol>

                        <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
                            <Panel
                                title={tr('Rankings')}
                                description={tr('{0} players', [
                                    entries.length,
                                ])}
                                icon={Medal}
                                className="xl:col-span-2"
                            >
                                <ResponsiveTable
                                    testId="leaderboard-table"
                                    rows={entries}
                                    rowKey={(entry) => entry.user_id}
                                    columns={[
                                        {
                                            key: 'rank',
                                            header: '#',
                                            primary: true,
                                            cell: (entry) => (
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
                                            ),
                                        },
                                        {
                                            key: 'player',
                                            header: tr('Player'),
                                            primary: true,
                                            cell: (entry) => (
                                                <span className="flex min-w-0 flex-col">
                                                    <Link
                                                        href={`/admin/users/${entry.user_id}`}
                                                        className="font-medium text-foreground hover:underline"
                                                    >
                                                        {entry.name}
                                                    </Link>
                                                    {entry.name !==
                                                        entry.account_name && (
                                                        <span className="text-xs font-normal text-muted-foreground">
                                                            {entry.account_name}
                                                        </span>
                                                    )}
                                                </span>
                                            ),
                                        },
                                        {
                                            key: 'school',
                                            header: tr('School'),
                                            cellClassName:
                                                'max-w-48 truncate text-muted-foreground',
                                            cell: (entry) =>
                                                entry.school_name ?? '—',
                                        },
                                        {
                                            key: 'age',
                                            header: tr('Age'),
                                            align: 'right',
                                            cellClassName: 'tabular-nums',
                                            cell: (entry) => entry.age ?? '—',
                                        },
                                        {
                                            key: 'grade',
                                            header: tr('Grade'),
                                            align: 'right',
                                            cellClassName: 'tabular-nums',
                                            cell: (entry) => entry.grade ?? '—',
                                        },
                                        {
                                            key: 'plays',
                                            header: tr('Plays'),
                                            align: 'right',
                                            cellClassName: 'tabular-nums',
                                            cell: (entry) =>
                                                formatNumber(entry.plays),
                                        },
                                        {
                                            key: 'accuracy',
                                            header: tr('Accuracy'),
                                            align: 'right',
                                            cell: (entry) => (
                                                <span
                                                    className={cn(
                                                        'font-medium tabular-nums',
                                                        rateTone(
                                                            entry.accuracy,
                                                        ),
                                                    )}
                                                >
                                                    {formatPercent(
                                                        entry.accuracy,
                                                    )}
                                                </span>
                                            ),
                                        },
                                        {
                                            key: 'points',
                                            header: tr('Points'),
                                            align: 'right',
                                            summary: true,
                                            cell: (entry) => (
                                                <span className="font-semibold text-foreground tabular-nums">
                                                    {formatNumber(entry.points)}{' '}
                                                    {tr('pts')}
                                                </span>
                                            ),
                                        },
                                        {
                                            key: 'last',
                                            header: tr('Last played'),
                                            align: 'right',
                                            cellClassName:
                                                'whitespace-nowrap text-muted-foreground',
                                            cell: (entry) =>
                                                formatDateTime(
                                                    entry.last_played_at,
                                                ),
                                        },
                                    ]}
                                />
                            </Panel>

                            <Panel
                                title={tr('Top schools')}
                                description={
                                    filters.game
                                        ? gameLabel(filters.game)
                                        : tr('All games')
                                }
                                icon={School}
                            >
                                {schools.length === 0 ? (
                                    <EmptyState
                                        icon={School}
                                        title={tr('No school data yet')}
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
                                                        {row.players}{' '}
                                                        {tr('players ·')}{' '}
                                                        {formatNumber(
                                                            row.plays,
                                                        )}{' '}
                                                        {tr('plays')}
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
    <AdminLayout title={tr('Leaderboard')}>{page}</AdminLayout>
);
