import {
    ConfirmDialog,
    FlashMessages,
    StatusPill,
} from '@/components/admin/admin-kit';
import {
    EmptyState,
    Panel,
    fieldClass,
    formatNumber,
    formatPercent,
} from '@/components/admin/game-stats';
import AdminLayout from '@/layouts/admin-layout';
import { cn } from '@/lib/utils';
import { Head, router, usePage } from '@inertiajs/react';
import {
    ArrowDown,
    ArrowUp,
    Cable,
    ChartColumnBig,
    Eye,
    EyeOff,
    Network,
    Pencil,
    Plus,
    Trash2,
    X,
} from 'lucide-react';
import { type FormEvent, useEffect, useState } from 'react';

interface Item {
    label_id: string;
    label_en: string | null;
    color?: string | null;
    stripe?: string | null;
}

interface End {
    id: string;
    en: string | null;
}

interface SetStats {
    key: string;
    attempts: number;
    solved: number;
    wrong: number;
    players: number;
    error_rate: number | null;
    avg_ms: number | null;
    slot_errors: number[];
    worst_slot: number | null;
    labels: string[];
    title: string;
    category: string;
}

interface SequenceSet {
    id: number;
    key: string;
    category: string;
    kind: 'cable' | 'protocol';
    title_id: string;
    title_en: string | null;
    description_id: string | null;
    description_en: string | null;
    items: Item[];
    /** Cable crimped on both sides: end A pieces, then end B pieces. */
    ends: End[] | null;
    is_active: boolean;
    stats: SetStats | null;
}

interface Props {
    sets: SequenceSet[];
    analytics: SetStats[];
    days: number;
    kinds: string[];
    limits: { min: number; max: number };
}

type Draft = Omit<SequenceSet, 'id' | 'stats'> & { id: number | null };

const EMPTY: Draft = {
    id: null,
    key: '',
    category: '',
    kind: 'protocol',
    title_id: '',
    title_en: '',
    description_id: '',
    description_en: '',
    items: [
        { label_id: '', label_en: '' },
        { label_id: '', label_en: '' },
        { label_id: '', label_en: '' },
    ],
    ends: null,
    is_active: true,
};

const DEFAULT_ENDS: End[] = [
    { id: 'Ujung A', en: 'End A' },
    { id: 'Ujung B', en: 'End B' },
];

/** Pieces per connector end (the whole set when it has one end). */
function piecesPerEnd(set: { items: unknown[]; ends: End[] | null }): number {
    return set.ends
        ? Math.ceil(set.items.length / set.ends.length)
        : set.items.length;
}

/** Small cable swatch: solid core, or white with a coloured stripe. */
export function Swatch({ item }: { item: Item }) {
    if (!item.color) {
        return null;
    }
    return (
        <span
            aria-hidden="true"
            className="inline-block h-3 w-6 shrink-0 rounded-sm border border-black/20"
            style={{
                background: item.stripe
                    ? `repeating-linear-gradient(135deg, ${item.color} 0 4px, ${item.stripe} 4px 8px)`
                    : item.color,
            }}
        />
    );
}

function seconds(ms: number | null): string {
    return ms === null ? '–' : `${(ms / 1000).toFixed(1)} s`;
}

