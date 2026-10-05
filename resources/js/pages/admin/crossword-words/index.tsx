import {
    ConfirmDialog,
    FlashMessages,
    type Paginated,
    SimplePagination,
    StatusPill,
} from '@/components/admin/admin-kit';
import {
    EmptyState,
    Panel,
    fieldClass,
    formatNumber,
    formatPercent,
    rateTone,
} from '@/components/admin/game-stats';
import { GameTabs } from '@/components/admin/game-tabs';
import AdminLayout from '@/layouts/admin-layout';
import { cn } from '@/lib/utils';
import { Head, Link, router, usePage } from '@inertiajs/react';
import {
    ArrowLeft,
    Eye,
    EyeOff,
    Grid3x3,
    Pencil,
    Plus,
    Search,
    Trash2,
    TriangleAlert,
} from 'lucide-react';
import { type FormEvent, useState } from 'react';

interface Word {
    id: number;
    key: string;
    level: number;
    answer: string;
    clue_id: string;
    clue_en: string | null;
    is_active: boolean;
    times_used: number;
    times_solved: number;
    solve_rate: number | null;
    author: string | null;
}

export interface LevelStat {
    level: number;
    size: number;
    words_per_grid: number;
    minimum: number;
    total: number;
    active: number;
    used: number;
    solve_rate: number | null;
}

interface Props {
    words: Paginated<Word>;
    levels: LevelStat[];
    filters: { search?: string; level?: string; status?: string };
}

