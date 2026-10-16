<?php

namespace App\Http\Controllers\Admin;

use App\Http\Controllers\Controller;
use App\Http\Requests\Admin\ChatLogRequest;
use App\Models\ChatConversation;
use App\Models\ChatMessage;
use App\Models\ChatParticipant;
use App\Models\User;
use App\Services\Chat\ChatService;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Http\Request;
use Illuminate\Support\Carbon;
use Illuminate\Support\Str;
use Inertia\Inertia;
use Inertia\Response;

/**
 * Super admin view of every player chat (direct, group and 3D classroom
 * chat), with a per-user log of who they talked to. Opening a conversation
 * is recorded in the activity log because the content is private.
 */
class ChatLogController extends Controller
{
    public const PER_PAGE = 20;

    public const MESSAGES_PER_PAGE = 100;

    public function __construct(private ChatService $chat) {}

    public function index(ChatLogRequest $request): Response
    {
        $filters = $request->filters();

        $conversations = $this->query($filters)
            ->with([
                'participants' => fn ($query) => $query->orderBy('id'),
                'participants.user.playerProfile',
                'latestMessage.user.playerProfile',
            ])
            ->withCount('messages')
            ->orderByRaw('COALESCE(last_message_at, created_at) DESC')
            ->orderByDesc('id')
            ->paginate(self::PER_PAGE)
            ->withQueryString()
            ->through(fn (ChatConversation $conversation): array => $this->presentConversation($conversation, $request->user()));

        $user = $filters['user_id'] !== null
            ? User::query()->with('playerProfile')->find($filters['user_id'])
            : null;

        return Inertia::render('admin/chat-logs/index', [
            'filters' => $filters,
            'summary' => [
                'conversations' => ChatConversation::query()->count(),
                'direct' => ChatConversation::query()->where('type', ChatConversation::DIRECT)->count(),
                'groups' => ChatConversation::query()->where('type', ChatConversation::GROUP)->count(),
                'messages' => ChatMessage::query()->where('type', ChatMessage::TEXT)->count(),
            ],
            'user' => $user ? $this->presentUserLog($user) : null,
            'conversations' => $conversations,
        ]);
    }

    public function show(Request $request, ChatConversation $conversation): Response
    {
        $conversation->load([
            'participants' => fn ($query) => $query->orderBy('id'),
            'participants.user.playerProfile',
            'creator.playerProfile',
        ])->loadCount('messages');

        $participants = $conversation->participants;

        $messages = $conversation->messages()
            ->with('user.playerProfile')
            ->orderBy('created_at')
            ->orderBy('id')
            ->paginate(self::MESSAGES_PER_PAGE)
            ->withQueryString()
            ->through(fn (ChatMessage $message): array => $this->presentMessage($message, $conversation, $participants, $request->user()));

        activity()->causedBy($request->user())->performedOn($conversation)->log('Viewed chat log');

        return Inertia::render('admin/chat-logs/show', [
            'conversation' => [
                'id' => $conversation->id,
                'type' => $conversation->type,
                'name' => $conversation->name,
                'creator' => $conversation->creator ? $this->presentUser($conversation->creator) : null,
                'messages_count' => $conversation->messages_count,
                'created_at' => $conversation->created_at?->toIso8601String(),
                'last_message_at' => $conversation->last_message_at?->toIso8601String(),
                'participants' => $participants->map(fn (ChatParticipant $participant): array => $this->presentParticipant($participant))->values()->all(),
            ],
            'messages' => $messages,
        ]);
    }

    /**
     * @param  array{search: ?string, user_id: ?int, type: ?string, date_from: ?string, date_to: ?string}  $filters
     * @return Builder<ChatConversation>
     */
    private function query(array $filters): Builder
    {
        $search = $filters['search'];
        $like = $search !== null ? '%'.str_replace(['\\', '%', '_'], ['\\\\', '\\%', '\\_'], $search).'%' : null;

        return ChatConversation::query()
            ->when($filters['user_id'] !== null, fn (Builder $query) => $query
                ->whereHas('participants', fn (Builder $participant) => $participant->where('user_id', $filters['user_id'])))
            ->when($filters['type'] !== null, fn (Builder $query) => $query->where('type', $filters['type']))
            ->when($like !== null, fn (Builder $query) => $query->where(fn (Builder $where) => $where
                ->where('name', 'like', $like)
                ->orWhereHas('participants.user', fn (Builder $user) => $user
                    ->where('name', 'like', $like)
                    ->orWhereHas('playerProfile', fn (Builder $profile) => $profile->where('nickname', 'like', $like)))
                ->orWhereHas('messages', fn (Builder $message) => $message
                    ->where('type', ChatMessage::TEXT)
                    ->where('body', 'like', $like))))
            ->when($filters['date_from'] !== null || $filters['date_to'] !== null, fn (Builder $query) => $query
                ->whereHas('messages', fn (Builder $message) => $message
                    ->when($filters['date_from'] !== null, fn (Builder $from) => $from->where('created_at', '>=', Carbon::parse($filters['date_from'])->startOfDay()))
                    ->when($filters['date_to'] !== null, fn (Builder $to) => $to->where('created_at', '<=', Carbon::parse($filters['date_to'])->endOfDay()))));
    }

