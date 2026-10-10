<?php

use App\Models\User;
use App\Models\WhatsAppMessage;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Queue;
use Inertia\Testing\AssertableInertia as Assert;

beforeEach(function (): void {
    config([
        'scout.driver' => 'null',
        'whatsapp.base_url' => 'http://gowa.test',
        'whatsapp.username' => 'efh',
        'whatsapp.password' => 'secret',
        'whatsapp.device_id' => 'edufunhub',
    ]);
    Http::preventStrayRequests();
    Http::fake(['gowa.test/*' => Http::response(['code' => 'SUCCESS', 'results' => ['is_connected' => true, 'is_logged_in' => true, 'jid' => '6281111222333:1@s.whatsapp.net']])]);
    $this->withoutVite();
    $this->admin = User::factory()->superadmin()->create();
});

test('the log page is only for super admins', function (): void {
    $this->get('/admin/whatsapp/log')->assertRedirect('/login');
    $this->actingAs(User::factory()->create())->get('/admin/whatsapp/log')->assertForbidden();

    $message = WhatsAppMessage::factory()->create();
    $this->actingAs(User::factory()->create())->getJson("/admin/whatsapp/log/{$message->id}")->assertForbidden();
});

test('the log lists messages newest first with masked numbers and paginates', function (): void {
    $ana = User::factory()->create(['name' => 'Ana Lestari']);
    WhatsAppMessage::factory()->count(26)->for($ana)->sent()->create(['phone' => '6281234567890']);
    $latest = WhatsAppMessage::factory()->for($ana)->failed()->create(['event' => 'welcome', 'phone' => '6281234567890']);

    $this->actingAs($this->admin)->get('/admin/whatsapp/log')->assertOk()->assertInertia(fn (Assert $page) => $page
        ->component('admin/whatsapp-log')
        ->has('messages.data', 25)
        ->where('messages.total', 27)
        ->where('messages.data.0.id', $latest->id)
        ->where('messages.data.0.phone', '62812****7890')
        ->where('messages.data.0.event_label', 'Welcome new players')
        ->where('messages.data.0.user.name', 'Ana Lestari')
        ->where('totals.all', 27)
        ->where('totals.sent', 26)
        ->where('totals.failed', 1)
        ->where('totals.queued', 0));

    $this->actingAs($this->admin)->get('/admin/whatsapp/log?page=2')->assertInertia(fn (Assert $page) => $page
        ->has('messages.data', 2));
});

test('the log filters by status, event, date and search', function (string $query, Closure $expected): void {
    $ana = User::factory()->create(['name' => 'Ana Lestari', 'email' => 'ana@school.test']);
    $budi = User::factory()->create(['name' => 'Budi Santoso']);
    $rows = [
        'ana_sent' => WhatsAppMessage::factory()->for($ana)->sent()->create(['event' => 'welcome', 'phone' => '6281234567890', 'body' => 'Selamat datang di EduFunHub']),
        'budi_failed' => WhatsAppMessage::factory()->for($budi)->failed()->create(['event' => 'friend_request', 'phone' => '6289876543210', 'body' => 'Ada permintaan teman']),
        'old_queued' => WhatsAppMessage::factory()->for($budi)->create(['event' => 'friend_request', 'phone' => '6289876543210', 'body' => 'Pesan lama', 'created_at' => now()->subDays(10)]),
    ];

    $this->actingAs($this->admin)->get('/admin/whatsapp/log?'.$query)->assertOk()->assertInertia(fn (Assert $page) => $page
        ->where('messages.data', fn ($data): bool => collect($data)->pluck('id')->sort()->values()->all()
            === collect($expected($rows))->map->id->sort()->values()->all()));
})->with([
    'status failed' => ['status=failed', fn (array $r): array => [$r['budi_failed']]],
    'status queued' => ['status=queued', fn (array $r): array => [$r['old_queued']]],
    'event' => ['event=welcome', fn (array $r): array => [$r['ana_sent']]],
    'date from' => ['date_from='.now()->subDay()->toDateString(), fn (array $r): array => [$r['ana_sent'], $r['budi_failed']]],
    'date to' => ['date_to='.now()->subDays(5)->toDateString(), fn (array $r): array => [$r['old_queued']]],
    'search recipient name' => ['search=budi', fn (array $r): array => [$r['budi_failed'], $r['old_queued']]],
    'search email' => ['search=ana@school', fn (array $r): array => [$r['ana_sent']]],
    'search body' => ['search=selamat datang', fn (array $r): array => [$r['ana_sent']]],
    'search local number' => ['search=0812-3456', fn (array $r): array => [$r['ana_sent']]],
    'search international number' => ['search=%2B6289876', fn (array $r): array => [$r['budi_failed'], $r['old_queued']]],
    'search error text' => ['search=not logged', fn (array $r): array => [$r['budi_failed']]],
    'combined' => ['status=failed&search=ana', fn (array $r): array => []],
]);

test('invalid filters are ignored instead of breaking the page', function (): void {
    WhatsAppMessage::factory()->count(2)->create();

    $this->actingAs($this->admin)->get('/admin/whatsapp/log?status=bogus&event=DROP%20TABLE&date_from=yesterday')
        ->assertOk()
        ->assertInertia(fn (Assert $page) => $page->has('messages.data', 2)->where('filters', []));
});

