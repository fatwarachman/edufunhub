<?php

namespace App\Http\Controllers\Admin;

use App\Ai\Agents\AdminAssistant;
use App\Http\Controllers\Controller;
use App\Http\Requests\Admin\AiAssistantConversationRequest;
use App\Http\Requests\Admin\AiAssistantMessageRequest;
use App\Mcp\AdminAssistantSession;
use App\Models\AgentConversation;
use App\Models\AgentConversationMessage;
use App\Services\Ai\AiSettings;
use App\Services\Ai\OpenAiCompatibleClient;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Str;
use Inertia\Inertia;
use Inertia\Response;
use Laravel\Ai\Exceptions\FailoverableException;
use RuntimeException;
use Throwable;

class AiAssistantController extends Controller
{
    public function index(Request $request, AiSettings $settings): Response
    {
        abort_unless($request->user()?->is_superadmin, 403);

        return Inertia::render('admin/ai-assistant/index', [
            'configured' => $settings->configured(),
            'model' => $settings->model() ?? '',
            'conversations' => $this->conversationList($request),
        ]);
    }

    public function show(Request $request, string $conversation): JsonResponse
    {
        abort_unless($request->user()?->is_superadmin, 403);
        $record = $this->ownedConversation($request, $conversation);
        $messages = $record->messages()
            ->whereIn('role', ['user', 'assistant'])
            ->where('content', '!=', '')
            ->orderBy('created_at')
            ->orderBy('id')
            ->get(['id', 'role', 'content', 'meta', 'created_at']);

        return response()->json([
            'conversation' => ['id' => $record->id, 'title' => $record->title],
            'messages' => $messages->map(fn (AgentConversationMessage $message): array => [
                'role' => $message->role,
                'content' => $message->content,
                'sources' => $message->role === 'assistant' ? $this->safeSources($message->meta['sources'] ?? []) : [],
                'queried_at' => $message->role === 'assistant' ? $message->created_at?->toIso8601String() : null,
            ])->values(),
        ]);
    }

    public function update(AiAssistantConversationRequest $request, string $conversation): JsonResponse
    {
        $record = $this->ownedConversation($request, $conversation);
        $record->update(['title' => trim($request->validated('title'))]);

        return response()->json(['conversation' => ['id' => $record->id, 'title' => $record->title]]);
    }

    public function destroy(Request $request, string $conversation): JsonResponse
    {
        abort_unless($request->user()?->is_superadmin, 403);
        $record = $this->ownedConversation($request, $conversation);
        $record->messages()->delete();
        $record->delete();

        return response()->json(['deleted' => true]);
    }

    public function store(AiAssistantMessageRequest $request, AiSettings $settings, OpenAiCompatibleClient $client): JsonResponse
    {
        $data = new AdminAssistantSession($request->user());
        $data->authorize();
        if (! $settings->configured()) {
            return response()->json(['message' => __('ai_assistant.unavailable')], 422);
        }
        $input = $request->validated();
        $conversationId = $input['conversation_id'] ?? null;
        if ($conversationId !== null) {
            $this->ownedConversation($request, $conversationId);
        }
        $started = microtime(true);
        try {
            $response = retry(2, function () use ($data, $input, $request, $conversationId, $client, $settings) {
                $agent = new AdminAssistant($data, $conversationId === null ? ($input['history'] ?? []) : []);
                $conversationId === null ? $agent->forUser($request->user()) : $agent->continue($conversationId, $request->user());

                return $agent->prompt($input['message'], provider: $client->register(), model: $settings->model(), timeout: 60);
            }, 800, fn (Throwable $exception): bool => $exception instanceof FailoverableException);
            $answer = $response->text;
            if (trim($answer) === '') {
                throw new RuntimeException('Empty assistant response');
            }
        } catch (Throwable $exception) {
            $reference = (string) Str::uuid();
            Log::warning('Admin assistant request failed', ['reference' => $reference, 'exception_class' => get_class($exception)]);

            return response()->json(['message' => __('ai_assistant.provider_error'), 'reference' => $reference], 503);
        }
        $sources = $data->sources();
        $savedConversation = null;
        if ($response->conversationId !== null) {
            AgentConversationMessage::query()
                ->where('conversation_id', $response->conversationId)
                ->where('role', 'assistant')
                ->latest('created_at')
                ->latest('id')
                ->first()
                ?->update(['meta' => ['sources' => $sources]]);
            $savedConversation = AgentConversation::query()->find($response->conversationId, ['id', 'title', 'updated_at']);
        }
        Log::info('Admin assistant answered', ['seconds' => round(microtime(true) - $started, 2), 'tool_calls' => $response->toolCalls->count()]);

        return response()->json([
            'answer' => $answer,
            'sources' => $sources,
            'queried_at' => now()->toIso8601String(),
            'conversation' => $savedConversation ? [
                'id' => $savedConversation->id,
                'title' => $savedConversation->title,
                'updated_at' => $savedConversation->updated_at?->toIso8601String(),
            ] : null,
        ]);
    }

    /** @return list<array{id: string, title: string, updated_at: ?string}> */
    private function conversationList(Request $request): array
    {
        return $this->conversationQuery($request)
            ->latest('updated_at')
            ->limit(50)
            ->get(['id', 'title', 'updated_at'])
            ->map(fn (AgentConversation $conversation): array => [
                'id' => $conversation->id,
                'title' => $conversation->title,
                'updated_at' => $conversation->updated_at?->toIso8601String(),
            ])
            ->all();
    }

    private function ownedConversation(Request $request, string $conversation): AgentConversation
    {
        return $this->conversationQuery($request)->whereKey($conversation)->firstOrFail();
    }

    /** @return Builder<AgentConversation> */
    private function conversationQuery(Request $request): Builder
    {
        return AgentConversation::query()
            ->where('user_id', $request->user()->id)
            ->whereHas('messages', fn (Builder $query) => $query->where('agent', AdminAssistant::class));
    }

    /**
     * @return list<array{label: string, url: string}>
     */
    private function safeSources(mixed $sources): array
    {
        return collect(is_array($sources) ? $sources : [])
            ->filter(fn ($source): bool => is_array($source) && is_string($source['label'] ?? null) && is_string($source['url'] ?? null) && str_starts_with($source['url'], '/admin/'))
            ->map(fn (array $source): array => ['label' => $source['label'], 'url' => $source['url']])
            ->values()
            ->all();
    }
}
