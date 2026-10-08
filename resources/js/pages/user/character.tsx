import InputError from '@/components/input-error';
import { LanguageToggle } from '@/components/language-toggle';
import PlayerCharacter, {
    type CharacterData,
} from '@/components/player-character';
import { BackButton } from '@/components/site-nav';
import { useFreshOnHistory } from '@/hooks/use-fresh-on-history';
import { useTranslations } from '@/hooks/use-translations';
import PlayerLayout from '@/layouts/player-layout';
import { type AdSponsor, trackAd } from '@/lib/ads';
import {
    CHARACTER_SHIRTS,
    type CharacterLook,
    HAIR_COLORS,
    type ItemSlot,
    SKIN_TONES,
} from '@/lib/character/draw-character';
import { cn } from '@/lib/utils';
import { type SharedData } from '@/types';
import { router, useForm, usePage } from '@inertiajs/react';
import {
    Check,
    Coins,
    Crown,
    Glasses,
    LayoutGrid,
    Lock,
    RotateCcw,
    Shield,
    Shirt,
    Sparkles,
    Sword,
    X,
} from 'lucide-react';
import { type ReactNode, useEffect, useMemo, useRef, useState } from 'react';
import '../../../css/edu-ads.css';

interface ShopItem {
    id: number;
    key: string;
    slot: ItemSlot;
    style: string;
    color: string | null;
    name: string;
    price: number;
    sponsor?: AdSponsor | null;
}

interface Props {
    character: CharacterData;
    equipped: Partial<Record<ItemSlot, number>>;
    balance: number;
    owned: number[];
    items: ShopItem[];
    options: {
        slots: ItemSlot[];
        genders: string[];
        skins: string[];
        hairColors: string[];
        colors: string[];
    };
}

const SLOT_ICONS: Record<ItemSlot, typeof Crown> = {
    hat: Crown,
    face: Glasses,
    outfit: Shirt,
    back: Sparkles,
    weapon: Sword,
    offhand: Shield,
};

const ink = 'border-[2.5px] border-[#151b2e]';

type SlotFilter = ItemSlot | 'all';

