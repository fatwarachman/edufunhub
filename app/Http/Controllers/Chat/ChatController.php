<?php

namespace App\Http\Controllers\Chat;

use App\Http\Controllers\Controller;
use App\Http\Requests\Chat\SendChatMessageRequest;
use App\Http\Requests\Chat\StartDirectChatRequest;
use App\Http\Requests\Chat\StoreChatGroupRequest;
use App\Http\Requests\Chat\UpdateChatGroupRequest;
use App\Models\ChatConversation;
use App\Models\ChatMessage;
use App\Models\ChatParticipant;
use App\Models\User;
use App\Services\Chat\ChatService;
use App\Services\Chat\ChatServiceClient;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Inertia\Inertia;
use Inertia\Response;

/**
 * Player chat. The page and REST endpoints live in Laravel (membership,
 * storage, notifications); live delivery runs in the Go chat container.
 */
class ChatController extends Controller
{
    public function __construct(
        private ChatService $chat,
        private ChatServiceClient $client,
    ) {}

    public function index(Request $request): Response
    {
        $open = $request->integer('c') ?: null;

        return Inertia::render('chat/index', [
            'conversations' => $this->chat->inbox($request->user()),
            'openId' => $open,
            'live' => $this->client->isConfigured(),
            'wsUrl' => config('chat-service.public_ws_url'),
            'limits' => ['message' => ChatMessage::MAX_LENGTH, 'group' => ChatConversation::MAX_GROUP_MEMBERS],
        ]);
    }

    public function inbox(Request $request): JsonResponse
    {
        return response()->json([
            'conversations' => $this->chat->inbox($request->user()),
            'unread' => $this->chat->unreadTotal($request->user()),
        ]);
    }

    public function token(Request $request): JsonResponse
    {
        abort_unless($this->client->isConfigured(), 503);

        return response()->json([
            'token' => $this->client->issueToken($request->user()),
            'expires_in' => (int) config('chat-service.token_ttl'),
        ]);
    }

    public function people(Request $request): JsonResponse
    {
        return response()->json(['people' => $this->chat->searchPeople($request->user(), (string) $request->query('q', ''))]);
    }

    public function show(Request $request, ChatConversation $conversation): JsonResponse
    {
        $this->member($request, $conversation);
        $before = $request->integer('before') ?: null;
        if ($before === null) {
            $this->chat->markRead($conversation, $request->user());
        }

        return response()->json([
            'conversation' => $this->chat->presentConversation($conversation, $request->user()),
            'messages' => $this->chat->history($conversation, $request->user(), $before),
            'page_size' => ChatService::PAGE_SIZE,
        ]);
    }

    public function direct(StartDirectChatRequest $request): JsonResponse
    {
        $conversation = $this->chat->direct($request->user(), User::query()->findOrFail($request->integer('user_id')));

        return response()->json(['conversation' => $this->chat->presentConversation($conversation, $request->user())], 201);
    }

    public function storeGroup(StoreChatGroupRequest $request): JsonResponse
    {
        $conversation = $this->chat->createGroup($request->user(), $request->string('name')->toString(), array_map('intval', $request->input('member_ids')));

        return response()->json(['conversation' => $this->chat->presentConversation($conversation, $request->user())], 201);
    }

    public function updateGroup(UpdateChatGroupRequest $request, ChatConversation $conversation): JsonResponse
    {
        $participant = $this->member($request, $conversation);
        abort_unless($conversation->isGroup(), 404);

        if ($request->has('name')) {
            abort_unless($participant->role === ChatParticipant::OWNER, 403, __('chat.errors.owner_only'));
            $this->chat->rename($conversation, $request->user(), $request->string('name')->toString());
        }
        if ($request->filled('add_member_ids')) {
            $ids = array_map('intval', $request->input('add_member_ids'));
            $after = $conversation->activeParticipants()->count() + count(array_diff($ids, $conversation->activeParticipants()->pluck('user_id')->all()));
            abort_if($after > ChatConversation::MAX_GROUP_MEMBERS, 422, __('chat.errors.group_full', ['max' => ChatConversation::MAX_GROUP_MEMBERS]));
            $this->chat->addMembers($conversation, $request->user(), $ids);
        }

        return response()->json(['conversation' => $this->chat->presentConversation($conversation->refresh(), $request->user())]);
    }

    public function leave(Request $request, ChatConversation $conversation): JsonResponse
    {
        $this->member($request, $conversation);
        abort_unless($conversation->isGroup(), 422, __('chat.errors.direct_leave'));
        $this->chat->leave($conversation, $request->user());

        return response()->json(['ok' => true]);
    }

    public function send(SendChatMessageRequest $request, ChatConversation $conversation): JsonResponse
    {
        $this->member($request, $conversation);
        $message = $this->chat->send($conversation, $request->user(), $request->string('body')->toString());

        return response()->json(['message' => $this->chat->presentMessage($message->load('user.playerProfile'), $request->user())], 201);
    }

    public function read(Request $request, ChatConversation $conversation): JsonResponse
    {
        $this->member($request, $conversation);
        $this->chat->markRead($conversation, $request->user());

        return response()->json(['unread' => $this->chat->unreadTotal($request->user())]);
    }

    /** Non-members get 404 so conversation ids are not probeable. */
    private function member(Request $request, ChatConversation $conversation): ChatParticipant
    {
        $participant = $conversation->participantFor($request->user());
        abort_unless($participant !== null, 404);

        return $participant;
    }
}
