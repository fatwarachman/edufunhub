<?php

namespace App\Http\Controllers\Teacher;

use App\Http\Controllers\Controller;
use App\Http\Requests\Teacher\ClassroomAnnouncementRequest;
use App\Models\Classroom;
use App\Models\ClassroomAnnouncement;
use App\Services\Classrooms\ClassroomAnnouncer;
use Illuminate\Http\RedirectResponse;
use Illuminate\Support\Facades\Gate;

/**
 * Teacher side of classroom announcements: send one to every active member
 * or stop it early. Only while the classroom is running.
 */
class ClassroomAnnouncementController extends Controller
{
    public function __construct(private ClassroomAnnouncer $announcer) {}

    public function store(ClassroomAnnouncementRequest $request, Classroom $classroom): RedirectResponse
    {
        Gate::authorize('update', $classroom);

        if (! $classroom->isActive()) {
            return back()->withErrors(['announcement' => __('classrooms.announcement_not_active')]);
        }

        $announcement = $this->announcer->announce($classroom, $request->user(), $request->validated());

        activity()->causedBy($request->user())->performedOn($announcement)->log('Teacher sent classroom announcement');

        return back()->with('success', __('classrooms.announcement_sent'));
    }

    public function stop(Classroom $classroom, ClassroomAnnouncement $announcement): RedirectResponse
    {
        Gate::authorize('update', $classroom);

        if (! $classroom->isActive()) {
            return back()->withErrors(['announcement' => __('classrooms.announcement_not_active')]);
        }

        $this->announcer->stop($announcement);

        return back()->with('success', __('classrooms.announcement_stopped'));
    }
}
