<?php

use App\Http\Controllers\Auth\LoginController;
use App\Models\ConnectedAccount;
use App\Models\User;
use Illuminate\Database\UniqueConstraintViolationException;
use Illuminate\Http\Request;
use Inertia\Testing\AssertableInertia as Assert;
use Laravel\Fortify\Contracts\LoginViewResponse;
use Laravel\Socialite\Facades\Socialite;
use Laravel\Socialite\Two\GoogleProvider;
use Laravel\Socialite\Two\InvalidStateException;
use Laravel\Socialite\Two\User as GoogleUser;

beforeEach(function () {
    config([
        'services.google.client_id' => 'test-client',
        'services.google.client_secret' => 'test-secret',
        'services.google.redirect' => '/auth/google/callback',
        'scout.driver' => 'null',
    ]);
    $this->withoutVite();
});

function googleIdentity(array $attributes = [], array $raw = ['email_verified' => true]): GoogleUser
{
    return (new GoogleUser)->setRaw($raw)->map(array_merge([
        'id' => 'google-123',
        'email' => 'player@example.com',
        'name' => 'Player',
    ], $attributes))->setToken('do-not-store')->setRefreshToken('do-not-store-refresh');
}

function mockGoogleIdentity(GoogleUser $identity): void
{
    $provider = Mockery::mock(GoogleProvider::class);
    $provider->shouldReceive('user')->once()->andReturn($identity);
    Socialite::shouldReceive('driver')->with('google')->once()->andReturn($provider);
}

function googleCallbackUrl(): string
{
    return route('google.callback', ['code' => 'test-code', 'state' => 'test-state']);
}

test('google redirect generates state using real stateful provider', function () {
    $response = $this->get(route('google.redirect'));
    $response->assertRedirect();
    parse_str(parse_url($response->headers->get('Location'), PHP_URL_QUERY), $query);
    expect(parse_url($response->headers->get('Location'), PHP_URL_HOST))->toBe('accounts.google.com');
    expect($query['state'])->toBe(session('state'))->not->toBeEmpty();
    expect($query['redirect_uri'])->toBe(url('/auth/google/callback'));
});

test('missing configuration returns friendly error', function (string $field, string $route) {
    config(["services.google.{$field}" => null]);
    Socialite::shouldReceive('driver')->never();
    $this->get(route($route))->assertRedirect(route('login'))->assertSessionHasErrors('google');
    $this->assertGuest();
})->with(['client_id', 'client_secret', 'redirect'])->with(['google.redirect', 'google.callback']);

test('callback rejects missing mismatched or cancelled state without contacting google', function (array $query, array $session) {
    Socialite::shouldReceive('driver')->never();
    $this->withSession($session)->get(route('google.callback', $query))
        ->assertRedirect(route('login'))->assertSessionHasErrors('google')->assertSessionMissing('state');
    $this->assertGuest();
    $this->assertDatabaseCount('users', 0);
})->with([
    'missing state' => [['code' => 'code'], ['state' => 'test-state']],
    'missing session' => [['code' => 'code', 'state' => 'test-state'], []],
    'mismatch' => [['code' => 'code', 'state' => 'other'], ['state' => 'test-state']],
    'denied' => [['error' => 'access_denied', 'state' => 'test-state'], ['state' => 'test-state']],
    'missing code' => [['state' => 'test-state'], ['state' => 'test-state']],
    'array state' => [['code' => 'code', 'state' => ['test-state']], ['state' => 'test-state']],
]);

test('provider errors fail closed without exposing details', function (Throwable $error) {
    $provider = Mockery::mock(GoogleProvider::class);
    $provider->shouldReceive('user')->once()->andThrow($error);
    Socialite::shouldReceive('driver')->with('google')->once()->andReturn($provider);
    $this->withSession(['state' => 'test-state'])->get(googleCallbackUrl())
        ->assertRedirect(route('login'))->assertSessionHasErrors('google')->assertSessionMissing('state');
    $this->assertGuest();
    expect(session('errors')->first('google'))->not->toContain('private-provider-detail');
})->with([new InvalidStateException, new RuntimeException('private-provider-detail')]);

test('google requires valid provider id and verified email', function (array $attributes, array $raw) {
    mockGoogleIdentity(googleIdentity($attributes, $raw));
    $this->withSession(['state' => 'test-state'])->get(googleCallbackUrl())
        ->assertRedirect(route('login'))->assertSessionHasErrors('google');
    $this->assertGuest();
    $this->assertDatabaseCount('users', 0);
    $this->assertDatabaseCount('connected_accounts', 0);
})->with([
    'unverified' => [[], ['email_verified' => false]],
    'missing verification' => [[], []],
    'false string' => [[], ['email_verified' => 'false']],
    'missing id' => [['id' => null], ['email_verified' => true]],
    'empty id' => [['id' => ''], ['email_verified' => true]],
    'missing email' => [['email' => null], ['email_verified' => true]],
    'invalid email' => [['email' => 'not-an-email'], ['email_verified' => true]],
]);

test('new google user is verified unprivileged tokenless and session is regenerated', function () {
    mockGoogleIdentity(googleIdentity());
    $this->withSession(['state' => 'test-state', 'url.intended' => 'https://evil.example']);
    $oldSession = session()->getId();
    $this->get(googleCallbackUrl())->assertRedirect(route('dashboard'))->assertSessionMissing('url.intended');
    $user = User::query()->sole();
    $this->assertAuthenticatedAs($user);
    expect($user->is_superadmin)->toBeFalse()
        ->and($user->email_verified_at)->not->toBeNull()
        ->and($user->password)->not->toBeEmpty()
        ->and($user->roles()->count())->toBe(0)
        ->and($user->workspaces()->count())->toBe(0)
        ->and(session()->getId())->not->toBe($oldSession);
    $account = $user->connectedAccounts()->sole();
    expect($account->provider)->toBe('google')->and($account->provider_id)->toBe('google-123')
        ->and($account->token)->toBeNull()->and($account->refresh_token)->toBeNull()
        ->and($account->secret)->toBeNull()->and($account->expires_at)->toBeNull();
});

