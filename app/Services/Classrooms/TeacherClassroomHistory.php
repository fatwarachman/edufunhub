<?php

namespace App\Services\Classrooms;

use App\Models\Classroom;
use App\Models\ClassroomMember;
use App\Models\User;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\DB;

class TeacherClassroomHistory
{
    /**
     * Historical students across teacher classrooms. Private account fields stay excluded.
     *
     * @return list<array{user_id: int, name: string, grade: ?int, classrooms: list<array{id: int, name: string, joined_at: ?string, left_at: ?string, points: int, plays: int, accuracy: ?float}>}>
     */
    public function forTeacher(User $teacher): array
    {
        return $this->rows($this->classrooms($teacher))
            ->groupBy('user_id')
            ->map(fn (Collection $members): array => [
                'user_id' => (int) $members->first()['user_id'],
                'name' => (string) $members->first()['name'],
                'grade' => $members->first()['grade'],
                'classrooms' => $members->pluck('classroom')->values()->all(),
            ])
            ->values()
            ->all();
    }

    /**
     * The teacher's classrooms (newest first), each with every student who
     * ever joined (including those who left) and their score in that class.
     *
     * @return list<array{id: int, name: string, pin: string, status: string, starts_at: ?string, ends_at: ?string, games: list<string>, members: int, active_members: int, students: list<array{user_id: int, name: string, grade: ?int, joined_at: ?string, left_at: ?string, points: int, plays: int, accuracy: ?float}>}>
     */
    public function classroomsFor(User $teacher): array
    {
        $classrooms = $this->classrooms($teacher);
        $rows = $this->rows($classrooms)->groupBy(fn (array $row): int => $row['classroom']['id']);

        return $classrooms
            ->map(function (Classroom $classroom) use ($rows): array {
                $students = $rows->get($classroom->id, collect())
                    ->map(fn (array $row): array => [
                        'user_id' => $row['user_id'],
                        'name' => $row['name'],
                        'grade' => $row['grade'],
                        ...collect($row['classroom'])->except(['id', 'name'])->all(),
                    ])
                    ->sortByDesc('points')
                    ->values();

                return [
                    'id' => (int) $classroom->id,
                    'name' => (string) $classroom->name,
                    'pin' => (string) $classroom->pin,
                    'status' => $classroom->status(),
                    'starts_at' => $classroom->starts_at?->toIso8601String(),
                    'ends_at' => $classroom->ends_at?->toIso8601String(),
                    'games' => $classroom->gameKeys(),
                    'members' => $students->count(),
                    'active_members' => $students->whereNull('left_at')->count(),
                    'students' => $students->all(),
                ];
            })
            ->values()
            ->all();
    }

    /** @return Collection<int, Classroom> */
    private function classrooms(User $teacher): Collection
    {
        return Classroom::query()
            ->where('teacher_id', $teacher->id)
            ->with(['games', 'members' => fn ($query) => $query->with('user.playerProfile')->orderBy('joined_at')])
            ->latest('id')
            ->get();
    }

    /**
     * One row per membership with the student's score in that classroom.
     *
     * @param  Collection<int, Classroom>  $classrooms
     * @return Collection<int, array{user_id: int, name: string, grade: ?int, classroom: array{id: int, name: string, joined_at: ?string, left_at: ?string, points: int, plays: int, accuracy: ?float}}>
     */
    private function rows(Collection $classrooms): Collection
    {
        $scores = DB::table('game_histories')
            ->whereIn('classroom_id', $classrooms->pluck('id'))
            ->selectRaw('classroom_id, user_id, COUNT(*) as plays, COALESCE(SUM(correct), 0) as correct, COALESCE(SUM(wrong), 0) as wrong, COALESCE(SUM(points), 0) as points')
            ->groupBy('classroom_id', 'user_id')
            ->get()
            ->keyBy(fn (object $row): string => $row->classroom_id.':'.$row->user_id);

        return $classrooms->flatMap(fn (Classroom $classroom) => $classroom->members->map(function (ClassroomMember $member) use ($classroom, $scores): array {
            $score = $scores->get($classroom->id.':'.$member->user_id);
            $answered = (int) ($score->correct ?? 0) + (int) ($score->wrong ?? 0);

            return [
                'user_id' => (int) $member->user_id,
                'name' => (string) ($member->user?->playerProfile?->nickname ?: ($member->user?->name ?? '')),
                'grade' => $member->user?->playerProfile?->grade,
                'classroom' => [
                    'id' => (int) $classroom->id,
                    'name' => (string) $classroom->name,
                    'joined_at' => $member->joined_at?->toIso8601String(),
                    'left_at' => $member->left_at?->toIso8601String(),
                    'points' => (int) ($score->points ?? 0),
                    'plays' => (int) ($score->plays ?? 0),
                    'accuracy' => $answered > 0 ? round((int) $score->correct / $answered * 100, 1) : null,
                ],
            ];
        }));
    }
}
