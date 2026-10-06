import {
    ConfirmDialog,
    FlashMessages,
    StatusPill,
} from '@/components/admin/admin-kit';
import { fieldClass } from '@/components/admin/game-stats';
import { GameTabs } from '@/components/admin/game-tabs';
import AdminLayout from '@/layouts/admin-layout';
import { tr } from '@/lib/admin-i18n';
import { cn } from '@/lib/utils';
import { Head, Link, router, usePage } from '@inertiajs/react';
import {
    ArrowLeft,
    ArrowRight,
    Eye,
    EyeOff,
    Network,
    Pencil,
    Plus,
    Trash2,
    X,
} from 'lucide-react';
import { type FormEvent, useEffect, useState } from 'react';

interface Bin {
    key: string;
    name_id: string;
    name_en: string | null;
    color: string;
}

interface Item {
    label: string;
    hint_id: string | null;
    hint_en: string | null;
    bin: string;
    level: number;
}

interface SorterSet {
    id: number;
    key: string;
    title_id: string;
    title_en: string | null;
    description_id: string | null;
    description_en: string | null;
    bins: Bin[];
    items: Item[];
    is_active: boolean;
}

interface Limits {
    minBins: number;
    maxBins: number;
    maxItems: number;
    maxLabel: number;
    levels: number;
}

interface Props {
    sets: SorterSet[];
    limits: Limits;
}

type Draft = Omit<SorterSet, 'id'> & { id: number | null };

/** Bin palette offered for new bins (readable with white text). */
const PALETTE = [
    '#2563eb',
    '#c2410c',
    '#7c3aed',
    '#be185d',
    '#0f766e',
    '#4d7c0f',
];

const slug = (value: string) =>
    value
        .toLowerCase()
        .normalize('NFKD')
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '')
        .slice(0, 30);

const EMPTY: Draft = {
    id: null,
    key: '',
    title_id: '',
    title_en: '',
    description_id: '',
    description_en: '',
    bins: [
        { key: '', name_id: '', name_en: '', color: PALETTE[0] },
        { key: '', name_id: '', name_en: '', color: PALETTE[1] },
    ],
    items: [],
    is_active: true,
};

