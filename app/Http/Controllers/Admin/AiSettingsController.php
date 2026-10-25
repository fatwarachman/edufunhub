<?php

namespace App\Http\Controllers\Admin;

use App\Http\Controllers\Controller;
use App\Http\Requests\Admin\AiConnectionRequest;
use App\Http\Requests\Admin\AutoAssessmentRequest;
use App\Jobs\IndexQuestionBlueprint;
use App\Models\QuestionBlueprint;
use App\Services\Ai\AiSettings;
use App\Services\Ai\AutoAbilityAssessment;
use App\Services\Ai\EmbeddingClient;
use App\Services\Ai\OpenAiCompatibleClient;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;
use Inertia\Inertia;
use Inertia\Response;
use RuntimeException;

/**
 * OpenAI-compatible AI connection: base URL, encrypted key, model list, the
 * model used to generate questions and the automatic ability analysis
 * thresholds.
 */
class AiSettingsController extends Controller
{
    public function __construct(private AiSettings $settings, private OpenAiCompatibleClient $client) {}

    public function index(AutoAbilityAssessment $auto): Response
    {
        return Inertia::render('admin/ai-settings', [
            'connection' => [
                'base_url' => $this->settings->baseUrl(),
                'has_key' => $this->settings->hasKey(),
                'key_hint' => $this->settings->keyHint(),
                'model' => $this->settings->model(),
                'configured' => $this->settings->configured(),
            ],
            'models' => $this->settings->cachedModels(),
            'modelsFetchedAt' => $this->settings->modelsFetchedAt(),
            'autoAssessment' => $auto->toArray(),
            'embeddingModel' => app(EmbeddingClient::class)->model(),
        ]);
    }

    public function autoAssessment(AutoAssessmentRequest $request, AutoAbilityAssessment $auto): RedirectResponse
    {
        $data = $request->validated();
        $auto->save((bool) $data['enabled'], (int) $data['first'], (int) $data['next']);
        activity()->causedBy($request->user())->withProperties($data)->log('Updated automatic AI ability analysis');

        return back()->with('success', __('ai.auto_saved'));
    }

    public function update(AiConnectionRequest $request): RedirectResponse
    {
        $this->settings->saveConnection($request->validated('base_url'), $request->validated('api_key'));
        activity()->causedBy($request->user())->withProperties(['base_url' => $request->validated('base_url')])->log('Updated AI connection');

        if (! $this->settings->hasKey()) {
            return back()->with('success', __('ai.connection_saved'));
        }

        return $this->refresh($request);
    }

    public function refresh(Request $request): RedirectResponse
    {
        try {
            $models = $this->client->listModels();
        } catch (RuntimeException $exception) {
            return back()->withErrors(['models' => $exception->getMessage()]);
        }
        $this->settings->cacheModels($models);

        return back()->with('success', trans_choice('ai.models_loaded', count($models), ['count' => count($models)]));
    }

    public function model(Request $request): RedirectResponse
    {
        $known = array_column($this->settings->cachedModels(), 'id');
        $data = $request->validate(['model' => ['required', 'string', 'max:150', Rule::in($known)]], ['model.in' => __('ai.model_unknown')]);
        $this->settings->saveModel($data['model']);
        activity()->causedBy($request->user())->withProperties($data)->log('Selected AI model');

        return back()->with('success', __('ai.model_saved', ['model' => $data['model']]));
    }

    /**
     * Embedding model for blueprint search (RAG). Empty turns semantic
     * search off; a model is tested with one real request before saving.
     */
    public function embeddingModel(Request $request, EmbeddingClient $embeddings): RedirectResponse
    {
        $data = $request->validate(['embedding_model' => ['nullable', 'string', 'max:150', 'regex:/^[\w.\/:@+-]+$/']]);
        $model = trim((string) ($data['embedding_model'] ?? ''));

        if ($model !== '') {
            try {
                $embeddings->embed(['kisi-kisi soal'], $model);
            } catch (RuntimeException $exception) {
                return back()->withErrors(['embedding_model' => $exception->getMessage()]);
            }
        }

        $previous = $embeddings->model();
        $embeddings->saveModel($model);
        activity()->causedBy($request->user())->withProperties(['embedding_model' => $model])->log('Selected AI embedding model');

        if ($previous !== ($model !== '' ? $model : null)) {
            QuestionBlueprint::query()->get()->each(function (QuestionBlueprint $blueprint): void {
                $blueprint->forceFill(['index_status' => QuestionBlueprint::INDEX_PENDING])->save();
                IndexQuestionBlueprint::dispatch($blueprint);
            });
        }

        return back()->with('success', $model !== '' ? __('blueprint.embedding_saved', ['model' => $model]) : __('blueprint.embedding_cleared'));
    }

    public function forgetKey(Request $request): RedirectResponse
    {
        $this->settings->forgetKey();
        activity()->causedBy($request->user())->log('Removed AI API key');

        return back()->with('success', __('ai.key_removed'));
    }
}
