<?php

use App\Http\Requests\Api\StoreClassroomChatRequest;
use App\Models\ChatConversation;
use App\Models\ChatMessage;
use App\Models\Classroom;
use App\Models\ClassroomGame;
use App\Models\GameHistory;
use App\Models\User;
use Illuminate\Support\Facades\Http;
use Illuminate\Testing\TestResponse;

const CLASSROOM_STAGE3_SECRET = 'ssssssssssssssssssssssssssssssssssssssss';

beforeEach(function (): void {
    $this->withoutVite();
    config([
        'game-service.secret' => CLASSROOM_STAGE3_SECRET,
        'chat-service.secret' => str_repeat('c', 40),
        'chat-service.publish_url' => 'http://chat.test/internal/publish',
    ]);
    Http::fake([
        'chat.test/*' => Http::response(['delivered' => 1]),
        '*' => Http::response(null, 204),
    ]);

    $this->teacher = User::factory()->teacher()->create(['name' => 'Bu Sari']);
    $this->otherTeacher = User::factory()->teacher()->create();
    $this->student = User::factory()->create(['name' => 'Budi']);
    $this->classmate = User::factory()->create(['name' => 'Rani']);
    $this->classroom = Classroom::factory()->create(['teacher_id' => $this->teacher->id, 'pin' => '654321']);
    ClassroomGame::query()->create(['classroom_id' => $this->classroom->id, 'game_key' => 'flag-quest', 'sort_order' => 0]);
    foreach ([$this->student, $this->classmate] as $user) {
        $this->classroom->members()->create(['user_id' => $user->id, 'joined_at' => now()]);
    }
});

/** @return array<string, mixed> */
function stage3Claims(string $token): array
{
    [$payload] = explode('.', $token);

    return json_decode(base64_decode(strtr($payload, '-_', '+/')), true);
}

/**
 * @param  array<string, mixed>  $overrides
 */
function postClassroomChat(array $overrides = [], ?string $signature = null): TestResponse
{
    $body = json_encode([
        'event_id' => 'cw-'.test()->classroom->id.'-'.test()->student->id.'-'.hrtime(true).'-ab12',
        'classroom' => test()->classroom->id,
        'from' => test()->student->id,
        'to' => test()->teacher->id,
        'text' => 'Bu, saya sudah selesai',
        'at' => now()->toIso8601String(),
        ...$overrides,
    ]);
    $timestamp = (string) now()->getTimestamp();

    return test()->call('POST', '/api/internal/classroom-chat', [], [], [], [
        'CONTENT_TYPE' => 'application/json',
        'HTTP_ACCEPT' => 'application/json',
        'HTTP_X_GAME_TIMESTAMP' => $timestamp,
        'HTTP_X_GAME_SIGNATURE' => $signature ?? hash_hmac('sha256', $timestamp.'.'.$body, CLASSROOM_STAGE3_SECRET),
    ], $body);
}

it('rejects an unsigned or badly signed chat line', function (): void {
    postClassroomChat([], 'bad-signature')->assertForbidden();
    test()->call('POST', '/api/internal/classroom-chat', [], [], [], ['CONTENT_TYPE' => 'application/json', 'HTTP_ACCEPT' => 'application/json'], '{}')->assertForbidden();

    expect(ChatMessage::query()->count())->toBe(0);
});

it('stores a proximity chat line in the direct conversation shown on /chat', function (): void {
    $response = postClassroomChat()->assertOk()->assertJsonPath('status', 'stored');

    $conversation = ChatConversation::query()->findOrFail($response->json('conversation_id'));
    expect($conversation->type)->toBe(ChatConversation::DIRECT)
        ->and($conversation->direct_key)->toBe(ChatConversation::directKey($this->student->id, $this->teacher->id))
        ->and($conversation->messages()->sole()->only('user_id', 'body'))->toBe(['user_id' => $this->student->id, 'body' => 'Bu, saya sudah selesai']);

    $this->actingAs($this->teacher)->getJson('/chat/inbox')->assertOk()
        ->assertJsonPath('conversations.0.id', $conversation->id);
    expect($this->teacher->notifications()->count())->toBe(1);
});

