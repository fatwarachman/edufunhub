<?php

namespace App\Http\Controllers\Admin;

use App\Http\Controllers\Controller;
use App\Http\Requests\Admin\SorterSetRequest;
use App\Models\SorterSet;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\ValidationException;
use Inertia\Inertia;
use Inertia\Response;

/**
 * Super admin management of the Port Sorter bank: each set defines its own
 * bins (2–6) and the items that fall into them. The Go service syncs the
 * active sets every minute; running games keep the set they started with.
 */
class SorterSetController extends Controller
{
    public function index(): Response
    {
        return Inertia::render('admin/sorter-sets/index', [
            'sets' => SorterSet::query()->ordered()->get()->map(fn (SorterSet $set): array => $set->only([
                'id', 'key', 'title_id', 'title_en', 'description_id', 'description_en', 'bins', 'items', 'is_active',
            ]))->values(),
            'limits' => [
                'minBins' => SorterSet::MIN_BINS,
                'maxBins' => SorterSet::MAX_BINS,
                'maxItems' => SorterSet::MAX_ITEMS,
                'maxLabel' => SorterSet::MAX_LABEL,
                'levels' => SorterSet::LEVELS,
            ],
        ]);
    }

    public function store(SorterSetRequest $request): RedirectResponse
    {
        $set = SorterSet::query()->create([
            ...$request->validated(),
            'sort_order' => ((int) SorterSet::query()->max('sort_order')) + 10,
            'created_by' => $request->user()->id,
        ]);

        activity()->causedBy($request->user())->performedOn($set)->log('Created sorter set');

        return back()->with('success', "Sorter set \"{$set->title_id}\" added.");
    }

    public function update(SorterSetRequest $request, SorterSet $sorterSet): RedirectResponse
    {
        $data = $request->validated();
        unset($data['key']);
        if ($sorterSet->is_active && ! $data['is_active']) {
            $this->guardLastActive($sorterSet);
        }

        $sorterSet->update($data);
        activity()->causedBy($request->user())->performedOn($sorterSet)->log('Updated sorter set');

        return back()->with('success', "Sorter set \"{$sorterSet->title_id}\" updated.");
    }

    public function toggle(Request $request, SorterSet $sorterSet): RedirectResponse
    {
        if ($sorterSet->is_active) {
            $this->guardLastActive($sorterSet);
        }

        $sorterSet->update(['is_active' => ! $sorterSet->is_active]);
        activity()->causedBy($request->user())->performedOn($sorterSet)->log($sorterSet->is_active ? 'Activated sorter set' : 'Hid sorter set');

        return back()->with('success', $sorterSet->is_active ? 'Sorter set is live.' : 'Sorter set hidden.');
    }

    public function destroy(Request $request, SorterSet $sorterSet): RedirectResponse
    {
        if ($sorterSet->is_active) {
            $this->guardLastActive($sorterSet);
        }

        activity()->causedBy($request->user())->performedOn($sorterSet)->log('Deleted sorter set');
        $sorterSet->delete();

        return back()->with('success', 'Sorter set deleted.');
    }

    /** Port Sorter always needs at least one active set to play. */
    private function guardLastActive(SorterSet $set): void
    {
        if (SorterSet::query()->active()->whereKeyNot($set->id)->doesntExist()) {
            throw ValidationException::withMessages(['sorter_set' => 'Keep at least one active sorter set.']);
        }
    }
}
