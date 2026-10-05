<?php

namespace App\Services\Chat;

use App\Models\ChatConversation;
use App\Models\ChatMessage;
use App\Models\ChatParticipant;
use App\Models\PlayerProfile;
use App\Models\User;
use App\Notifications\PlayerNotification;
use App\Services\CharacterShop;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Collection;
use Illuminate\Notifications\DatabaseNotification;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;

/**
 * Player chat: direct and group conversations. Laravel owns membership and
 * storage; every new message is pushed to the Go chat service for live
 * delivery and lands in the recipients' notification bell (one entry per
 * conversation, updated while unread).
 */
class ChatService
{
    /** Messages returned per page of history. */
    public const PAGE_SIZE = 40;

    public function __construct(
        private ChatServiceClient $client,
        private CharacterShop $shop,
    ) {}

    public function direct(User $from, User $to): ChatConversation
    {
        return DB::transaction(function () use ($from, $to): ChatConversation {
            $conversation = ChatConversation::query()->firstOrCreate(
                ['direct_key' => ChatConversation::directKey($from->id, $to->id)],
                ['type' => ChatConversation::DIRECT, 'created_by' => $from->id],
            );
            foreach ([$from, $to] as $user) {
                ChatParticipant::query()->updateOrCreate(
                    ['chat_conversation_id' => $conversation->id, 'user_id' => $user->id],
                    ['left_at' => null],
                );
            }

            return $conversation;
        });
    }

    /**
     * @param  list<int>  $memberIds
     */
    public function createGroup(User $owner, string $name, array $memberIds): ChatConversation
    {
        $conversation = DB::transaction(function () use ($owner, $name, $memberIds): ChatConversation {
            $conversation = ChatConversation::query()->create([
                'type' => ChatConversation::GROUP,
                'name' => $name,
                'created_by' => $owner->id,
            ]);
            $conversation->participants()->create(['user_id' => $owner->id, 'role' => ChatParticipant::OWNER]);
            foreach (array_diff(array_unique($memberIds), [$owner->id]) as $id) {
                $conversation->participants()->create(['user_id' => $id, 'role' => ChatParticipant::MEMBER]);
            }

            return $conversation;
        });

        $this->system($conversation, $owner, 'created', ['name' => $name]);

        return $conversation;
    }

    /**
     * @param  list<int>  $memberIds
     */
    public function addMembers(ChatConversation $conversation, User $by, array $memberIds): int
    {
        $added = [];
        foreach (array_unique($memberIds) as $id) {
            $participant = ChatParticipant::query()->firstOrNew(['chat_conversation_id' => $conversation->id, 'user_id' => $id]);
            if ($participant->exists && $participant->left_at === null) {
                continue;
            }
            $participant->fill(['role' => ChatParticipant::MEMBER, 'left_at' => null, 'last_read_message_id' => $conversation->messages()->max('id')])->save();
            $added[] = $id;
        }
        if ($added !== []) {
            $names = User::query()->whereKey($added)->with('playerProfile')->get()->map(fn (User $u): string => $this->displayName($u))->implode(', ');
            $this->system($conversation, $by, 'added', ['names' => $names]);
        }

        return count($added);
    }

    public function leave(ChatConversation $conversation, User $user): void
    {
        $participant = $conversation->participantFor($user);
        if (! $participant) {
            return;
        }
        $this->system($conversation, $user, 'left', ['name' => $this->displayName($user)]);
        $participant->update(['left_at' => now()]);

        if ($participant->role === ChatParticipant::OWNER) {
            $conversation->activeParticipants()->oldest('id')->first()?->update(['role' => ChatParticipant::OWNER]);
        }
        $this->clearNotification($user, $conversation);
    }

    public function rename(ChatConversation $conversation, User $by, string $name): void
    {
        $conversation->update(['name' => $name]);
        $this->system($conversation, $by, 'renamed', ['name' => $name]);
    }

    public function send(ChatConversation $conversation, User $sender, string $body): ChatMessage
    {
        $message = $conversation->messages()->create([
            'user_id' => $sender->id,
            'type' => ChatMessage::TEXT,
            'body' => $body,
        ]);
        $conversation->update(['last_message_at' => $message->created_at]);
        $conversation->participants()->where('user_id', $sender->id)->update(['last_read_message_id' => $message->id]);

        $recipients = $this->recipients($conversation, $sender);
        foreach ($recipients as $user) {
            $this->notify($user, $conversation, $sender, $body);
        }
        $this->deliver($conversation, $message);

        return $message;
    }

    public function markRead(ChatConversation $conversation, User $user): void
    {
        $last = $conversation->messages()->max('id');
        $conversation->participants()->where('user_id', $user->id)->update(['last_read_message_id' => $last]);
        $this->clearNotification($user, $conversation);
    }