export default function Character({
    character,
    equipped,
    balance,
    owned,
    items,
    options,
}: Props) {
    const { t } = useTranslations();
    const { errors } = usePage<
        SharedData & { errors: Record<string, string> }
    >().props;
    const form = useForm({
        nickname: character.nickname ?? '',
        color: character.color,
        gender: character.gender ?? 'boy',
        skin: character.skin ?? 'light',
        hair_color: character.hair ?? 'brown',
        equipped: Object.fromEntries(
            options.slots.map((slot) => [slot, equipped[slot] ?? null]),
        ) as Record<ItemSlot, number | null>,
    });
    const [slot, setSlot] = useState<SlotFilter>('all');
    const [trying, setTrying] = useState<ShopItem | null>(null);
    const [buying, setBuying] = useState<ShopItem | null>(null);
    const [purchasing, setPurchasing] = useState(false);

    const itemsById = useMemo(
        () => new Map(items.map((item) => [item.id, item])),
        [items],
    );
    const ownsItem = (item: ShopItem) =>
        item.price === 0 || owned.includes(item.id);

    const look: CharacterLook = useMemo(() => {
        const worn: CharacterLook['items'] = {};
        for (const s of options.slots) {
            const id = form.data.equipped[s];
            const item =
                trying?.slot === s ? trying : id ? itemsById.get(id) : null;
            worn[s] = item ? { style: item.style, color: item.color } : null;
        }
        return {
            color: form.data.color,
            gender: form.data.gender,
            skin: form.data.skin,
            hair: form.data.hair_color,
            items: worn,
        };
    }, [form.data, trying, itemsById, options.slots]);

    const withItem = (item: ShopItem): CharacterLook => ({
        ...look,
        items: {
            ...look.items,
            [item.slot]: { style: item.style, color: item.color },
        },
    });

    const changeSlot = (next: SlotFilter) => {
        setTrying(null);
        setSlot(next);
    };

    const wear = (s: ItemSlot, id: number | null) => {
        setTrying(null);
        form.setData((current) => ({
            ...current,
            equipped: { ...current.equipped, [s]: id },
        }));
    };

    /** Tapping the item you wear takes it off (also in the All tab). */
    const toggleWear = (item: ShopItem) =>
        wear(
            item.slot,
            form.data.equipped[item.slot] === item.id ? null : item.id,
        );

    useFreshOnHistory(['character', 'equipped', 'owned', 'balance'], (page) => {
        const fresh = page.props as unknown as Props;
        const next = Object.fromEntries(
            options.slots.map((s) => [s, fresh.equipped[s] ?? null]),
        ) as Record<ItemSlot, number | null>;
        setTrying(null);
        form.setDefaults('equipped', next);
        form.setData('equipped', next);
    });

    const save = () =>
        form.patch('/character', {
            preserveScroll: true,
            onSuccess: () => form.setDefaults(),
        });

    const confirmBuy = () => {
        if (!buying) {
            return;
        }
        const item = buying;
        setPurchasing(true);
        router.post(
            `/character/items/${item.id}/buy`,
            {},
            {
                preserveScroll: true,
                preserveState: true,
                onSuccess: () => {
                    form.setData('equipped', {
                        ...form.data.equipped,
                        [item.slot]: item.id,
                    });
                    setTrying(null);
                    setBuying(null);
                },
                onError: () => setBuying(null),
                onFinish: () => setPurchasing(false),
            },
        );
    };

    const slotItems =
        slot === 'all'
            ? [...items].sort(
                  (a, b) =>
                      options.slots.indexOf(a.slot) -
                      options.slots.indexOf(b.slot),
              )
            : items.filter((item) => item.slot === slot);
    const equippedError = Object.entries(form.errors).find(([key]) =>
        key.startsWith('equipped'),
    )?.[1];

    return (
        <PlayerLayout title={t('shop.title')}>
            <div className="flex flex-wrap items-center justify-between gap-3">
                <BackButton
                    href="/dashboard"
                    label={t('nav.backToDashboard')}
                />
                <LanguageToggle />
            </div>
            <div className="flex flex-wrap items-end justify-between gap-4">
                <div className="flex flex-col gap-2">
                    <h1 className="text-3xl font-bold md:text-5xl">
                        {t('shop.title')}
                    </h1>
                    <p className="max-w-xl text-base text-[#3d4460]">
                        {t('shop.intro')}
                    </p>
                </div>
                <div
                    className={cn(
                        ink,
                        'flex items-center gap-3 rounded-2xl bg-[#ffd93d] px-4 py-2.5 shadow-[4px_4px_0_#151b2e]',
                    )}
                    title={t('shop.balanceNote')}
                >
                    <Coins className="size-7 shrink-0" />
                    <div className="flex flex-col leading-tight">
                        <span className="text-xs font-bold tracking-wide uppercase">
                            {t('shop.balance')}
                        </span>
                        <span
                            className="text-2xl font-bold tabular-nums"
                            data-testid="shop-balance"
                        >
                            {balance.toLocaleString()}
                        </span>
                    </div>
                </div>
            </div>

            <div className="grid gap-6 lg:grid-cols-[340px_minmax(0,1fr)] lg:items-start">
                <section className="auth-card flex flex-col items-center gap-4 lg:sticky lg:top-6">
                    <div className="w-full max-w-64 rounded-3xl bg-[#d8c7a4]/60 p-2">
                        <PlayerCharacter
                            character={look}
                            className="mx-auto w-full"
                        />
                    </div>
                    <p className="max-w-full text-xl font-bold break-words">
                        {form.data.nickname || t('player.character')}
                    </p>
                    {trying && !ownsItem(trying) && (
                        <p
                            className="rounded-full bg-[#fff3c4] px-3 py-1 text-xs font-bold"
                            data-testid="shop-preview-note"
                        >
                            {t('shop.preview')}
                        </p>
                    )}
                    <div className="flex w-full flex-col gap-2">
                        {form.isDirty && (
                            <p
                                role="status"
                                className="text-center text-sm font-semibold text-[#b8394f]"
                            >
                                {t('shop.unsaved')}
                            </p>
                        )}
                        {form.recentlySuccessful && !form.isDirty && (
                            <p
                                role="status"
                                className="text-center text-sm font-semibold text-[#116a56]"
                            >
                                {t('player.saved')}
                            </p>
                        )}
                        <button
                            type="submit"
                            onClick={save}
                            disabled={form.processing || !form.isDirty}
                            className="px-5 py-3 font-bold disabled:opacity-50"
                            data-testid="character-save"
                        >
                            {t(
                                form.processing
                                    ? 'player.saving'
                                    : 'player.save',
                            )}
                        </button>
                        {form.isDirty && (
                            <button
                                type="button"
                                onClick={() => {
                                    form.reset();
                                    setTrying(null);
                                }}
                                className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl text-sm font-bold text-[#3d4460] underline-offset-4 hover:underline"
                            >
                                <RotateCcw className="size-4" />
                                {t('shop.reset')}
                            </button>
                        )}
                    </div>
                </section>

                <div className="flex min-w-0 flex-col gap-6">
                    <section className="auth-card flex flex-col gap-5">
                        <h2 className="text-xl font-bold">{t('shop.look')}</h2>
                        <div className="flex flex-col gap-2">
                            <label htmlFor="nickname" className="font-semibold">
                                {t('player.nickname')}
                            </label>
                            <input
                                id="nickname"
                                maxLength={40}
                                value={form.data.nickname}
                                onChange={(event) =>
                                    form.setData('nickname', event.target.value)
                                }
                                className="w-full px-3"
                            />
                            <InputError message={form.errors.nickname} />
                        </div>

                        <ChoiceRow label={t('shop.gender')}>
                            {options.genders.map((gender) => (
                                <Chip
                                    key={gender}
                                    active={form.data.gender === gender}
                                    onClick={() =>
                                        form.setData('gender', gender)
                                    }
                                    testId={`gender-${gender}`}
                                >
                                    {t(`shop.${gender}`)}
                                </Chip>
                            ))}
                        </ChoiceRow>
                        <ChoiceRow label={t('shop.skin')}>
                            {options.skins.map((skin) => (
                                <Swatch
                                    key={skin}
                                    color={SKIN_TONES[skin]}
                                    label={t(`shop.skins.${skin}`)}
                                    active={form.data.skin === skin}
                                    onClick={() => form.setData('skin', skin)}
                                />
                            ))}
                        </ChoiceRow>
                        <ChoiceRow label={t('shop.hair')}>
                            {options.hairColors.map((hair) => (
                                <Swatch
                                    key={hair}
                                    color={HAIR_COLORS[hair]}
                                    label={t(`shop.hairs.${hair}`)}
                                    active={form.data.hair_color === hair}
                                    onClick={() =>
                                        form.setData('hair_color', hair)
                                    }
                                />
                            ))}
                        </ChoiceRow>
                        <ChoiceRow label={t('shop.shirt')}>
                            {options.colors.map((color) => (
                                <Swatch
                                    key={color}
                                    color={CHARACTER_SHIRTS[color][0]}
                                    label={t(`player.${color}`)}
                                    active={form.data.color === color}
                                    onClick={() => form.setData('color', color)}
                                />
                            ))}
                        </ChoiceRow>
                        <InputError
                            message={
                                form.errors.gender ||
                                form.errors.skin ||
                                form.errors.hair_color ||
                                form.errors.color
                            }
                        />
                    </section>

                    <section className="auth-card flex flex-col gap-4">
                        <div
                            role="tablist"
                            aria-label={t('shop.title')}
                            className="-mx-1 flex gap-2 overflow-x-auto px-1 pt-0.5 pb-2"
                        >
                            {(['all', ...options.slots] as SlotFilter[]).map(
                                (s) => {
                                    const Icon =
                                        s === 'all'
                                            ? LayoutGrid
                                            : SLOT_ICONS[s];
                                    return (
                                        <button
                                            key={s}
                                            type="button"
                                            role="tab"
                                            aria-selected={slot === s}
                                            onClick={() => changeSlot(s)}
                                            data-testid={`shop-tab-${s}`}
                                            className={cn(
                                                ink,
                                                'inline-flex min-h-11 shrink-0 items-center gap-2 rounded-xl px-3.5 text-sm font-bold transition-colors',
                                                slot === s
                                                    ? 'bg-[#151b2e] text-white'
                                                    : 'bg-white hover:bg-[#fff3c4]',
                                            )}
                                        >
                                            <Icon className="size-4" />
                                            {s === 'all'
                                                ? t('shop.allItems')
                                                : t(`shop.slots.${s}`)}
                                        </button>
                                    );
                                },
                            )}
                        </div>

                        <InputError message={errors.item ?? equippedError} />

                        <div
                            className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-4"
                            data-testid="shop-items"
                        >
                            {slot !== 'all' && (
                                <ItemCard
                                    name={t('shop.none')}
                                    active={form.data.equipped[slot] === null}
                                    onSelect={() => wear(slot, null)}
                                    testId={`shop-item-none-${slot}`}
                                    preview={
                                        <div className="flex size-full items-center justify-center">
                                            <X className="size-8 text-[#3d4460]" />
                                        </div>
                                    }
                                    badge={
                                        form.data.equipped[slot] === null ? (
                                            <Badge tone="ink">
                                                {t('shop.wearing')}
                                            </Badge>
                                        ) : null
                                    }
                                />
                            )}
                            {slotItems.map((item) => {
                                const has = ownsItem(item);
                                const wearing =
                                    form.data.equipped[item.slot] === item.id;
                                const short = item.price - balance;
                                return (
                                    <ItemCard
                                        key={item.id}
                                        name={item.name}
                                        caption={
                                            slot === 'all'
                                                ? t(`shop.slots.${item.slot}`)
                                                : null
                                        }
                                        sponsor={item.sponsor ?? null}
                                        active={
                                            wearing || trying?.id === item.id
                                        }
                                        testId={`shop-item-${item.key}`}
                                        onSelect={() =>
                                            has
                                                ? toggleWear(item)
                                                : setTrying(item)
                                        }
                                        preview={
                                            <PlayerCharacter
                                                character={withItem(item)}
                                                backdrop={false}
                                                className="size-full"
                                            />
                                        }
                                        badge={
                                            wearing ? (
                                                <Badge tone="ink">
                                                    {t('shop.wearing')}
                                                </Badge>
                                            ) : item.price === 0 ? (
                                                <Badge tone="teal">
                                                    {t('shop.free')}
                                                </Badge>
                                            ) : has ? (
                                                <Badge tone="teal">
                                                    {t('shop.owned')}
                                                </Badge>
                                            ) : (
                                                <Badge tone="amber">
                                                    <Coins className="size-3.5" />
                                                    {item.price}
                                                </Badge>
                                            )
                                        }
                                        action={
                                            has ? null : (
                                                <button
                                                    type="button"
                                                    onClick={() =>
                                                        setBuying(item)
                                                    }
                                                    disabled={short > 0}
                                                    data-testid={`shop-buy-${item.key}`}
                                                    className={cn(
                                                        ink,
                                                        'inline-flex min-h-10 w-full items-center justify-center gap-1.5 rounded-xl px-2 text-xs font-bold',
                                                        short > 0
                                                            ? 'bg-[#eceae3] text-[#5b6178]'
                                                            : 'bg-[#ffd93d] shadow-[2px_2px_0_#151b2e] hover:bg-[#ffe680]',
                                                    )}
                                                >
                                                    {short > 0 ? (
                                                        <>
                                                            <Lock className="size-3.5" />
                                                            {t(
                                                                'shop.needMore',
                                                                {
                                                                    count: short,
                                                                },
                                                            )}
                                                        </>
                                                    ) : (
                                                        t('shop.buyFor', {
                                                            price: item.price,
                                                        })
                                                    )}
                                                </button>
                                            )
                                        }
                                    />
                                );
                            })}
                        </div>
                        {slotItems.length === 0 && (
                            <p className="text-sm text-[#3d4460]">
                                {t('shop.empty')}
                            </p>
                        )}
                    </section>
                </div>
            </div>

            {buying && (
                <div
                    className="fixed inset-0 z-50 flex items-center justify-center bg-[#151b2e]/50 p-4"
                    onClick={() => !purchasing && setBuying(null)}
                    onKeyDown={(event) => {
                        if (event.key === 'Escape' && !purchasing) {
                            setBuying(null);
                        }
                    }}
                >
                    <div
                        role="dialog"
                        aria-modal="true"
                        aria-labelledby="buy-title"
                        className="auth-card flex w-full max-w-sm flex-col items-center gap-4 text-center"
                        onClick={(event) => event.stopPropagation()}
                        data-testid="shop-confirm"
                    >
                        <div className="size-32 rounded-2xl bg-[#d8c7a4]/60">
                            <PlayerCharacter
                                character={withItem(buying)}
                                backdrop={false}
                                className="size-full"
                            />
                        </div>
                        <h2 id="buy-title" className="text-xl font-bold">
                            {t('shop.confirmTitle', { item: buying.name })}
                        </h2>
                        <p className="text-sm text-[#3d4460]">
                            {t('shop.confirmText', {
                                price: buying.price,
                                left: balance - buying.price,
                            })}
                        </p>
                        <div className="grid w-full grid-cols-2 gap-3">
                            <button
                                type="button"
                                autoFocus
                                onClick={() => setBuying(null)}
                                disabled={purchasing}
                                className={cn(
                                    ink,
                                    'min-h-12 rounded-xl bg-white font-bold',
                                )}
                            >
                                {t('shop.cancel')}
                            </button>
                            <button
                                type="submit"
                                onClick={confirmBuy}
                                disabled={purchasing}
                                data-testid="shop-confirm-buy"
                                className="px-3 font-bold disabled:opacity-60"
                            >
                                {purchasing
                                    ? t('shop.buying')
                                    : t('shop.confirm')}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </PlayerLayout>
    );
}

function ChoiceRow({
    label,
    children,
}: {
    label: string;
    children: ReactNode;
}) {
    return (
        <fieldset className="flex flex-col gap-2.5">
            <legend className="mb-2 font-semibold">{label}</legend>
            <div className="flex flex-wrap gap-2.5">{children}</div>
        </fieldset>
    );
}

function Chip({
    active,
    onClick,
    children,
    testId,
}: {
    active: boolean;
    onClick: () => void;
    children: ReactNode;
    testId?: string;
}) {
    return (
        <button
            type="button"
            aria-pressed={active}
            onClick={onClick}
            data-testid={testId}
            className={cn(
                ink,
                'inline-flex min-h-11 items-center gap-2 rounded-xl px-4 font-bold transition-colors',
                active
                    ? 'bg-[#151b2e] text-white'
                    : 'bg-white hover:bg-[#fff3c4]',
            )}
        >
            {active && <Check className="size-4" />}
            {children}
        </button>
    );
}

function Swatch({
    color,
    label,
    active,
    onClick,
}: {
    color: string;
    label: string;
    active: boolean;
    onClick: () => void;
}) {
    return (
        <button
            type="button"
            aria-pressed={active}
            aria-label={label}
            title={label}
            onClick={onClick}
            className={cn(
                'relative flex size-11 items-center justify-center rounded-full border-[2.5px] border-[#151b2e] transition-transform',
                active
                    ? 'scale-110 shadow-[0_0_0_3px_#fff,0_0_0_5.5px_#151b2e]'
                    : 'hover:scale-105',
            )}
            style={{ backgroundColor: color }}
        >
            {active && (
                <Check className="size-5 text-white drop-shadow-[0_1px_1px_#151b2e]" />
            )}
        </button>
    );
}

function Badge({
    tone,
    children,
}: {
    tone: 'ink' | 'teal' | 'amber';
    children: ReactNode;
}) {
    return (
        <span
            className={cn(
                'inline-flex items-center gap-1 rounded-full border-2 border-[#151b2e] px-2 py-0.5 text-[11px] font-bold whitespace-nowrap',
                tone === 'ink' && 'bg-[#151b2e] text-white',
                tone === 'teal' && 'bg-[#bff0e3]',
                tone === 'amber' && 'bg-[#ffd93d]',
            )}
        >
            {children}
        </span>
    );
}

function ItemCard({
    name,
    caption = null,
    sponsor = null,
    active,
    onSelect,
    preview,
    badge,
    action,
    testId,
}: {
    name: string;
    caption?: string | null;
    sponsor?: AdSponsor | null;
    active: boolean;
    onSelect: () => void;
    preview: ReactNode;
    badge?: ReactNode;
    action?: ReactNode;
    testId?: string;
}) {
    return (
        <div
            data-testid={testId}
            data-active={active}
            className={cn(
                'flex flex-col gap-2 rounded-2xl border-[2.5px] border-[#151b2e] p-2.5 transition-shadow',
                active
                    ? 'bg-[#fff8dc] shadow-[4px_4px_0_#151b2e]'
                    : 'bg-white shadow-[2px_2px_0_#151b2e]',
            )}
        >
            <button
                type="button"
                onClick={onSelect}
                aria-pressed={active}
                className="flex flex-col gap-2 rounded-xl text-left"
            >
                <div className="aspect-square w-full overflow-hidden rounded-xl bg-[#d8c7a4]/50">
                    {preview}
                </div>
                {caption && (
                    <span className="-mb-1 text-[11px] font-bold tracking-wide text-[#3d4460] uppercase">
                        {caption}
                    </span>
                )}
                <span
                    className="line-clamp-2 min-h-[2.5em] text-sm leading-tight font-bold break-words"
                    title={name}
                >
                    {name}
                </span>
                {badge && <span className="flex">{badge}</span>}
            </button>
            {sponsor && <SponsorChip sponsor={sponsor} />}
            {action && <div className="mt-auto">{action}</div>}
        </div>
    );
}

function SponsorChip({ sponsor }: { sponsor: AdSponsor }) {
    const { t } = useTranslations();
    const ref = useRef<HTMLSpanElement | null>(null);

    useEffect(() => {
        const node = ref.current;
        if (!node || typeof IntersectionObserver === 'undefined') return;
        const observer = new IntersectionObserver(
            (entries) => {
                if (entries.some((entry) => entry.intersectionRatio >= 0.5)) {
                    trackAd(sponsor.serve, 'impression');
                    observer.disconnect();
                }
            },
            { threshold: [0.5] },
        );
        observer.observe(node);
        return () => observer.disconnect();
    }, [sponsor.serve]);

    return (
        <span
            ref={ref}
            className="edu-ad-sponsor-chip"
            title={sponsor.motto ?? undefined}
            data-testid="shop-sponsor"
        >
            {sponsor.logo_url && <img src={sponsor.logo_url} alt="" />}
            <span>{t('ads.sponsoredBy', { brand: sponsor.advertiser })}</span>
        </span>
    );
}
