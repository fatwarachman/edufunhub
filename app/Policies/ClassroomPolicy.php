<?php

namespace App\Policies;

use App\Models\Classroom;
use App\Models\User;

class ClassroomPolicy
{
    public function viewAny(User $user): bool
    {
        return $user->isTeacher() || $user->isAdmin();
    }

    public function create(User $user): bool
    {
        return $user->isTeacher();
    }

    public function view(User $user, Classroom $classroom): bool
    {
        return $user->isAdmin() || $user->id === $classroom->teacher_id;
    }

    public function update(User $user, Classroom $classroom): bool
    {
        return $user->isAdmin() || $user->id === $classroom->teacher_id;
    }

    public function delete(User $user, Classroom $classroom): bool
    {
        return $user->isAdmin() || $user->id === $classroom->teacher_id;
    }

    public function end(User $user, Classroom $classroom): bool
    {
        return $user->isAdmin() || $user->id === $classroom->teacher_id;
    }

    public function analyze(User $user, Classroom $classroom): bool
    {
        return $user->isAdmin() || $user->id === $classroom->teacher_id;
    }

    public function share(User $user, Classroom $classroom): bool
    {
        return $user->isAdmin() || $user->id === $classroom->teacher_id;
    }
}
