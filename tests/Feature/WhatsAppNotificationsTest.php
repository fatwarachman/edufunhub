<?php

use App\Jobs\GenerateAbilityAssessment;
use App\Jobs\SendWhatsAppMessage;
use App\Models\Friendship;
use App\Models\Setting;
use App\Models\Subject;
use App\Models\User;
use App\Models\UserAbilityAssessment;
use App\Models\WhatsAppMessage;
use App\Services\AbilityComparison;
use App\Services\Ai\AbilityAnalyzer;
use App\Services\WhatsApp\AbilityReportMessage;
use App\Services\WhatsApp\GowaClient;
use App\Services\WhatsApp\PhoneNumber;
use App\Services\WhatsApp\WhatsAppNotifier;
use App\Services\WhatsApp\WhatsAppSettings;
use Illuminate\Http\Client\ConnectionException;
use Illuminate\Http\Client\Request;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Queue;
use Illuminate\Support\Str;
use Inertia\Testing\AssertableInertia as Assert;

const WA_CHAT_SECRET = 'whatsapp-test-chat-secret-with-32-chars!';

beforeEach(function (): void {
    config([
        'scout.driver' => 'null',
        'whatsapp.base_url' => 'http://gowa.test',
        'whatsapp.username' => 'efh',
        'whatsapp.password' => 'secret',
        'whatsapp.device_id' => 'edufunhub',
        'chat-service.secret' => WA_CHAT_SECRET,
        'chat-service.publish_url' => 'http://chat.test/internal/publish',
    ]);
    Http::preventStrayRequests();
    Http::fake(fn (Request $request): mixed => waStub($request));
    $this->withoutVite();
});

/**
 * Fake the chat service and GOWA. Stubs passed by a test take precedence over
 * the defaults (connected device, successful send).
 *
 * @param  array<string, mixed>  $stubs
 */
function waFake(array $stubs = []): void
{
    app()->instance('wa.stubs', $stubs);
}

function waStub(Request $request): mixed
{
    $url = preg_replace('#^https?://#', '', $request->url());
    $stubs = (app()->bound('wa.stubs') ? app('wa.stubs') : []) + [
        'chat.test/*' => Http::response(['delivered' => 1]),
        'gowa.test/devices' => Http::response(['code' => 'SUCCESS', 'results' => [['id' => 'edufunhub', 'state' => 'connected']]]),
        'gowa.test/send/message' => Http::response(['code' => 'SUCCESS', 'results' => ['message_id' => 'MSG-1', 'status' => 'ok']]),
    ];

    foreach ($stubs as $pattern => $response) {
        if (Str::is($pattern, $url)) {
            return is_callable($response) ? $response($request) : $response;
        }
    }

    return null;
}

function waEnable(array $events = []): void
{
    app(WhatsAppSettings::class)->save(true, [...['welcome' => true, 'ability_analysis' => true, 'friend_request' => true], ...$events]);
}

function waPlayer(string $name = 'Ana', ?string $number = '6281234567890', array $attributes = []): User
{
    $user = User::factory()->create(['name' => $name, 'locale' => 'id', 'whatsapp_number' => $number, ...$attributes]);
    $user->playerProfile()->create(['grade' => 5, 'nickname' => $name, 'birth_date' => '2015-03-01', 'school_name' => 'SD Ceria']);

    return $user->fresh();
}

describe('phone numbers', function (): void {
    it('normalizes Indonesian input to international digits', function (string $input, ?string $expected): void {
        expect(PhoneNumber::normalize($input))->toBe($expected);
    })->with([
        'local 08' => ['0812-3456-7890', '6281234567890'],
        'plus 62' => ['+62 812 3456 7890', '6281234567890'],
        'bare 8' => ['81234567890', '6281234567890'],
        'double zero' => ['006281234567890', '6281234567890'],
        'empty' => ['  ', null],
    ]);

    it('masks numbers for the admin log', function (): void {
        expect(PhoneNumber::mask('6281234567890'))->toBe('62812****7890');
    });
});

