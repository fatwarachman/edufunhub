import {
    ConfirmDialog,
    FlashMessages,
    StatusPill,
} from '@/components/admin/admin-kit';
import { Panel, StatTile, formatNumber } from '@/components/admin/game-stats';
import PlayerCharacter from '@/components/player-character';
import AdminLayout from '@/layouts/admin-layout';
import { adminLocale, tr } from '@/lib/admin-i18n';
import { type ItemSlot } from '@/lib/character/draw-character';
import { SLOT_LABELS, itemPreview } from '@/lib/character/items';
import { cn } from '@/lib/utils';
import { Head, Link, router, usePage } from '@inertiajs/react';
import {
    Coins,
    Eye,
    EyeOff,
    Package,
    Pencil,
    Plus,
    ShoppingBag,
    Trash2,
    Users,
    X,
} from 'lucide-react';
import { type ReactNode, useEffect, useState } from 'react';

export interface AdminItem {
    id: number;
    key: string;
    slot: ItemSlot;
    style: string;
    color: string | null;
    name_id: string;
    name_en: string | null;
    price: number;
    is_active: boolean;
    sort_order: number;
    owners: number | null;
    wearing: number;
    points_spent: number;
    created_at?: string | null;
    updated_at?: string | null;
}

interface Props {
    items: AdminItem[];
    filters: { slot: string | null };
    summary: {
        items: number;
        active: number;
        purchases: number;
        buyers: number;
        points_spent: number;
    };
    slots: ItemSlot[];
}

