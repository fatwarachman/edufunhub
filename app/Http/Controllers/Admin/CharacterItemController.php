<?php

namespace App\Http\Controllers\Admin;

use App\Http\Controllers\Controller;
use App\Http\Requests\Admin\CharacterItemRequest;
use App\Models\CharacterItem;
use App\Models\PlayerProfile;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;
use Inertia\Inertia;
use Inertia\Response;

/**
 * Super admin management of character shop items: prices, availability and
 * how many players own and wear each item.
 */
class CharacterItemController extends Controller
{
    public function index(Request $request): Response
    {
        $slot = in_array($request->query('slot'), CharacterItem::SLOTS, true) ? $request->query('slot') : null;
        $wearing = $this->wearingCounts();

        $items = CharacterItem::query()
            ->withCount('owners')
            ->withSum('owners as points_spent', 'character_item_user.price_paid')
            ->when($slot, fn ($q) => $q->where('slot', $slot))
            ->orderBy('slot')
            ->orderBy('sort_order')
            ->orderBy('price')
            ->get()
            ->map(fn (CharacterItem $item): array => [
                ...$item->only(['id', 'key', 'slot', 'style', 'color', 'name_id', 'name_en', 'price', 'is_active', 'sort_order']),
                'owners' => $item->isFree() ? null : (int) $item->owners_count,
                'wearing' => $wearing[$item->id] ?? 0,
                'points_spent' => (int) $item->points_spent,
            ]);

        return Inertia::render('admin/character-items/index', [
            'items' => $items->values(),
            'filters' => ['slot' => $slot],
            'summary' => [
                'items' => CharacterItem::query()->count(),
                'active' => CharacterItem::query()->active()->count(),
                'purchases' => (int) DB::table('character_item_user')->count(),
                'buyers' => (int) DB::table('character_item_user')->distinct()->count('user_id'),
                'points_spent' => (int) DB::table('character_item_user')->sum('price_paid'),
            ],
            ...$this->options(),
        ]);
    }

    public function create(): Response
    {
        return Inertia::render('admin/character-items/form', ['item' => null, ...$this->options()]);
    }

    public function store(CharacterItemRequest $request): RedirectResponse
    {
        $data = $request->validated();
        $item = CharacterItem::query()->create([
            ...$data,
            'sort_order' => $data['sort_order'] ?? 0,
            'key' => Str::slug($data['name_en'] ?: $data['name_id']).'-'.Str::lower(Str::random(4)),
        ]);

        activity()->causedBy($request->user())->performedOn($item)->log('Created character item');

        return to_route('admin.character-items.index')->with('success', 'Item created.');
    }

    public function edit(CharacterItem $characterItem): Response
    {
        $characterItem->loadCount('owners');

        return Inertia::render('admin/character-items/form', [
            'item' => [
                ...$characterItem->only(['id', 'key', 'slot', 'style', 'color', 'name_id', 'name_en', 'price', 'is_active', 'sort_order']),
                'owners' => (int) $characterItem->owners_count,
                'wearing' => $this->wearingCounts()[$characterItem->id] ?? 0,
            ],
            ...$this->options(),
        ]);
    }

    /**
     * Price changes apply to future purchases; owners keep their items.
     */
    public function update(CharacterItemRequest $request, CharacterItem $characterItem): RedirectResponse
    {
        $data = $request->validated();
        $characterItem->update([...$data, 'sort_order' => $data['sort_order'] ?? $characterItem->sort_order]);

        activity()->causedBy($request->user())->performedOn($characterItem)->log('Updated character item');

        return to_route('admin.character-items.index')->with('success', 'Item updated.');
    }

    public function toggle(Request $request, CharacterItem $characterItem): RedirectResponse
    {
        $characterItem->update(['is_active' => ! $characterItem->is_active]);
        activity()->causedBy($request->user())->performedOn($characterItem)->log($characterItem->is_active ? 'Activated character item' : 'Deactivated character item');

        return back()->with('success', $characterItem->is_active ? 'Item is back in the shop.' : 'Item hidden from the shop. Owners keep it.');
    }

    /**
     * Owned items cannot be deleted (players paid for them); hide them instead.
     */
    public function destroy(Request $request, CharacterItem $characterItem): RedirectResponse
    {
        if ($characterItem->owners()->exists() || ($this->wearingCounts()[$characterItem->id] ?? 0) > 0) {
            return back()->with('error', 'Players own or wear this item. Hide it from the shop instead.');
        }

        activity()->causedBy($request->user())->performedOn($characterItem)->log('Deleted character item');
        $characterItem->delete();

        return to_route('admin.character-items.index')->with('success', 'Item deleted.');
    }

    /**
     * Players wearing each item right now (from the equipped JSON).
     *
     * @return array<int, int>
     */
    private function wearingCounts(): array
    {
        $counts = [];
        PlayerProfile::query()->whereNotNull('equipped')->select(['id', 'equipped'])->chunkById(500, function ($profiles) use (&$counts): void {
            foreach ($profiles as $profile) {
                foreach ((array) $profile->equipped as $id) {
                    $counts[(int) $id] = ($counts[(int) $id] ?? 0) + 1;
                }
            }
        });

        return $counts;
    }

    /** @return array<string, mixed> */
    private function options(): array
    {
        return ['slots' => CharacterItem::SLOTS, 'styles' => CharacterItem::STYLES, 'maxPrice' => CharacterItem::MAX_PRICE];
    }
}
