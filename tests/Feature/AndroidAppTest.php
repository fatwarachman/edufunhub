<?php

use App\Models\User;

beforeEach(function (): void {
    config()->set('android.package_name', 'com.edufunhub.app');
});

it('publishes the digital asset links statement for the play store app', function (): void {
    config()->set('android.sha256_cert_fingerprints', ['AA:BB:CC', 'DD:EE:FF']);

    $this->getJson('/.well-known/assetlinks.json')
        ->assertOk()
        ->assertHeader('Content-Type', 'application/json')
        ->assertExactJson([
            [
                'relation' => [
                    'delegate_permission/common.handle_all_urls',
                    'delegate_permission/common.get_login_creds',
                ],
                'target' => [
                    'namespace' => 'android_app',
                    'package_name' => 'com.edufunhub.app',
                    'sha256_cert_fingerprints' => ['AA:BB:CC', 'DD:EE:FF'],
                ],
            ],
        ]);
});

it('returns an empty statement list when no signing key is configured', function (): void {
    config()->set('android.sha256_cert_fingerprints', []);

    $this->getJson('/.well-known/assetlinks.json')
        ->assertOk()
        ->assertExactJson([]);
});

it('is reachable by guests and signed in players alike', function (): void {
    config()->set('android.sha256_cert_fingerprints', ['AA:BB:CC']);

    $this->get('/.well-known/assetlinks.json')->assertOk();
    $this->actingAs(User::factory()->create())
        ->get('/.well-known/assetlinks.json')
        ->assertOk()
        ->assertJsonPath('0.target.package_name', 'com.edufunhub.app');
});

it('keeps the web manifest ready for the trusted web activity', function (): void {
    $manifest = json_decode((string) file_get_contents(public_path('manifest.webmanifest')), true, flags: JSON_THROW_ON_ERROR);

    expect($manifest['scope'])->toBe('/')
        ->and($manifest['display'])->toBe('standalone')
        ->and($manifest['display_override'])->toContain('standalone')
        ->and($manifest['related_applications'][0])->toMatchArray([
            'platform' => 'play',
            'id' => 'com.edufunhub.app',
        ]);
});

it('parses comma separated fingerprints from the environment', function (): void {
    $original = $_ENV['ANDROID_SHA256_CERT_FINGERPRINTS'] ?? null;
    $_ENV['ANDROID_SHA256_CERT_FINGERPRINTS'] = ' aa:bb , ,cc:dd';
    $_SERVER['ANDROID_SHA256_CERT_FINGERPRINTS'] = ' aa:bb , ,cc:dd';

    try {
        $config = require config_path('android.php');
    } finally {
        if ($original === null) {
            unset($_ENV['ANDROID_SHA256_CERT_FINGERPRINTS'], $_SERVER['ANDROID_SHA256_CERT_FINGERPRINTS']);
        } else {
            $_ENV['ANDROID_SHA256_CERT_FINGERPRINTS'] = $_SERVER['ANDROID_SHA256_CERT_FINGERPRINTS'] = $original;
        }
    }

    expect($config['sha256_cert_fingerprints'])->toBe(['AA:BB', 'CC:DD']);
});
