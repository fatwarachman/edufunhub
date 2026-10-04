<?php

namespace App\Http\Controllers;

use App\Http\Requests\BuyCharacterItemRequest;
use App\Http\Requests\UpdateCharacterRequest;
use App\Models\CharacterItem;
use App\Models\PlayerProfile;
use App\Services\CharacterShop;
use App\Services\PlayerNotifications;
use App\Services\PlayerPortal;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Inertia\Inertia;
use Inertia\Response;

/**
 * Character builder and shop: base look (boy/girl, skin, hair, shirt colour)
 * plus items per slot bought with points.
 */
class CharacterController extends Controller
{
    public function __construct(private CharacterShop $shop, private PlayerPortal $portal, private PlayerNotifications $notifications) {}

    public function show(Request $request): Response
    {
        $user = $request->user();
        $profile = $user->playerProfile()->first() ?? new PlayerProfile;
        $locale = $user->locale === 'en' ? 'en' : 'id';

        return Inertia::render('user/character', [
            'character' => $profile->character(),
            'equipped' => (object) ($profile->equipped ?? []),
            'balance' => $this->portal->balance($user),
            'owned' => $this->shop->ownedIds($user),
            'items' => $this->shop->catalog()->map(fn (CharacterItem $item): array => [
                'id' => $item->id,
                'key' => $item->key,
                'slot' => $item->slot,
                'style' => $item->style,
                'color' => $item->color,
                'name' => $item->name($locale),
                'price' => $item->price,
            ])->values(),
            'options' => [
                'slots' => CharacterItem::SLOTS,
                'genders' => PlayerProfile::GENDERS,
                'skins' => PlayerProfile::SKINS,
                'hairColors' => PlayerProfile::HAIR_COLORS,
                'colors' => PlayerProfile::COLORS,
            ],
        ]);
    }

    public function update(UpdateCharacterRequest $request): RedirectResponse
    {
        $user = $request->user();
        $data = $request->safe()->only(['color', 'accessory', 'nickname', 'gender', 'skin', 'hair_color']);

        if ($request->has('equipped')) {
            $data['equipped'] = $this->shop->equipped($user, $request->equippedSlots());
            $data['accessory'] = $this->shop->legacyAccessory($data['equipped']);
        } elseif (isset($data['accessory'])) {
            $data['equipped'] = $this->legacyEquipped($data['accessory']);
        }

        $user->playerProfile()->updateOrCreate([], $data);

        return to_route('character.show');
    }

    public function buy(BuyCharacterItemRequest $request, CharacterItem $item): RedirectResponse
    {
        $user = $request->user();
        $this->shop->buy($user, $item);
        $name = $item->name($user->locale === 'en' ? 'en' : 'id');
        $this->notifications->notify($user, 'item', 'player_notifications.item', ['item' => $name], '/dashboard#vault');

        return to_route('character.show')->with('success', __('shop.bought', ['item' => $name]));
    }

    /**
     * Wear or take off an item from the vault.
     */
    public function wear(Request $request, CharacterItem $item): RedirectResponse
    {
        $user = $request->user();
        $wearing = $this->shop->toggleWear($user, $item);
        $name = $item->name($user->locale === 'en' ? 'en' : 'id');

        return back()->with('success', __($wearing ? 'shop.worn' : 'shop.taken_off', ['item' => $name]));
    }

    /**
     * Keep the old cap/glasses picker working: map it to the free shop items.
     *
     * @return array<string, int>
     */
    private function legacyEquipped(string $accessory): array
    {
        $item = in_array($accessory, ['cap', 'glasses'], true)
            ? CharacterItem::query()->where('key', $accessory)->first()
            : null;

        return $item ? [$item->slot => $item->id] : [];
    }
}