export default function SorterSetsIndex({ sets, limits }: Props) {
    const { errors } = usePage<{ errors: Record<string, string> }>().props;
    const [draft, setDraft] = useState<Draft | null>(null);
    const [deleting, setDeleting] = useState<SorterSet | null>(null);
    const [processing, setProcessing] = useState(false);

    return (
        <AdminLayout>
            <Head title={tr('Sorter Bank')} />
            <div className="flex flex-col gap-6">
                <div className="flex flex-col gap-4">
                    <Link
                        href="/admin/games"
                        className="inline-flex w-fit items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
                    >
                        <ArrowLeft className="size-4" />
                        {tr('All games')}
                    </Link>
                    <GameTabs game="port-sorter" active="sets" />
                </div>
                <div className="flex flex-wrap items-end justify-between gap-4">
                    <div>
                        <h1 className="text-2xl font-bold text-foreground">
                            {tr('Sorter Bank')}
                        </h1>
                        <p className="text-sm text-muted-foreground">
                            {tr(
                                'Port Sorter topics. Each set has its own bins (',
                            )}
                            {limits.minBins}–{limits.maxBins}
                            {tr(
                                ") and the items that fall into them. The game service syncs active sets every minute and never reveals an item's bin while it falls.",
                            )}
                        </p>
                    </div>
                    <button
                        type="button"
                        onClick={() =>
                            setDraft({
                                ...EMPTY,
                                bins: EMPTY.bins.map((bin) => ({ ...bin })),
                                items: [],
                            })
                        }
                        data-testid="sorter-new"
                        className="inline-flex h-9 items-center gap-2 rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground hover:bg-primary/90"
                    >
                        <Plus className="size-4" />
                        {tr('New sorter set')}
                    </button>
                </div>

                <FlashMessages errors={errors} />

                <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                    {sets.map((set) => (
                        <article
                            key={set.id}
                            data-testid={`sorter-card-${set.key}`}
                            className={cn(
                                'flex flex-col gap-3 rounded-2xl border border-border bg-card p-4 shadow-sm',
                                !set.is_active && 'opacity-70',
                            )}
                        >
                            <div className="flex items-start justify-between gap-2">
                                <div className="flex min-w-0 items-start gap-2">
                                    <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-teal-100 text-teal-800 dark:bg-teal-900/50 dark:text-teal-200">
                                        <Network className="size-4" />
                                    </span>
                                    <div className="min-w-0">
                                        <h3 className="leading-tight font-semibold text-foreground">
                                            {set.title_id}
                                        </h3>
                                        <p className="text-xs text-muted-foreground">
                                            {set.bins.length} {tr('bins ·')}{' '}
                                            {set.items.length} {tr('items')}
                                        </p>
                                    </div>
                                </div>
                                <StatusPill active={set.is_active} />
                            </div>
                            <ul className="flex flex-col gap-1.5 text-sm">
                                {set.bins.map((bin) => {
                                    const items = set.items.filter(
                                        (item) => item.bin === bin.key,
                                    );
                                    return (
                                        <li
                                            key={bin.key}
                                            className="flex items-start gap-2"
                                        >
                                            <span
                                                className="shrink-0 rounded-md px-2 py-0.5 text-xs font-bold text-white"
                                                style={{
                                                    background: bin.color,
                                                }}
                                            >
                                                {bin.name_id}
                                            </span>
                                            <span className="min-w-0 truncate text-xs text-muted-foreground">
                                                {items
                                                    .map((item) => item.label)
                                                    .join(', ') || '–'}
                                            </span>
                                        </li>
                                    );
                                })}
                            </ul>
                            <div className="mt-auto flex flex-wrap gap-2">
                                <button
                                    type="button"
                                    onClick={() =>
                                        setDraft({
                                            ...set,
                                            bins: set.bins.map((bin) => ({
                                                ...bin,
                                            })),
                                            items: set.items.map((item) => ({
                                                ...item,
                                            })),
                                        })
                                    }
                                    data-testid={`sorter-edit-${set.key}`}
                                    className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-border px-3 text-xs font-medium text-foreground hover:bg-muted"
                                >
                                    <Pencil className="size-3.5" />
                                    {tr('Edit')}
                                </button>
                                <button
                                    type="button"
                                    onClick={() =>
                                        router.patch(
                                            `/admin/games/port-sorter/sets/${set.id}/toggle`,
                                            {},
                                            { preserveScroll: true },
                                        )
                                    }
                                    className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-border px-3 text-xs font-medium text-foreground hover:bg-muted"
                                >
                                    {set.is_active ? (
                                        <EyeOff className="size-3.5" />
                                    ) : (
                                        <Eye className="size-3.5" />
                                    )}
                                    {set.is_active ? tr('Hide') : tr('Show')}
                                </button>
                                <button
                                    type="button"
                                    onClick={() => setDeleting(set)}
                                    className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-red-200 px-3 text-xs font-medium text-red-700 hover:bg-red-50 dark:border-red-900/60 dark:text-red-300 dark:hover:bg-red-950/40"
                                >
                                    <Trash2 className="size-3.5" />
                                    {tr('Delete')}
                                </button>
                            </div>
                        </article>
                    ))}
                </div>
            </div>

            {draft && (
                <SetEditor
                    draft={draft}
                    limits={limits}
                    onClose={() => setDraft(null)}
                />
            )}

            <ConfirmDialog
                open={deleting !== null}
                title={tr('Delete sorter set?')}
                message={
                    <>
                        <strong>{deleting?.title_id}</strong>{' '}
                        {tr(
                            'is removed from the bank. Players can no longer pick it.',
                        )}
                    </>
                }
                confirmLabel={tr('Delete')}
                processing={processing}
                onClose={() => setDeleting(null)}
                onConfirm={() => {
                    if (!deleting) {
                        return;
                    }
                    setProcessing(true);
                    router.delete(
                        `/admin/games/port-sorter/sets/${deleting.id}`,
                        {
                            preserveScroll: true,
                            onFinish: () => {
                                setProcessing(false);
                                setDeleting(null);
                            },
                        },
                    );
                }}
            />
        </AdminLayout>
    );
}