export default function CharacterItemsIndex({
    items,
    filters,
    summary,
    slots,
}: Props) {
    const { errors } = usePage<{ errors: Record<string, string> }>().props;
    const [deleting, setDeleting] = useState<AdminItem | null>(null);
    const [viewingId, setViewingId] = useState<number | null>(null);
    const viewing = items.find((item) => item.id === viewingId) ?? null;
    const [processing, setProcessing] = useState(false);

    const filter = (slot: string | null) =>
        router.get('/admin/character-items', slot ? { slot } : {}, {
            preserveScroll: true,
            preserveState: true,
        });

    return (
        <AdminLayout>
            <Head title={tr('Character Items')} />
            <div className="flex flex-col gap-6">
                <div className="flex flex-wrap items-end justify-between gap-4">
                    <div>
                        <h1 className="text-2xl font-bold text-foreground">
                            {tr('Character Items')}
                        </h1>
                        <p className="text-sm text-muted-foreground">
                            {tr(
                                'Shop items players buy with points. Price changes apply to new purchases; owners keep their items.',
                            )}
                        </p>
                    </div>
                    <Link
                        href="/admin/character-items/create"
                        className="inline-flex h-9 items-center gap-2 rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground hover:bg-primary/90"
                    >
                        <Plus className="size-4" />
                        {tr('New item')}
                    </Link>
                </div>

                <FlashMessages errors={errors} />

                <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
                    <StatTile
                        label={tr('Items in shop')}
                        value={`${summary.active} / ${summary.items}`}
                        icon={Package}
                        color="bg-indigo-500"
                    />
                    <StatTile
                        label={tr('Purchases')}
                        value={formatNumber(summary.purchases)}
                        icon={ShoppingBag}
                        color="bg-emerald-500"
                    />
                    <StatTile
                        label={tr('Buyers')}
                        value={formatNumber(summary.buyers)}
                        icon={Users}
                        color="bg-sky-500"
                    />
                    <StatTile
                        label={tr('Points spent')}
                        value={formatNumber(summary.points_spent)}
                        icon={Coins}
                        color="bg-amber-500"
                    />
                </div>

                <Panel
                    title={tr('Items')}
                    icon={Package}
                    actions={
                        <div className="flex flex-wrap gap-1.5">
                            {[null, ...slots].map((slot) => (
                                <button
                                    key={slot ?? 'all'}
                                    type="button"
                                    onClick={() => filter(slot)}
                                    data-testid={`items-filter-${slot ?? 'all'}`}
                                    className={cn(
                                        'h-8 rounded-lg px-3 text-xs font-medium',
                                        filters.slot === slot
                                            ? 'bg-primary text-primary-foreground'
                                            : 'bg-muted text-muted-foreground hover:text-foreground',
                                    )}
                                >
                                    {slot ? SLOT_LABELS[slot] : tr('All')}
                                </button>
                            ))}
                        </div>
                    }
                >
                    <div className="-mx-5 -my-5 overflow-x-auto">
                        <table className="w-full min-w-[760px] text-sm">
                            <thead className="border-b border-border bg-muted/40 text-left text-xs text-muted-foreground uppercase">
                                <tr>
                                    <th className="px-5 py-3 font-medium">
                                        {tr('Item')}
                                    </th>
                                    <th className="px-3 py-3 font-medium">
                                        {tr('Slot')}
                                    </th>
                                    <th className="px-3 py-3 text-right font-medium">
                                        {tr('Price')}
                                    </th>
                                    <th className="px-3 py-3 text-right font-medium">
                                        {tr('Owners')}
                                    </th>
                                    <th className="px-3 py-3 text-right font-medium">
                                        {tr('Wearing now')}
                                    </th>
                                    <th className="px-3 py-3 text-right font-medium">
                                        {tr('Points spent')}
                                    </th>
                                    <th className="px-3 py-3 font-medium">
                                        {tr('Status')}
                                    </th>
                                    <th className="px-5 py-3" />
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-border">
                                {items.map((item) => (
                                    <tr
                                        key={item.id}
                                        data-testid={`item-row-${item.key}`}
                                        className="cursor-pointer hover:bg-muted/30"
                                        onClick={() => setViewingId(item.id)}
                                    >
                                        <td className="px-5 py-2.5">
                                            <button
                                                type="button"
                                                onClick={(event) => {
                                                    event.stopPropagation();
                                                    setViewingId(item.id);
                                                }}
                                                className="flex items-center gap-3 rounded-lg text-left focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                                                aria-label={tr('View {0}', [
                                                    item.name_en ??
                                                        item.name_id,
                                                ])}
                                                data-testid={`item-open-${item.key}`}
                                            >
                                                <div className="size-12 shrink-0 overflow-hidden rounded-xl bg-[#d8c7a4]/60">
                                                    <PlayerCharacter
                                                        character={itemPreview(
                                                            item,
                                                        )}
                                                        backdrop={false}
                                                        className="size-full"
                                                    />
                                                </div>
                                                <div className="min-w-0">
                                                    <p className="font-medium text-foreground">
                                                        {item.name_en ??
                                                            item.name_id}
                                                    </p>
                                                    <p className="truncate text-xs text-muted-foreground">
                                                        {item.name_id} ·{' '}
                                                        {item.style}
                                                    </p>
                                                </div>
                                            </button>
                                        </td>
                                        <td className="px-3 py-2.5 text-muted-foreground">
                                            {tr(SLOT_LABELS[item.slot])}
                                        </td>
                                        <td className="px-3 py-2.5 text-right font-medium tabular-nums">
                                            {item.price === 0
                                                ? tr('Free')
                                                : formatNumber(item.price)}
                                        </td>
                                        <td
                                            className="px-3 py-2.5 text-right tabular-nums"
                                            data-testid={`item-owners-${item.key}`}
                                        >
                                            {item.owners === null
                                                ? tr('Everyone')
                                                : formatNumber(item.owners)}
                                        </td>
                                        <td
                                            className="px-3 py-2.5 text-right tabular-nums"
                                            data-testid={`item-wearing-${item.key}`}
                                        >
                                            {formatNumber(item.wearing)}
                                        </td>
                                        <td className="px-3 py-2.5 text-right tabular-nums">
                                            {formatNumber(item.points_spent)}
                                        </td>
                                        <td className="px-3 py-2.5">
                                            <StatusPill
                                                active={item.is_active}
                                            />
                                        </td>
                                        <td
                                            className="px-5 py-2.5"
                                            onClick={(event) =>
                                                event.stopPropagation()
                                            }
                                        >
                                            <div className="flex justify-end gap-1">
                                                <Link
                                                    href={`/admin/character-items/${item.id}/edit`}
                                                    className="inline-flex size-8 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground"
                                                    aria-label={tr('Edit {0}', [
                                                        item.name_id,
                                                    ])}
                                                >
                                                    <Pencil className="size-4" />
                                                </Link>
                                                <button
                                                    type="button"
                                                    onClick={() =>
                                                        router.patch(
                                                            `/admin/character-items/${item.id}/toggle`,
                                                            {},
                                                            {
                                                                preserveScroll: true,
                                                            },
                                                        )
                                                    }
                                                    className="inline-flex size-8 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground"
                                                    aria-label={
                                                        item.is_active
                                                            ? tr('Hide {0}', [
                                                                  item.name_id,
                                                              ])
                                                            : tr('Show {0}', [
                                                                  item.name_id,
                                                              ])
                                                    }
                                                >
                                                    {item.is_active ? (
                                                        <EyeOff className="size-4" />
                                                    ) : (
                                                        <Eye className="size-4" />
                                                    )}
                                                </button>
                                                <button
                                                    type="button"
                                                    onClick={() =>
                                                        setDeleting(item)
                                                    }
                                                    className="inline-flex size-8 items-center justify-center rounded-lg text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                                                    aria-label={tr(
                                                        'Delete {0}',
                                                        [item.name_id],
                                                    )}
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
                </Panel>
            </div>

            <ItemDetailDialog
                item={viewing}
                onClose={() => setViewingId(null)}
                onDelete={(item) => {
                    setViewingId(null);
                    setDeleting(item);
                }}
            />

            <ConfirmDialog
                open={deleting !== null}
                title={tr('Delete item?')}
                message={
                    deleting &&
                    tr(
                        '“{0}” will be removed. Items that players own or wear cannot be deleted; hide them instead.',
                        [deleting.name_en ?? deleting.name_id],
                    )
                }
                confirmLabel={tr('Delete')}
                processing={processing}
                onClose={() => setDeleting(null)}
                onConfirm={() =>
                    deleting &&
                    router.delete(`/admin/character-items/${deleting.id}`, {
                        preserveScroll: true,
                        onStart: () => setProcessing(true),
                        onFinish: () => {
                            setProcessing(false);
                            setDeleting(null);
                        },
                    })
                }
            />
        </AdminLayout>
    );
}

