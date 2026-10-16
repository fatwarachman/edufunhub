<?php

use App\Models\ChatConversation;
use App\Models\ChatMessage;
use App\Models\ChatParticipant;
use App\Models\PlayerProfile;
use App\Models\User;
use Database\Factories\ChatConversationFactory;
use Inertia\Testing\AssertableInertia as Assert;
use Spatie\Activitylog\Models\Activity;

beforeEach(function (): void {
    config(['scout.driver' => 'null']);
    $this->withoutVite();
    $this->admin = User::factory()->superadmin()->create();
});

function chatLogPlayer(string $name, string $nickname): User
{
    $user = User::factory()->create(['name' => $name]);
    PlayerProfile::factory()->for($user)->create(['nickname' => $nickname]);

    return $user->refresh();
}

function chatLogSay(ChatConversation $conversation, User $user, string $body, int $minutesAgo = 0): ChatMessage
{
    $message = $conversation->messages()->create(['user_id' => $user->id, 'type' => ChatMessage::TEXT, 'body' => $body]);
    $message->forceFill(['created_at' => now()->subMinutes($minutesAgo)])->save();
    $conversation->update(['last_message_at' => $message->created_at]);

    return $message;
}

it('is only for super admins', function (): void {
    $this->get('/admin/chat-logs')->assertRedirect('/login');
    $this->actingAs(User::factory()->create())->get('/admin/chat-logs')->assertForbidden();

    $rani = chatLogPlayer('Rani Account', 'Rani');
    $budi = chatLogPlayer('Budi Account', 'Budi');
    $conversation = ChatConversationFactory::between($rani, $budi);
    $this->actingAs($rani)->get("/admin/chat-logs/{$conversation->id}")->assertForbidden();

    $this->actingAs($this->admin)->get('/admin/chat-logs')->assertOk()
        ->assertInertia(fn (Assert $page) => $page->component('admin/chat-logs/index'));
});

it('lists conversations with participants counts and the latest message', function (): void {
    $rani = chatLogPlayer('Rani Account', 'Rani');
    $budi = chatLogPlayer('Budi Account', 'Budi');
    $sari = chatLogPlayer('Sari Account', 'Sari');

    $direct = ChatConversationFactory::between($rani, $budi);
    chatLogSay($direct, $rani, 'Halo Budi', 30);
    chatLogSay($direct, $budi, 'Halo juga Rani', 20);

    $group = ChatConversationFactory::group([$rani, $budi, $sari], 'Tim Matematika');
    chatLogSay($group, $sari, 'Ayo belajar', 5);

    $this->actingAs($this->admin)->get('/admin/chat-logs')->assertOk()
        ->assertInertia(fn (Assert $page) => $page
            ->component('admin/chat-logs/index')
            ->where('summary.conversations', 2)
            ->where('summary.messages', 3)
            ->where('user', null)
            ->has('conversations.data', 2)
            ->where('conversations.data.0.id', $group->id)
            ->where('conversations.data.0.name', 'Tim Matematika')
            ->where('conversations.data.0.type', 'group')
            ->has('conversations.data.0.participants', 3)
            ->where('conversations.data.0.messages_count', 1)
            ->where('conversations.data.0.last_message.body', 'Ayo belajar')
            ->where('conversations.data.0.last_message.sender', 'Sari')
            ->where('conversations.data.1.id', $direct->id)
            ->where('conversations.data.1.type', 'direct')
            ->where('conversations.data.1.participants.0.user.display_name', 'Rani')
            ->where('conversations.data.1.participants.1.user.display_name', 'Budi')
            ->where('conversations.data.1.messages_count', 2)
            ->where('conversations.data.1.last_message.body', 'Halo juga Rani'));
});

it('filters by user and shows their chat partners', function (): void {
    $rani = chatLogPlayer('Rani Account', 'Rani');
    $budi = chatLogPlayer('Budi Account', 'Budi');
    $sari = chatLogPlayer('Sari Account', 'Sari');
    $dodi = chatLogPlayer('Dodi Account', 'Dodi');

    $withBudi = ChatConversationFactory::between($rani, $budi);
    chatLogSay($withBudi, $rani, 'Satu', 10);
    chatLogSay($withBudi, $rani, 'Dua', 9);
    chatLogSay($withBudi, $budi, 'Tiga', 8);

    $withSari = ChatConversationFactory::between($rani, $sari);
    chatLogSay($withSari, $sari, 'Hai', 5);

    $other = ChatConversationFactory::between($budi, $dodi);
    chatLogSay($other, $dodi, 'Bukan Rani', 1);

    $this->actingAs($this->admin)->get("/admin/chat-logs?user_id={$rani->id}")->assertOk()
        ->assertInertia(fn (Assert $page) => $page
            ->where('filters.user_id', $rani->id)
            ->has('conversations.data', 2)
            ->where('conversations.data.0.id', $withSari->id)
            ->where('conversations.data.1.id', $withBudi->id)
            ->where('user.id', $rani->id)
            ->where('user.display_name', 'Rani')
            ->where('user.conversations', 2)
            ->where('user.messages_sent', 2)
            ->has('user.partners', 2)
            ->where('user.partners.0.id', $budi->id)
            ->where('user.partners.0.messages_sent', 2)
            ->where('user.partners.0.messages_received', 1)
            ->where('user.partners.1.id', $sari->id)
            ->where('user.partners.1.messages_received', 1));
});

