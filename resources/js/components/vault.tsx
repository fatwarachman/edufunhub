import PlayerCharacter, {
    type CharacterData,
} from '@/components/player-character';
import { useTranslations } from '@/hooks/use-translations';
import { type ItemSlot } from '@/lib/character/draw-character';
import { cn } from '@/lib/utils';
import { router } from '@inertiajs/react';
import { Archive, Check, Coins, ShoppingBag } from 'lucide-react';
import { useState } from 'react';

export interface VaultItem {
    id: number;
    key: string;
    slot: ItemSlot;
    style: string;
    color: string | null;
    name: string;
    price_paid: number;
    bought_at: string | null;
    equipped: boolean;
    retired: boolean;
}

/**
 * The player's vault: every bought item stays here and can be worn again or
 * taken off with one tap. Used on the dashboard (profile) and the shop page.
 */
export function Vault({
    items,
    character,
    showShopLink = true,
}: {
    items: VaultItem[];
    character: CharacterData;
    showShopLink?: boolean;
}) {
    const { t } = useTranslations();
    const [busy, setBusy] = useState<number | null>(null);

    const toggle = (item: VaultItem) => {
        setBusy(item.id);
        router.post(
            `/vault/${item.id}/wear`,
            {},
            {
                preserveScroll: true,
                onFinish: () => setBusy(null),
            },
        );
    };

    const preview = (item: VaultItem): CharacterData => ({
        ...character,
        items: {
            ...(character.items ?? {}),
            [item.slot]: { style: item.style, color: item.color },
        },
    });

    return (
        <section
            id="vault"
            className="auth-card flex scroll-mt-6 flex-col gap-4"
            data-testid="vault"
        >
            <div className="flex flex-wrap items-center justify-between gap-3">
                <h2 className="flex items-center gap-2 text-xl font-bold">
                    <Archive className="size-5" aria-hidden="true" />
                    {t('vault.title')}
                    <span
                        className="rounded-full border-2 border-[#151b2e] bg-[#ffd93d] px-2 text-sm tabular-nums"
                        data-testid="vault-count"
                    >
                        {items.length}
                    </span>
                </h2>
                {showShopLink && (
                    <a
                        href="/character"
                        onClick={(event) => {
                            event.preventDefault();
                            router.visit('/character');
                        }}
                        className="inline-flex min-h-10 items-center gap-1.5 rounded-xl border-2 border-[#151b2e] bg-white px-3 text-sm font-bold shadow-[2px_2px_0_#151b2e]"
                    >
                        <ShoppingBag className="size-4" aria-hidden="true" />
                        {t('vault.shop')}
                    </a>
                )}
            </div>
            <p className="text-sm">{t('vault.intro')}</p>
            {items.length === 0 ? (
                <p
                    className="rounded-2xl border-2 border-dashed border-[#151b2e]/40 px-4 py-6 text-center text-sm font-semibold"
                    data-testid="vault-empty"
                >
                    {t('vault.empty')}
                </p>
            ) : (
                <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-4">
                    {items.map((item) => (
                        <li
                            key={item.id}
                            data-testid={`vault-item-${item.key}`}
                            data-equipped={item.equipped}
                            className={cn(
                                'flex min-w-0 flex-col gap-2 rounded-2xl border-[2.5px] border-[#151b2e] p-2.5',
                                item.equipped
                                    ? 'bg-[#fff8dc] shadow-[4px_4px_0_#151b2e]'
                                    : 'bg-white shadow-[2px_2px_0_#151b2e]',
                            )}
                        >
                            <div className="aspect-square w-full overflow-hidden rounded-xl bg-[#d8c7a4]/50">
                                <PlayerCharacter
                                    character={preview(item)}
                                    backdrop={false}
                                    className="size-full"
                                />
                            </div>
                            <div className="flex min-w-0 flex-col gap-1">
                                <span className="text-sm leading-tight font-bold break-words">
                                    {item.name}
                                </span>
                                <span className="flex flex-wrap items-center gap-1 text-xs font-semibold text-[#3d4460]">
                                    <span>{t(`shop.slots.${item.slot}`)}</span>
                                    <span aria-hidden="true">·</span>
                                    <Coins
                                        className="size-3"
                                        aria-hidden="true"
                                    />
                                    <span className="tabular-nums">
                                        {item.price_paid}
                                    </span>
                                    {item.retired && (
                                        <span className="rounded-full bg-[#eceae3] px-1.5">
                                            {t('vault.retired')}
                                        </span>
                                    )}
                                </span>
                            </div>
                            <button
                                type="button"
                                onClick={() => toggle(item)}
                                disabled={busy !== null}
                                aria-pressed={item.equipped}
                                data-testid={`vault-wear-${item.key}`}
                                className={cn(
                                    'mt-auto inline-flex min-h-10 w-full items-center justify-center gap-1.5 rounded-xl border-2 border-[#151b2e] px-2 text-xs font-bold disabled:opacity-60',
                                    item.equipped
                                        ? 'bg-white'
                                        : 'bg-[#151b2e] text-white',
                                )}
                            >
                                {item.equipped ? (
                                    <>
                                        <Check
                                            className="size-4"
                                            aria-hidden="true"
                                        />
                                        {t('vault.takeOff')}
                                    </>
                                ) : (
                                    t('vault.wear')
                                )}
                            </button>
                        </li>
                    ))}
                </ul>
            )}
        </section>
    );
}
