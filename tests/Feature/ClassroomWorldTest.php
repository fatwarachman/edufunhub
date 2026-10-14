<?php

namespace Tests\Feature;

use App\Models\Classroom;
use App\Models\ClassroomGame;
use App\Models\GameHistory;
use App\Models\PlayerProfile;
use App\Models\Question;
use App\Models\User;
use App\Services\GameServiceSigner;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\Client\Request as HttpRequest;
use Illuminate\Support\Facades\Http;
use Tests\TestCase;

class ClassroomWorldTest extends TestCase
{
    use RefreshDatabase;

    private const KICK_URL = 'http://game.test/internal/classroom/kick';

    private User $teacher;

    private User $player;

    private Classroom $classroom;

    protected function setUp(): void
    {
        parent::setUp();

        config([
            'game-service.secret' => str_repeat('s', 40),
            'game-service.classroom_kick_url' => self::KICK_URL,
        ]);
        Http::fake(['game.test/*' => Http::response(null, 204)]);

        $this->teacher = User::factory()->teacher()->create();
        $this->player = User::factory()->create(['name' => 'Budi Player']);
        $this->classroom = Classroom::factory()->create(['teacher_id' => $this->teacher->id, 'pin' => '123456']);

        ClassroomGame::query()->create(['classroom_id' => $this->classroom->id, 'game_key' => 'ping-pong', 'sort_order' => 0]);
        ClassroomGame::query()->create(['classroom_id' => $this->classroom->id, 'game_key' => 'flag-quest', 'sort_order' => 1]);
    }

    private function join(User $user, array $attributes = []): void
    {
        $this->classroom->members()->create(['user_id' => $user->id, 'joined_at' => now(), ...$attributes]);
    }

    /** @return array<string, mixed> */
    private function decodeToken(string $token): array
    {
        [$payload] = explode('.', $token);

        return json_decode(base64_decode(strtr($payload, '-_', '+/')), true);
    }

    public function test_active_member_gets_world_token(): void
    {
        $this->join($this->player);

        $response = $this->actingAs($this->player)->postJson('/portal/classrooms/123456/world-token');

        $response->assertOk()->assertJsonStructure(['token', 'expires_in']);
        $claims = $this->decodeToken($response->json('token'));
        $this->assertSame('classroom', $claims['game']);
        $this->assertSame($this->classroom->id, $claims['classroom']);
        $this->assertSame(['ping-pong', 'flag-quest'], $claims['booths']);
        $this->assertSame(100, $claims['seats']);
        $this->assertSame($this->player->id, $claims['sub']);
        $this->assertSame('Budi Player', $claims['name']);
        $this->assertSame(PlayerProfile::MIN_GRADE, $claims['grade']);
        $this->assertIsArray($claims['character']);
    }

    public function test_token_seats_follow_max_members(): void
    {
        $this->join($this->player);

        foreach ([1 => 1, 30 => 30, 200 => 200] as $maxMembers => $seats) {
            $this->classroom->update(['max_members' => $maxMembers]);
            $claims = $this->decodeToken($this->actingAs($this->player)->postJson('/portal/classrooms/123456/world-token')->json('token'));
            $this->assertSame($seats, $claims['seats']);
        }
    }

    public function test_signer_clamps_seats_claim(): void
    {
        $signer = app(GameServiceSigner::class);
        $player = ['name' => 'Budi', 'grade' => 3, 'color' => 'teal', 'accessory' => 'none'];

        foreach ([0 => 1, -5 => 1, 999 => GameServiceSigner::MAX_SEATS, 60 => 60] as $in => $want) {
            $claims = $this->decodeToken($signer->issueToken($this->player, 'classroom', $player, ['classroom' => 1, 'seats' => $in]));
            $this->assertSame($want, $claims['seats']);
        }

        $this->assertArrayNotHasKey('seats', $this->decodeToken($signer->issueToken($this->player, 'classroom', $player, ['classroom' => 1])));
    }

    public function test_token_uses_nickname(): void
    {
        $this->join($this->player);
        $this->player->playerProfile()->create(['nickname' => 'Bubu', 'grade' => 4]);

        $claims = $this->decodeToken($this->actingAs($this->player)->postJson('/portal/classrooms/123456/world-token')->json('token'));

        $this->assertSame('Bubu', $claims['name']);
        $this->assertSame(4, $claims['grade']);
    }

