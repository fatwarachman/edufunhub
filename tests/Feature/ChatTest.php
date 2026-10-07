<?php

use App\Models\ChatConversation;
use App\Models\ChatMessage;
use App\Models\PlayerProfile;
use App\Models\User;
use Database\Factories\ChatConversationFactory;
use Illuminate\Http\Client\Request as HttpRequest;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\Http;
use Inertia\Testing\AssertableInertia as Assert;

beforeEach(function (): void {
    $this->withoutVite();
    config([
        'chat-service.secret' => str_repeat('c', 40),
        'chat-service.publish_url' => 'http://chat.test/internal/publish',
    ]);
    Http::fake(['chat.test/*' => Http::response(['delivered' => 1])]);
});

function chatPlayer(string $nickname): User
{
    $user = User::factory()->withPlayerDetails()->create(['locale' => 'id']);
    PlayerProfile::query()->where('user_id', $user->id)->update(['nickname' => $nickname]);

    return $user->refresh();
}

it('renders the chat page with the inbox and live socket settings', function (): void {
    $rani = chatPlayer('Rani');
    $budi = chatPlayer('Budi');
    ChatConversationFactory::between($rani, $budi);

    $this->actingAs($rani)->get('/chat?c=5')->assertOk()->assertInertia(fn (Assert $page) => $page
        ->component('chat/index')
        ->has('conversations', 1)
        ->where('conversations.0.name', 'Budi')
        ->where('conversations.0.type', 'direct')
        ->where('openId', 5)
        ->where('live', true)
        ->where('wsUrl', '/chat-ws/ws'));
});

it('requires sign in for every chat endpoint', function (): void {
    $this->get('/chat')->assertRedirect('/login');
    $this->getJson('/chat/inbox')->assertUnauthorized();
    $this->postJson('/chat/token')->assertUnauthorized();
    $this->postJson('/chat/direct', ['user_id' => 1])->assertUnauthorized();
});

it('starts one direct chat per pair and refuses chatting with yourself', function (): void {
    $rani = chatPlayer('Rani');
    $budi = chatPlayer('Budi');

    $first = $this->actingAs($rani)->postJson('/chat/direct', ['user_id' => $budi->id])->assertCreated()->json('conversation.id');
    $again = $this->actingAs($budi)->postJson('/chat/direct', ['user_id' => $rani->id])->assertCreated()->json('conversation.id');

    expect($again)->toBe($first)->and(ChatConversation::query()->count())->toBe(1);
    $this->actingAs($rani)->postJson('/chat/direct', ['user_id' => $rani->id])->assertUnprocessable()->assertJsonValidationErrors('user_id');
});

it('sends a message, stores it, publishes it to the chat service and notifies the other member', function (): void {
    $rani = chatPlayer('Rani');
    $budi = chatPlayer('Budi');
    $conversation = ChatConversationFactory::between($rani, $budi);

    $this->actingAs($rani)->postJson("/chat/conversations/{$conversation->id}/messages", ['body' => '  Halo Budi!  '])
        ->assertCreated()
        ->assertJsonPath('message.body', 'Halo Budi!')
        ->assertJsonPath('message.mine', true);

    expect(ChatMessage::query()->where('type', 'text')->value('body'))->toBe('Halo Budi!');
    Http::assertSent(function (HttpRequest $request) use ($rani, $budi): bool {
        $body = json_decode($request->body(), true);
        $expected = hash_hmac('sha256', $request->header('X-Chat-Timestamp')[0].'.'.$request->body(), str_repeat('c', 40));

        return $request->url() === 'http://chat.test/internal/publish'
            && $request->header('X-Chat-Signature')[0] === $expected
            && collect($body['users'])->sort()->values()->all() === collect([$rani->id, $budi->id])->sort()->values()->all()
            && $body['event']['message']['body'] === 'Halo Budi!';
    });

    $feed = $this->actingAs($budi)->getJson('/notifications')->assertOk()->json();
    expect($feed['unread'])->toBe(1)
        ->and($feed['items'][0]['kind'])->toBe('chat')
        ->and($feed['items'][0]['title'])->toBe('Rani')
        ->and($feed['items'][0]['body'])->toBe('Halo Budi!')
        ->and($feed['items'][0]['url'])->toBe("/chat?c={$conversation->id}");
    expect($this->actingAs($rani)->getJson('/notifications')->json('unread'))->toBe(0);
});