describe('player details form', function (): void {
    it('saves the WhatsApp number with the school details and greets once', function (): void {
        waEnable();
        $user = User::factory()->create(['locale' => 'id']);

        $payload = ['birth_date' => now()->subYears(10)->toDateString(), 'school_name' => 'SDN 1 Bogor', 'whatsapp_number' => '0812 3456 7890', 'whatsapp_notifications' => true];
        $this->actingAs($user)->patch(route('player-details.update'), $payload)->assertSessionHasNoErrors();
        $this->actingAs($user)->patch(route('player-details.update'), $payload)->assertSessionHasNoErrors();

        $user->refresh();
        $welcome = WhatsAppMessage::query()->sole();
        expect($user->whatsapp_number)->toBe('6281234567890')
            ->and($user->whatsapp_welcomed_at)->not->toBeNull()
            ->and($welcome->event)->toBe('welcome')
            ->and($welcome->status)->toBe(WhatsAppMessage::SENT)
            ->and($welcome->body)->toContain('Selamat datang');

        Http::assertSent(fn (Request $request): bool => $request->url() === 'http://gowa.test/send/message'
            && $request['phone'] === '6281234567890@s.whatsapp.net'
            && $request->hasHeader('X-Device-Id', 'edufunhub')
            && $request->hasHeader('Authorization', 'Basic '.base64_encode('efh:secret')));
    });

    it('keeps the number optional and leaves it untouched when the field is absent', function (): void {
        $user = waPlayer('Budi');

        $this->actingAs($user)->patch(route('player-details.update'), ['birth_date' => '2015-03-01', 'school_name' => 'SD Ceria'])->assertSessionHasNoErrors();
        expect($user->fresh()->whatsapp_number)->toBe('6281234567890');

        $this->actingAs($user)->patch(route('player-details.update'), ['birth_date' => '2015-03-01', 'school_name' => 'SD Ceria', 'whatsapp_number' => ''])->assertSessionHasNoErrors();
        expect($user->fresh()->whatsapp_number)->toBeNull()
            ->and(WhatsAppMessage::query()->count())->toBe(0);
    });

    it('rejects invalid numbers', function (string $number): void {
        $user = User::factory()->create();

        $this->actingAs($user)
            ->patch(route('player-details.update'), ['birth_date' => '2015-03-01', 'school_name' => 'SD Ceria', 'whatsapp_number' => $number])
            ->assertSessionHasErrors('whatsapp_number');
    })->with(['too short' => ['0812'], 'too long' => ['0812345678901234567'], 'letters only' => ['abc']]);

    it('does not greet players who opt out', function (): void {
        waEnable();
        $user = User::factory()->create();

        $this->actingAs($user)->patch(route('player-details.update'), [
            'birth_date' => '2015-03-01', 'school_name' => 'SD Ceria', 'whatsapp_number' => '081234567890', 'whatsapp_notifications' => false,
        ])->assertSessionHasNoErrors();

        expect($user->fresh()->whatsapp_notifications)->toBeFalse()
            ->and(WhatsAppMessage::query()->count())->toBe(0);
    });

    it('shows the saved number on the profile and dashboard', function (): void {
        $user = waPlayer();

        $this->actingAs($user)->get('/profile')->assertInertia(fn (Assert $page) => $page
            ->where('player.whatsapp_number', '6281234567890')
            ->where('player.whatsapp_notifications', true));
        $this->actingAs($user)->get('/dashboard')->assertInertia(fn (Assert $page) => $page
            ->where('playerDetails.whatsapp_number', '6281234567890'));
    });
});

describe('notifier', function (): void {
    it('sends nothing while the master switch or the event switch is off, but logs why', function (): void {
        Queue::fake();
        $user = waPlayer();
        $notifier = app(WhatsAppNotifier::class);

        expect($notifier->notify($user, 'friend_request', ['from' => 'Budi', 'link' => 'x']))->toBeNull();

        waEnable(['friend_request' => false]);
        expect($notifier->notify($user, 'friend_request', ['from' => 'Budi', 'link' => 'x']))->toBeNull()
            ->and($notifier->notify($user, 'unknown_event'))->toBeNull()
            ->and(WhatsAppMessage::query()->pluck('error', 'status')->keys()->all())->toBe([WhatsAppMessage::SKIPPED])
            ->and(WhatsAppMessage::query()->orderBy('id')->pluck('error')->all())->toBe([
                __('whatsapp.skipped.master_off'),
                __('whatsapp.skipped.event_off'),
            ]);

        Queue::assertNothingPushed();
        Http::assertNotSent(fn (Request $request): bool => str_contains($request->url(), '/send/'));
    });

    it('renders the template in the player language', function (): void {
        waEnable();
        $user = waPlayer('Cici', attributes: ['locale' => 'en']);

        $message = app(WhatsAppNotifier::class)->notify($user, 'friend_request', ['from' => 'Dodi', 'link' => 'https://x.test/friends']);

        expect($message->body)->toContain('*Dodi* wants to be your friend')->toContain('https://x.test/friends');
    });

    it('caps automatic messages per player per hour', function (): void {
        waEnable();
        config(['whatsapp.per_user_hourly' => 2]);
        $user = waPlayer();
        $notifier = app(WhatsAppNotifier::class);

        foreach (range(1, 3) as $i) {
            $notifier->notify($user, 'friend_request', ['from' => "P{$i}", 'link' => 'x']);
        }

        expect(WhatsAppMessage::query()->count())->toBe(2);
    });

    it('marks the message failed with a readable reason when the sender is not linked', function (): void {
        waEnable();
        waFake(['gowa.test/send/message' => Http::response(['code' => 'AUTHENTICATION_ERROR', 'message' => 'you are not logged in'], 401)]);

        $message = app(WhatsAppNotifier::class)->notify(waPlayer(), 'friend_request', ['from' => 'Budi', 'link' => 'x']);

        expect($message->fresh()->status)->toBe(WhatsAppMessage::FAILED)
            ->and($message->fresh()->error)->toBe(__('whatsapp.errors.not_logged_in'));
    });
});