export default function SequenceSetsIndex({
    sets,
    analytics,
    days,
    kinds,
    limits,
}: Props) {
    const { errors } = usePage<{ errors: Record<string, string> }>().props;
    const [draft, setDraft] = useState<Draft | null>(null);
    const [deleting, setDeleting] = useState<SequenceSet | null>(null);
    const [processing, setProcessing] = useState(false);

    const totalAttempts = analytics.reduce((sum, row) => sum + row.attempts, 0);
    const hardest = analytics.find((row) => row.attempts > 0) ?? null;

    return (
        <AdminLayout>
            <Head title="Sequence Bank" />
            <div className="flex flex-col gap-6">
                <div className="flex flex-wrap items-end justify-between gap-4">
                    <div>
                        <h1 className="text-2xl font-bold text-foreground">
                            Sequence Bank
                        </h1>
                        <p className="text-sm text-muted-foreground">
                            Order Rush (TKJ) sequences. Pieces are stored in the
                            correct order; the game service syncs active sets
                            every minute and never sends the order to players.
                        </p>
                    </div>
                    <button
                        type="button"
                        onClick={() => setDraft({ ...EMPTY })}
                        data-testid="sequence-new"
                        className="inline-flex h-9 items-center gap-2 rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground hover:bg-primary/90"
                    >
                        <Plus className="size-4" />
                        New sequence
                    </button>
                </div>

                <FlashMessages errors={errors} />

                <Panel
                    title="Most misunderstood sequences"
                    description={`Wrong orders per sequence and the slot students miss most, last ${days} days.`}
                    icon={ChartColumnBig}
                    actions={
                        <div className="flex gap-1">
                            {[7, 30, 90].map((value) => (
                                <button
                                    key={value}
                                    type="button"
                                    onClick={() =>
                                        router.get(
                                            '/admin/sequence-sets',
                                            { days: value },
                                            { preserveScroll: true },
                                        )
                                    }
                                    aria-pressed={days === value}
                                    className={cn(
                                        'h-8 rounded-lg border px-3 text-xs font-medium',
                                        days === value
                                            ? 'border-primary bg-primary text-primary-foreground'
                                            : 'border-border bg-background text-foreground hover:bg-muted',
                                    )}
                                >
                                    {value}d
                                </button>
                            ))}
                        </div>
                    }
                >
                    {totalAttempts === 0 ? (
                        <EmptyState
                            icon={ChartColumnBig}
                            title="No Order Rush games yet"
                            description="Analytics appear after the first finished game."
                        />
                    ) : (
                        <div className="flex flex-col gap-4">
                            {hardest && (
                                <p
                                    className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800 dark:border-red-900/60 dark:bg-red-950/40 dark:text-red-200"
                                    data-testid="sequence-hardest"
                                >
                                    Hardest: <strong>{hardest.title}</strong> —{' '}
                                    {formatPercent(hardest.error_rate)} wrong
                                    orders
                                    {hardest.worst_slot !== null && (
                                        <>
                                            , most often at slot{' '}
                                            {hardest.worst_slot + 1}
                                            {hardest.labels[hardest.worst_slot]
                                                ? ` (${hardest.labels[hardest.worst_slot]})`
                                                : ''}
                                        </>
                                    )}
                                    .
                                </p>
                            )}
                            <div className="overflow-x-auto">
                                <table
                                    className="w-full min-w-[640px] text-sm"
                                    data-testid="sequence-analytics"
                                >
                                    <thead>
                                        <tr className="border-b border-border text-left text-xs text-muted-foreground uppercase">
                                            <th className="py-2 pr-3">
                                                Sequence
                                            </th>
                                            <th className="py-2 pr-3 text-right">
                                                Players
                                            </th>
                                            <th className="py-2 pr-3 text-right">
                                                Orders
                                            </th>
                                            <th className="py-2 pr-3 text-right">
                                                Wrong
                                            </th>
                                            <th className="py-2 pr-3 text-right">
                                                Avg solve
                                            </th>
                                            <th className="py-2">
                                                Wrong slots
                                            </th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {analytics.map((row) => (
                                            <tr
                                                key={row.key}
                                                className="border-b border-border/60 last:border-0"
                                            >
                                                <td className="py-2 pr-3 font-medium text-foreground">
                                                    {row.title}
                                                    <span className="block text-xs text-muted-foreground">
                                                        {row.category}
                                                    </span>
                                                </td>
                                                <td className="py-2 pr-3 text-right tabular-nums">
                                                    {formatNumber(row.players)}
                                                </td>
                                                <td className="py-2 pr-3 text-right tabular-nums">
                                                    {formatNumber(row.attempts)}
                                                </td>
                                                <td className="py-2 pr-3 text-right font-semibold text-red-600 tabular-nums dark:text-red-400">
                                                    {formatPercent(
                                                        row.error_rate,
                                                    )}
                                                </td>
                                                <td className="py-2 pr-3 text-right tabular-nums">
                                                    {seconds(row.avg_ms)}
                                                </td>
                                                <td className="py-2">
                                                    <SlotHeat row={row} />
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    )}
                </Panel>

                <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                    {sets.map((set) => (
                        <article
                            key={set.id}
                            data-testid={`sequence-card-${set.key}`}
                            className={cn(
                                'flex flex-col gap-3 rounded-2xl border border-border bg-card p-4 shadow-sm',
                                !set.is_active && 'opacity-70',
                            )}
                        >
                            <div className="flex items-start justify-between gap-2">
                                <div className="flex min-w-0 items-start gap-2">
                                    <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-teal-100 text-teal-800 dark:bg-teal-900/50 dark:text-teal-200">
                                        {set.kind === 'cable' ? (
                                            <Cable className="size-4" />
                                        ) : (
                                            <Network className="size-4" />
                                        )}
                                    </span>
                                    <div className="min-w-0">
                                        <h3 className="leading-tight font-semibold text-foreground">
                                            {set.title_id}
                                        </h3>
                                        <p className="text-xs text-muted-foreground">
                                            {set.category} · {set.items.length}{' '}
                                            pieces
                                        </p>
                                    </div>
                                </div>
                                <StatusPill active={set.is_active} />
                            </div>
                            <ol className="flex flex-col gap-1 text-sm">
                                {set.items.map((item, index) => (
                                    <li
                                        key={index}
                                        className="flex flex-wrap items-center gap-2"
                                    >
                                        {set.ends &&
                                            index % piecesPerEnd(set) === 0 && (
                                                <span className="mt-1 w-full text-xs font-semibold text-teal-700 dark:text-teal-300">
                                                    {
                                                        set.ends[
                                                            index /
                                                                piecesPerEnd(
                                                                    set,
                                                                )
                                                        ]?.id
                                                    }
                                                </span>
                                            )}
                                        <span className="w-5 text-right text-xs text-muted-foreground tabular-nums">
                                            {(index % piecesPerEnd(set)) + 1}
                                        </span>
                                        <Swatch item={item} />
                                        <span className="truncate text-foreground">
                                            {item.label_id}
                                        </span>
                                    </li>
                                ))}
                            </ol>
                            {set.stats && (
                                <p className="text-xs text-muted-foreground">
                                    {formatNumber(set.stats.attempts)} orders ·{' '}
                                    {formatPercent(set.stats.error_rate)} wrong
                                </p>
                            )}
                            <div className="mt-auto flex flex-wrap gap-2">
                                <button
                                    type="button"
                                    onClick={() =>
                                        setDraft({
                                            ...set,
                                            items: set.items.map((item) => ({
                                                ...item,
                                            })),
                                            ends: set.ends
                                                ? set.ends.map((end) => ({
                                                      ...end,
                                                  }))
                                                : null,
                                        })
                                    }
                                    className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-border px-3 text-xs font-medium text-foreground hover:bg-muted"
                                >
                                    <Pencil className="size-3.5" />
                                    Edit
                                </button>
                                <button
                                    type="button"
                                    onClick={() =>
                                        router.patch(
                                            `/admin/sequence-sets/${set.id}/toggle`,
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
                                    {set.is_active ? 'Hide' : 'Show'}
                                </button>
                                <button
                                    type="button"
                                    onClick={() => setDeleting(set)}
                                    className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-red-200 px-3 text-xs font-medium text-red-700 hover:bg-red-50 dark:border-red-900/60 dark:text-red-300 dark:hover:bg-red-950/40"
                                >
                                    <Trash2 className="size-3.5" />
                                    Delete
                                </button>
                            </div>
                        </article>
                    ))}
                </div>
            </div>

            {draft && (
                <SetEditor
                    draft={draft}
                    kinds={kinds}
                    limits={limits}
                    onClose={() => setDraft(null)}
                />
            )}

            <ConfirmDialog
                open={deleting !== null}
                title="Delete sequence set?"
                message={
                    <>
                        <strong>{deleting?.title_id}</strong> is removed from
                        the bank. Past analytics stay.
                    </>
                }
                confirmLabel="Delete"
                processing={processing}
                onClose={() => setDeleting(null)}
                onConfirm={() => {
                    if (!deleting) {
                        return;
                    }
                    setProcessing(true);
                    router.delete(`/admin/sequence-sets/${deleting.id}`, {
                        preserveScroll: true,
                        onFinish: () => {
                            setProcessing(false);
                            setDeleting(null);
                        },
                    });
                }}
            />
        </AdminLayout>
    );
}

function SlotHeat({ row }: { row: SetStats }) {
    const peak = Math.max(1, ...row.slot_errors);
    if (row.slot_errors.every((count) => count === 0)) {
        return <span className="text-xs text-muted-foreground">–</span>;
    }
    return (
        <div className="flex flex-wrap gap-1">
            {row.slot_errors.map((count, index) => (
                <span
                    key={index}
                    title={`Slot ${index + 1}${row.labels[index] ? ` (${row.labels[index]})` : ''}: ${count} wrong`}
                    className="grid size-7 place-items-center rounded-md border border-red-300/60 text-[11px] font-semibold tabular-nums dark:border-red-800/60"
                    style={{
                        background: `rgb(220 38 38 / ${(count / peak) * 0.85})`,
                        color: count / peak > 0.5 ? '#fff' : undefined,
                    }}
                >
                    {index + 1}
                </span>
            ))}
        </div>
    );
}

function SetEditor({
    draft: initial,
    kinds,
    limits,
    onClose,
}: {
    draft: Draft;
    kinds: string[];
    limits: { min: number; max: number };
    onClose: () => void;
}) {
    const { errors } = usePage<{ errors: Record<string, string> }>().props;
    const [draft, setDraft] = useState<Draft>(initial);
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
    const setItem = (index: number, patch: Partial<Item>) =>
        setDraft((current) => ({
            ...current,
            items: current.items.map((item, i) =>
                i === index ? { ...item, ...patch } : item,
            ),
        }));
    const move = (index: number, by: number) =>
        setDraft((current) => {
            const items = [...current.items];
            const target = index + by;
            if (target < 0 || target >= items.length) {
                return current;
            }
            [items[index], items[target]] = [items[target], items[index]];
            return { ...current, items };
        });

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
        if (draft.kind !== 'cable') {
            payload.ends = null;
        }
        if (draft.id) {
            router.put(
                `/admin/sequence-sets/${draft.id}`,
                payload as never,
                options,
            );
        } else {
            router.post('/admin/sequence-sets', payload as never, options);
        }
    };

    const cable = draft.kind === 'cable';
    const twoEnd = cable && draft.ends !== null;
    const perEnd = twoEnd ? Math.ceil(draft.items.length / 2) : 0;
    const maxItems = twoEnd ? limits.max * 2 : limits.max;
    const setEnd = (index: number, patch: Partial<End>) =>
        setDraft((current) => ({
            ...current,
            ends: (current.ends ?? DEFAULT_ENDS).map((end, i) =>
                i === index ? { ...end, ...patch } : end,
            ),
        }));
    /** Two ends: copy end A so end B starts from the same wiring. */
    const toggleTwoEnd = (on: boolean) =>
        setDraft((current) => ({
            ...current,
            ends: on ? DEFAULT_ENDS.map((end) => ({ ...end })) : null,
            items: on
                ? [
                      ...current.items,
                      ...current.items.map((item) => ({ ...item })),
                  ]
                : current.items.slice(0, Math.ceil(current.items.length / 2)),
        }));

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
                aria-labelledby="sequence-editor-title"
                data-testid="sequence-editor"
                className="flex max-h-[92dvh] w-full max-w-2xl flex-col overflow-hidden rounded-t-2xl border border-border bg-card shadow-xl sm:rounded-2xl dark:border-white/15 dark:shadow-[0_0_24px_rgb(255_255_255/0.06)]"
            >
                <header className="flex items-center justify-between gap-3 border-b border-border px-5 py-4">
                    <h2
                        id="sequence-editor-title"
                        className="font-semibold text-foreground"
                    >
                        {draft.id ? 'Edit sequence' : 'New sequence'}
                    </h2>
                    <button
                        type="button"
                        onClick={onClose}
                        aria-label="Close"
                        className="grid size-8 place-items-center rounded-lg text-muted-foreground hover:bg-muted"
                    >
                        <X className="size-4" />
                    </button>
                </header>
                <div className="flex flex-col gap-4 overflow-y-auto px-5 py-4">
                    <div className="grid gap-3 sm:grid-cols-2">
                        <Field
                            label="Title (Indonesian)"
                            error={errors.title_id}
                        >
                            <input
                                className={fieldClass}
                                value={draft.title_id}
                                onChange={(e) =>
                                    set('title_id', e.target.value)
                                }
                                required
                            />
                        </Field>
                        <Field label="Title (English)" error={errors.title_en}>
                            <input
                                className={fieldClass}
                                value={draft.title_en ?? ''}
                                onChange={(e) =>
                                    set('title_en', e.target.value)
                                }
                            />
                        </Field>
                        <Field
                            label="Category code"
                            hint="e.g. UTP_T568B"
                            error={errors.category}
                        >
                            <input
                                className={fieldClass}
                                value={draft.category}
                                onChange={(e) =>
                                    set('category', e.target.value)
                                }
                                required
                            />
                        </Field>
                        <Field label="Validator" error={errors.kind}>
                            <select
                                className={fieldClass}
                                value={draft.kind}
                                onChange={(e) =>
                                    set('kind', e.target.value as Draft['kind'])
                                }
                            >
                                {kinds.map((kind) => (
                                    <option key={kind} value={kind}>
                                        {kind === 'cable'
                                            ? 'Cable / fibre (LAN tester)'
                                            : 'Protocol (packet animation)'}
                                    </option>
                                ))}
                            </select>
                        </Field>
                        <Field
                            label="Instruction (Indonesian)"
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
                            label="Instruction (English)"
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

                    {cable && (
                        <div className="flex flex-col gap-2 rounded-xl border border-border p-3">
                            <label className="flex items-center gap-2 text-sm font-medium text-foreground">
                                <input
                                    type="checkbox"
                                    checked={twoEnd}
                                    onChange={(e) =>
                                        toggleTwoEnd(e.target.checked)
                                    }
                                    data-testid="sequence-two-end"
                                />
                                Crimp both ends (straight / cross cable)
                            </label>
                            <p className="text-xs text-muted-foreground">
                                Players wire end A, then end B. The first half
                                of the pieces is end A, the second half end B.
                            </p>
                            {twoEnd && (
                                <div className="grid gap-2 sm:grid-cols-2">
                                    {(draft.ends ?? DEFAULT_ENDS).map(
                                        (end, index) => (
                                            <div
                                                key={index}
                                                className="flex flex-col gap-1"
                                            >
                                                <input
                                                    aria-label={`End ${String.fromCharCode(65 + index)} name (Indonesian)`}
                                                    placeholder={`Ujung ${String.fromCharCode(65 + index)} (T568B)`}
                                                    className={fieldClass}
                                                    value={end.id}
                                                    onChange={(e) =>
                                                        setEnd(index, {
                                                            id: e.target.value,
                                                        })
                                                    }
                                                    required
                                                />
                                                <input
                                                    aria-label={`End ${String.fromCharCode(65 + index)} name (English)`}
                                                    placeholder={`End ${String.fromCharCode(65 + index)} (T568B)`}
                                                    className={fieldClass}
                                                    value={end.en ?? ''}
                                                    onChange={(e) =>
                                                        setEnd(index, {
                                                            en: e.target.value,
                                                        })
                                                    }
                                                />
                                            </div>
                                        ),
                                    )}
                                </div>
                            )}
                            {errors.ends && (
                                <p className="text-xs text-red-600">
                                    {errors.ends}
                                </p>
                            )}
                        </div>
                    )}

                    <div className="flex flex-col gap-2">
                        <div className="flex items-center justify-between">
                            <h3 className="text-sm font-semibold text-foreground">
                                Pieces in the correct order
                            </h3>
                            <span className="text-xs text-muted-foreground">
                                {draft.items.length}/{maxItems}
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
                            >
                                <span className="min-w-5 text-right text-xs font-semibold text-muted-foreground tabular-nums">
                                    {twoEnd
                                        ? `${String.fromCharCode(65 + Math.floor(index / perEnd))}${(index % perEnd) + 1}`
                                        : index + 1}
                                </span>
                                <input
                                    aria-label={`Piece ${index + 1} label (Indonesian)`}
                                    placeholder="Label (ID)"
                                    className={cn(fieldClass, 'min-w-0 flex-1')}
                                    value={item.label_id}
                                    onChange={(e) =>
                                        setItem(index, {
                                            label_id: e.target.value,
                                        })
                                    }
                                    required
                                />
                                <input
                                    aria-label={`Piece ${index + 1} label (English)`}
                                    placeholder="Label (EN)"
                                    className={cn(fieldClass, 'min-w-0 flex-1')}
                                    value={item.label_en ?? ''}
                                    onChange={(e) =>
                                        setItem(index, {
                                            label_en: e.target.value,
                                        })
                                    }
                                />
                                {cable && (
                                    <>
                                        <input
                                            type="color"
                                            aria-label={`Piece ${index + 1} colour`}
                                            className="h-9 w-10 cursor-pointer rounded-lg border border-border bg-background"
                                            value={item.color || '#f8fafc'}
                                            onChange={(e) =>
                                                setItem(index, {
                                                    color: e.target.value,
                                                })
                                            }
                                        />
                                        <label className="flex items-center gap-1 text-xs text-muted-foreground">
                                            <input
                                                type="checkbox"
                                                checked={Boolean(item.stripe)}
                                                onChange={(e) =>
                                                    setItem(index, {
                                                        stripe: e.target.checked
                                                            ? '#f97316'
                                                            : null,
                                                    })
                                                }
                                            />
                                            Stripe
                                        </label>
                                        {item.stripe && (
                                            <input
                                                type="color"
                                                aria-label={`Piece ${index + 1} stripe colour`}
                                                className="h-9 w-10 cursor-pointer rounded-lg border border-border bg-background"
                                                value={item.stripe}
                                                onChange={(e) =>
                                                    setItem(index, {
                                                        stripe: e.target.value,
                                                    })
                                                }
                                            />
                                        )}
                                        <Swatch item={item} />
                                    </>
                                )}
                                <div className="flex gap-1">
                                    <IconButton
                                        label="Move up"
                                        disabled={index === 0}
                                        onClick={() => move(index, -1)}
                                    >
                                        <ArrowUp className="size-3.5" />
                                    </IconButton>
                                    <IconButton
                                        label="Move down"
                                        disabled={
                                            index === draft.items.length - 1
                                        }
                                        onClick={() => move(index, 1)}
                                    >
                                        <ArrowDown className="size-3.5" />
                                    </IconButton>
                                    <IconButton
                                        label="Remove"
                                        disabled={
                                            draft.items.length <= limits.min
                                        }
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
                                </div>
                                {(errors[`items.${index}.label_id`] ||
                                    errors[`items.${index}.color`]) && (
                                    <p className="w-full pl-7 text-xs text-red-600">
                                        {errors[`items.${index}.label_id`] ??
                                            errors[`items.${index}.color`]}
                                    </p>
                                )}
                            </div>
                        ))}
                        <button
                            type="button"
                            disabled={draft.items.length >= maxItems}
                            onClick={() =>
                                setDraft((current) => ({
                                    ...current,
                                    items: [
                                        ...current.items,
                                        { label_id: '', label_en: '' },
                                    ],
                                }))
                            }
                            className="inline-flex h-9 items-center justify-center gap-2 rounded-lg border border-dashed border-border text-sm text-foreground hover:bg-muted disabled:opacity-50"
                        >
                            <Plus className="size-4" />
                            Add piece
                        </button>
                    </div>
                    <label className="flex items-center gap-2 text-sm text-foreground">
                        <input
                            type="checkbox"
                            checked={draft.is_active}
                            onChange={(e) => set('is_active', e.target.checked)}
                        />
                        Active in games
                    </label>
                </div>
                <footer className="flex justify-end gap-2 border-t border-border px-5 py-3">
                    <button
                        type="button"
                        onClick={onClose}
                        className="h-9 rounded-lg border border-border px-4 text-sm text-foreground hover:bg-muted"
                    >
                        Cancel
                    </button>
                    <button
                        type="submit"
                        disabled={processing}
                        data-testid="sequence-save"
                        className="h-9 rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
                    >
                        Save
                    </button>
                </footer>
            </form>
        </div>
    );
}

function Field({
    label,
    hint,
    error,
    children,
}: {
    label: string;
    hint?: string;
    error?: string;
    children: React.ReactNode;
}) {
    return (
        <label className="flex flex-col gap-1 text-sm">
            <span className="font-medium text-foreground">
                {label}
                {hint && (
                    <span className="ml-1 text-xs font-normal text-muted-foreground">
                        {hint}
                    </span>
                )}
            </span>
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
            aria-label={label}
            title={label}
            disabled={disabled}
            onClick={onClick}
            className="grid size-8 place-items-center rounded-lg border border-border text-foreground hover:bg-muted disabled:opacity-40"
        >
            {children}
        </button>
    );
}
