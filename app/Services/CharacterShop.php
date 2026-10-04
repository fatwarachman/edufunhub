<?php

namespace App\Services;

use App\Models\CharacterItem;
use App\Models\PlayerProfile;
use App\Models\User;
use Illuminate\Database\Eloquent\Collection;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;

/**
 * Character shop: players spend points on items and equip one item per slot.
 * A purchase is a negative point ledger entry, so the balance is always the
 * ledger sum. Free items belong to everyone.
 */
class CharacterShop
{
    public function __construct(private PlayerPortal $portal) {}

    /** @return Collection<int, CharacterItem> */
    public function catalog(): Collection
    {
        return CharacterItem::query()->active()->orderBy('slot')->orderBy('sort_order')->orderBy('price')->get();
    }

    /** @return list<int> */
    public function ownedIds(User $user): array
    {
        return $user->characterItems()->pluck('character_items.id')->map(fn ($id): int => (int) $id)->all();
    }

    public function owns(User $user, CharacterItem $item): bool
    {
        return $item->isFree() || $user->characterItems()->whereKey($item->id)->exists();
    }

    /**
     * Buy an item with points. The balance check and the purchase run under
     * a lock on the user row so two parallel requests cannot overspend.
     */
    public function buy(User $user, CharacterItem $item): void
    {
        if (! $item->is_active) {
            throw ValidationException::withMessages(['item' => __('shop.unavailable')]);
        }
        if ($this->owns($user, $item)) {
            throw ValidationException::withMessages(['item' => __('shop.already_owned')]);
        }

        DB::transaction(function () use ($user, $item): void {
            User::query()->whereKey($user->id)->lockForUpdate()->first();

            if ($user->characterItems()->whereKey($item->id)->exists()) {
                throw ValidationException::withMessages(['item' => __('shop.already_owned')]);
            }
            if ($this->portal->totalPoints($user) < $item->price) {
                throw ValidationException::withMessages(['item' => __('shop.not_enough_points')]);
            }

            $user->characterItems()->attach($item->id, ['price_paid' => $item->price]);
            $user->pointLedgers()->create([
                'points' => -$item->price,
                'reason' => 'shop:'.$item->key,
                'event_id' => 'shop-'.$user->id.'-'.$item->id,
            ]);
        });
    }

    /**
     * The player's vault: every bought item, also ones no longer sold, with
     * whether it is worn right now.
     *
     * @return list<array{id: int, key: string, slot: string, style: string, color: ?string, name: string, price_paid: int, bought_at: ?string, equipped: bool, retired: bool}>
     */
    public function vault(User $user, string $locale): array
    {
        $equipped = array_map('intval', array_values($user->playerProfile?->equipped ?? []));

        return $user->characterItems()
            ->orderBy('slot')
            ->orderByPivot('created_at', 'desc')
            ->get()
            ->map(fn (CharacterItem $item): array => [
                'id' => $item->id,
                'key' => $item->key,
                'slot' => $item->slot,
                'style' => $item->style,
                'color' => $item->color,
                'name' => $item->name($locale),
                'price_paid' => (int) $item->pivot->price_paid,
                'bought_at' => $item->pivot->created_at?->toIso8601String(),
                'equipped' => in_array($item->id, $equipped, true),
                'retired' => ! $item->is_active,
            ])
            ->values()
            ->all();
    }

    /**
     * Put an owned item on, or take it off when it is already worn.
     * Returns true when the item is worn afterwards.
     */
    public function toggleWear(User $user, CharacterItem $item): bool
    {
        if (! $this->owns($user, $item)) {
            throw ValidationException::withMessages(['item' => __('shop.not_owned')]);
        }

        $profile = $user->playerProfile()->firstOrNew();
        $equipped = $profile->equipped ?? [];
        $wearing = (int) ($equipped[$item->slot] ?? 0) === $item->id;

        if ($wearing) {
            unset($equipped[$item->slot]);
        } else {
            $equipped[$item->slot] = $item->id;
        }

        $profile->equipped = $equipped;
        $profile->accessory = $this->legacyAccessory($equipped);
        $profile->save();

        return ! $wearing;
    }

    /**
     * Older game clients still read `accessory`; derive it from the items.
     *
     * @param  array<string, int>  $equipped
     */
    public function legacyAccessory(array $equipped): string
    {
        return match (true) {
            isset($equipped['face']) => 'glasses',
            isset($equipped['hat']) => 'cap',
            default => 'none',
        };
    }

    /**
     * Equip owned items (item id per slot, null to take off).
     *
     * @param  array<string, ?int>  $slots
     * @return array<string, int>
     */
    public function equipped(User $user, array $slots): array
    {
        $ids = array_values(array_filter($slots, fn ($id): bool => $id !== null));
        $owned = $this->ownedIds($user);
        $items = CharacterItem::query()
            ->whereKey($ids)
            ->where(fn ($query) => $query->where('is_active', true)->orWhereIn('id', $owned))
            ->get()
            ->keyBy('id');
        $equipped = [];

        foreach ($slots as $slot => $id) {
            if ($id === null) {
                continue;
            }
            $item = $items->get($id);
            if ($item === null || $item->slot !== $slot) {
                throw ValidationException::withMessages(["equipped.$slot" => __('shop.invalid_item')]);
            }
            if (! $item->isFree() && ! in_array($item->id, $owned, true)) {
                throw ValidationException::withMessages(["equipped.$slot" => __('shop.not_owned')]);
            }
            $equipped[$slot] = $item->id;
        }

        return $equipped;
    }

    /**
     * The drawable look of a profile: base appearance plus equipped items.
     * Inactive items stay visible on players who already wear them.
     *
     * @return array{color: string, accessory: string, gender: string, skin: string, hair: string, items: array<string, array{style: string, color: ?string}>}
     */
    public function look(PlayerProfile $profile): array
    {
        $equipped = $profile->equipped ?? [];
        $items = $equipped === [] ? collect() : CharacterItem::query()->whereKey(array_values($equipped))->get()->keyBy('id');

        return [
            'color' => $profile->color,
            'accessory' => $profile->accessory,
            'gender' => $profile->gender,
            'skin' => $profile->skin,
            'hair' => $profile->hair_color,
            'items' => collect($equipped)
                ->map(fn (int $id): ?array => $items->get($id)?->look())
                ->filter()
                ->all(),
        ];
    }

    /**
     * Looks for many profiles with a single item query (leaderboards).
     *
     * @param  iterable<PlayerProfile>  $profiles
     * @return array<int, array<string, mixed>> keyed by user id
     */
    public function looks(iterable $profiles): array
    {
        $profiles = collect($profiles);
        $ids = $profiles->flatMap(fn (PlayerProfile $p): array => array_values($p->equipped ?? []))->unique()->values();
        $items = $ids->isEmpty() ? collect() : CharacterItem::query()->whereKey($ids)->get()->keyBy('id');

        return $profiles->mapWithKeys(fn (PlayerProfile $p): array => [$p->user_id => [
            'color' => $p->color,
            'accessory' => $p->accessory,
            'gender' => $p->gender,
            'skin' => $p->skin,
            'hair' => $p->hair_color,
            'items' => collect($p->equipped ?? [])->map(fn (int $id): ?array => $items->get($id)?->look())->filter()->all(),
        ]])->all();
    }
}
