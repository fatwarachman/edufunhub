<?php

namespace App\Http\Controllers\Teacher;

use App\Http\Controllers\Controller;
use App\Models\Subject;
use App\Models\SubjectTopic;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;
use Inertia\Inertia;
use Inertia\Response;

/**
 * Teacher portal: CRUD for subject topics the teacher created.
 * Teachers can only edit/delete topics they created (created_by).
 */
class TeacherTopicController extends Controller
{
    public function index(Request $request): Response
    {
        $teacher = $request->user();

        $subjects = Subject::query()->active()->ordered()->get(['key', 'name_id', 'name_en', 'icon', 'color']);

        $topics = SubjectTopic::query()
            ->ordered()
            ->withCount('questions')
            ->get()
            ->map(fn (SubjectTopic $t): array => [
                ...$t->only(['id', 'subject_key', 'name_id', 'name_en', 'material', 'is_active', 'sort_order', 'created_by']),
                'questions_count' => $t->questions_count,
                'can_edit' => $t->created_by === $teacher->id,
                'created_at' => $t->created_at?->toIso8601String(),
            ]);

        return Inertia::render('teacher/topics', [
            'topics' => $topics,
            'subjects' => $subjects->map(fn (Subject $s): array => $s->only(['key', 'name_id', 'name_en', 'icon', 'color']))->values(),
        ]);
    }

    public function store(Request $request): RedirectResponse
    {
        $data = $request->validate([
            'subject_key' => ['required', 'string', Rule::in(Subject::activeKeys())],
            'name_id' => ['required', 'string', 'min:2', 'max:120'],
            'name_en' => ['nullable', 'string', 'max:120'],
            'material' => ['nullable', 'string', 'max:'.SubjectTopic::MAX_MATERIAL],
            'is_active' => ['boolean'],
        ]);

        // Unique name_id per subject_key
        $exists = SubjectTopic::query()
            ->where('subject_key', $data['subject_key'])
            ->where('name_id', $data['name_id'])
            ->exists();

        if ($exists) {
            return back()->withErrors(['name_id' => __('teacher.topics.name_taken')])->withInput();
        }

        $topic = SubjectTopic::query()->create([
            ...$data,
            'created_by' => $request->user()->id,
        ]);

        activity()->causedBy($request->user())->performedOn($topic)->log('Teacher created topic');

        return back()->with('success', __('teacher.topics.created'));
    }

    public function update(Request $request, SubjectTopic $topic): RedirectResponse
    {
        abort_unless($topic->created_by === $request->user()->id, 403);

        $data = $request->validate([
            'name_id' => ['required', 'string', 'min:2', 'max:120'],
            'name_en' => ['nullable', 'string', 'max:120'],
            'material' => ['nullable', 'string', 'max:'.SubjectTopic::MAX_MATERIAL],
            'is_active' => ['boolean'],
        ]);

        // Unique name_id per subject_key (ignoring self)
        $exists = SubjectTopic::query()
            ->where('subject_key', $topic->subject_key)
            ->where('name_id', $data['name_id'])
            ->where('id', '!=', $topic->id)
            ->exists();

        if ($exists) {
            return back()->withErrors(['name_id' => __('teacher.topics.name_taken')])->withInput();
        }

        $topic->update($data);
        activity()->causedBy($request->user())->performedOn($topic)->log('Teacher updated topic');

        return back()->with('success', __('teacher.topics.updated'));
    }

    public function destroy(Request $request, SubjectTopic $topic): RedirectResponse
    {
        abort_unless($topic->created_by === $request->user()->id, 403);

        activity()->causedBy($request->user())->performedOn($topic)->log('Teacher deleted topic');
        $topic->delete();

        return back()->with('success', __('teacher.topics.deleted'));
    }
}
