<?php

namespace App\Services\Classrooms;

use App\Models\Classroom;
use Illuminate\Support\Facades\DB;

class ClassroomLive
{
    /**
     * Live payload for the teacher dashboard.
     *
     * @return array{members_count: int, online_count: int, playing_count: int, updated_at: string, members: list<array>}
     */
    public function forClassroom(Classroom $classroom): array
    {
        $members = $classroom->members()->with('user.playerProfile')->get();
        $onlineSecs = Classroom::ONLINE_SECONDS;
        $now = now();

        $memberData = $members->map(function ($member) use ($now, $onlineSecs): array {
            $profile = $member->user->playerProfile;
            $online = $member->left_at === null
                && $member->last_seen_at !== null
                && $member->last_seen_at->gt($now->copy()->subSeconds($onlineSecs));

            return [
                'member_id' => $member->id,
                'user_id' => $member->user_id,
                'name' => $profile?->nickname ?? $member->user->name,
                'grade' => $profile?->grade,
                'school' => $profile?->school_name,
                'joined_at' => $member->joined_at?->toIso8601String(),
                'last_seen_at' => $member->last_seen_at?->toIso8601String(),
                'online' => $online,
                'current_game' => $member->current_game,
                'removed' => $member->left_at !== null,
            ];
        })->values()->all();

        $points = DB::table('game_histories')
            ->where('classroom_id', $classroom->id)
            ->selectRaw('user_id, COUNT(*) as plays, COALESCE(SUM(points), 0) as points')
            ->groupBy('user_id')
            ->pluck('points', 'user_id');

        $memberData = array_map(function (array $data) use ($points): array {
            $data['plays'] = 0;
            $data['answered'] = 0;
            $data['correct'] = 0;
            $data['points'] = $points[$data['user_id']] ?? 0;

            return $data;
        }, $memberData);

        $online = collect($memberData)->filter(fn (array $m): bool => $m['online'])->count();
        $playing = collect($memberData)->filter(fn (array $m): bool => $m['current_game'] !== null && $m['online'])->count();

        return [
            'members_count' => $members->count(),
            'online_count' => $online,
            'playing_count' => $playing,
            'updated_at' => $now->toIso8601String(),
            'members' => $memberData,
        ];
    }
}
