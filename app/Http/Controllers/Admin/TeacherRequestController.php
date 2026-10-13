<?php

namespace App\Http\Controllers\Admin;

use App\Http\Controllers\Controller;
use App\Models\Role;
use App\Models\Subject;
use App\Models\TeacherRequest;
use App\Models\TeacherSubject;
use App\Models\User;
use App\Services\PlayerNotifications;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Inertia\Inertia;
use Inertia\Response;

class TeacherRequestController extends Controller
{
    public function index(): Response
    {
        return Inertia::render('admin/teacher-requests/index', [
            'requests' => TeacherRequest::query()->with(['user:id,name,email'])->where('status', TeacherRequest::PENDING)->latest()->paginate(20),
            'subjects' => Subject::query()->active()->ordered()->get(['key', 'name_id', 'name_en']),
        ]);
    }

    public function update(Request $request, TeacherRequest $teacherRequest, PlayerNotifications $notifications): RedirectResponse
    {
        abort_unless($request->user()->is_superadmin, 403);
        $data = $request->validate(['status' => ['required', 'in:approved,rejected'], 'subjects' => ['nullable', 'array'], 'subjects.*' => ['nullable', 'string']]);

        DB::transaction(function () use ($request, $teacherRequest, $data, $notifications): void {
            $teacherRequest->update(['status' => $data['status'], 'reviewed_by' => $request->user()->id, 'reviewed_at' => now()]);
            if ($data['status'] === TeacherRequest::APPROVED) {
                $teacher = User::withTrashed()->where('users.id', (int) $teacherRequest->user_id)->firstOrFail();

                $role = Role::query()->firstOrCreate(['slug' => Role::TEACHER], ['name' => 'Guru', 'description' => 'Membuat dan mengelola quiz untuk kelas', 'is_system' => true]);
                $teacher->roles()->syncWithoutDetaching([$role->id]);
                TeacherSubject::query()->where('user_id', $teacherRequest->user_id)->delete();
                $subjects = array_values(array_filter($data['subjects'] ?? [], fn ($subject): bool => is_string($subject) && in_array($subject, Subject::activeKeys(), true)));
                foreach ($subjects === [] ? [null] : $subjects as $subject) {
                    TeacherSubject::query()->create(['user_id' => $teacherRequest->user_id, 'subject_key' => $subject]);
                }
                $notifications->notify($teacher, 'teacher', 'player_notifications.teacher_granted', url: '/teacher/questions');
            }
            activity()->causedBy($request->user())->performedOn($teacherRequest)->log('Reviewed teacher request');
        });

        return back()->with('success', __('teacher_requests.reviewed'));
    }
}