it('groups unread messages from one conversation into a single notification and clears it on read', function (): void {
    $rani = chatPlayer('Rani');
    $budi = chatPlayer('Budi');
    $conversation = ChatConversationFactory::between($rani, $budi);

    foreach (['satu', 'dua', 'tiga'] as $text) {
        $this->actingAs($rani)->postJson("/chat/conversations/{$conversation->id}/messages", ['body' => $text])->assertCreated();
    }

    $feed = $this->actingAs($budi)->getJson('/notifications')->json();
    expect($feed['unread'])->toBe(1)
        ->and($feed['items'][0]['body'])->toBe('tiga')
        ->and($feed['items'][0]['count'])->toBe(3)
        ->and($this->actingAs($budi)->getJson('/chat/inbox')->json('unread'))->toBe(3);

    $this->actingAs($budi)->getJson("/chat/conversations/{$conversation->id}")
        ->assertOk()
        ->assertJsonCount(3, 'messages')
        ->assertJsonPath('messages.2.body', 'tiga')
        ->assertJsonPath('messages.2.mine', false);

    expect($this->actingAs($budi)->getJson('/notifications')->json('unread'))->toBe(0)
        ->and($this->actingAs($budi)->getJson('/chat/inbox')->json('unread'))->toBe(0);
});

it('hides conversations from non-members', function (): void {
    $rani = chatPlayer('Rani');
    $budi = chatPlayer('Budi');
    $intruder = chatPlayer('Iseng');
    $conversation = ChatConversationFactory::between($rani, $budi);

    $this->actingAs($intruder)->getJson("/chat/conversations/{$conversation->id}")->assertNotFound();
    $this->actingAs($intruder)->postJson("/chat/conversations/{$conversation->id}/messages", ['body' => 'hai'])->assertNotFound();
    $this->actingAs($intruder)->postJson("/chat/conversations/{$conversation->id}/read")->assertNotFound();
    expect(ChatMessage::query()->count())->toBe(0);
});

it('validates message bodies', function (string $body): void {
    $rani = chatPlayer('Rani');
    $conversation = ChatConversationFactory::between($rani, chatPlayer('Budi'));

    $this->actingAs($rani)->postJson("/chat/conversations/{$conversation->id}/messages", ['body' => $body])
        ->assertUnprocessable()->assertJsonValidationErrors('body');
})->with([
    'empty' => [''],
    'only spaces' => ['    '],
    'too long' => [str_repeat('a', ChatMessage::MAX_LENGTH + 1)],
]);

it('creates groups, lets members chat, add people and leave, and hands ownership over', function (): void {
    $rani = chatPlayer('Rani');
    $budi = chatPlayer('Budi');
    $citra = chatPlayer('Citra');
    $dodi = chatPlayer('Dodi');

    $id = $this->actingAs($rani)->postJson('/chat/groups', ['name' => ' Kelas 4A ', 'member_ids' => [$budi->id, $citra->id]])
        ->assertCreated()
        ->assertJsonPath('conversation.name', 'Kelas 4A')
        ->assertJsonPath('conversation.owner_id', $rani->id)
        ->assertJsonCount(3, 'conversation.members')
        ->json('conversation.id');

    $this->actingAs($budi)->postJson("/chat/conversations/{$id}/messages", ['body' => 'Halo semua'])->assertCreated();
    foreach ([$rani, $citra] as $user) {
        $item = $this->actingAs($user)->getJson('/notifications')->json('items.0');
        expect($item['title'])->toBe('Budi @ Kelas 4A');
    }

    $this->actingAs($budi)->patchJson("/chat/groups/{$id}", ['name' => 'Bukan punyaku'])->assertForbidden();
    $this->actingAs($budi)->patchJson("/chat/groups/{$id}", ['add_member_ids' => [$dodi->id]])->assertOk()->assertJsonCount(4, 'conversation.members');

    $this->actingAs($rani)->postJson("/chat/groups/{$id}/leave")->assertOk();
    $this->actingAs($rani)->getJson("/chat/conversations/{$id}")->assertNotFound();
    $group = $this->actingAs($budi)->getJson("/chat/conversations/{$id}")->assertOk()->json();
    expect($group['conversation']['owner_id'])->toBe($budi->id)
        ->and(collect($group['messages'])->where('type', 'system')->pluck('body')->all())->toBe([
            'Rani membuat grup "Kelas 4A".',
            'Budi menambahkan Dodi.',
            'Rani keluar dari grup.',
        ]);

    $this->actingAs($budi)->patchJson("/chat/groups/{$id}", ['name' => 'Kelas 4B'])->assertOk()->assertJsonPath('conversation.name', 'Kelas 4B');
});

