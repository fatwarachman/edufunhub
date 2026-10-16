<?php

use App\Models\User;
use App\Services\AndroidApk;
use Inertia\Testing\AssertableInertia as Assert;

beforeEach(function (): void {
    $this->apkDir = sys_get_temp_dir().'/edufunhub-apk-'.uniqid();
    mkdir($this->apkDir);
    $this->apkPath = $this->apkDir.'/edufunhub.apk';
    config()->set('android.apk_path', $this->apkPath);
});

afterEach(function (): void {
    @unlink($this->apkPath);
    @rmdir($this->apkDir);
});

it('downloads the published apk with the android mime type', function (): void {
    file_put_contents($this->apkPath, 'PK-fake-apk');

    $response = $this->get('/download/edufunhub.apk');

    $response->assertOk()
        ->assertHeader('Content-Type', 'application/vnd.android.package-archive')
        ->assertHeader('X-Content-Type-Options', 'nosniff')
        ->assertDownload('edufunhub.apk');
    expect($response->baseResponse->getFile()->getPathname())->toBe($this->apkPath);
});

it('returns not found when no apk is published', function (): void {
    $this->get('/download/edufunhub.apk')->assertNotFound();
});

it('ignores path tricks in the query string', function (): void {
    file_put_contents($this->apkPath, 'PK-fake-apk');

    $response = $this->get('/download/edufunhub.apk?file=../../.env&v=../x');

    $response->assertOk();
    expect($response->baseResponse->getFile()->getPathname())->toBe($this->apkPath);
});

it('describes the apk with a versioned url that changes with the file', function (): void {
    file_put_contents($this->apkPath, 'build-one');
    $first = app(AndroidApk::class)->present();

    file_put_contents($this->apkPath, 'build-two-longer');
    touch($this->apkPath, time() + 5);
    clearstatcache();
    $second = app(AndroidApk::class)->present();

    expect($first['size'])->toBe(9)
        ->and($first['url'])->toContain('/download/edufunhub.apk?v=')
        ->and($second['hash'])->not->toBe($first['hash']);
});

it('shares the apk on the player dashboard', function (): void {
    file_put_contents($this->apkPath, 'PK-fake-apk');
    $user = User::factory()->create();

    $this->actingAs($user)->get('/dashboard')
        ->assertInertia(fn (Assert $page) => $page
            ->where('androidApk.size', 11)
            ->where('androidApk.url', fn (string $url): bool => str_contains($url, '/download/edufunhub.apk?v=')));
});

it('shares null on the dashboard when no apk is published', function (): void {
    $user = User::factory()->create();

    $this->actingAs($user)->get('/dashboard')
        ->assertInertia(fn (Assert $page) => $page->where('androidApk', null));
});

it('serves the latest apk from the stable /download/apk url', function (): void {
    file_put_contents($this->apkPath, 'PK-fake-apk');

    $this->get('/download/apk')
        ->assertOk()
        ->assertHeader('Content-Type', 'application/vnd.android.package-archive')
        ->assertDownload('edufunhub.apk');
});

it('describes the latest apk as public json for the landing page', function (): void {
    file_put_contents($this->apkPath, 'PK-fake-apk');
    config()->set('android.apk_version', '1.2.3');

    $this->getJson('/download/apk.json')
        ->assertOk()
        ->assertJsonPath('version', '1.2.3')
        ->assertJsonPath('size', 11)
        ->assertJsonPath('sha256', hash('sha256', 'PK-fake-apk'))
        ->assertJsonPath('url', fn (string $url): bool => str_contains($url, '/download/edufunhub.apk?v='.substr(hash('sha256', 'PK-fake-apk'), 0, 12)));
});

it('returns not found for apk json when no apk is published', function (): void {
    $this->getJson('/download/apk.json')->assertNotFound();
    $this->get('/download/apk')->assertNotFound();
});

it('links the apk download section on the landing page', function (): void {
    $html = (string) file_get_contents(public_path('new-landing/index.html'));

    expect($html)->toContain('id="download-apk"')
        ->and($html)->toContain('href="/download/apk"')
        ->and($html)->toContain('/download/apk.json');
});
