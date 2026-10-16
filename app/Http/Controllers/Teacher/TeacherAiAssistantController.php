<?php

namespace App\Http\Controllers\Teacher;

use App\Ai\Agents\TeacherAssistant;
use App\Http\Controllers\Controller;
use App\Http\Requests\Teacher\TeacherAiAssistantMessageRequest;
use App\Mcp\TeacherAssistantSession;
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

class TeacherAiAssistantController extends Controller
{
    public function index(Request $request, AiSettings $settings): Response
    {
        return Inertia::render('teacher/ai-assistant/index', [
            'configured' => $settings->configured(),
            'model' => $settings->model() ?? '',
            'conversations' => $this->conversationList($request),
        ]);
    }

    public function show(Request $request, string $conversation): JsonResponse
    {
        $record = $this->ownedConversation($request, $conversation);

        return response()->json([
            'conversation' => ['id' => $record->id, 'title' => $record->title],
            'messages' => $record->messages()->whereIn('role', ['user', 'assistant'])->orderBy('created_at')->orderBy('id')->get(['role', 'content', 'created_at'])->map(fn (AgentConversationMessage $message): array => [
                'role' => $message->role,
                'content' => $message->content,
                'sources' => [],
                'queried_at' => $message->role === 'assistant' ? $message->created_at?->toIso8601String() : null,
            ])->values(),
        ]);
    }

    public function destroy(Request $request, string $conversation): JsonResponse
    {
        $record = $this->ownedConversation($request, $conversation);
        $record->messages()->delete();
        $record->delete();

        return response()->json(['deleted' => true]);
    }

    public function store(TeacherAiAssistantMessageRequest $request, AiSettings $settings, OpenAiCompatibleClient $client): JsonResponse
    {
        $data = new TeacherAssistantSession($request->user());
        $data->authorize();
        if (! $settings->configured()) {
            return response()->json(['message' => __('ai_assistant.unavailable')], 422);
        }

        $input = $request->validated();
        $conversationId = $input['conversation_id'] ?? null;
        if ($conversationId !== null) {
            $this->ownedConversation($request, $conversationId);
        }

        try {
            $response = retry(2, function () use ($data, $input, $request, $conversationId, $client, $settings) {
                $agent = new TeacherAssistant($data, $conversationId === null ? ($input['history'] ?? []) : []);
                $conversationId === null ? $agent->forUser($request->user()) : $agent->continue($conversationId, $request->user());

                return $agent->prompt($input['message'], provider: $client->register(), model: $settings->model(), timeout: 60);
            }, 800, fn (Throwable $exception): bool => $exception instanceof FailoverableException);
            $answer = $response->text;
            if (trim($answer) === '') {
                throw new RuntimeException('Empty teacher assistant response');
            }
        } catch (Throwable $exception) {
            $reference = (string) Str::uuid();
            Log::warning('Teacher assistant request failed', ['reference' => $reference, 'exception_class' => get_class($exception)]);

            return response()->json(['message' => __('ai_assistant.provider_error'), 'reference' => $reference], 503);
        }

        $savedConversation = $response->conversationId !== null
            ? AgentConversation::query()->find($response->conversationId, ['id', 'title', 'updated_at'])
            : null;

        return response()->json([
            'answer' => $answer,
            'sources' => [],
            'queried_at' => now()->toIso8601String(),
            'conversation' => $savedConversation ? ['id' => $savedConversation->id, 'title' => $savedConversation->title, 'updated_at' => $savedConversation->updated_at?->toIso8601String()] : null,
        ]);
    }

    /** @return list<array{id: string, title: string, updated_at: ?string}> */
    private function conversationList(Request $request): array
    {
        return $this->conversationQuery($request)->latest('updated_at')->limit(50)->get(['id', 'title', 'updated_at'])->map(fn (AgentConversation $conversation): array => [
            'id' => $conversation->id,
            'title' => $conversation->title,
            'updated_at' => $conversation->updated_at?->toIso8601String(),
        ])->all();
    }

    private function ownedConversation(Request $request, string $conversation): AgentConversation
    {
        return $this->conversationQuery($request)->whereKey($conversation)->firstOrFail();
    }

    /** @return Builder<AgentConversation> */
    private function conversationQuery(Request $request): Builder
    {
        return AgentConversation::query()->where('user_id', $request->user()->id)->whereHas('messages', fn (Builder $query) => $query->where('agent', TeacherAssistant::class));
    }
}
