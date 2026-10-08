<?php

use App\Models\GameAccess;
use App\Models\PlayerProfile;
use App\Models\User;
use App\Services\DeviceDetector;
use Inertia\Testing\AssertableInertia as Assert;

const ANDROID_PHONE = 'Mozilla/5.0 (Linux; Android 14; SM-A546E) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Mobile Safari/537.36';
const IPHONE = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1';
const WINDOWS_CHROME = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Safari/537.36';

beforeEach(function (): void {
    config(['scout.driver' => 'null']);
    $this->withoutVite();
});

function completePlayer(): User
{
    $user = User::factory()->create();
    PlayerProfile::factory()->for($user)->create(['grade' => 5, 'birth_date' => now()->subYears(10)->toDateString(), 'school_name' => 'SDN 1 Bogor']);

    return $user->fresh();
}

test('detector classifies device type, operating system and browser', function (string $ua, ?string $mobile, ?string $platform, array $expected): void {
    expect((new DeviceDetector)->detect($ua, $mobile, $platform))->toBe($expected);
})->with([
    'android phone' => [ANDROID_PHONE, null, null, ['device_type' => 'mobile', 'os' => 'Android', 'browser' => 'Chrome']],
    'iphone' => [IPHONE, null, null, ['device_type' => 'mobile', 'os' => 'iOS', 'browser' => 'Safari']],
    'ipad' => ['Mozilla/5.0 (iPad; CPU OS 17_5 like Mac OS X) AppleWebKit/605.1.15 Version/17.5 Mobile/15E148 Safari/604.1', null, null, ['device_type' => 'tablet', 'os' => 'iOS', 'browser' => 'Safari']],
    'android tablet' => ['Mozilla/5.0 (Linux; Android 13; SM-X200) AppleWebKit/537.36 Chrome/129.0 Safari/537.36', null, null, ['device_type' => 'tablet', 'os' => 'Android', 'browser' => 'Chrome']],
    'windows desktop' => [WINDOWS_CHROME, null, null, ['device_type' => 'desktop', 'os' => 'Windows', 'browser' => 'Chrome']],
    'mac edge' => ['Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/129.0 Safari/537.36 Edg/129.0', null, null, ['device_type' => 'desktop', 'os' => 'macOS', 'browser' => 'Edge']],
    'linux firefox' => ['Mozilla/5.0 (X11; Linux x86_64; rv:131.0) Gecko/20100101 Firefox/131.0', null, null, ['device_type' => 'desktop', 'os' => 'Linux', 'browser' => 'Firefox']],
    'chromebook' => ['Mozilla/5.0 (X11; CrOS x86_64 14541.0.0) AppleWebKit/537.36 Chrome/129.0 Safari/537.36', null, null, ['device_type' => 'desktop', 'os' => 'ChromeOS', 'browser' => 'Chrome']],
    'client hints win over reduced ua' => ['Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 Chrome/129.0 Mobile Safari/537.36', '?1', '"Android"', ['device_type' => 'mobile', 'os' => 'Android', 'browser' => 'Chrome']],
    'samsung internet' => ['Mozilla/5.0 (Linux; Android 14; SM-S918B) AppleWebKit/537.36 SamsungBrowser/25.0 Chrome/121.0 Mobile Safari/537.36', null, null, ['device_type' => 'mobile', 'os' => 'Android', 'browser' => 'Samsung Internet']],
]);

test('detector flags bots and empty user agents', function (): void {
    $detector = new DeviceDetector;

    expect($detector->isBot('Googlebot/2.1 (+http://www.google.com/bot.html)'))->toBeTrue()
        ->and($detector->isBot('curl/8.5.0'))->toBeTrue()
        ->and($detector->isBot(''))->toBeTrue()
        ->and($detector->isBot(IPHONE))->toBeFalse();
});

