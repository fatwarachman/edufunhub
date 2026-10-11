<?php

namespace Tests\Feature;

use App\Models\Classroom;
use App\Models\ClassroomMember;
use App\Models\GameHistory;
use App\Models\Role;
use App\Models\User;
use App\Services\Classrooms\ClassroomContext;
use App\Services\Classrooms\ClassroomPresence;
use App\Services\GameServiceSigner;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class ClassroomGameIntegrationTest extends TestCase
{
    use RefreshDatabase;

    private User $teacher;

    private User $player;

    private Classroom $classroom;

    private ClassroomMember $member;

    protected function setUp(): void
    {
        parent::setUp();

        $this->teacher = User::factory()->create();
        $this->createTeacherFor($this->teacher);

        $this->player = User::factory()->create();

        $this->classroom = Classroom::factory()->create(['teacher_id' => $this->teacher->id, 'starts_at' => now()->subHour()]);
        $this->classroom->games()->create(['game_key' => 'flag-quest', 'sort_order' => 0]);

        $this->member = $this->classroom->members()->create([
            'user_id' => $this->player->id,
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

    public function test_classroom_context_returns_classroom_for_active_game(): void
    {
        $context = app(ClassroomContext::class);
        $result = $context->currentFor($this->player, 'flag-quest');

        $this->assertNotNull($result);
        $this->assertSame($this->classroom->id, $result->id);
    }

    public function test_classroom_context_returns_null_for_unknown_game(): void
    {
        $context = app(ClassroomContext::class);
        $result = $context->currentFor($this->player, 'unknown-game');

        $this->assertNull($result);
    }

    public function test_classroom_context_strips_host_suffix(): void
    {
        $context = app(ClassroomContext::class);
        $result = $context->currentFor($this->player, 'flag-quest-host');

        $this->assertNotNull($result);
        $this->assertSame($this->classroom->id, $result->id);
    }

    public function test_presence_updates_last_seen(): void
    {
        $presence = app(ClassroomPresence::class);
        $presence->touch($this->player, 'game:flag-quest');

        $this->assertNotNull($this->member->fresh()->last_seen_at);
        $this->assertSame('flag-quest', $this->member->fresh()->current_game);
    }

    public function test_game_result_sets_classroom_id(): void
    {
        $history = GameHistory::factory()->create([
            'user_id' => $this->player->id,
            'classroom_id' => $this->classroom->id,
        ]);

        $this->assertDatabaseHas('game_histories', [
            'id' => $history->id,
            'classroom_id' => $this->classroom->id,
        ]);
    }

    public function test_token_claim_includes_classroom(): void
    {
        $signer = app(GameServiceSigner::class);

        $this->assertTrue($signer->isConfigured());
    }

    public function test_screen_time_beat_updates_presence(): void
    {
        $response = $this->actingAs($this->player)->post('/screen-time/beat', [
            'area' => 'game:flag-quest',
            'seconds_active' => 30,
        ]);

        $response->assertNoContent();
        $this->assertNotNull($this->member->fresh()->last_seen_at);
    }
}