test('search treats like wildcards literally', function (): void {
    WhatsAppMessage::factory()->create(['body' => 'Diskon 100% hari ini']);
    WhatsAppMessage::factory()->create(['body' => 'Tidak ada diskon']);

    $this->actingAs($this->admin)->get('/admin/whatsapp/log?search=100%25')
        ->assertInertia(fn (Assert $page) => $page->has('messages.data', 1));
});

test('the detail endpoint returns the full entry for the modal', function (): void {
    $ana = User::factory()->create(['name' => 'Ana Lestari', 'email' => 'ana@school.test']);
    $message = WhatsAppMessage::factory()->for($ana)->sent()->create([
        'event' => 'friend_request',
        'phone' => '6281234567890',
        'body' => "Halo Ana\nBudi ingin berteman.",
        'provider_message_id' => 'wamid-123',
    ]);

    $this->actingAs($this->admin)->getJson("/admin/whatsapp/log/{$message->id}")->assertOk()->assertJson([
        'id' => $message->id,
        'event' => 'friend_request',
        'event_label' => 'Friend requests',
        'phone' => '62812****7890',
        'user' => ['id' => $ana->id, 'name' => 'Ana Lestari', 'email' => 'ana@school.test'],
        'body' => "Halo Ana\nBudi ingin berteman.",
        'status' => 'sent',
        'error' => null,
        'provider_message_id' => 'wamid-123',
    ])->assertJsonMissing(['phone' => '6281234567890']);
});

test('test messages and deleted recipients still show in the detail', function (): void {
    $message = WhatsAppMessage::factory()->create(['user_id' => null, 'event' => WhatsAppMessage::TEST_EVENT]);

    $this->actingAs($this->admin)->getJson("/admin/whatsapp/log/{$message->id}")->assertOk()
        ->assertJsonPath('user', null)
        ->assertJsonPath('event_label', 'Test message');
});

test('the detail of a missing message is a 404', function (): void {
    $this->actingAs($this->admin)->getJson('/admin/whatsapp/log/999999')->assertNotFound();
    $this->actingAs($this->admin)->get('/admin/whatsapp/log/abc')->assertNotFound();
});

test('a failed message can be sent again from the detail modal', function (): void {
    Queue::fake();
    $message = WhatsAppMessage::factory()->failed()->create();

    $this->actingAs($this->admin)->from('/admin/whatsapp/log')->post("/admin/whatsapp/messages/{$message->id}/retry")
        ->assertRedirect('/admin/whatsapp/log');

    expect($message->fresh()->status)->toBe(WhatsAppMessage::QUEUED)->and($message->fresh()->error)->toBeNull();
});

test('the settings page cards summarise the last 7 days with a daily series', function (): void {
    $this->travelTo(now()->setTime(12, 0));
    User::factory()->create(['whatsapp_number' => '6281000000001', 'whatsapp_notifications' => true]);
    User::factory()->create(['whatsapp_number' => '6281000000002', 'whatsapp_notifications' => false]);

    WhatsAppMessage::factory()->count(3)->sent()->create();
    WhatsAppMessage::factory()->sent()->create(['created_at' => now()->subDays(2)]);
    WhatsAppMessage::factory()->failed()->create(['created_at' => now()->subDay()]);
    WhatsAppMessage::factory()->count(2)->sent()->create(['created_at' => now()->subDays(9)]);
    WhatsAppMessage::factory()->count(2)->failed()->create(['created_at' => now()->subDays(8)]);
    $queued = WhatsAppMessage::factory()->create(['created_at' => now()->subHours(3)]);

    $this->actingAs($this->admin)->get('/admin/whatsapp')->assertOk()->assertInertia(fn (Assert $page) => $page
        ->component('admin/whatsapp')
        ->where('stats.recipients', 1)
        ->where('stats.opted_out', 1)
        ->where('stats.sent', 4)
        ->where('stats.failed', 1)
        ->where('stats.queued', 1)
        ->where('stats.oldest_queued_at', $queued->created_at->toIso8601String())
        ->where('stats.sent_delta', 100)
        ->where('stats.failed_delta', -50)
        ->where('stats.success_rate', 80)
        ->has('stats.daily', 7)
        ->where('stats.daily.6.date', now()->toDateString())
        ->where('stats.daily.6.sent', 3)
        ->where('stats.daily.5.failed', 1)
        ->where('stats.daily.4.sent', 1)
        ->has('messages', 5));
});

test('the settings page cards stay empty without any traffic', function (): void {
    $this->actingAs($this->admin)->get('/admin/whatsapp')->assertOk()->assertInertia(fn (Assert $page) => $page
        ->where('stats.sent', 0)
        ->where('stats.failed', 0)
        ->where('stats.queued', 0)
        ->where('stats.oldest_queued_at', null)
        ->where('stats.sent_delta', null)
        ->where('stats.failed_delta', null)
        ->where('stats.success_rate', null)
        ->has('messages', 0));
});

test('id-admin translates every new WhatsApp admin label', function (): void {
    $catalog = json_decode(file_get_contents(resource_path('js/locales/id-admin.json')), true, flags: JSON_THROW_ON_ERROR);

    foreach (['WhatsApp Log', 'Recipient', 'Message details', 'View full log', 'Delivery rate · 7 days', 'Test message', 'Sent · 7 days', 'Failed · 7 days'] as $label) {
        expect($catalog)->toHaveKey($label);
    }
});
