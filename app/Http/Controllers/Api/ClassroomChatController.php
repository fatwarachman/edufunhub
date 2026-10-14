<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Http\Requests\Api\StoreClassroomChatRequest;
use App\Models\Classroom;
use App\Models\User;
use App\Services\Chat\ChatService;
use Illuminate\Http\JsonResponse;
use Illuminate\Support\Facades\Cache;

/**
 * Stores a proximity chat line from the 3D classroom world into the direct
 * conversation of the two people, so it shows on /chat with notifications.
 * Both sides must be active members or the classroom teacher, and the
 * classroom must be active. Event ids are deduplicated for a day.
 */
class ClassroomChatController extends Controller
{
    public function store(StoreClassroomChatRequest $request, ChatService $chat): JsonResponse
    {
        /** @var array{event_id: string, classroom: int, from: int, to: int, text: string} $data */
        $data = $request->validated();

        $classroom = Classroom::query()->whereKey($data['classroom'])->activeAt()->first();
        abort_if($classroom === null, 403);

        $from = $this->participant($classroom, (int) $data['from']);
        $to = $this->participant($classroom, (int) $data['to']);
        abort_if($from === null || $to === null, 403);

        if (! Cache::add('classroom-chat:'.$data['event_id'], 1, now()->addDay())) {
            return response()->json(['status' => 'duplicate']);
        }

        $conversation = $chat->direct($from, $to);
        $chat->send($conversation, $from, $data['text']);

        return response()->json(['status' => 'stored', 'conversation_id' => $conversation->id]);
    }

    /** An enabled user who is the teacher or an active member of the classroom. */
    private function participant(Classroom $classroom, int $userId): ?User
    {
        $isMember = (int) $classroom->teacher_id === $userId
            || $classroom->members()->where('user_id', $userId)->whereNull('left_at')->exists();

        if (! $isMember) {
            return null;
        }

        return User::query()->whereKey($userId)->whereNull('disabled_at')->first();
    }
}