export default function CrosswordWordsIndex({ words, levels, filters }: Props) {
    const { errors } = usePage<{ errors: Record<string, string> }>().props;
    const [search, setSearch] = useState(filters.search ?? '');
    const [deleting, setDeleting] = useState<Word | null>(null);
    const [processing, setProcessing] = useState(false);

    const apply = (next: Record<string, string | undefined>) =>
        router.get(
            '/admin/games/crossword/words',
            Object.fromEntries(
                Object.entries({ ...filters, ...next }).filter(
                    ([, value]) => value,
                ),
            ),
            { preserveScroll: true, preserveState: true },
        );

    const submitSearch = (event: FormEvent) => {
        event.preventDefault();
        apply({ search });
    };

    return (
        <AdminLayout>
            <Head title="Crossword · Word bank" />
            <div className="flex flex-col gap-6">
                <div className="flex flex-col gap-4">
                    <Link
                        href="/admin/games"
                        className="inline-flex w-fit items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
                    >
                        <ArrowLeft className="size-4" />
                        All games
                    </Link>
                    <GameTabs game="crossword" active="words" />
                </div>
                <div className="flex flex-wrap items-end justify-between gap-4">
                    <div>
                        <h1 className="text-2xl font-bold text-foreground">
                            Crossword word bank
                        </h1>
                        <p className="text-sm text-muted-foreground">
                            Teka-Teki Silang answers and clues. The game service
                            syncs active words every minute.
                        </p>
                    </div>
                    <Link
                        href={`/admin/games/crossword/words/create${filters.level ? `?level=${filters.level}` : ''}`}
                        className="inline-flex h-9 items-center gap-2 rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground hover:bg-primary/90"
                    >
                        <Plus className="size-4" />
                        New word
                    </Link>
                </div>

                <FlashMessages errors={errors} />

                <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
                    {levels.map((level) => {
                        const low = level.active < level.minimum;
                        const selected = filters.level === String(level.level);
                        return (
                            <button
                                key={level.level}
                                type="button"
                                onClick={() =>
                                    apply({
                                        level: selected
                                            ? undefined
                                            : String(level.level),
                                    })
                                }
                                data-testid={`level-card-${level.level}`}
                                className={cn(
                                    'flex flex-col gap-2 rounded-2xl border bg-card p-4 text-left shadow-sm transition-colors',
                                    selected
                                        ? 'border-primary ring-2 ring-primary/30'
                                        : 'border-border hover:border-primary/50',
                                )}
                            >
                                <div className="flex items-center justify-between gap-2">
                                    <span className="font-semibold text-foreground">
                                        Level {level.level}
                                    </span>
                                    <span className="text-xs text-muted-foreground">
                                        {level.size}×{level.size} ·{' '}
                                        {level.words_per_grid} words
                                    </span>
                                </div>
                                <p className="text-2xl font-bold text-foreground tabular-nums">
                                    {level.active}
                                    <span className="text-sm font-normal text-muted-foreground">
                                        {' '}
                                        / {level.total} active
                                    </span>
                                </p>
                                <div className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
                                    <span>
                                        Used {formatNumber(level.used)}×
                                    </span>
                                    <span
                                        className={rateTone(level.solve_rate)}
                                    >
                                        Solved {formatPercent(level.solve_rate)}
                                    </span>
                                </div>
                                {low && (
                                    <p className="flex items-center gap-1 text-xs font-medium text-amber-600 dark:text-amber-400">
                                        <TriangleAlert className="size-3.5" />
                                        Needs {level.minimum} active words
                                    </p>
                                )}
                            </button>
                        );
                    })}
                </div>

                <Panel
                    title="Words"
                    icon={Grid3x3}
                    actions={
                        <div className="flex flex-wrap items-center gap-2">
                            <form
                                onSubmit={submitSearch}
                                className="relative"
                                role="search"
                            >
                                <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
                                <input
                                    value={search}
                                    onChange={(event) =>
                                        setSearch(event.target.value)
                                    }
                                    placeholder="Search word or clue"
                                    className={`${fieldClass} w-56 pl-9`}
                                    aria-label="Search words"
                                />
                            </form>
                            <select
                                value={filters.status ?? ''}
                                onChange={(event) =>
                                    apply({
                                        status: event.target.value || undefined,
                                    })
                                }
                                className={fieldClass}
                                aria-label="Status"
                            >
                                <option value="">All status</option>
                                <option value="active">Active</option>
                                <option value="inactive">Hidden</option>
                            </select>
                        </div>
                    }
                >
                    {words.data.length === 0 ? (
                        <EmptyState
                            icon={Grid3x3}
                            title="No words found"
                            description="Change the filters or add a new word."
                        />
                    ) : (
                        <div className="flex flex-col gap-4">
                            <div className="-mx-5 -mt-5 overflow-x-auto">
                                <table className="w-full min-w-[720px] text-sm">
                                    <thead className="border-b border-border bg-muted/40 text-left text-xs text-muted-foreground uppercase">
                                        <tr>
                                            <th className="px-5 py-3 font-medium">
                                                Answer
                                            </th>
                                            <th className="px-3 py-3 font-medium">
                                                Clue
                                            </th>
                                            <th className="px-3 py-3 font-medium">
                                                Level
                                            </th>
                                            <th className="px-3 py-3 text-right font-medium">
                                                Used
                                            </th>
                                            <th className="px-3 py-3 text-right font-medium">
                                                Solved
                                            </th>
                                            <th className="px-3 py-3 font-medium">
                                                Status
                                            </th>
                                            <th className="px-5 py-3" />
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-border">
                                        {words.data.map((word) => (
                                            <tr
                                                key={word.id}
                                                data-testid={`word-row-${word.answer}`}
                                                className="hover:bg-muted/30"
                                            >
                                                <td className="px-5 py-2.5">
                                                    <span className="font-mono font-semibold tracking-wider text-foreground">
                                                        {word.answer}
                                                    </span>
                                                    <span className="ml-2 text-xs text-muted-foreground">
                                                        {word.answer.length}
                                                    </span>
                                                </td>
                                                <td className="max-w-[340px] px-3 py-2.5">
                                                    <p className="text-foreground">
                                                        {word.clue_id}
                                                    </p>
                                                    {word.clue_en && (
                                                        <p className="text-xs text-muted-foreground">
                                                            {word.clue_en}
                                                        </p>
                                                    )}
                                                </td>
                                                <td className="px-3 py-2.5 text-muted-foreground">
                                                    {word.level}
                                                </td>
                                                <td className="px-3 py-2.5 text-right tabular-nums">
                                                    {formatNumber(
                                                        word.times_used,
                                                    )}
                                                </td>
                                                <td
                                                    className={cn(
                                                        'px-3 py-2.5 text-right tabular-nums',
                                                        rateTone(
                                                            word.solve_rate,
                                                        ),
                                                    )}
                                                >
                                                    {formatPercent(
                                                        word.solve_rate,
                                                    )}
                                                </td>
                                                <td className="px-3 py-2.5">
                                                    <StatusPill
                                                        active={word.is_active}
                                                    />
                                                </td>
                                                <td className="px-5 py-2.5">
                                                    <div className="flex justify-end gap-1">
                                                        <Link
                                                            href={`/admin/games/crossword/words/${word.id}/edit`}
                                                            className="inline-flex size-8 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground"
                                                            aria-label={`Edit ${word.answer}`}
                                                        >
                                                            <Pencil className="size-4" />
                                                        </Link>
                                                        <button
                                                            type="button"
                                                            onClick={() =>
                                                                router.patch(
                                                                    `/admin/games/crossword/words/${word.id}/toggle`,
                                                                    {},
                                                                    {
                                                                        preserveScroll: true,
                                                                    },
                                                                )
                                                            }
                                                            data-testid={`word-toggle-${word.answer}`}
                                                            className="inline-flex size-8 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground"
                                                            aria-label={
                                                                word.is_active
                                                                    ? `Hide ${word.answer}`
                                                                    : `Show ${word.answer}`
                                                            }
                                                        >
                                                            {word.is_active ? (
                                                                <EyeOff className="size-4" />
                                                            ) : (
                                                                <Eye className="size-4" />
                                                            )}
                                                        </button>
                                                        <button
                                                            type="button"
                                                            onClick={() =>
                                                                setDeleting(
                                                                    word,
                                                                )
                                                            }
                                                            className="inline-flex size-8 items-center justify-center rounded-lg text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                                                            aria-label={`Delete ${word.answer}`}
                                                        >
                                                            <Trash2 className="size-4" />
                                                        </button>
                                                    </div>
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                            <SimplePagination {...words} />
                        </div>
                    )}
                </Panel>
            </div>

            <ConfirmDialog
                open={deleting !== null}
                title="Delete word?"
                message={
                    deleting &&
                    `“${deleting.answer}” will be removed from level ${deleting.level}.`
                }
                confirmLabel="Delete"
                processing={processing}
                onClose={() => setDeleting(null)}
                onConfirm={() =>
                    deleting &&
                    router.delete(
                        `/admin/games/crossword/words/${deleting.id}`,
                        {
                            preserveScroll: true,
                            onStart: () => setProcessing(true),
                            onFinish: () => {
                                setProcessing(false);
                                setDeleting(null);
                            },
                        },
                    )
                }
            />
        </AdminLayout>
    );
}