    public function unreadTotal(User $user): int
    {
        return (int) ChatParticipant::query()
            ->where('chat_participants.user_id', $user->id)
            ->whereNull('chat_participants.left_at')
            ->join('chat_messages', 'chat_messages.chat_conversation_id', '=', 'chat_participants.chat_conversation_id')
            ->where('chat_messages.type', ChatMessage::TEXT)
            ->where('chat_messages.user_id', '!=', $user->id)
            ->where(fn ($q) => $q->whereNull('chat_participants.last_read_message_id')
                ->orWhereColumn('chat_messages.id', '>', 'chat_participants.last_read_message_id'))
            ->count();
    }

    /**
     * Conversation list for the inbox, newest activity first.
     *
     * @return list<array<string, mixed>>
     */
    public function inbox(User $user): array
    {
        $conversations = ChatConversation::query()
            ->for($user)
            ->with(['latestMessage.user.playerProfile', 'members.playerProfile'])
            ->orderByDesc(DB::raw('COALESCE(last_message_at, created_at)'))
            ->limit(100)
            ->get();

        $unread = $this->unreadByConversation($user, $conversations->modelKeys());
        $looks = $this->looksFor($conversations->flatMap->members);

        return $conversations->map(fn (ChatConversation $c): array => [
            ...$this->presentConversation($c, $user, $looks),
            'unread' => $unread[$c->id] ?? 0,
            'last' => $c->latestMessage ? $this->presentMessage($c->latestMessage, $user) : null,
        ])->all();
    }

    /**
     * @param  array<int, array<string, mixed>>  $looks
     * @return array<string, mixed>
     */
    public function presentConversation(ChatConversation $conversation, User $viewer, array $looks = []): array
    {
        $conversation->loadMissing('members.playerProfile');
        $looks = $looks ?: $this->looksFor($conversation->members);
        $others = $conversation->members->where('id', '!=', $viewer->id)->values();
        $owner = $conversation->members->first(fn (User $m): bool => $m->pivot->role === ChatParticipant::OWNER);

        return [
            'id' => $conversation->id,
            'type' => $conversation->type,
            'name' => $conversation->isGroup()
                ? (string) $conversation->name
                : ($others->first() ? $this->displayName($others->first()) : __('chat.deleted_user')),
            'owner_id' => $owner?->id,
            'members' => $conversation->members->map(fn (User $m): array => [
                'id' => $m->id,
                'name' => $this->displayName($m),
                'character' => $looks[$m->id] ?? null,
                'role' => $m->pivot->role,
            ])->values()->all(),
            'character' => $conversation->isGroup() ? null : ($looks[$others->first()?->id] ?? null),
        ];
    }

    /**
     * @return array{id: int, conversation_id: int, type: string, body: string, user_id: ?int, user_name: ?string, mine: bool, created_at: ?string}
     */
    public function presentMessage(ChatMessage $message, ?User $viewer = null): array
    {
        $body = $message->body;
        if ($message->type === ChatMessage::SYSTEM) {
            $data = json_decode($body, true) ?: [];
            $body = __('chat.system.'.($data['event'] ?? 'created'), [
                'actor' => (string) ($data['actor'] ?? ''),
                ...array_map('strval', (array) ($data['params'] ?? [])),
            ], $this->locale($viewer));
        }

        return [
            'id' => $message->id,
            'conversation_id' => $message->chat_conversation_id,
            'type' => $message->type,
            'body' => $body,
            'user_id' => $message->user_id,
            'user_name' => $message->user ? $this->displayName($message->user) : null,
            'mine' => $viewer !== null && $message->user_id === $viewer->id,
            'created_at' => $message->created_at?->toIso8601String(),
        ];
    }

    /**
     * Messages before $beforeId (or the newest page), oldest first.
     *
     * @return list<array<string, mixed>>
     */
    public function history(ChatConversation $conversation, User $viewer, ?int $beforeId = null): array
    {
        return $conversation->messages()
            ->with('user.playerProfile')
            ->when($beforeId, fn (Builder $q) => $q->where('id', '<', $beforeId))
            ->orderByDesc('id')
            ->limit(self::PAGE_SIZE)
            ->get()
            ->reverse()
            ->map(fn (ChatMessage $m): array => $this->presentMessage($m, $viewer))
            ->values()
            ->all();
    }

