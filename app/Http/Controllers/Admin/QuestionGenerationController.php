<?php

namespace App\Http\Controllers\Admin;

use App\Http\Controllers\Controller;
use App\Http\Requests\Admin\GenerateQuestionsRequest;
use App\Jobs\GenerateQuestions;
use App\Models\Question;
use App\Models\QuestionGeneration;
use App\Models\Subject;
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
            'grades' => Question::GRADES,
            'games' => Question::GAMES,
            'maxPerCombination' => QuestionGeneration::MAX_PER_COMBINATION,
            'maxTotal' => self::MAX_TOTAL,
            'aiTotal' => Question::query()->where('source', Question::SOURCE_AI)->count(),
            'generations' => QuestionGeneration::query()
                ->with(['requester:id,name', 'items' => fn ($query) => $query->orderBy('id')])
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
        $total = count($data['subjects']) * count($data['grades']) * $data['per_combination'];
        if ($total > self::MAX_TOTAL) {
            return back()->withErrors(['per_combination' => __('ai.too_many', ['total' => $total, 'max' => self::MAX_TOTAL])]);
        }

        $generation = DB::transaction(function () use ($request, $settings, $data): QuestionGeneration {
            $generation = QuestionGeneration::query()->create([
                'requested_by' => $request->user()->id,
                'model' => (string) $settings->model(),
                'subjects' => array_values($data['subjects']),
                'grades' => array_values(array_map('intval', $data['grades'])),
                'level' => Question::normalizeLevel($data['level'] ?? Question::LEVEL_EASY),
                'per_combination' => $data['per_combination'],
                'games' => array_values($data['games']),
                'activate' => $data['activate'],
                'status' => 'queued',
                'total_jobs' => count($data['subjects']) * count($data['grades']),
            ]);
            $generation->createItems();

            return $generation;
        });

        foreach ($generation->subjects as $subject) {
            foreach ($generation->grades as $grade) {
                GenerateQuestions::dispatch($generation, $subject, $grade);
            }
        }

        activity()->causedBy($request->user())->performedOn($generation)->withProperties(['total' => $total])->log('Started AI question generation');

        return redirect()->route('admin.questions.generate')->with('success', __('ai.generation_started', ['total' => $total]));
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
