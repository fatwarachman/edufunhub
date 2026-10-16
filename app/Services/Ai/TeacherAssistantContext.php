<?php

namespace App\Services\Ai;

use App\Models\Classroom;
use App\Models\Question;
use App\Models\User;
use App\Services\Classrooms\ClassroomReport;

class TeacherAssistantContext
{
    public function __construct(private ClassroomReport $report) {}

    public function for(User $teacher): string
    {
        $classrooms = Classroom::query()
            ->where('teacher_id', $teacher->id)
            ->withCount('members')
            ->latest('id')
            ->limit(30)
            ->get();

        $payload = [
            'classrooms' => $classrooms->map(function (Classroom $classroom): array {
                $report = $this->report->forClassroom($classroom);

                return [
                    'id' => $classroom->id,
                    'name' => $classroom->name,
                    'status' => $classroom->status(),
                    'members' => (int) $classroom->members_count,
                    'scores' => collect($report['students'] ?? [])->map(fn (array $student): array => [
                        'name' => $student['name'],
                        'plays' => $student['plays'],
                        'answered' => $student['answered'],
                        'correct' => $student['correct'],
                        'wrong' => $student['wrong'],
                        'accuracy' => $student['accuracy'],
                        'points' => $student['points'],
                    ])->values()->all(),
                ];
            })->values()->all(),
            'questions_created' => Question::query()->where('created_by', $teacher->id)->count(),
        ];

        return json_encode($payload, JSON_UNESCAPED_UNICODE | JSON_THROW_ON_ERROR);
    }
}
