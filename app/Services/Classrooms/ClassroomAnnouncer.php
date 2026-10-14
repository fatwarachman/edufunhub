<?php

namespace App\Services\Classrooms;

use App\Models\Classroom;
use App\Models\ClassroomAnnouncement;
use App\Models\User;
use App\Services\Chat\ChatServiceClient;

/**
 * Creates, stops and looks up classroom announcements and pushes them live
 * to the sockets of the classroom's active members through the chat service.
 * Live delivery is best effort; students also poll the current announcement.
 */
class ClassroomAnnouncer
{
    public const EVENT_SHOW = 'classroom_announcement';

    public const EVENT_END = 'classroom_announcement_end';

    public function __construct(private ChatServiceClient $chat) {}

    /**
     * Store a new announcement starting now and push it to active members.
     *
     * @param  array{title?: string|null, body: string, display_seconds: int|string}  $data
     */
    public function announce(Classroom $classroom, User $teacher, array $data): ClassroomAnnouncement
    {
        $seconds = (int) $data['display_seconds'];
        $title = isset($data['title']) && $data['title'] !== '' ? $data['title'] : null;

        $announcement = $classroom->announcements()->create([
            'teacher_id' => $teacher->id,
            'title' => $title,
            'body' => $data['body'],
            'display_seconds' => $seconds,
            'starts_at' => now(),
            'ends_at' => now()->addSeconds($seconds),
        ]);

        $this->chat->publish($this->activeMemberIds($classroom), [
            't' => self::EVENT_SHOW,
            'classroom_id' => $classroom->id,
            'announcement' => $announcement->toStudentPayload(),
        ]);

        return $announcement;
    }

    /**
     * End an announcement early and tell active members to close it.
     */
    public function stop(ClassroomAnnouncement $announcement): void
    {
        if ($announcement->ends_at->gt(now())) {
            $announcement->update(['ends_at' => now()]);
        }

        $this->chat->publish($this->activeMemberIds($announcement->classroom), [
            't' => self::EVENT_END,
            'classroom_id' => $announcement->classroom_id,
            'id' => $announcement->id,
        ]);
    }

    /** Latest announcement still on screen, if any. */
    public function current(Classroom $classroom): ?ClassroomAnnouncement
    {
        return $classroom->announcements()
            ->activeAt()
            ->latest('starts_at')
            ->latest('id')
            ->first();
    }

    /**
     * Teacher view: the 20 newest announcements.
     *
     * @return list<array<string, mixed>>
     */
    public function recent(Classroom $classroom): array
    {
        return $classroom->announcements()
            ->latest('id')
            ->limit(20)
            ->get()
            ->map(fn (ClassroomAnnouncement $announcement): array => $announcement->toTeacherPayload())
            ->values()
            ->all();
    }

    /**
     * User ids of the members currently in the classroom.
     *
     * @return list<int>
     */
    public function activeMemberIds(Classroom $classroom): array
    {
        return $classroom->members()
            ->whereNull('left_at')
            ->pluck('user_id')
            ->map(fn ($id): int => (int) $id)
            ->values()
            ->all();
    }
}