    public function test_non_member_and_teacher_are_forbidden(): void
    {
        $this->actingAs($this->player)->postJson('/portal/classrooms/123456/world-token')->assertForbidden();
        $this->actingAs($this->player)->getJson('/portal/classrooms/123456/hud')->assertForbidden();
        $this->actingAs($this->teacher)->postJson('/portal/classrooms/123456/world-token')->assertForbidden();
    }

    public function test_left_member_is_forbidden(): void
    {
        $this->join($this->player, ['left_at' => now()]);

        $this->actingAs($this->player)->postJson('/portal/classrooms/123456/world-token')->assertForbidden();
        $this->actingAs($this->player)->getJson('/portal/classrooms/123456/hud')->assertForbidden();
    }

    public function test_removed_member_cannot_get_token(): void
    {
        $this->join($this->player);
        $member = $this->classroom->members()->firstOrFail();

        $this->actingAs($this->teacher)->post("/teacher/classrooms/{$this->classroom->id}/remove-member", ['member_id' => $member->id])->assertRedirect();

        $this->actingAs($this->player)->postJson('/portal/classrooms/123456/world-token')->assertForbidden();
    }

    public function test_ended_scheduled_and_unknown_classrooms_are_not_found(): void
    {
        $ended = Classroom::factory()->ended()->create(['teacher_id' => $this->teacher->id, 'pin' => '222222']);
        $ended->members()->create(['user_id' => $this->player->id, 'joined_at' => now()->subHours(2)]);
        $scheduled = Classroom::factory()->scheduled()->create(['teacher_id' => $this->teacher->id, 'pin' => '333333']);
        $scheduled->members()->create(['user_id' => $this->player->id, 'joined_at' => now()]);

        foreach (['222222', '333333', '999999'] as $pin) {
            $this->actingAs($this->player)->postJson("/portal/classrooms/{$pin}/world-token")->assertNotFound();
            $this->actingAs($this->player)->getJson("/portal/classrooms/{$pin}/hud")->assertNotFound();
        }

        $this->actingAs($this->player)->postJson('/portal/classrooms/12ab56/world-token')->assertNotFound();
    }

    public function test_token_unavailable_without_secret(): void
    {
        $this->join($this->player);
        config(['game-service.secret' => '']);

        $this->actingAs($this->player)->postJson('/portal/classrooms/123456/world-token')->assertStatus(503);
    }

    public function test_guest_cannot_get_token(): void
    {
        $this->postJson('/portal/classrooms/123456/world-token')->assertUnauthorized();
    }

    public function test_hud_ranks_active_members(): void
    {
        $second = User::factory()->create(['name' => 'Ani']);
        $idle = User::factory()->create(['name' => 'Zed']);
        $gone = User::factory()->create(['name' => 'Gone']);
        $this->join($this->player);
        $this->join($second);
        $this->join($idle);
        $this->join($gone, ['left_at' => now()]);

        GameHistory::factory()->count(2)->create(['user_id' => $this->player->id, 'classroom_id' => $this->classroom->id, 'points' => 10]);
        GameHistory::factory()->create(['user_id' => $second->id, 'classroom_id' => $this->classroom->id, 'points' => 50]);
        GameHistory::factory()->create(['user_id' => $gone->id, 'classroom_id' => $this->classroom->id, 'points' => 999]);
        GameHistory::factory()->create(['user_id' => $this->player->id, 'points' => 500]);

        $response = $this->actingAs($this->player)->getJson('/portal/classrooms/123456/hud');

        $response->assertOk();
        $response->assertJsonPath('me', ['points' => 20, 'plays' => 2, 'rank' => 2]);
        $response->assertJsonPath('members_count', 3);
        $response->assertJsonPath('ends_at', $this->classroom->ends_at->toIso8601String());

        $board = $response->json('leaderboard');
        $this->assertSame([$second->id, $this->player->id, $idle->id], array_column($board, 'user_id'));
        $this->assertSame([1, 2, 3], array_column($board, 'rank'));
        $this->assertSame([50, 20, 0], array_column($board, 'points'));
        $this->assertSame([1, 2, 0], array_column($board, 'plays'));
        $this->assertSame([false, true, false], array_column($board, 'is_me'));
        $this->assertStringNotContainsString('email', $response->getContent());
        $this->assertStringNotContainsString($this->player->email, $response->getContent());
    }

    public function test_hud_leaderboard_is_top_ten(): void
    {
        $this->join($this->player);
        foreach (User::factory()->count(11)->create() as $index => $user) {
            $this->join($user);
            GameHistory::factory()->create(['user_id' => $user->id, 'classroom_id' => $this->classroom->id, 'points' => 100 + $index]);
        }

        $response = $this->actingAs($this->player)->getJson('/portal/classrooms/123456/hud');

        $this->assertCount(10, $response->json('leaderboard'));
        $response->assertJsonPath('me.rank', 12);
        $response->assertJsonPath('members_count', 12);
    }

