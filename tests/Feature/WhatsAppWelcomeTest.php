<?php

use App\Models\Role;
use App\Models\Setting;
use App\Models\User;
use App\Models\WhatsAppMessage;
use App\Services\WhatsApp\WhatsAppSettings;
use Illuminate\Support\Facades\Http;
use Inertia\Testing\AssertableInertia as Assert;

beforeEach(function (): void {
    config([
        'scout.driver' => 'null',
        'whatsapp.base_url' => 'http://gowa.test',
        'whatsapp.username' => 'efh',
        'whatsapp.password' => 'secret',
        'whatsapp.device_id' => 'edufunhub',
        'whatsapp.queue_connection' => 'sync',
    ]);
    Http::preventStrayRequests();
    Http::fake([
        'gowa.test/send/message' => Http::response(['code' => 'SUCCESS', 'results' => ['message_id' => 'wamid-1']]),
        'gowa.test/*' => Http::response(['code' => 'SUCCESS', 'results' => ['is_connected' => true, 'is_logged_in' => true, 'jid' => '6281111222333:1@s.whatsapp.net']]),
    ]);
    $this->withoutVite();
});

function welcomeSwitches(bool $enabled, bool $welcome = true): void
{
    app(WhatsAppSettings::class)->save($enabled, ['welcome' => $welcome, 'ability_analysis' => true, 'friend_request' => true]);
}

function wizardWelcomePayload(string $number = '081234567890'): array
{
    return [
        'name' => 'Rani Putri',
        'birth_date' => now()->subYears(10)->toDateString(),
        'grade' => 4,
        'school_name' => 'SDN 1 Bogor',
        'whatsapp_number' => $number,
        'whatsapp_notifications' => true,
    ];
}

function sentWhatsApps(): int
{
    return collect(Http::recorded())->filter(fn (array $pair): bool => str_ends_with($pair[0]->url(), '/send/message'))->count();
}

test('the wizard sends the welcome WhatsApp when notifications are on', function (): void {
    welcomeSwitches(true);
    $user = User::factory()->profilePending()->create(['locale' => 'id']);

    $this->actingAs($user)->post(route('profile-wizard.store'), wizardWelcomePayload())->assertSessionHasNoErrors();

    $message = WhatsAppMessage::query()->sole();
    expect($message->event)->toBe('welcome')
        ->and($message->status)->toBe(WhatsAppMessage::SENT)
        ->and($message->phone)->toBe('6281234567890')
        ->and($message->body)->toContain('Selamat datang')
        ->and($user->fresh()->whatsapp_welcomed_at)->not->toBeNull()
        ->and(sentWhatsApps())->toBe(1);
});

test('a wizard welcome blocked by a switch is logged as skipped and stays pending', function (bool $master, bool $welcome, string $reason): void {
    welcomeSwitches($master, $welcome);
    $user = User::factory()->profilePending()->create();

    $this->actingAs($user)->post(route('profile-wizard.store'), wizardWelcomePayload())->assertSessionHasNoErrors();

    $message = WhatsAppMessage::query()->sole();
    expect($message->status)->toBe(WhatsAppMessage::SKIPPED)
        ->and($message->error)->toBe(__($reason))
        ->and($user->fresh()->whatsapp_welcomed_at)->toBeNull()
        ->and(sentWhatsApps())->toBe(0);
})->with([
    'master off' => [false, true, 'whatsapp.skipped.master_off'],
    'welcome off' => [true, false, 'whatsapp.skipped.event_off'],
]);

test('players who opted out get no welcome and no skipped row', function (): void {
    welcomeSwitches(false);
    $user = User::factory()->profilePending()->create();

    $this->actingAs($user)->post(route('profile-wizard.store'), [...wizardWelcomePayload(), 'whatsapp_notifications' => false])->assertSessionHasNoErrors();

    expect(WhatsAppMessage::query()->count())->toBe(0);
});

test('skipped rows do not count against the hourly cap', function (): void {
    config(['whatsapp.per_user_hourly' => 1]);
    welcomeSwitches(false);
    $user = User::factory()->profilePending()->create();
    $this->actingAs($user)->post(route('profile-wizard.store'), wizardWelcomePayload())->assertSessionHasNoErrors();

    welcomeSwitches(true);
    $this->artisan('whatsapp:send-pending-welcome')->assertSuccessful();

    expect(WhatsAppMessage::query()->where('status', WhatsAppMessage::SENT)->count())->toBe(1);
});

