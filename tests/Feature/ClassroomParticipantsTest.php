<?php

namespace Tests\Feature;

use App\Models\Classroom;
use App\Models\GameHistory;
use App\Models\Role;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Inertia\Testing\AssertableInertia;
use Tests\TestCase;

class ClassroomParticipantsTest extends TestCase
{
    use RefreshDatabase;

    private User $teacher;

    private User $otherTeacher;

    private User $player;

    private Classroom $classroom;

    protected function setUp(): void
    {
        parent::setUp();

        $this->withoutVite();

        $role = Role::query()->firstOrCreate(
            ['slug' => Role::TEACHER],
            ['name' => 'Guru', 'description' => 'Guru', 'is_system' => true],
        );

        $this->teacher = User::factory()->create();
        $this->teacher->roles()->syncWithoutDetaching([$role->id]);
        $this->otherTeacher = User::factory()->create();
        $this->otherTeacher->roles()->syncWithoutDetaching([$role->id]);
        $this->player = User::factory()->create();

        $this->classroom = Classroom::factory()->create(['teacher_id' => $this->teacher->id]);
    }

    public function test_owner_sees_participants_with_top_scores(): void
    {
        $students = User::factory()->count(4)->create();
        foreach ($students as $index => $student) {
            $this->classroom->members()->create(['user_id' => $student->id, 'joined_at' => now()]);

            if ($index < 3) {
                GameHistory::factory()->create([
                    'user_id' => $student->id,
                    'classroom_id' => $this->classroom->id,
                    'points' => ($index + 1) * 10,
                    'correct' => 4,
                    'wrong' => 1,
                ]);
            }
        }
        $left = User::factory()->create();
        $this->classroom->members()->create(['user_id' => $left->id, 'joined_at' => now(), 'left_at' => now()]);

        $response = $this->actingAs($this->teacher)->get(route('teacher.classrooms.participants', $this->classroom));

        $response->assertOk();
        $response->assertInertia(fn (AssertableInertia $page) => $page
            ->component('teacher/classrooms/participants', false)
            ->where('classroom.id', $this->classroom->id)
            ->where('classroom.pin', $this->classroom->pin)
            ->has('classroom.status')
            ->where('summary.members', 4)
            ->where('summary.played_members', 3)
            ->where('summary.points', 60)
            ->has('students', 4)
            ->has('students.0', fn (AssertableInertia $student) => $student
                ->hasAll(['member_id', 'user_id', 'name', 'grade', 'plays', 'answered', 'correct', 'wrong', 'accuracy', 'points', 'rank', 'mastery', 'strengths', 'weaknesses', 'ai_feedback', 'shared_at'])
            )
            ->has('top', 3)
            ->where('top.0.points', 30)
            ->where('top.1.points', 20)
            ->where('top.2.points', 10)
            ->where('top.0.accuracy', 80)
            ->where('top.0.mastery', 'good')
        );
    }

    public function test_top_excludes_students_who_have_not_played(): void
    {
        $this->classroom->members()->create(['user_id' => $this->player->id, 'joined_at' => now()]);

        $this->actingAs($this->teacher)
            ->get("/teacher/classrooms/{$this->classroom->id}/participants")
            ->assertOk()
            ->assertInertia(fn (AssertableInertia $page) => $page
                ->has('students', 1)
                ->has('top', 0)
            );
    }

    public function test_other_teacher_is_forbidden(): void
    {
        $this->actingAs($this->otherTeacher)
            ->get("/teacher/classrooms/{$this->classroom->id}/participants")
            ->assertForbidden();
    }

    public function test_student_cannot_open_participants(): void
    {
        $this->classroom->members()->create(['user_id' => $this->player->id, 'joined_at' => now()]);

        $response = $this->actingAs($this->player)->get("/teacher/classrooms/{$this->classroom->id}/participants");

        $this->assertContains($response->status(), [302, 403]);
    }

    public function test_guest_is_redirected_to_login(): void
    {
        $this->get("/teacher/classrooms/{$this->classroom->id}/participants")
            ->assertRedirect(route('login'));
    }
}
