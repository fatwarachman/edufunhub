<?php

namespace App\Http\Controllers\Admin;

use App\Http\Controllers\Controller;
use App\Http\Requests\Admin\QuestionBlueprintRequest;
use App\Jobs\IndexQuestionBlueprint;
use App\Models\QuestionBlueprint;
use App\Services\Ai\BlueprintChunker;
use App\Services\Ai\BlueprintRetriever;
use App\Services\Ai\BlueprintTextExtractor;
use App\Services\Ai\QuestionGenerator;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Str;
use RuntimeException;
use Symfony\Component\HttpFoundation\StreamedResponse;

/**
 * Question blueprints (kisi-kisi soal): upload a document, keep its text and
 * let the admin pick it when generating questions with AI.
 */
class QuestionBlueprintController extends Controller
{
    public function store(QuestionBlueprintRequest $request, BlueprintTextExtractor $extractor): RedirectResponse
    {
        $file = $request->file('file');
        $extension = strtolower($file->getClientOriginalExtension() ?: (string) $file->extension());

        try {
            $content = $extractor->extract($file->getRealPath(), $extension);
        } catch (RuntimeException $exception) {
            return back()->withErrors(['file' => $exception->getMessage()]);
        }

        $path = $file->storeAs(QuestionBlueprint::FOLDER, Str::uuid().'.'.$extension, 'local');
        $blueprint = QuestionBlueprint::query()->create([
            'title' => $request->validated('title'),
            'subject_key' => $request->validated('subject_key'),
            'is_active' => $request->validated('is_active'),
            'original_name' => Str::limit($file->getClientOriginalName(), 250, ''),
            'path' => $path,
            'extension' => $extension,
            'size' => (int) $file->getSize(),
            'content' => Str::limit($content, QuestionBlueprint::MAX_CONTENT, ''),
            'uploaded_by' => $request->user()->id,
        ]);

        IndexQuestionBlueprint::dispatch($blueprint);
        activity()->causedBy($request->user())->performedOn($blueprint)->log('Uploaded question blueprint');

        return back()->with('success', __('blueprint.uploaded', ['title' => $blueprint->title]));
    }

    public function update(QuestionBlueprintRequest $request, QuestionBlueprint $blueprint): RedirectResponse
    {
        $content = BlueprintTextExtractor::tidy($request->validated('content'));
        $changed = $content !== $blueprint->content;
        $blueprint->update([
            ...$request->safe()->only(['title', 'subject_key', 'is_active']),
            'content' => $content,
            ...($changed ? ['index_status' => QuestionBlueprint::INDEX_PENDING] : []),
        ]);
        if ($changed) {
            IndexQuestionBlueprint::dispatch($blueprint);
        }

        activity()->causedBy($request->user())->performedOn($blueprint)->log('Updated question blueprint');

        return back()->with('success', __('blueprint.saved'));
    }

    /** Rebuild the retrieval index (after changing the embedding model, or a failed run). */
    public function reindex(Request $request, QuestionBlueprint $blueprint): RedirectResponse
    {
        $blueprint->forceFill(['index_status' => QuestionBlueprint::INDEX_PENDING, 'index_error' => null])->save();
        IndexQuestionBlueprint::dispatch($blueprint);
        activity()->causedBy($request->user())->performedOn($blueprint)->log('Reindexed question blueprint');

        return back()->with('success', __('blueprint.reindexing'));
    }

    /**
     * Preview which sections the AI receives for a subject, grade and topic.
     */
    public function preview(Request $request, QuestionBlueprint $blueprint, BlueprintRetriever $retriever): JsonResponse
    {
        $data = $request->validate([
            'subject' => ['nullable', 'string', 'max:30'],
            'grade' => ['nullable', 'integer', 'between:0,12'],
            'query' => ['nullable', 'string', 'max:300'],
        ]);
        $grade = isset($data['grade']) ? (int) $data['grade'] : null;
        $query = QuestionGenerator::blueprintQuery($data['subject'] ?? null, $grade, null, $data['query'] ?? null);
        $result = $retriever->retrieve($blueprint, $query, $grade);

        return response()->json([
            'query' => $query,
            'mode' => $result['mode'],
            'characters' => mb_strlen($result['text']),
            'sections' => collect($blueprint->chunks()->exists()
                ? $blueprint->chunks()->orderBy('position')->get(['position', 'heading', 'content', 'grades'])->map(fn ($chunk): array => $chunk->only(['position', 'heading', 'content', 'grades']))->all()
                : collect(app(BlueprintChunker::class)->chunk($blueprint->content))->values()->map(fn (array $chunk, int $position): array => [...$chunk, 'position' => $position])->all())
                ->map(fn (array $chunk): array => [
                    'position' => $chunk['position'],
                    'heading' => $chunk['heading'],
                    'preview' => Str::limit($chunk['content'], 220),
                    'characters' => mb_strlen($chunk['content']),
                    'grades' => $chunk['grades'] ?? [],
                    'picked' => in_array($chunk['position'], $result['sections'], true),
                ]),
        ]);
    }

    public function download(QuestionBlueprint $blueprint): StreamedResponse
    {
        abort_unless(Storage::disk('local')->exists($blueprint->path), 404);

        return Storage::disk('local')->download($blueprint->path, $blueprint->original_name);
    }

    public function destroy(Request $request, QuestionBlueprint $blueprint): RedirectResponse
    {
        activity()->causedBy($request->user())->performedOn($blueprint)->withProperties(['title' => $blueprint->title])->log('Deleted question blueprint');
        $blueprint->delete();

        return back()->with('success', __('blueprint.deleted'));
    }
}
