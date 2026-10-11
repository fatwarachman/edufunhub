<?php

namespace App\Services\Classrooms;

use App\Models\User;

class ClassroomPresence
{
    /**
     * Touch last_seen_at for all active classroom memberships.
     */
    public function touch(User $user, string $area = ''): void
    {
        $gameKey = null;
        if (str_starts_with($area, 'game:')) {
            $gameKey = substr($area, 5);
        }

        $members = $user
            ->classroomMembers()
            ->whereNull('left_at')
            ->whereHas('classroom', fn ($q) => $q->activeAt())
            ->with('classroom.games')
            ->get();

        foreach ($members as $member) {
            $update = ['last_seen_at' => now()];
            if ($gameKey !== null && $member->classroom->games->pluck('game_key')->contains($gameKey)) {
                $update['current_game'] = $gameKey;
            } else {
                $update['current_game'] = null;
            }
            $member->updateQuietly($update);
        }
    }
}
