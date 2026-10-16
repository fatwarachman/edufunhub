<?php

namespace Tests\Feature;

use App\Models\Classroom;
use App\Models\GameHistory;
use App\Models\Role;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Inertia\Testing\AssertableInertia;
use Tests\TestCase;

class ClassroomHistoryTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        $this->withoutVite();
    }

    public function test_player_profile_lists_only_own_classroom_history(): void
    {
        $player = User::factory()->create();
        $teacher = User::factory()->create();
        $classroom = Classroom::factory()->create(['teacher_id' => $teacher->id]);
        $classroom->members()->create(['user_id' => $player->id, 'joined_at' => now()->subDay(), 'left_at' => now()]);

        $response = $this->actingAs($player)->get(route('profile.show'));

        $response->assertOk()->assertInertia(fn (AssertableInertia $page) => $page
            ->component('user/profile', false)
            ->has('classrooms', 1)
            ->where('classrooms.0.classroom.id', $classroom->id)
            ->where('classrooms.0.classroom.teacher_name', $teacher->name)
        );
    }

    public function test_teacher_history_includes_left_students_and_scopes_to_owner(): void
    {
        $teacherRole = Role::query()->firstOrCreate(
            ['slug' => Role::TEACHER],
            ['name' => 'Guru', 'description' => 'Guru', 'is_system' => true],
        );
        $teacher = User::factory()->create();
        $teacher->roles()->syncWithoutDetaching([$teacherRole->id]);
        $otherTeacher = User::factory()->create();
        $otherTeacher->roles()->syncWithoutDetaching([$teacherRole->id]);
        $student = User::factory()->create();
        $classroom = Classroom::factory()->create(['teacher_id' => $teacher->id]);
        $classroom->members()->create(['user_id' => $student->id, 'joined_at' => now()->subWeek(), 'left_at' => now()->subDay()]);

        $response = $this->actingAs($teacher)->get(route('teacher.classrooms.history'));

        $response->assertOk()->assertInertia(fn (AssertableInertia $page) => $page
            ->component('teacher/classrooms/history', false)
            ->has('students', 1)
            ->where('students.0.user_id', $student->id)
            ->where('students.0.classrooms.0.id', $classroom->id)
            ->missing('students.0.email')
        );

        $this->actingAs($otherTeacher)->get(route('teacher.classrooms.history'))
            ->assertOk()
            ->assertInertia(fn (AssertableInertia $page) => $page->has('students', 0));
    }

    public function test_teacher_history_lists_each_class_with_students_and_scores(): void
    {
        $teacherRole = Role::query()->firstOrCreate(
            ['slug' => Role::TEACHER],
            ['name' => 'Guru', 'description' => 'Guru', 'is_system' => true],
        );
        $teacher = User::factory()->create();
        $teacher->roles()->syncWithoutDetaching([$teacherRole->id]);
        $active = User::factory()->create(['name' => 'Ani']);
        $left = User::factory()->create(['name' => 'Budi']);
        $empty = Classroom::factory()->create(['teacher_id' => $teacher->id, 'name' => 'Kelas Kosong', 'created_at' => now()->subDays(2)]);
        $classroom = Classroom::factory()->create(['teacher_id' => $teacher->id, 'name' => 'Kelas Pecahan']);
        $classroom->members()->create(['user_id' => $active->id, 'joined_at' => now()->subHour()]);
        $classroom->members()->create(['user_id' => $left->id, 'joined_at' => now()->subHours(2), 'left_at' => now()->subHour()]);
        GameHistory::factory()->create(['user_id' => $active->id, 'classroom_id' => $classroom->id, 'game_key' => 'floor-drop', 'points' => 60, 'correct' => 3, 'wrong' => 1]);
        GameHistory::factory()->create(['user_id' => $left->id, 'classroom_id' => $classroom->id, 'game_key' => 'floor-drop', 'points' => 20, 'correct' => 1, 'wrong' => 1]);
        GameHistory::factory()->create(['user_id' => $active->id, 'game_key' => 'floor-drop', 'points' => 999]);

        $this->actingAs($teacher)->get(route('teacher.classrooms.history'))
            ->assertOk()
            ->assertInertia(fn (AssertableInertia $page) => $page
                ->has('classrooms', 2)
                ->where('classrooms.0.id', $classroom->id)
                ->where('classrooms.0.members', 2)
                ->where('classrooms.0.active_members', 1)
                ->where('classrooms.0.students.0.user_id', $active->id)
                ->where('classrooms.0.students.0.points', 60)
                ->where('classrooms.0.students.0.accuracy', 75)
                ->where('classrooms.0.students.1.user_id', $left->id)
                ->where('classrooms.0.students.1.left_at', fn ($value): bool => $value !== null)
                ->missing('classrooms.0.students.0.email')
                ->where('classrooms.1.id', $empty->id)
                ->where('classrooms.1.members', 0)
                ->where('students.0.classrooms.0.points', fn ($value): bool => in_array($value, [60, 20], true)));
    }

    public function test_guest_cannot_open_teacher_history(): void
    {
        $this->get(route('teacher.classrooms.history'))->assertRedirect(route('login'));
    }
}
