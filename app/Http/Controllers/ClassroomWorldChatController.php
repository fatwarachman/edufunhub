<?php

namespace App\Http\Controllers;

use App\Http\Requests\ClassroomWorldReplyRequest;
use App\Models\Classroom;
use App\Models\User;
use App\Services\Chat\ChatService;
use App\Services\Classrooms\ClassroomWorldInbox;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Gate;

/**
 * Direct chats inside the 3D classroom world: unanswered messages from people
 * of the same classroom, replying from the "waiting chats" list and marking a
 * conversation read. Students reach it by PIN (active member of an active
 * classroom), the teacher by classroom id (owner of an active classroom).
 * Partners must be the teacher or an active member of the same classroom.
 */
class ClassroomWorldChatController extends Controller
{
    public function __construct(
        private ClassroomWorldInbox $inbox,
        private ChatService $chat,
    ) {}

    public function inbox(string $pin, Request $request): JsonResponse
    {
        return response()->json($this->inbox->for($this->studentClassroom($pin, $request->user()), $request->user()));
    }

    public function reply(string $pin, ClassroomWorldReplyRequest $request): JsonResponse
    {
        return $this->send($this->studentClassroom($pin, $request->user()), $request);
    }

    public function read(string $pin, Request $request): JsonResponse
    {
        return $this->markRead($this->studentClassroom($pin, $request->user()), $request);
    }

    public function teacherInbox(Classroom $classroom, Request $request): JsonResponse
    {
        $this->ensureOwner($classroom, $request->user());

        return response()->json($this->inbox->for($classroom, $request->user()));
    }

    public function teacherReply(Classroom $classroom, ClassroomWorldReplyRequest $request): JsonResponse
    {
        $this->ensureOwner($classroom, $request->user());

        return $this->send($classroom, $request);
    }

    public function teacherRead(Classroom $classroom, Request $request): JsonResponse
    {
        $this->ensureOwner($classroom, $request->user());

        return $this->markRead($classroom, $request);
    }

    private function send(Classroom $classroom, ClassroomWorldReplyRequest $request): JsonResponse
    {
        $viewer = $request->user();
        $partner = $this->partner($classroom, $viewer, $request->integer('user_id'));

        $conversation = $this->chat->direct($viewer, $partner);
        $message = $this->chat->send($conversation, $viewer, $request->string('text')->toString());
        $this->chat->markRead($conversation, $viewer);

        return response()->json([
            'message' => [
                'id' => (int) $message->id,
                'text' => (string) $message->body,
                'at' => $message->created_at?->toIso8601String(),
            ],
            'inbox' => $this->inbox->for($classroom, $viewer),
        ], 201);
    }

    private function markRead(Classroom $classroom, Request $request): JsonResponse
    {
        $request->validate(['user_id' => ['required', 'integer', 'min:1']]);
        $viewer = $request->user();
        $partner = $this->partner($classroom, $viewer, $request->integer('user_id'));

        $conversation = $this->chat->direct($viewer, $partner);
        $this->chat->markRead($conversation, $viewer);

        return response()->json(['inbox' => $this->inbox->for($classroom, $viewer)]);
    }

    /** Another enabled participant of the classroom, or 404. */
    private function partner(Classroom $classroom, User $viewer, int $userId): User
    {
        abort_if($userId === (int) $viewer->id || ! $this->inbox->isParticipant($classroom, $userId), 404);

        return User::query()->whereKey($userId)->whereNull('disabled_at')->firstOrFail();
    }

    private function studentClassroom(string $pin, User $user): Classroom
    {
        $classroom = Classroom::query()->where('pin', $pin)->activeAt()->firstOrFail();
        abort_unless(
            $classroom->members()->where('user_id', $user->id)->whereNull('left_at')->exists(),
            403,
        );

        return $classroom;
    }

    private function ensureOwner(Classroom $classroom, User $user): void
    {
        Gate::authorize('view', $classroom);
        abort_unless((int) $classroom->teacher_id === (int) $user->id, 403);
        abort_unless($classroom->isActive(), 404);
    }
}
