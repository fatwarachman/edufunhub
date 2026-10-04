import { Panel, fieldClass } from '@/components/admin/game-stats';
import InputError from '@/components/input-error';
import PlayerCharacter from '@/components/player-character';
import AdminLayout from '@/layouts/admin-layout';
import { type ItemSlot } from '@/lib/character/draw-character';
import { SLOT_LABELS, itemPreview } from '@/lib/character/items';
import { Head, Link, useForm } from '@inertiajs/react';
import { ArrowLeft, Loader2, Package } from 'lucide-react';
import { type FormEvent, type ReactNode } from 'react';

interface ItemForm {
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
    owners: number;
    wearing: number;
}

interface Props {
    item: ItemForm | null;
    slots: ItemSlot[];
    styles: Record<string, string[]>;
    maxPrice: number;
}

export default function CharacterItemForm({
    item,
    slots,
    styles,
    maxPrice,
}: Props) {
    const form = useForm({
        slot: item?.slot ?? ('hat' as ItemSlot),
        style: item?.style ?? styles.hat[0],
        color: item?.color ?? '#3d6fd1',
        name_id: item?.name_id ?? '',
        name_en: item?.name_en ?? '',
        price: item?.price ?? 100,
        sort_order: item?.sort_order ?? 0,
        is_active: item?.is_active ?? true,
    });
    const { data, setData, errors, processing } = form;

    const submit = (event: FormEvent) => {
        event.preventDefault();
        if (item) {
            form.put(`/admin/character-items/${item.id}`);
        } else {
            form.post('/admin/character-items');
        }
    };

    return (
        <AdminLayout>
            <Head title={item ? 'Edit item' : 'New item'} />
            <div className="flex flex-col gap-6">
                <div>
                    <Link
                        href="/admin/character-items"
                        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
                    >
                        <ArrowLeft className="size-4" />
                        Character Items
                    </Link>
                    <h1 className="mt-2 text-2xl font-bold text-foreground">
                        {item
                            ? `Edit ${item.name_en ?? item.name_id}`
                            : 'New item'}
                    </h1>
                    {item && (
                        <p className="text-sm text-muted-foreground">
                            Owned by {item.owners} · worn by {item.wearing}{' '}
                            players right now
                        </p>
                    )}
                </div>

                <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_280px] lg:items-start">
                    <Panel title="Item details" icon={Package}>
                        <form
                            onSubmit={submit}
                            className="flex flex-col gap-5"
                            data-testid="item-form"
                        >
                            <div className="grid gap-5 sm:grid-cols-2">
                                <Field label="Slot" error={errors.slot}>
                                    <select
                                        value={data.slot}
                                        onChange={(event) => {
                                            const slot = event.target
                                                .value as ItemSlot;
                                            setData((current) => ({
                                                ...current,
                                                slot,
                                                style: styles[slot][0],
                                            }));
                                        }}
                                        className={fieldClass}
                                        name="slot"
                                    >
                                        {slots.map((slot) => (
                                            <option key={slot} value={slot}>
                                                {SLOT_LABELS[slot]}
                                            </option>
                                        ))}
                                    </select>
                                </Field>
                                <Field label="Style" error={errors.style}>
                                    <select
                                        value={data.style}
                                        onChange={(event) =>
                                            setData('style', event.target.value)
                                        }
                                        className={fieldClass}
                                        name="style"
                                    >
                                        {styles[data.slot].map((style) => (
                                            <option key={style} value={style}>
                                                {style}
                                            </option>
                                        ))}
                                    </select>
                                </Field>
                                <Field
                                    label="Name (Indonesian)"
                                    error={errors.name_id}
                                >
                                    <input
                                        value={data.name_id}
                                        onChange={(event) =>
                                            setData(
                                                'name_id',
                                                event.target.value,
                                            )
                                        }
                                        maxLength={60}
                                        className={fieldClass}
                                        name="name_id"
                                        required
                                    />
                                </Field>
                                <Field
                                    label="Name (English)"
                                    error={errors.name_en}
                                >
                                    <input
                                        value={data.name_en}
                                        onChange={(event) =>
                                            setData(
                                                'name_en',
                                                event.target.value,
                                            )
                                        }
                                        maxLength={60}
                                        className={fieldClass}
                                        name="name_en"
                                    />
                                </Field>
                                <Field
                                    label="Price (points, 0 = free)"
                                    error={errors.price}
                                >
                                    <input
                                        type="number"
                                        min={0}
                                        max={maxPrice}
                                        value={data.price}
                                        onChange={(event) =>
                                            setData(
                                                'price',
                                                Math.max(
                                                    0,
                                                    Math.floor(
                                                        Number(
                                                            event.target.value,
                                                        ) || 0,
                                                    ),
                                                ),
                                            )
                                        }
                                        className={fieldClass}
                                        name="price"
                                    />
                                </Field>
                                <Field label="Colour" error={errors.color}>
                                    <div className="flex items-center gap-2">
                                        <input
                                            type="color"
                                            value={data.color ?? '#3d6fd1'}
                                            onChange={(event) =>
                                                setData(
                                                    'color',
                                                    event.target.value,
                                                )
                                            }
                                            className="h-9 w-12 shrink-0 cursor-pointer rounded-lg border border-input bg-background p-1"
                                            aria-label="Colour"
                                        />
                                        <input
                                            value={data.color ?? ''}
                                            onChange={(event) =>
                                                setData(
                                                    'color',
                                                    event.target.value,
                                                )
                                            }
                                            className={`${fieldClass} min-w-0 flex-1 font-mono`}
                                            name="color"
                                        />
                                    </div>
                                </Field>
                                <Field
                                    label="Sort order"
                                    error={errors.sort_order}
                                >
                                    <input
                                        type="number"
                                        min={0}
                                        value={data.sort_order}
                                        onChange={(event) =>
                                            setData(
                                                'sort_order',
                                                Math.max(
                                                    0,
                                                    Math.floor(
                                                        Number(
                                                            event.target.value,
                                                        ) || 0,
                                                    ),
                                                ),
                                            )
                                        }
                                        className={fieldClass}
                                    />
                                </Field>
                                <label className="flex items-center gap-2 self-end pb-2 text-sm text-foreground">
                                    <input
                                        type="checkbox"
                                        checked={data.is_active}
                                        onChange={(event) =>
                                            setData(
                                                'is_active',
                                                event.target.checked,
                                            )
                                        }
                                        className="size-4 rounded border-input"
                                    />
                                    Show in shop
                                </label>
                            </div>
                            <div className="flex justify-end gap-3 border-t border-border pt-5">
                                <Link
                                    href="/admin/character-items"
                                    className="inline-flex h-9 items-center rounded-lg px-4 text-sm font-medium text-muted-foreground hover:bg-muted hover:text-foreground"
                                >
                                    Cancel
                                </Link>
                                <button
                                    type="submit"
                                    disabled={processing}
                                    className="inline-flex h-9 items-center gap-2 rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
                                >
                                    {processing && (
                                        <Loader2 className="size-4 animate-spin" />
                                    )}
                                    {item ? 'Save changes' : 'Create item'}
                                </button>
                            </div>
                        </form>
                    </Panel>

                    <Panel title="Preview">
                        <div className="grid grid-cols-2 gap-3">
                            {(['boy', 'girl'] as const).map((gender) => (
                                <div
                                    key={gender}
                                    className="flex flex-col items-center gap-1"
                                >
                                    <div className="aspect-square w-full rounded-xl bg-[#d8c7a4]/60">
                                        <PlayerCharacter
                                            character={{
                                                ...itemPreview(data),
                                                gender,
                                            }}
                                            backdrop={false}
                                            className="size-full"
                                        />
                                    </div>
                                    <span className="text-xs text-muted-foreground capitalize">
                                        {gender}
                                    </span>
                                </div>
                            ))}
                        </div>
                    </Panel>
                </div>
            </div>
        </AdminLayout>
    );
}

function Field({
    label,
    error,
    children,
}: {
    label: string;
    error?: string;
    children: ReactNode;
}) {
    return (
        <div className="flex flex-col gap-1.5">
            <span className="text-sm font-medium text-foreground">{label}</span>
            {children}
            <InputError message={error} />
        </div>
    );
}
