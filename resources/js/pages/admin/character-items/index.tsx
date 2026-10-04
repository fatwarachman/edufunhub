import {
    ConfirmDialog,
    FlashMessages,
    StatusPill,
} from '@/components/admin/admin-kit';
import { Panel, StatTile, formatNumber } from '@/components/admin/game-stats';
import PlayerCharacter from '@/components/player-character';
import AdminLayout from '@/layouts/admin-layout';
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
} from 'lucide-react';
import { useState } from 'react';

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
    const [processing, setProcessing] = useState(false);

    const filter = (slot: string | null) =>
        router.get('/admin/character-items', slot ? { slot } : {}, {
            preserveScroll: true,
            preserveState: true,
        });

    return (
        <AdminLayout>
            <Head title="Character Items" />
            <div className="flex flex-col gap-6">
                <div className="flex flex-wrap items-end justify-between gap-4">
                    <div>
                        <h1 className="text-2xl font-bold text-foreground">
                            Character Items
                        </h1>
                        <p className="text-sm text-muted-foreground">
                            Shop items players buy with points. Price changes
                            apply to new purchases; owners keep their items.
                        </p>
                    </div>
                    <Link
                        href="/admin/character-items/create"
                        className="inline-flex h-9 items-center gap-2 rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground hover:bg-primary/90"
                    >
                        <Plus className="size-4" />
                        New item
                    </Link>
                </div>

                <FlashMessages errors={errors} />

                <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
                    <StatTile
                        label="Items in shop"
                        value={`${summary.active} / ${summary.items}`}
                        icon={Package}
                        color="bg-indigo-500"
                    />
                    <StatTile
                        label="Purchases"
                        value={formatNumber(summary.purchases)}
                        icon={ShoppingBag}
                        color="bg-emerald-500"
                    />
                    <StatTile
                        label="Buyers"
                        value={formatNumber(summary.buyers)}
                        icon={Users}
                        color="bg-sky-500"
                    />
                    <StatTile
                        label="Points spent"
                        value={formatNumber(summary.points_spent)}
                        icon={Coins}
                        color="bg-amber-500"
                    />
                </div>

                <Panel
                    title="Items"
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
                                    {slot ? SLOT_LABELS[slot] : 'All'}
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
                                        Item
                                    </th>
                                    <th className="px-3 py-3 font-medium">
                                        Slot
                                    </th>
                                    <th className="px-3 py-3 text-right font-medium">
                                        Price
                                    </th>
                                    <th className="px-3 py-3 text-right font-medium">
                                        Owners
                                    </th>
                                    <th className="px-3 py-3 text-right font-medium">
                                        Wearing now
                                    </th>
                                    <th className="px-3 py-3 text-right font-medium">
                                        Points spent
                                    </th>
                                    <th className="px-3 py-3 font-medium">
                                        Status
                                    </th>
                                    <th className="px-5 py-3" />
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-border">
                                {items.map((item) => (
                                    <tr
                                        key={item.id}
                                        data-testid={`item-row-${item.key}`}
                                        className="hover:bg-muted/30"
                                    >
                                        <td className="px-5 py-2.5">
                                            <div className="flex items-center gap-3">
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
                                            </div>
                                        </td>
                                        <td className="px-3 py-2.5 text-muted-foreground">
                                            {SLOT_LABELS[item.slot]}
                                        </td>
                                        <td className="px-3 py-2.5 text-right font-medium tabular-nums">
                                            {item.price === 0
                                                ? 'Free'
                                                : formatNumber(item.price)}
                                        </td>
                                        <td
                                            className="px-3 py-2.5 text-right tabular-nums"
                                            data-testid={`item-owners-${item.key}`}
                                        >
                                            {item.owners === null
                                                ? 'Everyone'
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
                                        <td className="px-5 py-2.5">
                                            <div className="flex justify-end gap-1">
                                                <Link
                                                    href={`/admin/character-items/${item.id}/edit`}
                                                    className="inline-flex size-8 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground"
                                                    aria-label={`Edit ${item.name_id}`}
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
                                                            ? `Hide ${item.name_id}`
                                                            : `Show ${item.name_id}`
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
                                                    aria-label={`Delete ${item.name_id}`}
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

            <ConfirmDialog
                open={deleting !== null}
                title="Delete item?"
                message={
                    deleting &&
                    `“${deleting.name_en ?? deleting.name_id}” will be removed. Items that players own or wear cannot be deleted; hide them instead.`
                }
                confirmLabel="Delete"
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