    /**
     * Players the user may start a chat with.
     *
     * @return list<array{id: int, name: string, character: array<string, mixed>|null}>
     */
    public function searchPeople(User $user, string $term, int $limit = 12): array
    {
        $term = trim($term);
        $users = User::query()
            ->whereKeyNot($user->id)
            ->whereNull('disabled_at')
            ->whereHas('playerProfile')
            ->with('playerProfile')
            ->when($term !== '', fn (Builder $q) => $q->where(fn (Builder $w) => $w
                ->where('name', 'like', '%'.$this->escapeLike($term).'%')
                ->orWhereHas('playerProfile', fn (Builder $p) => $p->where('nickname', 'like', '%'.$this->escapeLike($term).'%'))))
            ->orderBy('name')
            ->limit($limit)
            ->get();
        $looks = $this->looksFor($users);

        return $users->map(fn (User $u): array => [
            'id' => $u->id,
            'name' => $this->displayName($u),
            'character' => $looks[$u->id] ?? null,
        ])->all();
    }

    /** Player language for system lines (Indonesian by default). */
    private function locale(?User $viewer): string
    {
        return $viewer?->locale === 'en' ? 'en' : 'id';
    }

    public function displayName(User $user): string
    {
        return $user->playerProfile?->nickname ?: $user->name;
    }

    /**
     * @param  array<string, string>  $params
     */
    private function system(ChatConversation $conversation, User $actor, string $event, array $params = []): void
    {
        $message = $conversation->messages()->create([
            'user_id' => $actor->id,
            'type' => ChatMessage::SYSTEM,
            'body' => (string) json_encode(['event' => $event, 'actor' => $this->displayName($actor), 'params' => $params], JSON_UNESCAPED_UNICODE),
        ]);
        $conversation->update(['last_message_at' => $message->created_at]);
        $this->deliver($conversation, $message);
    }

    private function deliver(ChatConversation $conversation, ChatMessage $message): void
    {
        $message->loadMissing('user.playerProfile');
        $ids = $conversation->activeParticipants()->pluck('user_id')->all();
        $this->client->publish($ids, ['t' => 'message', 'message' => $this->presentMessage($message)]);
    }

    /** @return Collection<int, User> */
    private function recipients(ChatConversation $conversation, User $sender): Collection
    {
        return $conversation->members()->whereKeyNot($sender->id)->whereNull('users.disabled_at')->get();
    }

    private function notify(User $user, ChatConversation $conversation, User $sender, string $body): void
    {
        $preview = Str::limit($body, 120);
        $title = $conversation->isGroup()
            ? $this->displayName($sender).' @ '.$conversation->name
            : $this->displayName($sender);
        $url = '/chat?c='.$conversation->id;

        $existing = $this->unreadNotification($user, $conversation);
        if ($existing) {
            $count = (int) ($existing->data['count'] ?? 1) + 1;
            $existing->forceFill([
                'data' => [...$existing->data, 'title' => $title, 'body' => $preview, 'count' => $count],
                'created_at' => now(),
            ])->save();

            return;
        }

        $user->notify(new PlayerNotification('chat', title: $title, body: $preview, url: $url, conversationId: $conversation->id));
    }

    private function unreadNotification(User $user, ChatConversation $conversation): ?DatabaseNotification
    {
        return $user->unreadNotifications()
            ->where('type', 'player')
            ->where('data->kind', 'chat')
            ->where('data->conversation_id', $conversation->id)
            ->first();
    }

    private function clearNotification(User $user, ChatConversation $conversation): void
    {
        $user->unreadNotifications()
            ->where('type', 'player')
            ->where('data->kind', 'chat')
            ->where('data->conversation_id', $conversation->id)
            ->update(['read_at' => now()]);
    }

    /**
     * @param  list<int>  $ids
     * @return array<int, int>
     */
    private function unreadByConversation(User $user, array $ids): array
    {
        if ($ids === []) {
            return [];
        }

        return ChatParticipant::query()
            ->where('chat_participants.user_id', $user->id)
            ->whereIn('chat_participants.chat_conversation_id', $ids)
            ->join('chat_messages', 'chat_messages.chat_conversation_id', '=', 'chat_participants.chat_conversation_id')
            ->where('chat_messages.type', ChatMessage::TEXT)
            ->where('chat_messages.user_id', '!=', $user->id)
            ->where(fn ($q) => $q->whereNull('chat_participants.last_read_message_id')
                ->orWhereColumn('chat_messages.id', '>', 'chat_participants.last_read_message_id'))
            ->groupBy('chat_participants.chat_conversation_id')
            ->selectRaw('chat_participants.chat_conversation_id as cid, count(*) as total')
            ->pluck('total', 'cid')
            ->map(fn ($v): int => (int) $v)
            ->all();
    }

    /**
     * @param  iterable<User>  $users
     * @return array<int, array<string, mixed>>
     */
    private function looksFor(iterable $users): array
    {
        $profiles = collect($users)->map(fn (User $u): ?PlayerProfile => $u->playerProfile)->filter()->unique('id');

        return $this->shop->looks($profiles);
    }

    private function escapeLike(string $value): string
    {
        return str_replace(['\\', '%', '_'], ['\\\\', '\\%', '\\_'], $value);
    }
}