it('tells a wrong container password apart from an unlinked number', function (): void {
    waFake(['gowa.test/send/message' => Http::response('Unauthorized', 401)]);

    expect(fn () => app(GowaClient::class)->sendText('6281234567890', 'x'))->toThrow(RuntimeException::class, __('whatsapp.errors.unauthorized'));
});

describe('events', function (): void {
    it('WhatsApps the addressee of a friend request', function (): void {
        waEnable();
        [$ana, $budi] = [waPlayer('Ana', null), waPlayer('Budi', '6289876543210')];

        $this->actingAs($ana)->post('/friends', ['user_id' => $budi->id])->assertSessionHasNoErrors();

        $message = WhatsAppMessage::query()->sole();
        expect(Friendship::query()->count())->toBe(1)
            ->and($message->user_id)->toBe($budi->id)
            ->and($message->event)->toBe('friend_request')
            ->and($message->body)->toContain('*Ana* ingin berteman')->toContain('/friends?tab=requests');
    });

    it('sends the full ability analysis to the player WhatsApp as soon as it finishes', function (): void {
        waEnable();
        Subject::query()->updateOrCreate(['key' => 'math'], ['name_id' => 'Matematika', 'name_en' => 'Math']);
        $user = waPlayer();
        $assessment = UserAbilityAssessment::factory()->create(['user_id' => $user->id, 'status' => UserAbilityAssessment::PENDING]);
        $result = [
            'summary' => 'Kemampuan matematika berkembang pesat.',
            'strengths' => ['Berhitung cepat.', 'Teliti'],
            'weaknesses' => ['Membaca soal cerita'],
            'subject_scores' => ['math' => 85],
            'game_insights' => ['internal note'],
            'recommendations' => ['Latihan membaca 10 menit', 'Ulangi soal yang salah'],
            'learning_style' => 'Visual dan suka tantangan.',
            'progress_vs_previous' => '',
            'confidence' => 'sedang',
        ];

        $analyzer = Mockery::mock(AbilityAnalyzer::class);
        $analyzer->shouldReceive('analyze')->once()->andReturn($result);
        (new GenerateAbilityAssessment($assessment))->handle($analyzer, app(AbilityComparison::class));

        $message = WhatsAppMessage::query()->sole();
        expect($assessment->fresh()->status)->toBe(UserAbilityAssessment::DONE)
            ->and($message->event)->toBe('ability_analysis')
            ->and($message->status)->toBe(WhatsAppMessage::SENT)
            ->and($message->body)
            ->toContain('Halo Ana! Hasil analisa kemampuan belajarmu sudah keluar.')
            ->toContain("📝 *Ringkasan*\nKemampuan matematika berkembang pesat.")
            ->toContain('🟢 Matematika: *85*')
            ->toContain("💪 *Kekuatan*\n✅ Berhitung cepat\n✅ Teliti")
            ->toContain('📌 Membaca soal cerita')
            ->toContain("1. Latihan membaca 10 menit\n2. Ulangi soal yang salah")
            ->toContain("🧠 *Gaya belajar*\nVisual dan suka tantangan.")
            ->toContain('/a/'.$assessment->fresh()->share_code)
            ->not->toContain('internal note')
            ->not->toContain('Perkembangan');

        Http::assertSent(fn (Request $request): bool => $request->url() === 'http://gowa.test/send/message'
            && str_contains($request['message'], 'Matematika: *85*'));
    });

    it('writes the analysis message in English for English players and keeps it short', function (): void {
        waEnable();
        $user = waPlayer('Cici', attributes: ['locale' => 'en']);
        $assessment = UserAbilityAssessment::factory()->create([
            'user_id' => $user->id,
            'status' => UserAbilityAssessment::DONE,
            'result' => ['summary' => str_repeat('Long summary. ', 600), 'strengths' => [], 'weaknesses' => [], 'subject_scores' => [], 'recommendations' => [], 'learning_style' => '', 'progress_vs_previous' => ''],
        ]);

        $body = app(AbilityReportMessage::class)->build($user, $assessment);

        expect($body)->toContain('Hi Cici! Your learning ability analysis is ready.')
            ->toContain('🔗 See the full analysis: ')
            ->and(mb_strlen($body))->toBeLessThanOrEqual(AbilityReportMessage::MAX_LENGTH + 1);
    });

    it('does not send the analysis when the player has no number or opted out', function (array $attributes): void {
        waEnable();
        $user = waPlayer(attributes: $attributes);
        $assessment = UserAbilityAssessment::factory()->create(['user_id' => $user->id, 'status' => UserAbilityAssessment::PENDING]);

        $analyzer = Mockery::mock(AbilityAnalyzer::class);
        $analyzer->shouldReceive('analyze')->once()->andReturn(['summary' => 'Ringkasan cukup panjang.', 'strengths' => [], 'weaknesses' => [], 'subject_scores' => [], 'game_insights' => [], 'recommendations' => [], 'learning_style' => '', 'progress_vs_previous' => '', 'confidence' => 'sedang']);
        (new GenerateAbilityAssessment($assessment))->handle($analyzer, app(AbilityComparison::class));

        expect($assessment->fresh()->status)->toBe(UserAbilityAssessment::DONE)
            ->and(WhatsAppMessage::query()->count())->toBe(0);
    })->with([
        'no number' => [['whatsapp_number' => null]],
        'opted out' => [['whatsapp_notifications' => false]],
    ]);

    it('does not WhatsApp a failed analysis', function (): void {
        waEnable();
        $user = waPlayer();
        $assessment = UserAbilityAssessment::factory()->create(['user_id' => $user->id, 'status' => UserAbilityAssessment::PENDING]);

        $analyzer = Mockery::mock(AbilityAnalyzer::class);
        $analyzer->shouldReceive('analyze')->once()->andThrow(new RuntimeException('boom'));
        (new GenerateAbilityAssessment($assessment))->handle($analyzer, app(AbilityComparison::class));

        expect(WhatsAppMessage::query()->count())->toBe(0);
    });
});