it('validates group creation and refuses leaving a direct chat', function (): void {
    $rani = chatPlayer('Rani');
    $budi = chatPlayer('Budi');

    $this->actingAs($rani)->postJson('/chat/groups', ['name' => 'A', 'member_ids' => []])
        ->assertUnprocessable()->assertJsonValidationErrors(['name', 'member_ids']);
    $this->actingAs($rani)->postJson('/chat/groups', ['name' => 'Grup', 'member_ids' => [$rani->id]])
        ->assertUnprocessable()->assertJsonValidationErrors('member_ids.0');
    $this->actingAs($rani)->postJson('/chat/groups', ['name' => 'Grup', 'member_ids' => range(1, ChatConversation::MAX_GROUP_MEMBERS)])
        ->assertUnprocessable()->assertJsonValidationErrors('member_ids');

    $direct = ChatConversationFactory::between($rani, $budi);
    $this->actingAs($rani)->postJson("/chat/groups/{$direct->id}/leave")->assertUnprocessable();
});

it('searches people by nickname or name, excluding yourself and disabled accounts', function (): void {
    $rani = chatPlayer('Rani');
    chatPlayer('Budi Santoso');
    $off = chatPlayer('Budiman');
    $off->forceFill(['disabled_at' => now()])->save();

    $people = $this->actingAs($rani)->getJson('/chat/people?q=bud')->assertOk()->json('people');

    expect(collect($people)->pluck('name')->all())->toBe(['Budi Santoso'])
        ->and($people[0]['character'])->toHaveKey('color');
    expect(collect($this->actingAs($rani)->getJson('/chat/people?q=Rani')->json('people'))->pluck('name'))->not->toContain('Rani');
    expect($this->actingAs($rani)->getJson('/chat/people?q=%25')->json('people'))->toBe([]);
});

it('issues a chat socket token scoped to the chat audience', function (): void {
    $rani = chatPlayer('Rani');

    $token = $this->actingAs($rani)->postJson('/chat/token')->assertOk()->json('token');
    [$payload, $signature] = explode('.', $token);
    $claims = json_decode(base64_decode(strtr($payload, '-_', '+/')), true);
    $expected = rtrim(strtr(base64_encode(hash_hmac('sha256', $payload, str_repeat('c', 40), true)), '+/', '-_'), '=');

    expect($claims['sub'])->toBe($rani->id)
        ->and($claims['aud'])->toBe('chat')
        ->and($signature)->toBe($expected);

    config(['chat-service.secret' => '']);
    $this->actingAs($rani)->postJson('/chat/token')->assertServiceUnavailable();
});

it('keeps sending when the chat service is down', function (): void {
    Http::fake(['chat.test/*' => Http::response('down', 502)]);
    $rani = chatPlayer('Rani');
    $budi = chatPlayer('Budi');
    $conversation = ChatConversationFactory::between($rani, $budi);

    $this->actingAs($rani)->postJson("/chat/conversations/{$conversation->id}/messages", ['body' => 'tetap tersimpan'])->assertCreated();

    expect(ChatMessage::query()->where('body', 'tetap tersimpan')->exists())->toBeTrue()
        ->and($this->actingAs($budi)->getJson('/notifications')->json('unread'))->toBe(1);
});

it('rate limits message floods', function (): void {
    $rani = chatPlayer('Rani');
    $conversation = ChatConversationFactory::between($rani, chatPlayer('Budi'));

    $statuses = collect(range(1, 5))->map(fn (int $i) => $this->actingAs($rani)
        ->postJson("/chat/conversations/{$conversation->id}/messages", ['body' => "pesan {$i}"])->status());

    expect($statuses->filter(fn (int $s): bool => $s === 429)->count())->toBeGreaterThan(0);
});

it('publishes the sender and conversation with each live message for the chat popup', function (): void {
    $rani = chatPlayer('Rani');
    $budi = chatPlayer('Budi');
    $conversation = ChatConversationFactory::between($rani, $budi);

    $this->actingAs($rani)->postJson("/chat/conversations/{$conversation->id}/messages", ['body' => 'Main yuk'])->assertCreated();

    Http::assertSent(function (HttpRequest $request) use ($rani, $conversation): bool {
        $event = json_decode($request->body(), true)['event'];

        return $event['t'] === 'message'
            && $event['conversation'] === ['id' => $conversation->id, 'type' => 'direct', 'name' => null]
            && $event['sender']['id'] === $rani->id
            && $event['sender']['name'] === 'Rani'
            && is_array($event['sender']['character']);
    });
});

it('names the group in live group messages', function (): void {
    $rani = chatPlayer('Rani');
    $budi = chatPlayer('Budi');
    $group = $this->actingAs($rani)->postJson('/chat/groups', ['name' => 'Kelas 5A', 'member_ids' => [$budi->id]])->assertCreated()->json('conversation.id');

    $this->actingAs($rani)->postJson("/chat/conversations/{$group}/messages", ['body' => 'Halo kelas'])->assertCreated();

    Http::assertSent(fn (HttpRequest $request): bool => (json_decode($request->body(), true)['event']['message']['body'] ?? null) === 'Halo kelas'
        && json_decode($request->body(), true)['event']['conversation']['name'] === 'Kelas 5A');
});