it('stores chat between two classmates and reuses the existing direct chat', function (): void {
    $first = postClassroomChat(['to' => $this->classmate->id])->assertOk()->json('conversation_id');
    $second = postClassroomChat(['from' => $this->classmate->id, 'to' => $this->student->id, 'text' => 'Halo'])->assertOk()->json('conversation_id');

    expect($second)->toBe($first)->and(ChatMessage::query()->count())->toBe(2);
});

it('deduplicates by event id', function (): void {
    postClassroomChat(['event_id' => 'cw-dup-1'])->assertOk()->assertJsonPath('status', 'stored');
    postClassroomChat(['event_id' => 'cw-dup-1'])->assertOk()->assertExactJson(['status' => 'duplicate']);

    expect(ChatMessage::query()->count())->toBe(1);
});

it('refuses senders or targets outside the classroom', function (): void {
    $stranger = User::factory()->create();
    postClassroomChat(['from' => $stranger->id])->assertForbidden();
    postClassroomChat(['to' => $stranger->id])->assertForbidden();
    postClassroomChat(['to' => $this->otherTeacher->id])->assertForbidden();

    $this->classroom->members()->where('user_id', $this->classmate->id)->update(['left_at' => now()]);
    postClassroomChat(['to' => $this->classmate->id])->assertForbidden();

    $this->student->forceFill(['disabled_at' => now()])->save();
    postClassroomChat()->assertForbidden();

    expect(ChatMessage::query()->count())->toBe(0);
});

it('refuses chat for an ended or scheduled classroom', function (): void {
    $this->classroom->update(['starts_at' => now()->subHours(2), 'ends_at' => now()->subHour()]);
    postClassroomChat()->assertForbidden();

    $this->classroom->update(['starts_at' => now()->addHour(), 'ends_at' => now()->addHours(2)]);
    postClassroomChat()->assertForbidden();

    expect(ChatMessage::query()->count())->toBe(0);
});

it('validates the payload', function (): void {
    postClassroomChat(['to' => $this->student->id])->assertUnprocessable()->assertJsonValidationErrors('to');
    postClassroomChat(['event_id' => str_repeat('x', 81)])->assertUnprocessable()->assertJsonValidationErrors('event_id');
    postClassroomChat(['text' => " \u{0007}\n\t "])->assertUnprocessable()->assertJsonValidationErrors('text');
    postClassroomChat(['text' => ['x']])->assertUnprocessable()->assertJsonValidationErrors('text');
});

it('strips control characters, trims and caps the text', function (): void {
    postClassroomChat(['text' => "  Ha\u{0000}lo\nBu\u{200B} \u{001B}[31m  "])->assertOk();
    expect(ChatMessage::query()->sole()->body)->toBe('HaloBu [31m');

    postClassroomChat(['text' => str_repeat('é', 200)])->assertOk();
    expect(mb_strlen(ChatMessage::query()->latest('id')->first()->body))->toBe(StoreClassroomChatRequest::MAX_TEXT);
});

it('puts the classroom teacher id in the student world token', function (): void {
    $token = $this->actingAs($this->student)->postJson('/portal/classrooms/654321/world-token')->assertOk()->json('token');

    expect(stage3Claims($token)['teacher_id'])->toBe($this->teacher->id);
});

it('issues the teacher world token to the owner only', function (): void {
    $url = "/teacher/classrooms/{$this->classroom->id}/world-token";

    $response = $this->actingAs($this->teacher)->postJson($url)->assertOk()->assertJsonStructure(['token', 'expires_in']);
    $claims = stage3Claims($response->json('token'));
    expect($claims['sub'])->toBe($this->teacher->id)
        ->and($claims['teacher_id'])->toBe($this->teacher->id)
        ->and($claims['game'])->toBe('classroom')
        ->and($claims['classroom'])->toBe($this->classroom->id)
        ->and($claims['booths'])->toBe(['flag-quest'])
        ->and($claims['seats'])->toBe(100);

    $this->actingAs($this->otherTeacher)->postJson($url)->assertForbidden();
    $this->actingAs($this->student)->postJson($url)->assertForbidden();
    $this->actingAs(User::factory()->create(['is_superadmin' => true]))->postJson($url)->assertForbidden();
    $this->app['auth']->forgetGuards();
    $this->postJson($url)->assertUnauthorized();
});

