<?php

namespace App\Http\Controllers;

use App\Models\Classroom;
use App\Services\Classrooms\ClassroomAnnouncer;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/**
 * Student side of classroom announcements: the announcement on screen right
 * now (polling fallback when the live socket is down).
 */
class ClassroomAnnouncementController extends Controller
{
    public function __construct(private ClassroomAnnouncer $announcer) {}

    public function show(string $pin, Request $request): JsonResponse
    {
        $classroom = Classroom::query()
            ->where('pin', $pin)
            ->activeAt()
            ->latest('starts_at')
            ->first();

        $isActiveMember = $classroom !== null && $classroom->members()
            ->where('user_id', $request->user()->id)
            ->whereNull('left_at')
            ->exists();

        abort_unless($isActiveMember, 403);

        return response()->json([
            'announcement' => $this->announcer->current($classroom)?->toStudentPayload(),
        ]);
    }
}
