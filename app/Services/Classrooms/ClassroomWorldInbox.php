<?php

namespace App\Services\Classrooms;

use App\Models\ChatConversation;
use App\Models\ChatMessage;
use App\Models\ChatParticipant;
use App\Models\Classroom;
use App\Models\User;
use App\Services\Chat\ChatService;
use Illuminate\Support\Collection;

/**
 * Unanswered direct messages a classroom participant got from other people of
 * the same classroom (teacher + active members), grouped per sender. Feeds
 * the 3D world: count chips above heads and the "waiting chats" list.
 * Only messages the viewer has not read yet are returned.
 */
class ClassroomWorldInbox
{
    /** Newest unread lines returned per sender. */
    public const MESSAGES_PER_SENDER = 5;

    public function __construct(private ChatService $chat) {}

    /**
     * @return array{total: int, senders: list<array{user_id: int, name: string, teacher: bool, conversation_id: int, unread: int, last_at: string|null, messages: list<array{id: int, text: string, at: string|null}>}>}
     */
    public function for(Classroom $classroom, User $viewer): array
    {
        $people = $this->participantIds($classroom)->reject(fn (int $id): bool => $id === (int) $viewer->id);
        if ($people->isEmpty()) {
            return ['total' => 0, 'senders' => []];
        }

        $byKey = $people->mapWithKeys(fn (int $id): array => [ChatConversation::directKey((int) $viewer->id, $id) => $id]);
        $conversations = ChatConversation::query()
            ->where('type', ChatConversation::DIRECT)
            ->whereIn('direct_key', $byKey->keys()->all())
            ->get(['id', 'direct_key']);
        if ($conversations->isEmpty()) {
            return ['total' => 0, 'senders' => []];
        }

        $lastRead = ChatParticipant::query()
            ->where('user_id', $viewer->id)
            ->whereNull('left_at')
            ->whereIn('chat_conversation_id', $conversations->modelKeys())
            ->pluck('last_read_message_id', 'chat_conversation_id');

        $senders = [];
        foreach ($conversations as $conversation) {
            if (! $lastRead->has($conversation->id)) {
                continue;
            }
            $senderId = (int) $byKey[$conversation->direct_key];
            $unread = ChatMessage::query()
                ->where('chat_conversation_id', $conversation->id)
                ->where('type', ChatMessage::TEXT)
                ->where('user_id', $senderId)
                ->when($lastRead[$conversation->id] !== null, fn ($q) => $q->where('id', '>', (int) $lastRead[$conversation->id]));
            $count = (clone $unread)->count();
            if ($count === 0) {
                continue;
            }
            $latest = (clone $unread)->orderByDesc('id')->limit(self::MESSAGES_PER_SENDER)->get(['id', 'body', 'created_at'])->reverse()->values();
            $senders[] = [
                'user_id' => $senderId,
                'conversation_id' => (int) $conversation->id,
                'unread' => $count,
                'last_at' => $latest->last()?->created_at?->toIso8601String(),
                'messages' => $latest->map(fn (ChatMessage $m): array => [
                    'id' => (int) $m->id,
                    'text' => (string) $m->body,
                    'at' => $m->created_at?->toIso8601String(),
                ])->all(),
            ];
        }

        if ($senders === []) {
            return ['total' => 0, 'senders' => []];
        }

        $users = User::query()->with('playerProfile')->whereKey(array_column($senders, 'user_id'))->get()->keyBy('id');
        $teacherId = (int) $classroom->teacher_id;
        $rows = collect($senders)
            ->filter(fn (array $s): bool => $users->has($s['user_id']))
            ->map(fn (array $s): array => [
                'user_id' => $s['user_id'],
                'name' => $this->chat->displayName($users[$s['user_id']]),
                'teacher' => $s['user_id'] === $teacherId,
                'conversation_id' => $s['conversation_id'],
                'unread' => $s['unread'],
                'last_at' => $s['last_at'],
                'messages' => $s['messages'],
            ])
            ->sortByDesc('last_at')
            ->values();

        return ['total' => (int) $rows->sum('unread'), 'senders' => $rows->all()];
    }

    /**
     * Whether $userId may be talked to from this classroom world.
     */
    public function isParticipant(Classroom $classroom, int $userId): bool
    {
        return $this->participantIds($classroom)->contains($userId);
    }

    /** @return Collection<int, int> */
    private function participantIds(Classroom $classroom): Collection
    {
        return $classroom->members()
            ->whereNull('left_at')
            ->pluck('user_id')
            ->map(fn ($id): int => (int) $id)
            ->push((int) $classroom->teacher_id)
            ->filter(fn (int $id): bool => $id > 0)
            ->unique()
            ->values();
    }
}
