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
import { ResponsiveTable } from '@/components/responsive-table';
import AdminLayout from '@/layouts/admin-layout';
import { tr } from '@/lib/admin-i18n';
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
            <Head title={tr('Crossword · Word bank')} />
            <div className="flex flex-col gap-6">
                <div className="flex flex-col gap-4">
                    <Link
                        href="/admin/games"
                        className="inline-flex w-fit items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
                    >
                        <ArrowLeft className="size-4" />
                        {tr('All games')}
                    </Link>
                    <GameTabs game="crossword" active="words" />
                </div>
                <div className="flex flex-wrap items-end justify-between gap-4">
                    <div>
                        <h1 className="text-2xl font-bold text-foreground">
                            {tr('Crossword word bank')}
                        </h1>
                        <p className="text-sm text-muted-foreground">
                            {tr(
                                'Teka-Teki Silang answers and clues. The game service syncs active words every minute.',
                            )}
                        </p>
                    </div>
                    <Link
                        href={`/admin/games/crossword/words/create${filters.level ? `?level=${filters.level}` : ''}`}
                        className="inline-flex h-9 items-center gap-2 rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground hover:bg-primary/90"
                    >
                        <Plus className="size-4" />
                        {tr('New word')}
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
                                        {tr('Level')} {level.level}
                                    </span>
                                    <span className="text-xs text-muted-foreground">
                                        {level.size}×{level.size} ·{' '}
                                        {level.words_per_grid} {tr('words')}
                                    </span>
                                </div>
                                <p className="text-2xl font-bold text-foreground tabular-nums">
                                    {level.active}
                                    <span className="text-sm font-normal text-muted-foreground">
                                        {' '}
                                        / {level.total} {tr('active')}
                                    </span>
                                </p>
                                <div className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
                                    <span>
                                        {tr('Used')} {formatNumber(level.used)}×
                                    </span>
                                    <span
                                        className={rateTone(level.solve_rate)}
                                    >
                                        {tr('Solved')}{' '}
                                        {formatPercent(level.solve_rate)}
                                    </span>
                                </div>
                                {low && (
                                    <p className="flex items-center gap-1 text-xs font-medium text-amber-600 dark:text-amber-400">
                                        <TriangleAlert className="size-3.5" />
                                        {tr('Needs')} {level.minimum}{' '}
                                        {tr('active words')}
                                    </p>
                                )}
                            </button>
                        );
                    })}
                </div>

                <Panel
                    title={tr('Words')}
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
                                    placeholder={tr('Search word or clue')}
                                    className={`${fieldClass} w-56 pl-9`}
                                    aria-label={tr('Search words')}
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
                                aria-label={tr('Status')}
                            >
                                <option value="">{tr('All status')}</option>
                                <option value="active">{tr('Active')}</option>
                                <option value="inactive">{tr('Hidden')}</option>
                            </select>
                        </div>
                    }
                >
                    {words.data.length === 0 ? (
                        <EmptyState
                            icon={Grid3x3}
                            title={tr('No words found')}
                            description={tr(
                                'Change the filters or add a new word.',
                            )}
                        />
                    ) : (
                        <div className="flex flex-col gap-4">
                            <ResponsiveTable
                                testId="crossword-words-table"
                                rows={words.data}
                                rowKey={(word) => word.id}
                                actions={(word) => (
                                    <WordActions
                                        word={word}
                                        onDelete={setDeleting}
                                    />
                                )}
                                columns={[
                                    {
                                        key: 'answer',
                                        header: tr('Answer'),
                                        primary: true,
                                        cell: (word) => (
                                            <span
                                                data-testid={`word-row-${word.answer}`}
                                            >
                                                <span className="font-mono font-semibold tracking-wider text-foreground">
                                                    {word.answer}
                                                </span>
                                                <span className="ml-2 text-xs font-normal text-muted-foreground">
                                                    {word.answer.length}
                                                </span>
                                            </span>
                                        ),
                                    },
                                    {
                                        key: 'clue',
                                        header: tr('Clue'),
                                        cellClassName: 'max-w-[340px]',
                                        cell: (word) => (
                                            <span className="flex flex-col">
                                                <span className="text-foreground">
                                                    {word.clue_id}
                                                </span>
                                                {word.clue_en && (
                                                    <span className="text-xs text-muted-foreground">
                                                        {word.clue_en}
                                                    </span>
                                                )}
                                            </span>
                                        ),
                                    },
                                    {
                                        key: 'level',
                                        header: tr('Level'),
                                        cellClassName: 'text-muted-foreground',
                                        cell: (word) => word.level,
                                    },
                                    {
                                        key: 'used',
                                        header: tr('Used'),
                                        align: 'right',
                                        cellClassName: 'tabular-nums',
                                        cell: (word) =>
                                            formatNumber(word.times_used),
                                    },
                                    {
                                        key: 'solved',
                                        header: tr('Solved'),
                                        align: 'right',
                                        cell: (word) => (
                                            <span
                                                className={cn(
                                                    'tabular-nums',
                                                    rateTone(word.solve_rate),
                                                )}
                                            >
                                                {formatPercent(word.solve_rate)}
                                            </span>
                                        ),
                                    },
                                    {
                                        key: 'status',
                                        header: tr('Status'),
                                        summary: true,
                                        cell: (word) => (
                                            <StatusPill
                                                active={word.is_active}
                                            />
                                        ),
                                    },
                                    {
                                        key: 'actions',
                                        header: (
                                            <span className="sr-only">
                                                {tr('Actions')}
                                            </span>
                                        ),
                                        hideInAccordion: true,
                                        cell: (word) => (
                                            <WordActions
                                                word={word}
                                                onDelete={setDeleting}
                                            />
                                        ),
                                    },
                                ]}
                            />
                            <SimplePagination {...words} />
                        </div>
                    )}
                </Panel>
            </div>

            <ConfirmDialog
                open={deleting !== null}
                title={tr('Delete word?')}
                message={
                    deleting &&
                    tr('“{0}” will be removed from level {1}.', [
                        deleting.answer,
                        deleting.level,
                    ])
                }
                confirmLabel={tr('Delete')}
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

function WordActions({
    word,
    onDelete,
}: {
    word: Word;
    onDelete: (word: Word) => void;
}) {
    return (
        <div className="flex justify-end gap-1">
            <Link
                href={`/admin/games/crossword/words/${word.id}/edit`}
                className="inline-flex size-8 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground"
                aria-label={tr('Edit {0}', [word.answer])}
            >
                <Pencil className="size-4" />
            </Link>
            <button
                type="button"
                onClick={() =>
                    router.patch(
                        `/admin/games/crossword/words/${word.id}/toggle`,
                        {},
                        { preserveScroll: true },
                    )
                }
                data-testid={`word-toggle-${word.answer}`}
                className="inline-flex size-8 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground"
                aria-label={
                    word.is_active
                        ? tr('Hide {0}', [word.answer])
                        : tr('Show {0}', [word.answer])
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
                onClick={() => onDelete(word)}
                className="inline-flex size-8 items-center justify-center rounded-lg text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                aria-label={tr('Delete {0}', [word.answer])}
            >
                <Trash2 className="size-4" />
            </button>
        </div>
    );
}
