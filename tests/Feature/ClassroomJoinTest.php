<?php

namespace Tests\Feature;

use App\Models\Classroom;
use App\Models\Role;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class ClassroomJoinTest extends TestCase
{
    use RefreshDatabase;

    private User $player;

    private User $teacher;

    private Classroom $classroom;

    protected function setUp(): void
    {
        parent::setUp();

        $this->teacher = User::factory()->create();
        $this->createTeacherFor($this->teacher);

        $this->player = User::factory()->create();

        $this->classroom = Classroom::factory()->create(['teacher_id' => $this->teacher->id, 'pin' => '123456']);
    }

    private function createTeacherFor(User $user): void
    {
        $role = Role::query()->firstOrCreate(
            ['slug' => Role::TEACHER],
            ['name' => 'Guru', 'description' => 'Guru', 'is_system' => true],
        );
        $user->roles()->syncWithoutDetaching([$role->id]);
    }

    public function test_player_can_view_classroom_join_page(): void
    {
        $response = $this->actingAs($this->player)->getJson('/portal/classrooms/123456');

        $response->assertOk();
    }

    public function test_join_page_lists_games_as_objects_for_the_preview(): void
    {
        $this->classroom->games()->create(['game_key' => 'market-math', 'sort_order' => 0]);

        $this->actingAs($this->player)
            ->get('/portal/classrooms/123456')
            ->assertOk()
            ->assertInertia(fn ($page) => $page
                ->component('portal/classroom')
                ->where('games.0.game_key', 'market-math')
                ->where('games.0.question_count', 0)
                ->where('classroom.games', ['market-math'])
            );
    }

    public function test_ended_classroom_shows_as_null(): void
    {
        Classroom::factory()->ended()->create(['pin' => '654321', 'teacher_id' => $this->teacher->id]);

        $response = $this->actingAs($this->player)->get('/portal/classrooms/654321');

        $response->assertOk();
        $response->assertInertia(fn ($page) => $page
            ->where('pin', '654321')
            ->where('classroom', null)
            ->where('member', null)
        );
    }

    public function test_ended_classroom_shows_ended_screen_to_its_members(): void
    {
        $classroom = Classroom::factory()->ended()->create(['pin' => '654322', 'teacher_id' => $this->teacher->id]);
        $member = $classroom->members()->create(['user_id' => $this->player->id, 'joined_at' => now()->subHour()]);

        $this->actingAs($this->player)->get('/portal/classrooms/654322')
            ->assertOk()
            ->assertInertia(fn ($page) => $page
                ->where('classroom.status', 'ended')
                ->where('member.id', $member->id)
                ->where('world', null)
                ->where('announcement', null)
            );
    }

    public function test_invalid_pin_shows_null(): void
    {
        $response = $this->actingAs($this->player)->get('/portal/classrooms/000000');

        $response->assertOk();
        $response->assertInertia(fn ($page) => $page
            ->where('pin', '000000')
            ->where('classroom', null)
            ->where('member', null)
        );
    }

    public function test_player_can_join_classroom(): void
    {
        $response = $this->actingAs($this->player)->post('/portal/classrooms/123456/join');

        $response->assertRedirect();
        $this->assertDatabaseHas('classroom_members', [
            'classroom_id' => $this->classroom->id,
            'user_id' => $this->player->id,
        ]);
    }

    public function test_teacher_cannot_join_own_classroom(): void
    {
        $response = $this->actingAs($this->teacher)->post('/portal/classrooms/123456/join');

        $response->assertSessionHasErrors('own');
    }

    public function test_cannot_join_full_classroom(): void
    {
        $this->classroom->update(['max_members' => 0]);

        $response = $this->actingAs($this->player)->post('/portal/classrooms/123456/join');

        $response->assertSessionHasErrors('full');
    }

    public function test_cannot_join_scheduled_classroom(): void
    {
        $scheduled = Classroom::factory()->scheduled()->create(['pin' => '789012', 'teacher_id' => $this->teacher->id]);

        $response = $this->actingAs($this->player)->post('/portal/classrooms/789012/join');

        $response->assertStatus(404);
    }

    public function test_cannot_join_ended_classroom(): void
    {
        $ended = Classroom::factory()->ended()->create(['pin' => '789012', 'teacher_id' => $this->teacher->id]);

        $response = $this->actingAs($this->player)->post('/portal/classrooms/789012/join');

        $response->assertStatus(404);
    }

    public function test_cannot_join_when_already_member(): void
    {
        $this->classroom->members()->create([
            'user_id' => $this->player->id,
            'joined_at' => now(),
        ]);

        $response = $this->actingAs($this->player)->post('/portal/classrooms/123456/join');

        $response->assertSessionHasErrors('already');
    }

    public function test_can_rejoin_after_leaving(): void
    {
        $member = $this->classroom->members()->create([
            'user_id' => $this->player->id,
            'joined_at' => now()->subHour(),
            'left_at' => now()->subMinutes(30),
        ]);

        $response = $this->actingAs($this->player)->post('/portal/classrooms/123456/join');

        $response->assertRedirect();
        $this->assertNull($member->fresh()->left_at);
        $this->assertTrue($member->fresh()->joined_at->gt(now()->subMinute()));
    }

    public function test_player_can_leave_classroom(): void
    {
        $member = $this->classroom->members()->create([
            'user_id' => $this->player->id,
            'joined_at' => now(),
        ]);

        $response = $this->actingAs($this->player)->post('/portal/classrooms/123456/leave');

        $response->assertRedirect();
        $this->assertNotNull($member->fresh()->left_at);
    }

    public function test_live_numbers(): void
    {
        $this->classroom->members()->create(['user_id' => $this->player->id, 'joined_at' => now(), 'last_seen_at' => now()]);
        $player2 = User::factory()->create();
        $this->classroom->members()->create(['user_id' => $player2->id, 'joined_at' => now(), 'last_seen_at' => now(), 'current_game' => 'flag-quest']);

        $response = $this->actingAs($this->teacher)->getJson("/teacher/classrooms/{$this->classroom->id}/live");

        $response->assertOk();
        $data = $response->json();
        $this->assertSame(2, $data['members_count']);
        $this->assertArrayHasKey('online_count', $data);
        $this->assertArrayHasKey('members', $data);
    }
}