it('shares the live chat socket with signed-in players on every page', function (): void {
    $rani = chatPlayer('Rani');

    $this->actingAs($rani)->get('/portal')->assertOk()->assertInertia(fn (Assert $page) => $page
        ->where('chatLive.wsUrl', '/chat-ws/ws'));
});

it('does not share the live chat socket with guests or when the chat service is off', function (): void {
    $this->get('/gamelist')->assertOk()->assertInertia(fn (Assert $page) => $page->where('chatLive', null));

    config(['chat-service.secret' => 'short']);
    $this->actingAs(chatPlayer('Rani'))->get('/portal')->assertOk()->assertInertia(fn (Assert $page) => $page->where('chatLive', null));
});

it('returns the other members read pointer with the conversation', function (): void {
    $rani = chatPlayer('Rani');
    $budi = chatPlayer('Budi');
    $conversation = ChatConversationFactory::between($rani, $budi);

    $first = $this->actingAs($rani)->postJson("/chat/conversations/{$conversation->id}/messages", ['body' => 'satu'])->json('message.id');
    $this->actingAs($rani)->getJson("/chat/conversations/{$conversation->id}")
        ->assertOk()
        ->assertJsonPath('conversation.read_upto', 0)
        ->assertJsonPath('conversation.reads.0.user_id', $budi->id);

    $this->actingAs($budi)->getJson("/chat/conversations/{$conversation->id}")->assertOk();
    $this->actingAs($rani)->getJson("/chat/conversations/{$conversation->id}")
        ->assertJsonPath('conversation.read_upto', $first)
        ->assertJsonPath('conversation.reads.0.last_read_message_id', $first);
    expect(collect($this->actingAs($rani)->getJson('/chat/inbox')->json('conversations'))->firstWhere('id', $conversation->id)['read_upto'])->toBe($first);
});

it('publishes a read receipt to the other members only when the read pointer moves', function (): void {
    $rani = chatPlayer('Rani');
    $budi = chatPlayer('Budi');
    $conversation = ChatConversationFactory::between($rani, $budi);
    $id = $this->actingAs($rani)->postJson("/chat/conversations/{$conversation->id}/messages", ['body' => 'halo'])->json('message.id');

    $readEvents = fn (): Collection => Http::recorded()
        ->map(fn (array $pair): array => json_decode($pair[0]->body(), true))
        ->filter(fn (array $body): bool => ($body['event']['t'] ?? null) === 'read')
        ->values();

    $this->actingAs($budi)->postJson("/chat/conversations/{$conversation->id}/read")->assertOk();
    $this->actingAs($budi)->postJson("/chat/conversations/{$conversation->id}/read")->assertOk();
    $this->actingAs($budi)->getJson("/chat/conversations/{$conversation->id}")->assertOk();

    expect($readEvents())->toHaveCount(1)
        ->and($readEvents()[0]['users'])->toBe([$rani->id])
        ->and($readEvents()[0]['event'])->toBe([
            't' => 'read',
            'conversation_id' => $conversation->id,
            'user_id' => $budi->id,
            'last_read_message_id' => $id,
        ]);
});

it('reports group reads only once every other member has read', function (): void {
    $rani = chatPlayer('Rani');
    $budi = chatPlayer('Budi');
    $citra = chatPlayer('Citra');
    $group = ChatConversationFactory::group([$rani, $budi, $citra]);
    $id = $this->actingAs($rani)->postJson("/chat/conversations/{$group->id}/messages", ['body' => 'halo'])->json('message.id');

    $this->actingAs($budi)->postJson("/chat/conversations/{$group->id}/read")->assertOk();
    $this->actingAs($rani)->getJson("/chat/conversations/{$group->id}?before=999999")->assertJsonPath('conversation.read_upto', 0);

    $this->actingAs($citra)->postJson("/chat/conversations/{$group->id}/read")->assertOk();
    $this->actingAs($rani)->getJson("/chat/conversations/{$group->id}?before=999999")->assertJsonPath('conversation.read_upto', $id);
});

it('does not expose read state of conversations to non-members', function (): void {
    $rani = chatPlayer('Rani');
    $budi = chatPlayer('Budi');
    $intruder = chatPlayer('Iseng');
    $conversation = ChatConversationFactory::between($rani, $budi);
    $this->actingAs($rani)->postJson("/chat/conversations/{$conversation->id}/messages", ['body' => 'rahasia'])->assertCreated();

    $this->actingAs($intruder)->postJson("/chat/conversations/{$conversation->id}/read")->assertNotFound();
    expect($this->actingAs($intruder)->getJson('/chat/inbox')->json('conversations'))->toBe([]);
    Http::assertNotSent(fn (HttpRequest $request): bool => (json_decode($request->body(), true)['event']['t'] ?? null) === 'read');
});
