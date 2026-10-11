<?php

namespace Tests\Feature;

use App\Models\Classroom;
use App\Models\Question;
use App\Models\Role;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class ClassroomTeacherTest extends TestCase
{
    use RefreshDatabase;

    private User $teacher;

    private User $otherTeacher;

    private User $player;

    protected function setUp(): void
    {
        parent::setUp();

        $this->teacher = User::factory()->create();
        $this->createTeacherFor($this->teacher);
        $this->otherTeacher = User::factory()->create();
        $this->createTeacherFor($this->otherTeacher);

        $this->player = User::factory()->create();
    }

    private function createTeacherFor(User $user): void
    {
        $role = Role::query()->firstOrCreate(
            ['slug' => Role::TEACHER],
            ['name' => 'Guru', 'description' => 'Guru', 'is_system' => true],
        );
        $user->roles()->syncWithoutDetaching([$role->id]);
    }

    public function test_teacher_can_list_classrooms(): void
    {
        Classroom::factory(3)->create(['teacher_id' => $this->teacher->id]);
        Classroom::factory(2)->create(['teacher_id' => $this->otherTeacher->id]);

        $response = $this->actingAs($this->teacher)->get('/teacher/classrooms');

        $response->assertOk();
        $response->assertInertia(fn ($page) => $page->has('classrooms.data', 3));
    }

    public function test_player_cannot_list_classrooms(): void
    {
        $this->actingAs($this->player)->getJson('/teacher/classrooms')->assertForbidden();
    }

    public function test_guest_redirected(): void
    {
        $this->get('/teacher/classrooms')->assertRedirect();
    }

    public function test_teacher_can_store_classroom(): void
    {
        $startsAt = now()->addMinutes(10)->toIso8601String();

        $response = $this->actingAs($this->teacher)->post('/teacher/classrooms', [
            'name' => 'Kelas Matematika',
            'description' => 'Belajar matematika seru',
            'starts_at' => $startsAt,
            'duration_minutes' => 60,
            'max_members' => 50,
            'games' => [
                ['game_key' => 'flag-quest', 'question_ids' => []],
                ['game_key' => 'sky-quiz', 'question_ids' => []],
            ],
        ]);

        $response->assertRedirect();
        $this->assertDatabaseHas('classrooms', [
            'name' => 'Kelas Matematika',
            'teacher_id' => $this->teacher->id,
            'max_members' => 50,
        ]);
        $this->assertDatabaseCount('classroom_games', 2);
    }

    public function test_store_requires_valid_games(): void
    {
        $response = $this->actingAs($this->teacher)->post('/teacher/classrooms', [
            'name' => 'Test',
            'starts_at' => now()->addHour()->toIso8601String(),
            'duration_minutes' => 60,
            'games' => [
                ['game_key' => 'invalid-game', 'question_ids' => []],
            ],
        ]);

        $response->assertSessionHasErrors('games.0.game_key');
    }

    public function test_store_rejects_true_false_in_choice_only_game(): void
    {
        $trueFalse = Question::factory()->trueFalse()->create(['created_by' => $this->teacher->id, 'is_active' => true]);

        $response = $this->actingAs($this->teacher)->post('/teacher/classrooms', [
            'name' => 'Test',
            'starts_at' => now()->addHour()->toIso8601String(),
            'duration_minutes' => 60,
            'games' => [
                ['game_key' => 'sky-quiz', 'question_ids' => [$trueFalse->id]],
            ],
        ]);

        $response->assertSessionHasErrors('games.0.question_ids');
    }

    public function test_store_requires_min_duration(): void
    {
        $response = $this->actingAs($this->teacher)->post('/teacher/classrooms', [
            'name' => 'Test',
            'starts_at' => now()->addHour()->toIso8601String(),
            'duration_minutes' => Classroom::MIN_DURATION - 1,
            'games' => [['game_key' => 'flag-quest', 'question_ids' => []]],
        ]);

        $response->assertSessionHasErrors('duration_minutes');
    }

    public function test_store_requires_max_members_within_limit(): void
    {
        $response = $this->actingAs($this->teacher)->post('/teacher/classrooms', [
            'name' => 'Test',
            'starts_at' => now()->addHour()->toIso8601String(),
            'duration_minutes' => 60,
            'max_members' => Classroom::MAX_MEMBERS + 1,
            'games' => [['game_key' => 'flag-quest', 'question_ids' => []]],
        ]);

        $response->assertSessionHasErrors('max_members');
    }

    public function test_store_requires_name_min_3_chars(): void
    {
        $response = $this->actingAs($this->teacher)->post('/teacher/classrooms', [
            'name' => 'AB',
            'starts_at' => now()->addHour()->toIso8601String(),
            'duration_minutes' => 60,
            'games' => [['game_key' => 'flag-quest', 'question_ids' => []]],
        ]);

        $response->assertSessionHasErrors('name');
    }

    public function test_pin_is_unique(): void
    {
        Classroom::factory()->create(['pin' => '123456', 'ends_at' => now()->addDay()]);

        $pin = Classroom::freshPin();

        $this->assertNotSame('123456', $pin);
        $this->assertMatchesRegularExpression('/^\d{6}$/', $pin);
    }

    public function test_teacher_can_view_classroom(): void
    {
        $classroom = Classroom::factory()->create(['teacher_id' => $this->teacher->id]);

        $response = $this->actingAs($this->teacher)->getJson("/teacher/classrooms/{$classroom->id}");

        $response->assertOk();
    }

    public function test_other_teacher_cannot_view_classroom(): void
    {
        $classroom = Classroom::factory()->create(['teacher_id' => $this->teacher->id]);

        $this->actingAs($this->otherTeacher)->getJson("/teacher/classrooms/{$classroom->id}")->assertForbidden();
    }

    public function test_teacher_can_update_classroom(): void
    {
        $classroom = Classroom::factory()->create(['teacher_id' => $this->teacher->id]);

        $response = $this->actingAs($this->teacher)->put("/teacher/classrooms/{$classroom->id}", [
            'name' => 'Updated Name',
            'description' => 'Updated',
            'starts_at' => now()->addHours(2)->toIso8601String(),
            'duration_minutes' => 45,
            'max_members' => 30,
            'games' => [
                ['game_key' => 'flag-quest', 'question_ids' => []],
            ],
        ]);

        $response->assertRedirect();
        $this->assertDatabaseHas('classrooms', ['id' => $classroom->id, 'name' => 'Updated Name']);
    }

    public function test_other_teacher_cannot_update_classroom(): void
    {
        $classroom = Classroom::factory()->create(['teacher_id' => $this->teacher->id]);

        $this->actingAs($this->otherTeacher)
            ->put("/teacher/classrooms/{$classroom->id}", [
                'name' => 'Hacked',
                'starts_at' => now()->addHour()->toIso8601String(),
                'duration_minutes' => 60,
                'games' => [['game_key' => 'flag-quest', 'question_ids' => []]],
            ])
            ->assertForbidden();
    }

    public function test_teacher_can_end_classroom(): void
    {
        $classroom = Classroom::factory()->create(['teacher_id' => $this->teacher->id]);

        $response = $this->actingAs($this->teacher)->post("/teacher/classrooms/{$classroom->id}/end");

        $response->assertRedirect();
        $this->assertTrue($classroom->fresh()->ends_at->lte(now()));
    }

    public function test_teacher_can_destroy_classroom(): void
    {
        $classroom = Classroom::factory()->create(['teacher_id' => $this->teacher->id]);

        $response = $this->actingAs($this->teacher)->delete("/teacher/classrooms/{$classroom->id}");

        $response->assertRedirect();
        $this->assertDatabaseMissing('classrooms', ['id' => $classroom->id]);
    }

    public function test_teacher_can_remove_member(): void
    {
        $classroom = Classroom::factory()->create(['teacher_id' => $this->teacher->id]);
        $member = $classroom->members()->create([
            'user_id' => $this->player->id,
            'joined_at' => now(),
        ]);

        $response = $this->actingAs($this->teacher)->post("/teacher/classrooms/{$classroom->id}/remove-member", [
            'member_id' => $member->id,
        ]);

        $response->assertRedirect();
        $this->assertNotNull($member->fresh()->left_at);
    }

    public function test_status_scheduled(): void
    {
        $classroom = Classroom::factory()->scheduled()->create(['teacher_id' => $this->teacher->id]);

        $this->assertSame('scheduled', $classroom->status());
    }

    public function test_status_active(): void
    {
        $classroom = Classroom::factory()->create(['teacher_id' => $this->teacher->id]);

        $this->assertSame('active', $classroom->status());
    }

    public function test_status_ended(): void
    {
        $classroom = Classroom::factory()->ended()->create(['teacher_id' => $this->teacher->id]);

        $this->assertSame('ended', $classroom->status());
    }

    public function test_teacher_can_filter_by_status(): void
    {
        Classroom::factory()->create(['teacher_id' => $this->teacher->id]);
        Classroom::factory()->scheduled()->create(['teacher_id' => $this->teacher->id]);
        Classroom::factory()->ended()->create(['teacher_id' => $this->teacher->id]);

        $active = $this->actingAs($this->teacher)->get('/teacher/classrooms?status=active');
        $active->assertInertia(fn ($page) => $page->has('classrooms.data', 1));

        $scheduled = $this->actingAs($this->teacher)->get('/teacher/classrooms?status=scheduled');
        $scheduled->assertInertia(fn ($page) => $page->has('classrooms.data', 1));

        $ended = $this->actingAs($this->teacher)->get('/teacher/classrooms?status=ended');
        $ended->assertInertia(fn ($page) => $page->has('classrooms.data', 1));
    }
}
