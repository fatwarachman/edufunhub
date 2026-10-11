<?php

namespace App\Http\Controllers\Admin;

use App\Http\Controllers\Controller;
use App\Models\Subject;
use App\Models\SubjectTopic;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;

/**
 * Admin CRUD for subject topics (materi per mata pelajaran).
 */
class SubjectTopicController extends Controller
{
    public function index(Subject $subject): JsonResponse
    {
        return response()->json([
            'topics' => $subject->topics()->ordered()->withCount('questions')->get()
                ->map(fn (SubjectTopic $t): array => [
                    ...$t->only(['id', 'subject_key', 'name_id', 'name_en', 'material', 'is_active', 'sort_order', 'created_by']),
                    'questions_count' => $t->questions_count,
                    'created_at' => $t->created_at?->toIso8601String(),
                ]),
        ]);
    }

    public function store(Request $request, Subject $subject): JsonResponse
    {
        $data = $request->validate([
            'name_id' => ['required', 'string', 'min:2', 'max:120', Rule::unique('subject_topics')->where('subject_key', $subject->key)],
            'name_en' => ['nullable', 'string', 'max:120'],
            'material' => ['nullable', 'string', 'max:'.SubjectTopic::MAX_MATERIAL],
            'is_active' => ['boolean'],
        ]);

        $topic = $subject->topics()->create([...$data, 'created_by' => $request->user()->id]);
        activity()->causedBy($request->user())->performedOn($topic)->log('Admin created topic');

        return response()->json(['topic' => $topic->fresh()], 201);
    }

    public function update(Request $request, Subject $subject, SubjectTopic $topic): JsonResponse
    {
        abort_unless($topic->subject_key === $subject->key, 404);

        $data = $request->validate([
            'name_id' => ['required', 'string', 'min:2', 'max:120', Rule::unique('subject_topics')->where('subject_key', $subject->key)->ignore($topic->id)],
            'name_en' => ['nullable', 'string', 'max:120'],
            'material' => ['nullable', 'string', 'max:'.SubjectTopic::MAX_MATERIAL],
            'is_active' => ['boolean'],
        ]);

        $topic->update($data);
        activity()->causedBy($request->user())->performedOn($topic)->log('Admin updated topic');

        return response()->json(['topic' => $topic->fresh()]);
    }

    public function destroy(Request $request, Subject $subject, SubjectTopic $topic): JsonResponse
    {
        abort_unless($topic->subject_key === $subject->key, 404);

        activity()->causedBy($request->user())->performedOn($topic)->log('Admin deleted topic');
        $topic->delete();

        return response()->json(['deleted' => true]);
    }

    public function toggle(Request $request, Subject $subject, SubjectTopic $topic): JsonResponse
    {
        abort_unless($topic->subject_key === $subject->key, 404);

        $topic->update(['is_active' => ! $topic->is_active]);
        activity()->causedBy($request->user())->performedOn($topic)->log('Admin toggled topic');

        return response()->json(['topic' => $topic->fresh()]);
    }
}
