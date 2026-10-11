<?php

namespace Tests\Feature;

use App\Models\Classroom;
use App\Models\ClassroomMember;
use App\Models\Role;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class ClassroomReportTest extends TestCase
{
    use RefreshDatabase;

    private User $teacher;

    private User $student;

    private User $otherStudent;

    private Classroom $classroom;

    private ClassroomMember $member;

    protected function setUp(): void
    {
        parent::setUp();

        $this->teacher = User::factory()->create();
        $this->createTeacherFor($this->teacher);

        $this->student = User::factory()->create();
        $this->otherStudent = User::factory()->create();

        $this->classroom = Classroom::factory()->create(['teacher_id' => $this->teacher->id]);

        $this->member = $this->classroom->members()->create([
            'user_id' => $this->student->id,
            'joined_at' => now(),
        ]);
    }

    private function createTeacherFor(User $user): void
    {
        $role = Role::query()->firstOrCreate(
            ['slug' => Role::TEACHER],
            ['name' => 'Guru', 'description' => 'Guru', 'is_system' => true],
        );
        $user->roles()->syncWithoutDetaching([$role->id]);
    }

    public function test_student_can_view_shared_report(): void
    {
        $this->member->update([
            'report' => ['classroom' => ['name' => 'Test']],
            'report_shared_at' => now(),
        ]);

        $response = $this->actingAs($this->student)->get("/portal/classrooms/report/{$this->member->id}");

        $response->assertOk();
    }

    public function test_unshared_report_returns_404(): void
    {
        $response = $this->actingAs($this->student)->getJson("/portal/classrooms/report/{$this->member->id}");

        $response->assertNotFound();
    }

    public function test_other_student_cannot_view_report(): void
    {
        $this->member->update([
            'report' => ['classroom' => ['name' => 'Test']],
            'report_shared_at' => now(),
        ]);

        $response = $this->actingAs($this->otherStudent)->getJson("/portal/classrooms/report/{$this->member->id}");

        $response->assertNotFound();
    }

    public function test_teacher_can_share_report(): void
    {
        $response = $this->actingAs($this->teacher)->post("/teacher/classrooms/{$this->classroom->id}/share", [
            'member_id' => $this->member->id,
        ]);

        $response->assertRedirect();
        $this->assertNotNull($this->member->fresh()->report_shared_at);
        $this->assertNotNull($this->member->fresh()->report);
    }

    public function test_teacher_can_share_all(): void
    {
        $response = $this->actingAs($this->teacher)->post("/teacher/classrooms/{$this->classroom->id}/share-all");

        $response->assertRedirect();
    }

    public function test_report_contains_accuracy(): void
    {
        $this->member->update([
            'report' => [
                'student' => ['accuracy' => 75.0, 'plays' => 5],
                'games' => [],
                'subjects' => [],
                'topics' => [],
                'review' => [],
                'classroom' => ['id' => $this->classroom->id, 'name' => 'Test', 'pin' => '123456'],
            ],
            'report_shared_at' => now(),
        ]);

        $response = $this->actingAs($this->student)->getJson("/portal/classrooms/report/{$this->member->id}");

        $response->assertOk();
    }
}
