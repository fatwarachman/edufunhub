<?php

namespace App\Http\Controllers;

use App\Models\ClassroomMember;
use App\Services\Classrooms\StudentClassroomProgress;
use Illuminate\Http\Request;
use Inertia\Inertia;
use Inertia\Response;

/**
 * "Kelasku": the classrooms a student joined, with their own games, scores,
 * questions and self analysis. Only the membership owner can open a detail.
 */
class MyClassroomController extends Controller
{
    public function __construct(private StudentClassroomProgress $progress) {}

    public function index(Request $request): Response
    {
        return Inertia::render('portal/my-classrooms', [
            'classrooms' => $this->progress->list($request->user()),
        ]);
    }

    /** Teachers the student learned with and the classes joined with each. */
    public function teachers(Request $request): Response
    {
        return Inertia::render('portal/my-teachers', [
            'teachers' => $this->progress->teachers($request->user()),
        ]);
    }

    public function show(ClassroomMember $member, Request $request): Response
    {
        abort_unless($member->user_id === $request->user()->id && $member->classroom()->exists(), 404);

        return Inertia::render('portal/my-classroom', [
            'detail' => $this->progress->detail($member),
        ]);
    }
}