function DetailRow({
    label,
    children,
}: {
    label: string;
    children: ReactNode;
}) {
    return (
        <div className="flex items-center justify-between gap-3 py-2 text-sm">
            <dt className="text-muted-foreground">{tr(label)}</dt>
            <dd className="min-w-0 truncate text-right font-medium text-foreground">
                {children}
            </dd>
        </div>
    );
}

/** Item preview and details, opened by clicking a row. */
function ItemDetailDialog({
    item,
    onClose,
    onDelete,
}: {
    item: AdminItem | null;
    onClose: () => void;
    onDelete: (item: AdminItem) => void;
}) {
    const [gender, setGender] = useState<'boy' | 'girl' | null>(null);
    const [lastId, setLastId] = useState(item?.id);
    if (lastId !== item?.id) {
        setLastId(item?.id);
        setGender(null);
    }

    useEffect(() => {
        if (!item) {
            return;
        }
        const onKey = (event: KeyboardEvent) => {
            if (event.key === 'Escape') {
                onClose();
            }
        };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, [item, onClose]);

    if (!item) {
        return null;
    }

    const base = itemPreview(item);
    const preview = { ...base, gender: gender ?? base.gender };
    const toggle = () =>
        router.patch(
            `/admin/character-items/${item.id}/toggle`,
            {},
            { preserveScroll: true },
        );

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <div className="fixed inset-0 bg-black/50" onClick={onClose} />
            <div
                role="dialog"
                aria-modal="true"
                aria-labelledby="item-detail-title"
                data-testid="item-detail"
                className="relative z-10 flex max-h-[90dvh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl border border-border bg-card shadow-xl dark:border-white/15 dark:shadow-[0_0_24px_rgba(255,255,255,0.06)]"
            >
                <div className="flex items-start justify-between gap-3 border-b border-border px-5 py-4">
                    <div className="min-w-0">
                        <h3
                            id="item-detail-title"
                            className="truncate text-lg font-semibold text-foreground"
                        >
                            {item.name_en ?? item.name_id}
                        </h3>
                        <p className="truncate text-xs text-muted-foreground">
                            {item.name_id} · {item.key}
                        </p>
                    </div>
                    <button
                        type="button"
                        onClick={onClose}
                        className="inline-flex size-8 shrink-0 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground"
                        aria-label={tr('Close')}
                        data-testid="item-detail-close"
                    >
                        <X className="size-4" />
                    </button>
                </div>
                <div className="grid gap-5 overflow-y-auto p-5 sm:grid-cols-[minmax(0,13rem)_minmax(0,1fr)]">
                    <div className="flex flex-col gap-2">
                        <div className="mx-auto aspect-square w-full max-w-52 overflow-hidden rounded-2xl bg-[#d8c7a4]/60">
                            <PlayerCharacter
                                character={preview}
                                backdrop={false}
                                className="size-full"
                            />
                        </div>
                        <div className="grid grid-cols-2 gap-2">
                            {(['boy', 'girl'] as const).map((option) => {
                                const selected = preview.gender === option;
                                return (
                                    <button
                                        key={option}
                                        type="button"
                                        onClick={() => setGender(option)}
                                        aria-pressed={selected}
                                        data-testid={`item-detail-${option}`}
                                        className={cn(
                                            'flex items-center gap-2 rounded-xl border px-2 py-1 text-xs font-medium capitalize',
                                            selected
                                                ? 'border-primary bg-primary/10 text-foreground'
                                                : 'border-border bg-muted text-muted-foreground hover:text-foreground',
                                        )}
                                    >
                                        <span className="size-10 shrink-0">
                                            <PlayerCharacter
                                                character={{
                                                    ...preview,
                                                    gender: option,
                                                }}
                                                backdrop={false}
                                                className="size-full"
                                            />
                                        </span>
                                        {option}
                                    </button>
                                );
                            })}
                        </div>
                    </div>
                    <div className="flex min-w-0 flex-col gap-4">
                        <dl className="divide-y divide-border">
                            <DetailRow label={tr('Slot')}>
                                {tr(SLOT_LABELS[item.slot])}
                            </DetailRow>
                            <DetailRow label={tr('Style')}>
                                {item.style}
                            </DetailRow>
                            <DetailRow label={tr('Color')}>
                                {item.color ? (
                                    <span className="inline-flex items-center gap-2">
                                        <span
                                            className="size-4 rounded border border-border"
                                            style={{
                                                backgroundColor: item.color,
                                            }}
                                        />
                                        {item.color}
                                    </span>
                                ) : (
                                    tr('Default')
                                )}
                            </DetailRow>
                            <DetailRow label={tr('Price')}>
                                {item.price === 0
                                    ? tr('Free')
                                    : tr('{0} pts', [formatNumber(item.price)])}
                            </DetailRow>
                            <DetailRow label={tr('Status')}>
                                <StatusPill active={item.is_active} />
                            </DetailRow>
                            <DetailRow label={tr('Sort order')}>
                                {item.sort_order}
                            </DetailRow>
                            {item.updated_at && (
                                <DetailRow label={tr('Updated')}>
                                    {new Date(item.updated_at).toLocaleString(
                                        adminLocale(),
                                        {
                                            dateStyle: 'medium',
                                            timeStyle: 'short',
                                        },
                                    )}
                                </DetailRow>
                            )}
                        </dl>
                        <div className="grid grid-cols-3 gap-2 text-center">
                            {[
                                {
                                    label: tr('Owners'),
                                    value:
                                        item.owners === null
                                            ? 'All'
                                            : formatNumber(item.owners),
                                },
                                {
                                    label: tr('Wearing'),
                                    value: formatNumber(item.wearing),
                                },
                                {
                                    label: tr('Points spent'),
                                    value: formatNumber(item.points_spent),
                                },
                            ].map((stat) => (
                                <div
                                    key={stat.label}
                                    className="rounded-xl bg-muted/60 px-2 py-2.5"
                                >
                                    <p className="text-base font-semibold text-foreground tabular-nums">
                                        {stat.value}
                                    </p>
                                    <p className="text-xs text-muted-foreground">
                                        {tr(stat.label)}
                                    </p>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>
                <div className="flex flex-wrap items-center gap-2 border-t border-border px-5 py-3">
                    <button
                        type="button"
                        onClick={() => onDelete(item)}
                        className="mr-auto inline-flex h-9 items-center gap-1.5 rounded-lg border border-destructive/30 px-3 text-sm font-medium text-destructive hover:bg-destructive/10"
                        data-testid="item-detail-delete"
                    >
                        <Trash2 className="size-4" />
                        {tr('Delete')}
                    </button>
                    <button
                        type="button"
                        onClick={toggle}
                        className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-border px-3 text-sm font-medium text-foreground hover:bg-muted"
                        data-testid="item-detail-toggle"
                    >
                        {item.is_active ? (
                            <EyeOff className="size-4" />
                        ) : (
                            <Eye className="size-4" />
                        )}
                        {item.is_active ? tr('Hide') : tr('Show')}
                    </button>
                    <Link
                        href={`/admin/character-items/${item.id}/edit`}
                        className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-primary px-3 text-sm font-medium text-primary-foreground hover:bg-primary/90"
                        data-testid="item-detail-edit"
                    >
                        <Pencil className="size-4" />
                        {tr('Edit')}
                    </Link>
                </div>
            </div>
        </div>
    );
}
