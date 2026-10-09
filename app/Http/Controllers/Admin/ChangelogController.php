<?php

namespace App\Http\Controllers\Admin;

use App\Http\Controllers\Controller;
use App\Http\Requests\Admin\ChangelogEntryRequest;
use App\Models\ChangelogEntry;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\ValidationException;
use Inertia\Inertia;
use Inertia\Response;

/**
 * Super admin changelog: every change shipped to the app, grouped by
 * Semantic Versioning release. Recorded changes come from
 * database/data/changelog.php (`changelog:sync`) and are read-only here;
 * super admins can add manual notes next to them.
 */
class ChangelogController extends Controller
{
    public function index(): Response
    {
        $entries = ChangelogEntry::query()
            ->orderByDesc('published_at')
            ->orderByDesc('id')
            ->get()
            ->map(fn (ChangelogEntry $entry): array => [
                ...$entry->only(['id', 'version', 'title', 'title_en', 'body', 'body_en', 'type', 'is_published']),
                'published_at' => $entry->published_at?->toIso8601String(),
                'created_at' => $entry->created_at?->toIso8601String(),
                'recorded' => $entry->isRecorded(),
            ]);

        $releases = $entries
            ->groupBy('version')
            ->sortKeysUsing(fn (string $a, string $b): int => ChangelogEntry::compareVersions($b, $a))
            ->map(fn ($changes, string $version): array => [
                'version' => $version,
                'date' => $changes->pluck('published_at')->filter()->max() ?? $changes->pluck('created_at')->max(),
                'published' => $changes->contains('is_published', true),
                'counts' => collect(ChangelogEntry::TYPES)->mapWithKeys(fn (string $type): array => [$type => $changes->where('type', $type)->count()])->all(),
                'entries' => $changes->values()->all(),
            ])
            ->values();

        return Inertia::render('admin/changelog', [
            'releases' => $releases,
            'entries' => $entries->values(),
            'currentVersion' => ChangelogEntry::currentVersion(),
            'types' => ChangelogEntry::TYPES,
        ]);
    }

    public function store(ChangelogEntryRequest $request): RedirectResponse
    {
        $data = $request->validated();
        $entry = ChangelogEntry::query()->create([
            ...$data,
            'published_at' => $data['is_published'] ? now() : null,
        ]);

        activity()->causedBy($request->user())->performedOn($entry)->log('Created changelog entry');

        return back()->with('success', __('changelog.flash.created', ['version' => $entry->version]));
    }

    public function update(ChangelogEntryRequest $request, ChangelogEntry $changelogEntry): RedirectResponse
    {
        $this->guardManual($changelogEntry);

        $data = $request->validated();
        $data['published_at'] = match (true) {
            ! $data['is_published'] => null,
            $changelogEntry->is_published => $changelogEntry->published_at,
            default => now(),
        };

        $changelogEntry->update($data);
        activity()->causedBy($request->user())->performedOn($changelogEntry)->log('Updated changelog entry');

        return back()->with('success', __('changelog.flash.updated', ['version' => $changelogEntry->version]));
    }

    public function destroy(Request $request, ChangelogEntry $changelogEntry): RedirectResponse
    {
        $this->guardManual($changelogEntry);

        activity()->causedBy($request->user())->performedOn($changelogEntry)->log('Deleted changelog entry');
        $changelogEntry->delete();

        return back()->with('success', __('changelog.flash.deleted', ['version' => $changelogEntry->version]));
    }

    /** Recorded entries are owned by database/data/changelog.php. */
    private function guardManual(ChangelogEntry $entry): void
    {
        if ($entry->isRecorded()) {
            throw ValidationException::withMessages(['entry' => __('changelog.validation.recorded')]);
        }
    }
}