it('searches by participant name nickname or message text and filters by type', function (): void {
    $rani = chatLogPlayer('Rani Account', 'Rani');
    $budi = chatLogPlayer('Budi Account', 'Budi');
    $sari = chatLogPlayer('Sari Account', 'Kucing');
    $dodi = chatLogPlayer('Dodi Account', 'Dodi');

    $direct = ChatConversationFactory::between($rani, $budi);
    chatLogSay($direct, $rani, 'PR pecahan sudah selesai?');

    $other = ChatConversationFactory::between($sari, $dodi);
    chatLogSay($other, $sari, 'Main bola');

    $group = ChatConversationFactory::group([$rani, $dodi], 'Klub Sains');

    $this->actingAs($this->admin)->get('/admin/chat-logs?search=pecahan')
        ->assertInertia(fn (Assert $page) => $page->has('conversations.data', 1)->where('conversations.data.0.id', $direct->id));

    $this->actingAs($this->admin)->get('/admin/chat-logs?search=Kucing')
        ->assertInertia(fn (Assert $page) => $page->has('conversations.data', 1)->where('conversations.data.0.id', $other->id));

    $this->actingAs($this->admin)->get('/admin/chat-logs?search=Budi+Account')
        ->assertInertia(fn (Assert $page) => $page->has('conversations.data', 1)->where('conversations.data.0.id', $direct->id));

    $this->actingAs($this->admin)->get('/admin/chat-logs?type=group')
        ->assertInertia(fn (Assert $page) => $page->has('conversations.data', 1)->where('conversations.data.0.id', $group->id));

    $this->actingAs($this->admin)->get('/admin/chat-logs?type=secret')->assertSessionHasErrors('type');
});

it('filters by message date range', function (): void {
    $rani = chatLogPlayer('Rani Account', 'Rani');
    $budi = chatLogPlayer('Budi Account', 'Budi');
    $sari = chatLogPlayer('Sari Account', 'Sari');

    $old = ChatConversationFactory::between($rani, $budi);
    chatLogSay($old, $rani, 'Lama', 60 * 24 * 10);

    $recent = ChatConversationFactory::between($rani, $sari);
    chatLogSay($recent, $rani, 'Baru');

    $from = now()->subDays(2)->toDateString();
    $this->actingAs($this->admin)->get("/admin/chat-logs?date_from={$from}")
        ->assertInertia(fn (Assert $page) => $page->has('conversations.data', 1)->where('conversations.data.0.id', $recent->id));
});

it('shows every message with sender and recipient as plain text', function (): void {
    $rani = chatLogPlayer('Rani Account', 'Rani');
    $budi = chatLogPlayer('Budi Account', 'Budi');
    $conversation = ChatConversationFactory::between($rani, $budi);
    chatLogSay($conversation, $rani, '<b>Halo</b> Budi', 10);
    chatLogSay($conversation, $budi, 'Halo Rani', 5);

    $this->actingAs($this->admin)->get("/admin/chat-logs/{$conversation->id}")->assertOk()
        ->assertInertia(fn (Assert $page) => $page
            ->component('admin/chat-logs/show')
            ->where('conversation.id', $conversation->id)
            ->where('conversation.type', 'direct')
            ->where('conversation.messages_count', 2)
            ->has('conversation.participants', 2)
            ->has('messages.data', 2)
            ->where('messages.data.0.body', '<b>Halo</b> Budi')
            ->where('messages.data.0.sender.id', $rani->id)
            ->where('messages.data.0.sender.display_name', 'Rani')
            ->where('messages.data.0.recipient', 'Budi')
            ->where('messages.data.1.sender.id', $budi->id)
            ->where('messages.data.1.recipient', 'Rani'));
});

it('shows group members who left and translated system messages', function (): void {
    $rani = chatLogPlayer('Rani Account', 'Rani');
    $budi = chatLogPlayer('Budi Account', 'Budi');
    $group = ChatConversationFactory::group([$rani, $budi], 'Klub Baca');
    $group->messages()->create([
        'user_id' => $budi->id,
        'type' => ChatMessage::SYSTEM,
        'body' => json_encode(['event' => 'left', 'actor' => 'Budi', 'params' => ['name' => 'Budi']]),
    ]);
    ChatParticipant::query()->where('chat_conversation_id', $group->id)->where('user_id', $budi->id)->update(['left_at' => now()]);

    $this->actingAs($this->admin)->get("/admin/chat-logs/{$group->id}")->assertOk()
        ->assertInertia(fn (Assert $page) => $page
            ->where('conversation.name', 'Klub Baca')
            ->where('conversation.participants.1.user.id', $budi->id)
            ->whereNot('conversation.participants.1.left_at', null)
            ->where('messages.data.0.type', 'system')
            ->where('messages.data.0.recipient', null)
            ->where('messages.data.0.body', fn (string $body): bool => str_contains($body, 'Budi')));
});

it('records viewing a chat in the activity log', function (): void {
    $rani = chatLogPlayer('Rani Account', 'Rani');
    $budi = chatLogPlayer('Budi Account', 'Budi');
    $conversation = ChatConversationFactory::between($rani, $budi);

    $this->actingAs($this->admin)->get("/admin/chat-logs/{$conversation->id}")->assertOk();

    $activity = Activity::query()->where('description', 'Viewed chat log')->latest('id')->first();
    expect($activity)->not->toBeNull()
        ->and($activity->causer_id)->toBe($this->admin->id)
        ->and($activity->subject_type)->toBe(ChatConversation::class)
        ->and($activity->subject_id)->toBe($conversation->id);
});

it('returns 404 for a missing conversation', function (): void {
    $this->actingAs($this->admin)->get('/admin/chat-logs/999999')->assertNotFound();
});