    public function test_show_world_prop_for_member_only(): void
    {
        $this->actingAs($this->player)->get('/portal/classrooms/123456')
            ->assertOk()
            ->assertInertia(fn ($page) => $page
                ->where('world', null)
                ->where('classroom.status', 'active')
                ->where('classroom.games', ['ping-pong', 'flag-quest'])
            );

        $this->join($this->player);

        $this->actingAs($this->player)->get('/portal/classrooms/123456')
            ->assertOk()
            ->assertInertia(fn ($page) => $page
                ->where('world.ws_url', '/game-ws/classroom')
                ->where('world.token_url', route('classrooms.world-token', ['pin' => '123456']))
                ->where('world.hud_url', route('classrooms.hud', ['pin' => '123456']))
                ->where('world.me.id', $this->player->id)
                ->where('world.me.name', 'Budi Player')
                ->has('world.me.character')
                ->where('world.hud.me.rank', 1)
                ->where('member.removed', false)
            );
    }

    public function test_show_world_null_for_left_member(): void
    {
        $this->join($this->player, ['left_at' => now()]);

        $this->actingAs($this->player)->get('/portal/classrooms/123456')
            ->assertInertia(fn ($page) => $page->where('world', null)->where('member.removed', true));
    }

    public function test_show_games_prop_has_question_count(): void
    {
        $game = $this->classroom->games()->where('game_key', 'ping-pong')->firstOrFail();
        foreach (Question::factory()->count(3)->create() as $index => $question) {
            $game->questions()->attach($question->id, ['sort_order' => $index]);
        }

        $this->actingAs($this->player)->get('/portal/classrooms/123456')
            ->assertInertia(fn ($page) => $page->where('games', [
                ['game_key' => 'ping-pong', 'question_count' => 3, 'max_plays' => null],
                ['game_key' => 'flag-quest', 'question_count' => 0, 'max_plays' => null],
            ]));
    }

    public function test_join_redirects_to_classroom_page(): void
    {
        $this->actingAs($this->player)->post('/portal/classrooms/123456/join')
            ->assertRedirect(route('classrooms.show', ['pin' => '123456']));
    }

    public function test_leave_kicks_from_world(): void
    {
        $this->join($this->player);

        $this->actingAs($this->player)->post('/portal/classrooms/123456/leave')->assertRedirect();

        $this->assertKickSent($this->classroom->id, $this->player->id);
    }

    public function test_remove_member_kicks_from_world(): void
    {
        $this->join($this->player);
        $member = $this->classroom->members()->firstOrFail();

        $this->actingAs($this->teacher)->post("/teacher/classrooms/{$this->classroom->id}/remove-member", ['member_id' => $member->id])->assertRedirect();

        $this->assertKickSent($this->classroom->id, $this->player->id);
    }

    public function test_end_kicks_everyone(): void
    {
        $this->actingAs($this->teacher)->post("/teacher/classrooms/{$this->classroom->id}/end")->assertRedirect();

        $this->assertKickSent($this->classroom->id, 0);
    }

    public function test_kick_failure_never_breaks_request(): void
    {
        Http::fake(['game.test/*' => fn () => throw new \RuntimeException('down')]);
        $this->join($this->player);

        $this->actingAs($this->player)->post('/portal/classrooms/123456/leave')->assertRedirect();

        $this->assertNotNull($this->classroom->members()->firstOrFail()->left_at);
    }

    public function test_kick_skipped_without_secret(): void
    {
        config(['game-service.secret' => '']);
        $this->join($this->player);

        $this->actingAs($this->player)->post('/portal/classrooms/123456/leave')->assertRedirect();

        Http::assertNothingSent();
    }

    private function assertKickSent(int $classroomId, int $userId): void
    {
        Http::assertSent(function (HttpRequest $request) use ($classroomId, $userId): bool {
            $timestamp = $request->header('X-Game-Timestamp')[0] ?? '';
            $signature = $request->header('X-Game-Signature')[0] ?? '';

            return $request->url() === self::KICK_URL
                && $request->method() === 'POST'
                && json_decode($request->body(), true) === ['classroom' => $classroomId, 'user' => $userId]
                && hash_equals(app(GameServiceSigner::class)->sign($timestamp, $request->body()), $signature);
        });
    }
}