test('the settings page warns while the master switch is off and counts skipped messages', function (): void {
    $admin = User::factory()->superadmin()->create();
    WhatsAppMessage::factory()->count(2)->create(['status' => WhatsAppMessage::SKIPPED, 'error' => 'x']);
    WhatsAppMessage::factory()->create(['status' => WhatsAppMessage::SKIPPED, 'created_at' => now()->subDays(10)]);

    $this->actingAs($admin)->get('/admin/whatsapp')->assertInertia(fn (Assert $page) => $page
        ->where('settings.enabled', false)
        ->where('stats.skipped', 2));

    $this->actingAs($admin)->get('/admin/whatsapp/log?status=skipped')->assertInertia(fn (Assert $page) => $page
        ->has('messages.data', 3)
        ->where('totals.skipped', 3));
});

describe('whatsapp:send-pending-welcome', function (): void {
    beforeEach(function (): void {
        $this->pending = User::factory()->create(['name' => 'Pending Player', 'whatsapp_number' => '6281200000001', 'locale' => 'id']);
        $this->greeted = User::factory()->create(['whatsapp_number' => '6281200000002', 'whatsapp_welcomed_at' => now()]);
        $this->optedOut = User::factory()->create(['whatsapp_number' => '6281200000003', 'whatsapp_notifications' => false]);
        $this->noNumber = User::factory()->create();
        $this->disabled = User::factory()->create(['whatsapp_number' => '6281200000004', 'disabled_at' => now()]);
        $this->superadmin = User::factory()->superadmin()->create(['whatsapp_number' => '6281200000005']);
        $this->teacher = User::factory()->create(['whatsapp_number' => '6281200000006']);
        $this->teacher->roles()->attach(Role::query()->firstOrCreate(['slug' => Role::TEACHER], ['name' => 'Guru', 'is_system' => true]));
    });

    it('refuses to run while the switches are off', function (): void {
        welcomeSwitches(false);

        $this->artisan('whatsapp:send-pending-welcome')->assertFailed();

        expect(WhatsAppMessage::query()->count())->toBe(0);
    });

    it('lists the pending players on a dry run without sending', function (): void {
        welcomeSwitches(false);

        $this->artisan('whatsapp:send-pending-welcome --dry-run')
            ->expectsOutputToContain('Pending Player')
            ->expectsOutputToContain('1 player(s) would be greeted')
            ->assertSuccessful();

        expect(WhatsAppMessage::query()->count())->toBe(0);
    });

    it('greets only players with a number who were never greeted, once', function (): void {
        welcomeSwitches(true);

        $this->artisan('whatsapp:send-pending-welcome')->expectsOutputToContain('queued for 1 of 1')->assertSuccessful();
        $this->artisan('whatsapp:send-pending-welcome')->expectsOutputToContain('No players are waiting')->assertSuccessful();

        $message = WhatsAppMessage::query()->sole();
        expect($message->user_id)->toBe($this->pending->id)
            ->and($message->status)->toBe(WhatsAppMessage::SENT)
            ->and($this->pending->fresh()->whatsapp_welcomed_at)->not->toBeNull()
            ->and(sentWhatsApps())->toBe(1);
    });

    it('respects the limit option', function (): void {
        welcomeSwitches(true);
        User::factory()->create(['whatsapp_number' => '6281200000007']);

        $this->artisan('whatsapp:send-pending-welcome --limit=1')->expectsOutputToContain('queued for 1 of 1')->assertSuccessful();

        expect(WhatsAppMessage::query()->count())->toBe(1);
    });
});

test('the master switch is stored when the admin saves the settings', function (): void {
    $admin = User::factory()->superadmin()->create();

    $this->actingAs($admin)->put('/admin/whatsapp', ['enabled' => true, 'events' => ['welcome' => true, 'ability_analysis' => true, 'friend_request' => true]])
        ->assertSessionHasNoErrors();

    expect(app(WhatsAppSettings::class)->enabled())->toBeTrue()
        ->and(Setting::get('whatsapp.enabled'))->not->toBeNull();
});