function SetEditor({
    draft: initial,
    limits,
    onClose,
}: {
    draft: Draft;
    limits: Limits;
    onClose: () => void;
}) {
    const { errors } = usePage<{ errors: Record<string, string> }>().props;
    const [draft, setDraft] = useState<Draft>(() => ({
        ...initial,
        bins: initial.bins.map((bin) => ({
            ...bin,
            key: bin.key || slug(bin.name_id),
        })),
    }));
    const [processing, setProcessing] = useState(false);

    useEffect(() => {
        const onKey = (event: KeyboardEvent) => {
            if (event.key === 'Escape' && !processing) {
                onClose();
            }
        };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, [onClose, processing]);

    const set = <K extends keyof Draft>(key: K, value: Draft[K]) =>
        setDraft((current) => ({ ...current, [key]: value }));

    /** Renaming a bin keeps its items attached (bin keys follow names on new bins). */
    const setBin = (index: number, patch: Partial<Bin>) =>
        setDraft((current) => {
            const before = current.bins[index];
            const next = { ...before, ...patch };
            if (patch.name_id !== undefined && !initial.bins[index]?.key) {
                next.key = slug(patch.name_id);
            }
            return {
                ...current,
                bins: current.bins.map((bin, i) => (i === index ? next : bin)),
                items: current.items.map((item) =>
                    item.bin === before.key ? { ...item, bin: next.key } : item,
                ),
            };
        });

    const moveBin = (index: number, by: number) =>
        setDraft((current) => {
            const bins = [...current.bins];
            const target = index + by;
            if (target < 0 || target >= bins.length) {
                return current;
            }
            [bins[index], bins[target]] = [bins[target], bins[index]];
            return { ...current, bins };
        });

    const removeBin = (index: number) =>
        setDraft((current) => {
            const removed = current.bins[index];
            return {
                ...current,
                bins: current.bins.filter((_, i) => i !== index),
                items: current.items.filter((item) => item.bin !== removed.key),
            };
        });

    const setItem = (index: number, patch: Partial<Item>) =>
        setDraft((current) => ({
            ...current,
            items: current.items.map((item, i) =>
                i === index ? { ...item, ...patch } : item,
            ),
        }));

    const submit = (event: FormEvent) => {
        event.preventDefault();
        setProcessing(true);
        const options = {
            preserveScroll: true,
            onSuccess: onClose,
            onFinish: () => setProcessing(false),
        };
        const payload = { ...draft } as Record<string, unknown>;
        delete payload.id;
        if (draft.id) {
            router.put(
                `/admin/games/port-sorter/sets/${draft.id}`,
                payload as never,
                options,
            );
        } else {
            router.post(
                '/admin/games/port-sorter/sets',
                payload as never,
                options,
            );
        }
    };

    const binError = (index: number) =>
        errors[`bins.${index}.name_id`] ??
        errors[`bins.${index}.key`] ??
        errors[`bins.${index}.color`];
    const itemError = (index: number) =>
        errors[`items.${index}.label`] ??
        errors[`items.${index}.bin`] ??
        errors[`items.${index}.level`];

    return (
        <div
            className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 p-0 sm:items-center sm:p-4"
            onPointerDown={(event) => {
                if (event.target === event.currentTarget && !processing) {
                    onClose();
                }
            }}
        >
            <form
                onSubmit={submit}
                role="dialog"
                aria-modal="true"
                aria-labelledby="sorter-editor-title"
                data-testid="sorter-editor"
                className="flex max-h-[92dvh] w-full max-w-3xl flex-col overflow-hidden rounded-t-2xl border border-border bg-card shadow-xl sm:rounded-2xl dark:border-white/15 dark:shadow-[0_0_24px_rgb(255_255_255/0.06)]"
            >
                <header className="flex items-center justify-between gap-3 border-b border-border px-5 py-4">
                    <h2
                        id="sorter-editor-title"
                        className="font-semibold text-foreground"
                    >
                        {draft.id
                            ? tr('Edit sorter set')
                            : tr('New sorter set')}
                    </h2>
                    <button
                        type="button"
                        onClick={onClose}
                        aria-label={tr('Close')}
                        className="grid size-8 place-items-center rounded-lg text-muted-foreground hover:bg-muted"
                    >
                        <X className="size-4" />
                    </button>
                </header>
                <div className="flex flex-col gap-5 overflow-y-auto px-5 py-4">
                    <div className="grid gap-3 sm:grid-cols-2">
                        <Field
                            label={tr('Title (Indonesian)')}
                            error={errors.title_id}
                        >
                            <input
                                className={fieldClass}
                                value={draft.title_id}
                                onChange={(e) =>
                                    set('title_id', e.target.value)
                                }
                                data-testid="sorter-title"
                                required
                            />
                        </Field>
                        <Field
                            label={tr('Title (English)')}
                            error={errors.title_en}
                        >
                            <input
                                className={fieldClass}
                                value={draft.title_en ?? ''}
                                onChange={(e) =>
                                    set('title_en', e.target.value)
                                }
                            />
                        </Field>
                        <Field
                            label={tr('Instruction (Indonesian)')}
                            error={errors.description_id}
                        >
                            <input
                                className={fieldClass}
                                value={draft.description_id ?? ''}
                                onChange={(e) =>
                                    set('description_id', e.target.value)
                                }
                            />
                        </Field>
                        <Field
                            label={tr('Instruction (English)')}
                            error={errors.description_en}
                        >
                            <input
                                className={fieldClass}
                                value={draft.description_en ?? ''}
                                onChange={(e) =>
                                    set('description_en', e.target.value)
                                }
                            />
                        </Field>
                    </div>

                    <section className="flex flex-col gap-2">
                        <div className="flex items-center justify-between">
                            <h3 className="text-sm font-semibold text-foreground">
                                {tr('Bins (left to right)')}
                            </h3>
                            <span className="text-xs text-muted-foreground">
                                {draft.bins.length}/{limits.maxBins}
                            </span>
                        </div>
                        {errors.bins && (
                            <p className="text-xs text-red-600">
                                {errors.bins}
                            </p>
                        )}
                        {draft.bins.map((bin, index) => (
                            <div
                                key={index}
                                className="flex flex-wrap items-center gap-2 rounded-xl border border-border p-2"
                                data-testid={`sorter-bin-${index}`}
                            >
                                <input
                                    type="color"
                                    aria-label={tr('Bin {0} colour', [
                                        index + 1,
                                    ])}
                                    className="h-9 w-10 cursor-pointer rounded-lg border border-border bg-background"
                                    value={bin.color}
                                    onChange={(e) =>
                                        setBin(index, { color: e.target.value })
                                    }
                                />
                                <input
                                    aria-label={tr(
                                        'Bin {0} name (Indonesian)',
                                        [index + 1],
                                    )}
                                    placeholder={tr('Name (ID), e.g. HTTP/WEB')}
                                    className={cn(fieldClass, 'min-w-0 flex-1')}
                                    value={bin.name_id}
                                    maxLength={24}
                                    onChange={(e) =>
                                        setBin(index, {
                                            name_id: e.target.value,
                                        })
                                    }
                                    required
                                />
                                <input
                                    aria-label={tr('Bin {0} name (English)', [
                                        index + 1,
                                    ])}
                                    placeholder={tr('Name (EN)')}
                                    className={cn(fieldClass, 'min-w-0 flex-1')}
                                    value={bin.name_en ?? ''}
                                    maxLength={24}
                                    onChange={(e) =>
                                        setBin(index, {
                                            name_en: e.target.value,
                                        })
                                    }
                                />
                                <span
                                    className="rounded-md px-2 py-1 text-xs font-bold text-white"
                                    style={{ background: bin.color }}
                                >
                                    {bin.name_id || tr('Bin {0}', [index + 1])}
                                </span>
                                <div className="flex gap-1">
                                    <IconButton
                                        label={tr('Move left')}
                                        disabled={index === 0}
                                        onClick={() => moveBin(index, -1)}
                                    >
                                        <ArrowLeft className="size-3.5" />
                                    </IconButton>
                                    <IconButton
                                        label={tr('Move right')}
                                        disabled={
                                            index === draft.bins.length - 1
                                        }
                                        onClick={() => moveBin(index, 1)}
                                    >
                                        <ArrowRight className="size-3.5" />
                                    </IconButton>
                                    <IconButton
                                        label={tr('Remove bin and its items')}
                                        disabled={
                                            draft.bins.length <= limits.minBins
                                        }
                                        onClick={() => removeBin(index)}
                                    >
                                        <Trash2 className="size-3.5" />
                                    </IconButton>
                                </div>
                                {binError(index) && (
                                    <p className="w-full text-xs text-red-600">
                                        {binError(index)}
                                    </p>
                                )}
                            </div>
                        ))}
                        <button
                            type="button"
                            disabled={draft.bins.length >= limits.maxBins}
                            onClick={() =>
                                setDraft((current) => ({
                                    ...current,
                                    bins: [
                                        ...current.bins,
                                        {
                                            key: '',
                                            name_id: '',
                                            name_en: '',
                                            color: PALETTE[
                                                current.bins.length %
                                                    PALETTE.length
                                            ],
                                        },
                                    ],
                                }))
                            }
                            data-testid="sorter-add-bin"
                            className="inline-flex h-9 items-center justify-center gap-2 rounded-lg border border-dashed border-border text-sm text-foreground hover:bg-muted disabled:opacity-50"
                        >
                            <Plus className="size-4" />
                            {tr('Add bin')}
                        </button>
                    </section>

                    <section className="flex flex-col gap-2">
                        <div className="flex items-center justify-between">
                            <h3 className="text-sm font-semibold text-foreground">
                                {tr('Falling items')}
                            </h3>
                            <span className="text-xs text-muted-foreground">
                                {draft.items.length}/{limits.maxItems}{' '}
                                {tr('· level 1 must mix at least two bins')}
                            </span>
                        </div>
                        {errors.items && (
                            <p className="text-xs text-red-600">
                                {errors.items}
                            </p>
                        )}
                        {draft.items.map((item, index) => (
                            <div
                                key={index}
                                className="flex flex-wrap items-center gap-2 rounded-xl border border-border p-2"
                                data-testid={`sorter-item-${index}`}
                            >
                                <input
                                    aria-label={tr('Item {0} label', [
                                        index + 1,
                                    ])}
                                    placeholder={tr('Label, e.g. 443')}
                                    className={cn(fieldClass, 'w-28')}
                                    value={item.label}
                                    maxLength={limits.maxLabel}
                                    onChange={(e) =>
                                        setItem(index, {
                                            label: e.target.value,
                                        })
                                    }
                                    required
                                />
                                <input
                                    aria-label={tr(
                                        'Item {0} hint (Indonesian)',
                                        [index + 1],
                                    )}
                                    placeholder={tr('Hint (ID), e.g. HTTPS')}
                                    className={cn(fieldClass, 'min-w-0 flex-1')}
                                    value={item.hint_id ?? ''}
                                    maxLength={40}
                                    onChange={(e) =>
                                        setItem(index, {
                                            hint_id: e.target.value,
                                        })
                                    }
                                />
                                <input
                                    aria-label={tr('Item {0} hint (English)', [
                                        index + 1,
                                    ])}
                                    placeholder={tr('Hint (EN)')}
                                    className={cn(fieldClass, 'min-w-0 flex-1')}
                                    value={item.hint_en ?? ''}
                                    maxLength={40}
                                    onChange={(e) =>
                                        setItem(index, {
                                            hint_en: e.target.value,
                                        })
                                    }
                                />
                                <select
                                    aria-label={tr('Item {0} bin', [index + 1])}
                                    className={cn(fieldClass, 'w-36')}
                                    value={item.bin}
                                    onChange={(e) =>
                                        setItem(index, { bin: e.target.value })
                                    }
                                    required
                                >
                                    <option value="" disabled>
                                        {tr('Bin…')}
                                    </option>
                                    {draft.bins.map((bin, binIndex) => (
                                        <option
                                            key={binIndex}
                                            value={bin.key}
                                            disabled={!bin.key}
                                        >
                                            {bin.name_id ||
                                                tr('Bin {0}', [binIndex + 1])}
                                        </option>
                                    ))}
                                </select>
                                <select
                                    aria-label={tr('Item {0} first level', [
                                        index + 1,
                                    ])}
                                    className={cn(fieldClass, 'w-24')}
                                    value={item.level}
                                    onChange={(e) =>
                                        setItem(index, {
                                            level: Number(e.target.value),
                                        })
                                    }
                                >
                                    {Array.from(
                                        { length: limits.levels },
                                        (_, level) => (
                                            <option
                                                key={level}
                                                value={level + 1}
                                            >
                                                {tr('Lv')} {level + 1}
                                            </option>
                                        ),
                                    )}
                                </select>
                                <IconButton
                                    label={tr('Remove item')}
                                    onClick={() =>
                                        setDraft((current) => ({
                                            ...current,
                                            items: current.items.filter(
                                                (_, i) => i !== index,
                                            ),
                                        }))
                                    }
                                >
                                    <Trash2 className="size-3.5" />
                                </IconButton>
                                {itemError(index) && (
                                    <p className="w-full text-xs text-red-600">
                                        {itemError(index)}
                                    </p>
                                )}
                            </div>
                        ))}
                        <button
                            type="button"
                            disabled={draft.items.length >= limits.maxItems}
                            onClick={() =>
                                setDraft((current) => ({
                                    ...current,
                                    items: [
                                        ...current.items,
                                        {
                                            label: '',
                                            hint_id: '',
                                            hint_en: '',
                                            bin:
                                                current.bins[
                                                    current.items.length %
                                                        current.bins.length
                                                ]?.key ?? '',
                                            level: 1,
                                        },
                                    ],
                                }))
                            }
                            data-testid="sorter-add-item"
                            className="inline-flex h-9 items-center justify-center gap-2 rounded-lg border border-dashed border-border text-sm text-foreground hover:bg-muted disabled:opacity-50"
                        >
                            <Plus className="size-4" />
                            {tr('Add item')}
                        </button>
                    </section>

                    <label className="flex items-center gap-2 text-sm text-foreground">
                        <input
                            type="checkbox"
                            checked={draft.is_active}
                            onChange={(e) => set('is_active', e.target.checked)}
                        />
                        {tr('Active in games')}
                    </label>
                </div>
                <footer className="flex justify-end gap-2 border-t border-border px-5 py-3">
                    <button
                        type="button"
                        onClick={onClose}
                        className="h-9 rounded-lg border border-border px-4 text-sm text-foreground hover:bg-muted"
                    >
                        {tr('Cancel')}
                    </button>
                    <button
                        type="submit"
                        disabled={processing}
                        data-testid="sorter-save"
                        className="h-9 rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
                    >
                        {tr('Save')}
                    </button>
                </footer>
            </form>
        </div>
    );
}

function Field({
    label,
    error,
    children,
}: {
    label: string;
    error?: string;
    children: React.ReactNode;
}) {
    return (
        <label className="flex flex-col gap-1 text-sm">
            <span className="font-medium text-foreground">{tr(label)}</span>
            {children}
            {error && <span className="text-xs text-red-600">{error}</span>}
        </label>
    );
}

function IconButton({
    label,
    disabled,
    onClick,
    children,
}: {
    label: string;
    disabled?: boolean;
    onClick: () => void;
    children: React.ReactNode;
}) {
    return (
        <button
            type="button"
            aria-label={tr(label)}
            title={tr(label)}
            disabled={disabled}
            onClick={onClick}
            className="grid size-8 place-items-center rounded-lg border border-border text-foreground hover:bg-muted disabled:opacity-40"
        >
            {children}
        </button>
    );
}
