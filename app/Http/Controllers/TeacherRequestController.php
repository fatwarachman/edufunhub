<?php

namespace App\Http\Controllers;

use App\Http\Requests\TeacherRequestStoreRequest;
use App\Models\Subject;
use App\Models\TeacherRequest;
use App\Services\TeacherRequestAlerts;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Inertia\Inertia;
use Inertia\Response;

class TeacherRequestController extends Controller
{
    public function create(Request $request): Response
    {
        abort_if($request->user()->isTeacher(), 403);

        return Inertia::render('teacher-request/create', [
            'subjects' => Subject::query()->active()->ordered()->get(['key', 'name_id', 'name_en', 'icon', 'color']),
            'request' => $request->user()->teacherRequests()->latest()->first()?->only(['id', 'subject_key', 'status', 'message', 'created_at']),
        ]);
    }

    public function store(TeacherRequestStoreRequest $request, TeacherRequestAlerts $alerts): RedirectResponse
    {
        $existing = $request->user()->teacherRequests()->where('status', TeacherRequest::PENDING)->exists();
        if ($existing) {
            return back()->withErrors(['request' => __('teacher_requests.pending_exists')]);
        }

        $teacherRequest = TeacherRequest::query()->create([
            ...$request->validated(),
            'user_id' => $request->user()->id,
            'status' => TeacherRequest::PENDING,
        ]);

        activity()->causedBy($request->user())->performedOn($teacherRequest)->log('Requested teacher access');
        $alerts->notifyReviewers($teacherRequest);

        return redirect()->route('teacher-request.create')->with('success', __('teacher_requests.submitted'));
    }
}