it('refuses the teacher world token outside the active window or without secret', function (): void {
    $url = "/teacher/classrooms/{$this->classroom->id}/world-token";

    $this->classroom->update(['starts_at' => now()->addHour(), 'ends_at' => now()->addHours(2)]);
    $this->actingAs($this->teacher)->postJson($url)->assertNotFound();

    $this->classroom->update(['starts_at' => now()->subMinute(), 'ends_at' => now()->addHour()]);
    config(['game-service.secret' => '']);
    $this->actingAs($this->teacher)->postJson($url)->assertStatus(503);
});

it('serves the teacher world hud with a non-null me', function (): void {
    GameHistory::factory()->create(['user_id' => $this->student->id, 'classroom_id' => $this->classroom->id, 'points' => 40]);

    $this->actingAs($this->teacher)->getJson("/teacher/classrooms/{$this->classroom->id}/world-hud")
        ->assertOk()
        ->assertJsonPath('me', ['points' => 0, 'plays' => 0, 'rank' => null])
        ->assertJsonPath('members_count', 2)
        ->assertJsonPath('leaderboard.0.user_id', $this->student->id);

    $this->actingAs($this->otherTeacher)->getJson("/teacher/classrooms/{$this->classroom->id}/world-hud")->assertForbidden();
    $this->actingAs($this->student)->getJson("/teacher/classrooms/{$this->classroom->id}/world-hud")->assertForbidden();
});

it('renders the teacher world page for an active classroom', function (): void {
    $this->actingAs($this->teacher)->get("/teacher/classrooms/{$this->classroom->id}/world")
        ->assertOk()
        ->assertInertia(fn ($page) => $page
            ->component('teacher/classrooms/world', false)
            ->where('classroom', ['id' => $this->classroom->id, 'name' => $this->classroom->name, 'pin' => '654321', 'status' => 'active'])
            ->where('world.role', 'teacher')
            ->where('world.token_url', route('teacher.classrooms.world-token', $this->classroom))
            ->where('world.hud_url', route('teacher.classrooms.world-hud', $this->classroom))
            ->where('world.me.id', $this->teacher->id)
            ->where('world.teacher.id', $this->teacher->id)
            ->where('world.teacher.name', 'Bu Sari')
            ->has('world.teacher.character')
            ->where('world.hud.me.rank', null)
            ->has('world.ws_url')
        );

    $this->actingAs($this->otherTeacher)->get("/teacher/classrooms/{$this->classroom->id}/world")->assertForbidden();
    $this->actingAs($this->student)->get("/teacher/classrooms/{$this->classroom->id}/world")->assertForbidden();
});

it('redirects the teacher world page back when the classroom is not active', function (): void {
    $this->classroom->update(['starts_at' => now()->addHour(), 'ends_at' => now()->addHours(2)]);

    $this->actingAs($this->teacher)->get("/teacher/classrooms/{$this->classroom->id}/world")
        ->assertRedirect(route('teacher.classrooms.show', $this->classroom))
        ->assertSessionHas('error', __('classrooms.world_not_active'));
});

it('adds teacher and role to the student world props', function (): void {
    $this->actingAs($this->student)->get('/portal/classrooms/654321')
        ->assertOk()
        ->assertInertia(fn ($page) => $page
            ->where('world.role', 'student')
            ->where('world.me.id', $this->student->id)
            ->where('world.teacher.id', $this->teacher->id)
            ->where('world.teacher.name', 'Bu Sari')
            ->has('world.teacher.character')
        );
});
