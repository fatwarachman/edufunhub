<?php

namespace App\Services\Classrooms;

use App\Models\Classroom;
use App\Models\User;

class ClassroomContext
{
    /**
     * Find the classroom the user is actively playing in for a given game.
     */
    public function currentFor(User $user, string $gameKey): ?Classroom
    {
        $gameKey = str_ends_with($gameKey, '-host') ? substr($gameKey, 0, -5) : $gameKey;

        $member = $user
            ->classroomMembers()
            ->whereNull('left_at')
            ->whereHas('classroom', fn ($q) => $q
                ->activeAt()
                ->whereHas('games', fn ($q) => $q->where('game_key', $gameKey))
            )
            ->with('classroom.games')
            ->latest('joined_at')
            ->first();

        return $member?->classroom;
    }
}
