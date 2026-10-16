<?php

namespace Tests\Feature;

use App\Models\Classroom;
use App\Models\ClassroomMember;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class ClassroomDifficultyAdminMonitorTest extends TestCase
{
    use RefreshDatabase;

    public function test_teacher_persists_classroom_game_difficulty(): void
    {
        $teacher = User::factory()->teacher()->create();
        $classroom = Classroom::factory()->for($teacher, 'teacher')->create();

        $response = $this->actingAs($teacher)->put(route('teacher.classrooms.update', $classroom), [
            'name' => $classroom->name,
            'description' => null,
            'starts_at' => now()->addHour()->toDateTimeLocalString(),
            'duration_minutes' => 60,
            'max_members' => 20,
            'games' => [['game_key' => 'sky-quiz', 'max_plays' => null, 'difficulty' => 3, 'subjects' => [], 'question_ids' => []]],
        ]);

        $response->assertSessionDoesntHaveErrors();
        $response->assertRedirect();
        $this->assertDatabaseHas('classroom_games', ['classroom_id' => $classroom->id, 'difficulty' => 3]);
    }

    public function test_admin_can_issue_observer_token_without_membership(): void
    {
        config(['game-service.secret' => str_repeat('x', 32)]);
        $admin = User::factory()->superadmin()->create();
        $teacher = User::factory()->teacher()->create();
        $classroom = Classroom::factory()->for($teacher, 'teacher')->create([
            'starts_at' => now()->subMinute(),
            'ends_at' => now()->addHour(),
        ]);

        $response = $this->actingAs($admin)
            ->postJson(route('admin.classrooms.world-token', $classroom));

        $response->assertOk()->assertJsonStructure(['token', 'expires_in']);
        $this->assertDatabaseCount('classroom_members', 0);
        $this->assertFalse(ClassroomMember::query()->where('user_id', $admin->id)->exists());
    }
}
