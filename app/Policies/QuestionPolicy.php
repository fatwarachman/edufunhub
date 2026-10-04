<?php

namespace App\Policies;

use App\Models\Question;
use App\Models\User;

/**
 * Teachers manage only the questions they authored; super admins manage all.
 */
class QuestionPolicy
{
    public function update(User $user, Question $question): bool
    {
        return $user->is_superadmin || ($user->isTeacher() && $question->isTeacherAuthored() && $question->created_by === $user->id);
    }

    public function delete(User $user, Question $question): bool
    {
        return $this->update($user, $question);
    }
}
