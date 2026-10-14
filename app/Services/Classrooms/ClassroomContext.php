<?php

namespace App\Services\Classrooms;

use App\Models\Classroom;
use App\Models\User;

class ClassroomContext
{
    public function __construct(private ClassroomPlayLimit $limits) {}

    /**
     * Find the classroom the user is actively playing in for a given game.
     * Still returned when the play limit is reached, so a game already
     * running keeps its classroom; use canStart() before a new play.
     */
    public function currentFor(User $user, string $gameKey): ?Classroom
    {
        $gameKey = ClassroomPlayLimit::baseGameKey($gameKey);

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

    /**
     * Whether the user may start a new classroom play of this game: true
     * outside a classroom or when the game still has plays left.
     */
    public function canStart(User $user, string $gameKey): bool
    {
        $classroom = $this->currentFor($user, $gameKey);

        return $classroom === null || $this->limits->remaining($classroom, $user, $gameKey) !== 0;
    }
}
