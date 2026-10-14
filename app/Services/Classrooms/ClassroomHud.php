<?php

namespace App\Services\Classrooms;

use App\Models\Classroom;
use App\Models\ClassroomMember;
use App\Models\GameHistory;
use App\Models\User;

/**
 * HUD payload of the classroom world: my classroom points, plays, rank and
 * the top 10 of the active members. Never exposes emails.
 */
class ClassroomHud
{
    public const LEADERBOARD_SIZE = 10;

    public function __construct(private ClassroomPlayLimit $playLimits) {}

    /**
     * @return array{me: array{points: int, plays: int, rank: int|null}, leaderboard: list<array{rank: int, user_id: int, name: string, points: int, plays: int, is_me: bool}>, members_count: int, ends_at: string|null, limits: array<string, array{plays: int, max: int|null, remaining: int|null}>}
     */
    public function forMember(Classroom $classroom, User $user): array
    {
        $members = $classroom->members()
            ->whereNull('left_at')
            ->with('user.playerProfile')
            ->get();

        $totals = GameHistory::query()
            ->where('classroom_id', $classroom->id)
            ->selectRaw('user_id, COUNT(*) as plays, COALESCE(SUM(points), 0) as points')
            ->groupBy('user_id')
            ->get()
            ->keyBy('user_id');

        $rows = $members
            ->map(function (ClassroomMember $member) use ($totals, $user): array {
                $total = $totals->get($member->user_id);
                $profile = $member->user?->playerProfile;

                return [
                    'user_id' => (int) $member->user_id,
                    'name' => (string) ($profile?->nickname ?: $member->user?->name),
                    'points' => (int) ($total->points ?? 0),
                    'plays' => (int) ($total->plays ?? 0),
                    'is_me' => (int) $member->user_id === (int) $user->id,
                ];
            })
            ->sort(function (array $a, array $b): int {
                return [$b['points'], $b['plays'], $a['name']] <=> [$a['points'], $a['plays'], $b['name']];
            })
            ->values()
            ->map(fn (array $row, int $index): array => ['rank' => $index + 1, ...$row]);

        $me = $rows->firstWhere('is_me', true);
        $myTotal = $totals->get($user->id);

        return [
            'me' => [
                'points' => (int) ($myTotal->points ?? 0),
                'plays' => (int) ($myTotal->plays ?? 0),
                'rank' => $me['rank'] ?? null,
            ],
            'leaderboard' => $rows->take(self::LEADERBOARD_SIZE)->values()->all(),
            'members_count' => $members->count(),
            'ends_at' => $classroom->ends_at?->toIso8601String(),
            'limits' => $this->playLimits->usage($classroom->loadMissing('games'), $user),
        ];
    }

    /**
     * HUD for the classroom owner walking in the world: same payload, but the
     * teacher never ranks and has no plays of their own.
     *
     * @return array{me: array{points: int, plays: int, rank: int|null}, leaderboard: list<array{rank: int, user_id: int, name: string, points: int, plays: int, is_me: bool}>, members_count: int, ends_at: string|null, limits: array<string, array{plays: int, max: int|null, remaining: int|null}>}
     */
    public function forTeacher(Classroom $classroom, User $teacher): array
    {
        return [
            ...$this->forMember($classroom, $teacher),
            'me' => ['points' => 0, 'plays' => 0, 'rank' => null],
            'limits' => [],
        ];
    }
}