    /**
     * @return array{id: int, type: string, name: ?string, participants: list<array<string, mixed>>, messages_count: int, last_message: ?array{body: string, type: string, sender: ?string, created_at: ?string}, last_message_at: ?string, created_at: ?string}
     */
    private function presentConversation(ChatConversation $conversation, ?User $viewer): array
    {
        $latest = $conversation->latestMessage;

        return [
            'id' => $conversation->id,
            'type' => $conversation->type,
            'name' => $conversation->name,
            'participants' => $conversation->participants->map(fn (ChatParticipant $participant): array => $this->presentParticipant($participant))->values()->all(),
            'messages_count' => (int) $conversation->messages_count,
            'last_message' => $latest ? [
                'body' => Str::limit((string) $this->chat->presentMessage($latest, $viewer)['body'], 140),
                'type' => $latest->type,
                'sender' => $latest->user ? $this->chat->displayName($latest->user) : null,
                'created_at' => $latest->created_at?->toIso8601String(),
            ] : null,
            'last_message_at' => ($conversation->last_message_at ?? $latest?->created_at)?->toIso8601String(),
            'created_at' => $conversation->created_at?->toIso8601String(),
        ];
    }

    /**
     * @param  iterable<ChatParticipant>  $participants
     * @return array{id: int, type: string, body: string, sender: ?array{id: int, name: string, nickname: ?string, display_name: string, avatar_url: ?string}, recipient: ?string, created_at: ?string}
     */
    private function presentMessage(ChatMessage $message, ChatConversation $conversation, iterable $participants, ?User $viewer): array
    {
        $recipient = null;
        if (! $conversation->isGroup()) {
            $other = collect($participants)->first(fn (ChatParticipant $participant): bool => $participant->user_id !== $message->user_id);
            $recipient = $other?->user ? $this->chat->displayName($other->user) : null;
        }

        return [
            'id' => $message->id,
            'type' => $message->type,
            'body' => (string) $this->chat->presentMessage($message, $viewer)['body'],
            'sender' => $message->user ? $this->presentUser($message->user) : null,
            'recipient' => $recipient,
            'created_at' => $message->created_at?->toIso8601String(),
        ];
    }

    /**
     * @return array{id: int, user: ?array{id: int, name: string, nickname: ?string, display_name: string, avatar_url: ?string}, role: string, left_at: ?string, joined_at: ?string}
     */
    private function presentParticipant(ChatParticipant $participant): array
    {
        return [
            'id' => $participant->id,
            'user' => $participant->user ? $this->presentUser($participant->user) : null,
            'role' => $participant->role,
            'left_at' => $participant->left_at?->toIso8601String(),
            'joined_at' => $participant->created_at?->toIso8601String(),
        ];
    }

    /**
     * @return array{id: int, name: string, nickname: ?string, display_name: string, avatar_url: ?string}
     */
    private function presentUser(User $user): array
    {
        return [
            'id' => $user->id,
            'name' => $user->name,
            'nickname' => $user->playerProfile?->nickname,
            'display_name' => $this->chat->displayName($user),
            'avatar_url' => $user->avatar_url,
        ];
    }

    /**
     * Header card for the per-user filter: totals and everyone they chatted with.
     *
     * @return array{id: int, name: string, nickname: ?string, display_name: string, avatar_url: ?string, email: string, grade: ?int, school_name: ?string, conversations: int, messages_sent: int, partners: list<array{id: int, name: string, nickname: ?string, display_name: string, avatar_url: ?string, conversations: int, messages_sent: int, messages_received: int}>}
     */
    private function presentUserLog(User $user): array
    {
        $conversationIds = ChatParticipant::query()
            ->where('user_id', $user->id)
            ->pluck('chat_conversation_id')
            ->unique()
            ->values();

        $partners = ChatParticipant::query()
            ->whereIn('chat_conversation_id', $conversationIds)
            ->where('user_id', '!=', $user->id)
            ->with('user.playerProfile')
            ->get()
            ->filter(fn (ChatParticipant $participant): bool => $participant->user !== null)
            ->groupBy('user_id');

        $sentByConversation = ChatMessage::query()
            ->whereIn('chat_conversation_id', $conversationIds)
            ->where('type', ChatMessage::TEXT)
            ->selectRaw('chat_conversation_id, user_id, COUNT(*) as total')
            ->groupBy('chat_conversation_id', 'user_id')
            ->get()
            ->groupBy('chat_conversation_id');

        $partnerRows = $partners->map(function ($rows) use ($user, $sentByConversation): array {
            $shared = $rows->pluck('chat_conversation_id')->unique();
            $sent = $shared->sum(fn (int $id): int => (int) ($sentByConversation->get($id)?->firstWhere('user_id', $user->id)?->total ?? 0));
            $received = $shared->sum(fn (int $id): int => (int) ($sentByConversation->get($id)?->firstWhere('user_id', $rows->first()->user_id)?->total ?? 0));

            return [
                ...$this->presentUser($rows->first()->user),
                'conversations' => $shared->count(),
                'messages_sent' => $sent,
                'messages_received' => $received,
            ];
        })
            ->sortByDesc(fn (array $row): int => $row['messages_sent'] + $row['messages_received'])
            ->values()
            ->all();

        return [
            ...$this->presentUser($user),
            'email' => $user->email,
            'grade' => $user->playerProfile?->grade,
            'school_name' => $user->playerProfile?->school_name,
            'conversations' => $conversationIds->count(),
            'messages_sent' => ChatMessage::query()->where('user_id', $user->id)->where('type', ChatMessage::TEXT)->count(),
            'partners' => $partnerRows,
        ];
    }
}
