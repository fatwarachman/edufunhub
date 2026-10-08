<?php

use App\Models\User;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Route;
use Inertia\Testing\AssertableInertia as Assert;

test('registration screen offers only Google sign-up', function (bool $enabled) {
    config([
        'services.google.client_id' => $enabled ? 'client' : '',
        'services.google.client_secret' => $enabled ? 'secret' : '',
        'services.google.redirect' => $enabled ? 'http://localhost/auth/google/callback' : '',
    ]);

    $this->get(route('register'))->assertOk()->assertInertia(fn (Assert $page) => $page
        ->component('auth/register')
        ->where('googleEnabled', $enabled)
        ->where('googleRedirectUrl', $enabled ? route('google.redirect') : null));
})->with([true, false]);

test('manual email and password sign-up is closed', function () {
    expect(Route::has('register.store'))->toBeFalse();

    $this->post('/register', [
        'name' => 'Test User',
        'email' => 'test@example.com',
        'birth_date' => now()->subYears(10)->toDateString(),
        'school_name' => 'SDN 1 Bogor',
        'password' => 'password',
        'password_confirmation' => 'password',
    ])->assertStatus(405);

    $this->assertGuest();
    expect(User::query()->where('email', 'test@example.com')->exists())->toBeFalse();
});

test('the users table defaults to Indonesian', function () {
    $id = DB::table('users')->insertGetId([
        'name' => 'Raw', 'email' => 'raw@example.com', 'password' => 'x', 'created_at' => now(), 'updated_at' => now(),
    ]);

    expect(DB::table('users')->where('id', $id)->value('locale'))->toBe('id');
});

test('register google info box uses readable ink on a light tint', function () {
    $source = file_get_contents(resource_path('js/pages/auth/register.tsx'));

    expect($source)->toContain('data-testid="register-google-why"')
        ->toContain('bg-[#e8f8ee]')
        ->toContain('text-[#151b2e]')
        ->not->toContain('bg-muted/40 p-3 text-xs text-muted-foreground');
});
