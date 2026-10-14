<?php

namespace Tests\Feature;

use App\Models\Classroom;
use App\Models\ClassroomGame;
use App\Models\PlayerProfile;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/**
 * Games opened from a classroom send the player back to that classroom
 * (shared `gameReturn` prop) instead of the portal.
 */
class ClassroomGameReturnTest extends TestCase
{
    use RefreshDatabase;

    private User $player;

    private Classroom $classroom;

    protected function setUp(): void
    {
        parent::setUp();

        $teacher = User::factory()->teacher()->create();
        $this->player = User::factory()->create();
        PlayerProfile::factory()->for($this->player)->create(['grade' => 5]);
        $this->classroom = Classroom::factory()->create([
            'teacher_id' => $teacher->id,
            'pin' => '246810',
            'name' => 'Kelas Seru',
        ]);
        ClassroomGame::query()->create(['classroom_id' => $this->classroom->id, 'game_key' => 'ping-pong', 'sort_order' => 0]);
    }

    private function join(array $attributes = []): void
    {
        $this->classroom->members()->create(['user_id' => $this->player->id, 'joined_at' => now(), ...$attributes]);
    }

    public function test_game_picked_by_the_classroom_returns_to_the_classroom(): void
    {
        $this->join();

        $this->actingAs($this->player)
            ->get('/games/ping-pong?classroom='.$this->classroom->id)
            ->assertOk()
            ->assertInertia(fn ($page) => $page
                ->where('gameReturn.href', '/portal/classrooms/246810')
                ->where('gameReturn.name', 'Kelas Seru')
            );
    }

    public function test_game_not_picked_by_the_classroom_returns_to_the_portal(): void
    {
        $this->join();

        $this->actingAs($this->player)
            ->get('/games/sky-quiz')
            ->assertOk()
            ->assertInertia(fn ($page) => $page->where('gameReturn', null));
    }

    public function test_non_member_and_left_member_return_to_the_portal(): void
    {
        $this->actingAs($this->player)
            ->get('/games/ping-pong?classroom='.$this->classroom->id)
            ->assertInertia(fn ($page) => $page->where('gameReturn', null));

        $this->join(['left_at' => now()]);

        $this->actingAs($this->player)
            ->get('/games/ping-pong')
            ->assertInertia(fn ($page) => $page->where('gameReturn', null));
    }

    public function test_ended_classroom_returns_to_the_portal(): void
    {
        $this->join();
        $this->classroom->update(['starts_at' => now()->subHours(2), 'ends_at' => now()->subMinute()]);

        $this->actingAs($this->player)
            ->get('/games/ping-pong')
            ->assertInertia(fn ($page) => $page->where('gameReturn', null));
    }
}