test('opening a game page stores the player device and operating system', function (): void {
    $user = completePlayer();

    $this->actingAs($user)->withHeaders(['User-Agent' => ANDROID_PHONE])->get('/games/sky-quiz')->assertOk();

    $access = GameAccess::query()->sole();
    expect($access->user_id)->toBe($user->id)
        ->and($access->game_key)->toBe('sky-quiz')
        ->and($access->device_type)->toBe('mobile')
        ->and($access->os)->toBe('Android')
        ->and($access->browser)->toBe('Chrome')
        ->and($access->user_agent)->toBe(ANDROID_PHONE);
});

test('reloads in one session count once and guests are never recorded', function (): void {
    $this->withHeaders(['User-Agent' => WINDOWS_CHROME])->get('/games/snakes-and-ladders')->assertRedirect(route('login'));
    expect(GameAccess::query()->count())->toBe(0);

    $user = completePlayer();
    $this->actingAs($user)->withHeaders(['User-Agent' => WINDOWS_CHROME])->get('/games/snakes-and-ladders')->assertOk();
    $this->actingAs($user)->withHeaders(['User-Agent' => WINDOWS_CHROME])->get('/games/snakes-and-ladders')->assertOk();

    expect(GameAccess::query()->count())->toBe(1)
        ->and(GameAccess::query()->first())->user_id->toBe($user->id)->device_type->toBe('desktop')->os->toBe('Windows');

    $this->travel(11)->minutes();
    $this->actingAs($user)->withHeaders(['User-Agent' => WINDOWS_CHROME])->get('/games/snakes-and-ladders')->assertOk();
    expect(GameAccess::query()->count())->toBe(2);
});

test('bots and blocked game requests are not recorded', function (): void {
    $this->actingAs(completePlayer())->withHeaders(['User-Agent' => 'Googlebot/2.1'])->get('/games/sky-quiz')->assertOk();
    $incomplete = User::factory()->create();
    $this->actingAs($incomplete)->withHeaders(['User-Agent' => IPHONE])->get('/games/flag-quest')->assertRedirect();

    expect(GameAccess::query()->count())->toBe(0);
});

test('admin dashboard shows device type, operating system and per game split', function (): void {
    $superadmin = User::factory()->create(['is_superadmin' => true]);
    $alice = User::factory()->create();
    $bob = User::factory()->create();
    GameAccess::factory()->for($alice)->mobile('Android')->count(3)->create();
    GameAccess::factory()->for($bob)->mobile('iOS')->create(['game_key' => 'flag-quest']);
    GameAccess::factory()->for($bob)->create();
    GameAccess::factory()->create(['user_id' => null, 'device_type' => 'tablet', 'os' => 'iOS', 'browser' => 'Safari']);
    GameAccess::factory()->for($alice)->create(['accessed_at' => now()->subDays(45)]);

    $this->actingAs($superadmin)->get('/admin/dashboard')
        ->assertOk()
        ->assertInertia(fn (Assert $page) => $page
            ->component('admin/dashboard')
            ->where('devices.total', 6)
            ->where('devices.users', 2)
            ->where('devices.guests', 1)
            ->where('devices.types.0', ['key' => 'mobile', 'accesses' => 4, 'users' => 2])
            ->where('devices.types.1', ['key' => 'tablet', 'accesses' => 1, 'users' => 0])
            ->where('devices.types.2', ['key' => 'desktop', 'accesses' => 1, 'users' => 1])
            ->where('devices.os.0.name', 'Android')
            ->where('devices.os.0.accesses', 3)
            ->where('devices.os.1', ['name' => 'iOS', 'accesses' => 2, 'users' => 1, 'mobile' => 1, 'tablet' => 1, 'desktop' => 0])
            ->where('devices.games.0', ['game' => 'sky-quiz', 'mobile' => 3, 'tablet' => 1, 'desktop' => 1])
            ->where('devices.games.1', ['game' => 'flag-quest', 'mobile' => 1, 'tablet' => 0, 'desktop' => 0])
        );
});
