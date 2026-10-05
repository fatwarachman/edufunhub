<?php

namespace App\Http\Controllers\Admin;

use App\Http\Controllers\Controller;
use App\Http\Requests\Admin\SubjectRequest;
use App\Models\Question;
use App\Models\Subject;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\ValidationException;
use Inertia\Inertia;
use Inertia\Response;

/**
 * Super admin management of school subjects (mata pelajaran). New subjects
 * show up in every game's subject picker once they have questions, and the
 * Go service receives the list with the next bank sync (within a minute).
 */
class SubjectController extends Controller
{
    public function index(): Response
    {
        $counts = Question::query()
            ->selectRaw('subject, COUNT(*) as total, SUM(CASE WHEN is_active THEN 1 ELSE 0 END) as active')
            ->groupBy('subject')
            ->get()
            ->keyBy('subject');

        return Inertia::render('admin/subjects/index', [
            'subjects' => Subject::query()->ordered()->get()->map(fn (Subject $subject): array => [
                ...$subject->only(['id', 'key', 'name_id', 'name_en', 'icon', 'color', 'ai_hint', 'sort_order', 'is_active', 'is_system']),
                'questions' => (int) ($counts->get($subject->key)->total ?? 0),
                'active_questions' => (int) ($counts->get($subject->key)->active ?? 0),
            ])->values(),
            'icons' => Subject::ICONS,
        ]);
    }

    public function store(SubjectRequest $request): RedirectResponse
    {
        $subject = Subject::query()->create([
            ...$request->validated(),
            'sort_order' => ((int) Subject::query()->max('sort_order')) + 10,
            'created_by' => $request->user()->id,
        ]);

        activity()->causedBy($request->user())->performedOn($subject)->log('Created subject');

        return back()->with('success', __('subjects.flash.created', ['name' => $subject->name_id]));
    }

    public function update(SubjectRequest $request, Subject $subject): RedirectResponse
    {
        $data = $request->validated();
        unset($data['key']);
        if ($subject->is_active && ! $data['is_active']) {
            $this->guardLastActive($subject);
        }

        $subject->update($data);
        activity()->causedBy($request->user())->performedOn($subject)->log('Updated subject');

        return back()->with('success', __('subjects.flash.updated', ['name' => $subject->name_id]));
    }

    public function toggle(Request $request, Subject $subject): RedirectResponse
    {
        if ($subject->is_active) {
            $this->guardLastActive($subject);
        }

        $subject->update(['is_active' => ! $subject->is_active]);
        activity()->causedBy($request->user())->performedOn($subject)->log($subject->is_active ? 'Activated subject' : 'Hid subject');

        return back()->with('success', __($subject->is_active ? 'subjects.flash.shown' : 'subjects.flash.hidden', ['name' => $subject->name_id]));
    }

    /** Move a subject one place up or down in the pickers. */
    public function move(Request $request, Subject $subject): RedirectResponse
    {
        $direction = $request->validate(['direction' => ['required', 'in:up,down']])['direction'];
        $ordered = Subject::query()->ordered()->get()->values();
        $index = $ordered->search(fn (Subject $item): bool => $item->is($subject));
        $target = $direction === 'up' ? $index - 1 : $index + 1;

        if ($index !== false && $ordered->has($target)) {
            $moved = $ordered->pull($index);
            $ordered = $ordered->values();
            $ordered->splice($target, 0, [$moved]);
            $ordered->values()->each(function (Subject $item, int $i): void {
                $item->sort_order = ($i + 1) * 10;
                if ($item->isDirty('sort_order')) {
                    $item->save();
                }
            });
        }

        return back();
    }

    public function destroy(Request $request, Subject $subject): RedirectResponse
    {
        if ($subject->is_system) {
            throw ValidationException::withMessages(['subject' => __('subjects.validation.system_delete')]);
        }
        if ($subject->questions()->exists()) {
            throw ValidationException::withMessages(['subject' => __('subjects.validation.has_questions', ['count' => $subject->questions()->count()])]);
        }

        activity()->causedBy($request->user())->performedOn($subject)->log('Deleted subject');
        $subject->delete();

        return back()->with('success', __('subjects.flash.deleted', ['name' => $subject->name_id]));
    }

    /** Games always need at least one subject to pick from. */
    private function guardLastActive(Subject $subject): void
    {
        if (Subject::query()->active()->whereKeyNot($subject->id)->doesntExist()) {
            throw ValidationException::withMessages(['subject' => __('subjects.validation.last_active')]);
        }
    }
}