describe('admin page', function (): void {
    beforeEach(function (): void {
        $this->admin = User::factory()->superadmin()->create();
    });

    it('is only for super admins', function (): void {
        $this->get('/admin/whatsapp')->assertRedirect('/login');
        $this->actingAs(User::factory()->create())->get('/admin/whatsapp')->assertForbidden();
    });

    it('shows the connection, switches and masked log', function (): void {
        waFake(['gowa.test/app/status' => Http::response(['code' => 'SUCCESS', 'results' => ['is_connected' => true, 'is_logged_in' => true, 'jid' => '6281111222333:12@s.whatsapp.net']])]);
        WhatsAppMessage::factory()->sent()->create(['phone' => '6281234567890']);

        $this->actingAs($this->admin)->get('/admin/whatsapp')->assertOk()->assertInertia(fn (Assert $page) => $page
            ->component('admin/whatsapp')
            ->where('connection.logged_in', true)
            ->where('connection.number', '6281111222333')
            ->where('settings.enabled', false)
            ->has('settings.events', 3)
            ->where('stats.sent', 1)
            ->where('messages.0.phone', '62812****7890'));
    });

    it('reports an unreachable container instead of crashing', function (): void {
        waFake(['gowa.test/*' => fn () => throw new ConnectionException('down')]);

        $this->actingAs($this->admin)->get('/admin/whatsapp')->assertOk()->assertInertia(fn (Assert $page) => $page
            ->where('connection.reachable', false)
            ->where('connection.error', __('whatsapp.errors.unreachable')));
    });

    it('creates the device slot and returns the QR as a data URI', function (): void {
        waFake([
            'gowa.test/devices' => Http::sequence()
                ->push(['code' => 'SUCCESS', 'results' => null])
                ->push(['code' => 'SUCCESS', 'results' => ['id' => 'edufunhub']]),
            'gowa.test/app/login' => Http::response(['code' => 'SUCCESS', 'results' => ['qr_duration' => 30, 'qr_link' => 'http://edufunhub-whatsapp:3000/statics/qrcode/scan-qr-1.png']]),
            'gowa.test/statics/qrcode/scan-qr-1.png' => Http::response('PNGDATA', 200, ['Content-Type' => 'image/png']),
        ]);

        $this->actingAs($this->admin)->postJson('/admin/whatsapp/qr')->assertOk()->assertExactJson([
            'qr' => 'data:image/png;base64,'.base64_encode('PNGDATA'),
            'duration' => 30,
        ]);

        Http::assertSent(fn (Request $request): bool => $request->method() === 'POST' && $request->url() === 'http://gowa.test/devices' && $request['device_id'] === 'edufunhub');
    });

    it('returns a pairing code and validates the phone', function (): void {
        waFake(['gowa.test/app/login-with-code*' => Http::response(['code' => 'SUCCESS', 'results' => ['pair_code' => 'ABCD-1234']])]);

        $this->actingAs($this->admin)->postJson('/admin/whatsapp/code', ['phone' => '0812 3456 7890'])->assertOk()->assertExactJson(['code' => 'ABCD-1234']);
        $this->actingAs($this->admin)->postJson('/admin/whatsapp/code', ['phone' => '12'])->assertUnprocessable()->assertJsonValidationErrors('phone');

        Http::assertSent(fn (Request $request): bool => str_contains($request->url(), 'phone=6281234567890'));
    });

    it('saves the switches and logs the change', function (): void {
        $this->actingAs($this->admin)->put('/admin/whatsapp', [
            'enabled' => true,
            'events' => ['welcome' => true, 'ability_analysis' => false, 'friend_request' => true],
        ])->assertSessionHasNoErrors()->assertRedirect();

        $settings = app(WhatsAppSettings::class);
        expect($settings->enabled())->toBeTrue()
            ->and($settings->eventEnabled('ability_analysis'))->toBeFalse()
            ->and($settings->eventEnabled('friend_request'))->toBeTrue()
            ->and(Setting::query()->where('group', 'whatsapp')->count())->toBe(2);
        $this->assertDatabaseHas('activity_log', ['description' => 'Updated WhatsApp notification settings']);
    });

    it('rejects incomplete switch payloads', function (): void {
        $this->actingAs($this->admin)->put('/admin/whatsapp', ['enabled' => 'maybe', 'events' => ['welcome' => true]])
            ->assertSessionHasErrors(['enabled', 'events.ability_analysis', 'events.friend_request']);
    });

    it('queues a test message and retries failed ones', function (): void {
        Queue::fake();

        $this->actingAs($this->admin)->post('/admin/whatsapp/test', ['phone' => '081234567890'])->assertSessionHasNoErrors();
        $failed = WhatsAppMessage::factory()->failed()->create();
        $sent = WhatsAppMessage::factory()->sent()->create();

        $this->actingAs($this->admin)->post("/admin/whatsapp/messages/{$failed->id}/retry")->assertSessionHasNoErrors();
        $this->actingAs($this->admin)->post("/admin/whatsapp/messages/{$sent->id}/retry")->assertNotFound();

        expect(WhatsAppMessage::query()->where('event', WhatsAppMessage::TEST_EVENT)->value('phone'))->toBe('6281234567890')
            ->and($failed->fresh()->status)->toBe(WhatsAppMessage::QUEUED);
        Queue::assertPushed(SendWhatsAppMessage::class, 2);
    });

    it('unlinks the sender number', function (): void {
        waFake(['gowa.test/app/logout' => Http::response(['code' => 'SUCCESS', 'results' => ['device_id' => 'edufunhub']])]);

        $this->actingAs($this->admin)->post('/admin/whatsapp/logout')->assertSessionHasNoErrors()->assertSessionHas('success', __('whatsapp.flash.logged_out'));
    });
});

it('ships every WhatsApp template in Indonesian and English', function (): void {
    foreach (['id', 'en'] as $locale) {
        $events = require lang_path("{$locale}/whatsapp.php");
        foreach (array_keys(config('whatsapp.events')) as $event) {
            expect($events['events'][$event] ?? '')->not->toBeEmpty();
        }
    }

    expect(array_keys(require lang_path('id/whatsapp.php')))->toBe(array_keys(require lang_path('en/whatsapp.php')));
    expect(app(GowaClient::class)->deviceId())->toBe('edufunhub');
});