test('existing local email cannot be automatically linked including case variants and deleted users', function (bool $deleted) {
    $user = User::factory()->withoutTwoFactor()->create(['email' => 'PLAYER@example.com']);
    if ($deleted) {
        $user->delete();
    }
    mockGoogleIdentity(googleIdentity());
    $this->withSession(['state' => 'test-state'])->get(googleCallbackUrl())
        ->assertRedirect(route('login'))->assertSessionHasErrors('google');
    $this->assertGuest();
    expect(User::withTrashed()->count())->toBe(1);
    $this->assertDatabaseCount('connected_accounts', 0);
})->with([false, true]);

test('linked users use provider identity and fixed role destination', function (bool $admin) {
    $user = User::factory()->withoutTwoFactor()->create(['is_superadmin' => $admin]);
    $user->connectedAccounts()->create(['provider' => 'google', 'provider_id' => 'google-123']);
    mockGoogleIdentity(googleIdentity());
    $this->withSession(['state' => 'test-state', 'url.intended' => 'https://evil.example'])
        ->get(googleCallbackUrl())->assertRedirect(route($admin ? 'admin.dashboard' : 'dashboard'));
    $this->assertAuthenticatedAs($user);
    $this->assertDatabaseCount('users', 1);
    $this->assertDatabaseCount('connected_accounts', 1);
})->with([false, true]);

test('disabled deleted and two factor linked users cannot sign in', function (string $status) {
    $user = User::factory()->withoutTwoFactor()->create();
    $user->connectedAccounts()->create(['provider' => 'google', 'provider_id' => 'google-123']);
    match ($status) {
        'disabled' => $user->forceFill(['disabled_at' => now()])->save(),
        'unverified' => $user->forceFill(['email_verified_at' => null])->save(),
        'deleted' => $user->delete(),
        'two-factor' => $user->forceFill(['two_factor_secret' => encrypt('secret'), 'two_factor_confirmed_at' => now()])->save(),
        'pending-two-factor' => $user->forceFill(['two_factor_secret' => encrypt('secret')])->save(),
    };
    mockGoogleIdentity(googleIdentity());
    $this->withSession(['state' => 'test-state'])->get(googleCallbackUrl())
        ->assertRedirect(route('login'))->assertSessionHasErrors('google');
    $this->assertGuest();
    expect($user->fresh()->email_verified_at?->toDateTimeString())->toBe($user->email_verified_at?->toDateTimeString());
})->with(['disabled', 'unverified', 'deleted', 'two-factor', 'pending-two-factor']);

test('account creation failure rolls back newly created user', function () {
    mockGoogleIdentity(googleIdentity());
    ConnectedAccount::creating(function (): void {
        throw new RuntimeException('Simulated persistence failure');
    });
    try {
        $this->withSession(['state' => 'test-state'])->get(googleCallbackUrl())
            ->assertRedirect(route('login'))->assertSessionHasErrors('google');
        $this->assertGuest();
        $this->assertDatabaseCount('users', 0);
        $this->assertDatabaseCount('connected_accounts', 0);
    } finally {
        ConnectedAccount::flushEventListeners();
    }
});

test('provider identity is unique across users', function () {
    $first = User::factory()->create();
    $second = User::factory()->create();
    $first->connectedAccounts()->create(['provider' => 'google', 'provider_id' => 'google-123']);
    expect(fn () => $second->connectedAccounts()->create(['provider' => 'google', 'provider_id' => 'google-123']))
        ->toThrow(UniqueConstraintViolationException::class);
});

test('oauth routes are guest only and throttled', function (string $route) {
    Socialite::shouldReceive('driver')->never();
    $user = User::factory()->withoutTwoFactor()->create();
    $this->actingAs($user)->get(route($route))->assertRedirect();
    expect(app('router')->getRoutes()->getByName($route)->gatherMiddleware())->toContain('guest', 'throttle:10,1');
})->with(['google.redirect', 'google.callback']);

test('oauth request limit enforced', function (string $route) {
    config(['services.google.client_id' => null]);
    for ($i = 0; $i < 10; $i++) {
        $this->get(route($route))->assertRedirect(route('login'));
    }
    $this->get(route($route))->assertTooManyRequests();
})->with(['google.redirect', 'google.callback']);

test('login views expose only google availability and redirect url', function (bool $enabled) {
    if (! $enabled) {
        config(['services.google.client_id' => null]);
    }
    $this->get(route('login'))->assertInertia(fn (Assert $page) => $page
        ->component('auth/login')->where('googleEnabled', $enabled)
        ->where('googleRedirectUrl', $enabled ? route('google.redirect') : null));
    $request = Request::create('/login');
    $request->setLaravelSession(session()->driver());
    foreach ([app(LoginController::class)->showLoginForm($request), app(LoginViewResponse::class)] as $view) {
        $props = $view->toResponse($request)->getOriginalContent()->getData()['page']['props'];
        expect($props['googleEnabled'])->toBe($enabled)
            ->and($props['googleRedirectUrl'])->toBe($enabled ? route('google.redirect') : null);
    }
})->with([false, true]);
