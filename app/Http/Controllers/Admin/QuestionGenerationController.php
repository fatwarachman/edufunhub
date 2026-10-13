<?php

namespace App\Http\Controllers\Admin;

use App\Http\Controllers\Controller;
use App\Http\Requests\Admin\GenerateQuestionsRequest;
use App\Jobs\GenerateQuestions;
use App\Models\Question;
use App\Models\QuestionGeneration;
use App\Models\Subject;
use App\Models\SubjectTopic;
use App\Services\Ai\AiSettings;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Inertia\Inertia;
use Inertia\Response;

/**
 * Generate bank questions with the configured AI model for every subject and
 * grade, or a chosen subset. Each subject/grade pair is one queued job.
 */
class QuestionGenerationController extends Controller
{
    /** Hard limit of questions one request may produce. */
    public const MAX_TOTAL = 800;

    public function index(AiSettings $settings): Response
    {
        return Inertia::render('admin/questions/generate', [
            'ai' => ['configured' => $settings->configured(), 'model' => $settings->model()],
            'subjects' => Subject::activeKeys(),
            'topics' => SubjectTopic::query()->active()->ordered()->get(['id', 'subject_key', 'name_id', 'name_en', 'material'])
                ->map(fn (SubjectTopic $topic): array => $topic->only(['id', 'subject_key', 'name_id', 'name_en', 'material']))
                ->values(),
            'grades' => Question::GRADES,
            'games' => Question::GAMES,
            'maxPerCombination' => QuestionGeneration::MAX_PER_COMBINATION,
            'maxTotal' => self::MAX_TOTAL,
            'aiTotal' => Question::query()->where('source', Question::SOURCE_AI)->count(),
            'generations' => QuestionGeneration::query()
                ->with(['requester:id,name', 'topic:id,name_id,name_en', 'items' => fn ($query) => $query->with('topic:id,name_id,name_en')->orderBy('id')])
                ->latest('id')
                ->limit(15)
                ->get()
                ->map(fn (QuestionGeneration $generation): array => $generation->toProgressPayload()),
        ]);
    }

    public function store(GenerateQuestionsRequest $request, AiSettings $settings): RedirectResponse
    {
        if (! $settings->configured()) {
            return back()->withErrors(['ai' => __('ai.not_configured')]);
        }

        $data = $request->validated();
        $plan = $this->plan($data['subjects'], $data['topic_ids']);
        $total = count($plan['targets']) * count($data['grades']) * $data['per_combination'];
        if ($total > self::MAX_TOTAL) {
            return back()->withErrors(['per_combination' => __('ai.too_many', ['total' => $total, 'max' => self::MAX_TOTAL])]);
        }

        $generation = DB::transaction(function () use ($request, $settings, $data, $plan): QuestionGeneration {
            $generation = QuestionGeneration::query()->create([
                'requested_by' => $request->user()->id,
                'model' => (string) $settings->model(),
                'subjects' => $plan['subjects'],
                'topic_ids' => $plan['topic_ids'],
                'grades' => array_values(array_map('intval', $data['grades'])),
                'level' => Question::normalizeLevel($data['level'] ?? Question::LEVEL_EASY),
                'topic_id' => count($plan['topic_ids']) === 1 ? $plan['topic_ids'][0] : null,
                'per_combination' => $data['per_combination'],
                'games' => array_values($data['games']),
                'activate' => $data['activate'],
                'status' => 'queued',
                'total_jobs' => count($plan['targets']) * count($data['grades']),
            ]);
            $generation->createItems();

            return $generation;
        });

        foreach ($plan['targets'] as $target) {
            foreach ($generation->grades as $grade) {
                GenerateQuestions::dispatch($generation, $target['subject'], $grade, $target['topic_id']);
            }
        }

        activity()->causedBy($request->user())->performedOn($generation)->withProperties(['total' => $total])->log('Started AI question generation');

        return redirect()->route('admin.questions.generate')->with('success', __('ai.generation_started', ['total' => $total]));
    }

    /**
     * Whole subjects cover all their active topics (or the subject itself
     * when it has none); single topics only cover themselves.
     *
     * @param  list<string>  $subjects
     * @param  list<int|string>  $topicIds
     * @return array{subjects: list<string>, topic_ids: list<int>, targets: list<array{subject: string, topic_id: ?int}>}
     */
    private function plan(array $subjects, array $topicIds): array
    {
        $picked = SubjectTopic::query()->active()->whereIn('id', array_map('intval', $topicIds))->get(['id', 'subject_key']);
        $wholeTopics = SubjectTopic::query()->active()->whereIn('subject_key', $subjects)->get(['id', 'subject_key']);
        $allSubjects = array_values(array_unique([...$subjects, ...$picked->pluck('subject_key')->all()]));
        $order = array_flip(Subject::activeKeys());
        usort($allSubjects, fn (string $a, string $b): int => ($order[$a] ?? PHP_INT_MAX) <=> ($order[$b] ?? PHP_INT_MAX));

        $generation = new QuestionGeneration([
            'subjects' => $allSubjects,
            'topic_ids' => $wholeTopics->merge($picked)->pluck('id')->unique()->map(fn ($id): int => (int) $id)->values()->all(),
        ]);
        $targets = $generation->targets();

        return [
            'subjects' => $allSubjects,
            'topic_ids' => array_values(array_filter(array_map(fn (array $t): ?int => $t['topic_id'], $targets))),
            'targets' => $targets,
        ];
    }

    /**
     * Stop a running request: queued pairs are dropped, running pairs end
     * after their current batch and keep the questions already saved.
     */
    public function cancel(Request $request, QuestionGeneration $generation): RedirectResponse
    {
        if (! $generation->isLive() || $generation->cancelled_at !== null) {
            return back()->withErrors(['generation' => __('ai.generation_not_running')]);
        }

        $generation->cancel();
        activity()->causedBy($request->user())->performedOn($generation)->log('Stopped AI question generation');

        return back()->with('success', __('ai.generation_stopped'));
    }
}
