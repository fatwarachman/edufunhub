<?php

use App\Models\ChatConversation;
use App\Models\ChatMessage;
use App\Models\Classroom;
use App\Models\ClassroomGame;
use App\Models\User;
use App\Services\Chat\ChatService;
use Illuminate\Support\Facades\Http;

beforeEach(function (): void {
    $this->withoutVite();
    config([
        'chat-service.secret' => str_repeat('c', 40),
        'chat-service.publish_url' => 'http://chat.test/internal/publish',
    ]);
    Http::fake([
        'chat.test/*' => Http::response(['delivered' => 1]),
        '*' => Http::response(null, 204),
    ]);

    $this->teacher = User::factory()->teacher()->create(['name' => 'Bu Sari']);
    $this->student = User::factory()->create(['name' => 'Budi']);
    $this->classmate = User::factory()->create(['name' => 'Rani']);
    $this->outsider = User::factory()->create(['name' => 'Orang Luar']);
    $this->classroom = Classroom::factory()->create(['teacher_id' => $this->teacher->id, 'pin' => '765432']);
    ClassroomGame::query()->create(['classroom_id' => $this->classroom->id, 'game_key' => 'flag-quest', 'sort_order' => 0]);
    foreach ([$this->student, $this->classmate] as $user) {
        $this->classroom->members()->create(['user_id' => $user->id, 'joined_at' => now()]);
    }
});

function sendDirect(User $from, User $to, string $body): ChatMessage
{
    $chat = app(ChatService::class);

    return $chat->send($chat->direct($from, $to), $from, $body);
}

it('lists unanswered messages from classroom people grouped per sender', function (): void {
    sendDirect($this->student, $this->teacher, 'Bu, saya sudah selesai');
    sendDirect($this->student, $this->teacher, 'Boleh main lagi?');
    sendDirect($this->classmate, $this->teacher, '<b>Halo</b> Bu');
    sendDirect($this->outsider, $this->teacher, 'Bukan anggota kelas');

    $response = $this->actingAs($this->teacher)
        ->getJson(route('teacher.classrooms.world-chat', $this->classroom))
        ->assertOk()
        ->assertJsonPath('total', 3);

    $senders = collect($response->json('senders'))->keyBy('user_id');
    expect($senders)->toHaveCount(2)
        ->and($senders[$this->student->id]['unread'])->toBe(2)
        ->and(array_column($senders[$this->student->id]['messages'], 'text'))->toBe(['Bu, saya sudah selesai', 'Boleh main lagi?'])
        ->and($senders[$this->classmate->id]['messages'][0]['text'])->toBe('<b>Halo</b> Bu')
        ->and($senders->has($this->outsider->id))->toBeFalse();
});

it('drops a sender once the teacher answered or marked it read', function (): void {
    sendDirect($this->student, $this->teacher, 'Bu?');
    sendDirect($this->classmate, $this->teacher, 'Bu, tolong');

    $this->actingAs($this->teacher)
        ->postJson(route('teacher.classrooms.world-chat.reply', $this->classroom), [
            'user_id' => $this->student->id,
            'text' => "  Iya Budi\u{0007}  ",
        ])
        ->assertCreated()
        ->assertJsonPath('message.text', 'Iya Budi')
        ->assertJsonPath('inbox.total', 1)
        ->assertJsonPath('inbox.senders.0.user_id', $this->classmate->id);

    $conversation = ChatConversation::query()->where('direct_key', ChatConversation::directKey($this->teacher->id, $this->student->id))->firstOrFail();
    expect($conversation->messages()->latest('id')->first()->body)->toBe('Iya Budi');

    $this->actingAs($this->teacher)
        ->postJson(route('teacher.classrooms.world-chat.read', $this->classroom), ['user_id' => $this->classmate->id])
        ->assertOk()
        ->assertJsonPath('inbox.total', 0);
});

it('lets a student see and answer the teacher from the world', function (): void {
    sendDirect($this->teacher, $this->student, 'Budi, kerjakan bilik 2');

    $this->actingAs($this->student)
        ->getJson(route('classrooms.world-chat', $this->classroom->pin))
        ->assertOk()
        ->assertJsonPath('total', 1)
        ->assertJsonPath('senders.0.teacher', true);

    $this->actingAs($this->student)
        ->postJson(route('classrooms.world-chat.reply', $this->classroom->pin), ['user_id' => $this->teacher->id, 'text' => 'Siap Bu'])
        ->assertCreated()
        ->assertJsonPath('inbox.total', 0);
});

it('refuses partners outside the classroom and empty text', function (): void {
    $this->actingAs($this->teacher)
        ->postJson(route('teacher.classrooms.world-chat.reply', $this->classroom), ['user_id' => $this->outsider->id, 'text' => 'Hai'])
        ->assertNotFound();
    $this->actingAs($this->teacher)
        ->postJson(route('teacher.classrooms.world-chat.reply', $this->classroom), ['user_id' => $this->teacher->id, 'text' => 'Hai'])
        ->assertNotFound();
    $this->actingAs($this->teacher)
        ->postJson(route('teacher.classrooms.world-chat.reply', $this->classroom), ['user_id' => $this->student->id, 'text' => "\u{0007} "])
        ->assertUnprocessable();
    $this->actingAs($this->student)
        ->postJson(route('classrooms.world-chat.read', $this->classroom->pin), ['user_id' => $this->outsider->id])
        ->assertNotFound();

    expect(ChatConversation::query()->where('direct_key', ChatConversation::directKey($this->teacher->id, $this->outsider->id))->exists())->toBeFalse();
});

it('only lets members and the owning teacher reach the world chat', function (): void {
    $other = User::factory()->teacher()->create();

    $this->actingAs($this->outsider)->getJson(route('classrooms.world-chat', $this->classroom->pin))->assertForbidden();
    $this->actingAs($other)->getJson(route('teacher.classrooms.world-chat', $this->classroom))->assertForbidden();
    $this->actingAs($this->student)->getJson(route('teacher.classrooms.world-chat', $this->classroom))->assertForbidden();

    $this->classroom->members()->where('user_id', $this->classmate->id)->update(['left_at' => now()]);
    $this->actingAs($this->classmate)->getJson(route('classrooms.world-chat', $this->classroom->pin))->assertForbidden();

    $this->classroom->update(['ends_at' => now()->subMinute()]);
    $this->actingAs($this->student)->getJson(route('classrooms.world-chat', $this->classroom->pin))->assertNotFound();
    $this->actingAs($this->teacher)->getJson(route('teacher.classrooms.world-chat', $this->classroom))->assertNotFound();
});

it('shares the chat url with the world page props', function (): void {
    $this->actingAs($this->teacher)
        ->get(route('teacher.classrooms.world', $this->classroom))
        ->assertOk()
        ->assertInertia(fn ($page) => $page->where('world.chat_url', route('teacher.classrooms.world-chat', $this->classroom)));
});
