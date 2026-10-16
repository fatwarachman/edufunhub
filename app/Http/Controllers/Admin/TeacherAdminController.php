<?php

namespace App\Http\Controllers\Admin;

use App\Http\Controllers\Controller;
use App\Http\Requests\Admin\TeacherDirectoryRequest;
use App\Models\User;
use App\Services\TeacherDirectory;
use Inertia\Inertia;
use Inertia\Response;

/**
 * Super admin: every teacher with their questions, classrooms, participants,
 * compensation and account points, plus a detail page per teacher.
 */
class TeacherAdminController extends Controller
{
    public function index(TeacherDirectoryRequest $request, TeacherDirectory $directory): Response
    {
        $filters = $request->filters();

        return Inertia::render('admin/teachers/index', [
            'filters' => $filters,
            'summary' => $directory->summary(),
            'subjects' => $directory->subjects(),
            'teachers' => $directory->paginate($filters),
        ]);
    }

    public function show(User $user, TeacherDirectory $directory): Response
    {
        abort_unless($directory->isTeacher($user), 404);

        return Inertia::render('admin/teachers/show', [
            ...$directory->detail($user),
            'subjects' => $directory->subjects(),
        ]);
    }
}
