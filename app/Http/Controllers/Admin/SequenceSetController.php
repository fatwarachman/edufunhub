<?php

namespace App\Http\Controllers\Admin;

use App\Http\Controllers\Controller;
use App\Http\Requests\Admin\SequenceSetRequest;
use App\Models\SequenceSet;
use App\Services\SequenceAnalytics;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\ValidationException;
use Inertia\Inertia;
use Inertia\Response;

/**
 * Super admin management of the Order Rush sequence bank (TKJ material)
 * and its learning analytics. The Go service syncs the active sets every
 * minute; running rooms keep the bank they started with.
 */
class SequenceSetController extends Controller
{
    public function index(Request $request, SequenceAnalytics $analytics): Response
    {
        $days = in_array($request->integer('days'), [7, 30, 90], true) ? $request->integer('days') : 30;
        $stats = collect($analytics->summary($days))->keyBy('key');

        return Inertia::render('admin/sequence-sets/index', [
            'sets' => SequenceSet::query()->ordered()->get()->map(fn (SequenceSet $set): array => [
                ...$set->only(['id', 'key', 'category', 'kind', 'title_id', 'title_en', 'description_id', 'description_en', 'items', 'ends', 'is_active']),
                'stats' => $stats->get($set->key),
            ])->values(),
            'analytics' => $stats->values(),
            'days' => $days,
            'kinds' => SequenceSet::KINDS,
            'limits' => ['min' => SequenceSet::MIN_ITEMS, 'max' => SequenceSet::MAX_ITEMS],
        ]);
    }

    public function store(SequenceSetRequest $request): RedirectResponse
    {
        $set = SequenceSet::query()->create([
            ...$request->validated(),
            'sort_order' => ((int) SequenceSet::query()->max('sort_order')) + 10,
            'created_by' => $request->user()->id,
        ]);

        activity()->causedBy($request->user())->performedOn($set)->log('Created sequence set');

        return back()->with('success', "Sequence set \"{$set->title_id}\" added.");
    }

    public function update(SequenceSetRequest $request, SequenceSet $sequenceSet): RedirectResponse
    {
        $data = $request->validated();
        unset($data['key']);
        if ($sequenceSet->is_active && ! $data['is_active']) {
            $this->guardLastActive($sequenceSet);
        }

        $sequenceSet->update($data);
        activity()->causedBy($request->user())->performedOn($sequenceSet)->log('Updated sequence set');

        return back()->with('success', "Sequence set \"{$sequenceSet->title_id}\" updated.");
    }

    public function toggle(Request $request, SequenceSet $sequenceSet): RedirectResponse
    {
        if ($sequenceSet->is_active) {
            $this->guardLastActive($sequenceSet);
        }

        $sequenceSet->update(['is_active' => ! $sequenceSet->is_active]);
        activity()->causedBy($request->user())->performedOn($sequenceSet)->log($sequenceSet->is_active ? 'Activated sequence set' : 'Hid sequence set');

        return back()->with('success', $sequenceSet->is_active ? 'Sequence set is live.' : 'Sequence set hidden.');
    }

    public function destroy(Request $request, SequenceSet $sequenceSet): RedirectResponse
    {
        if ($sequenceSet->is_active) {
            $this->guardLastActive($sequenceSet);
        }

        activity()->causedBy($request->user())->performedOn($sequenceSet)->log('Deleted sequence set');
        $sequenceSet->delete();

        return back()->with('success', 'Sequence set deleted.');
    }

    /** Order Rush always needs at least one active set to deal. */
    private function guardLastActive(SequenceSet $set): void
    {
        if (SequenceSet::query()->active()->whereKeyNot($set->id)->doesntExist()) {
            throw ValidationException::withMessages(['sequence_set' => 'Keep at least one active sequence set.']);
        }
    }
}
