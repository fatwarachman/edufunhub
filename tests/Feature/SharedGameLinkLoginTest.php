<?php

use App\Models\User;
use App\Services\GameReturnUrl;
use Illuminate\Http\Request;
use Laravel\Socialite\Facades\Socialite;
use Laravel\Socialite\Two\User as GoogleUser;

beforeEach(function (): void {
    $this->withoutVite();
    config([
        'services.google.client_id' => 'client-id',
        'services.google.client_secret' => 'client-secret',
        'services.google.redirect' => 'http://localhost/auth/google/callback',
    ]);
});

function sharedLinkGoogleIdentity(): GoogleUser
{
    $identity = (new GoogleUser)->map(['id' => 'shared-link-google', 'name' => 'Rani', 'email' => 'rani@shared-link-qa.test']);
    $identity->setRaw(['email_verified' => true]);

    return $identity;
}

function sharedLinkLoginWithGoogle(): void
{
    $provider = Mockery::mock();
    $provider->shouldReceive('user')->andReturn(sharedLinkGoogleIdentity());
    Socialite::shouldReceive('driver')->with('google')->andReturn($provider);
}

it('sends a guest from a shared room link to login and back to the room after google sign-in', function (): void {
    $user = User::factory()->withPlayerDetails()->withoutTwoFactor()->create(['email' => 'rani@shared-link-qa.test']);
    $user->connectedAccounts()->create(['provider' => 'google', 'provider_id' => 'shared-link-google']);

    $this->get('/games/quiz-duel/join/482913')->assertRedirect(route('login'));
    sharedLinkLoginWithGoogle();

    $this->withSession(['state' => 'test-state', 'url.intended' => session('url.intended')])
        ->get('/auth/google/callback?state=test-state&code=abc')
        ->assertRedirect('/games/quiz-duel/join/482913');
    $this->assertAuthenticatedAs($user);
});

it('sends a guest back to the room after email and password login', function (): void {
    $user = User::factory()->withPlayerDetails()->withoutTwoFactor()->create(['password' => 'secret-pass-123']);

    $this->get('/games/snakes-and-ladders?pin=482913')->assertRedirect(route('login'));
    $this->post('/login', ['email' => $user->email, 'password' => 'secret-pass-123'])
        ->assertRedirect('/games/snakes-and-ladders?pin=482913');
});

it('returns a player who first had to fill in their details to the shared room', function (): void {
    $user = User::factory()->create();

    $this->actingAs($user)->get('/games/quiz-duel?pin=482913')->assertRedirect(route('portal'));
    expect(session(GameReturnUrl::SESSION_KEY))->toBe('/games/quiz-duel?pin=482913');

    $this->actingAs($user)->patch('/player-details', [
        'birth_date' => now()->subYears(10)->toDateString(),
        'school_name' => 'SDN 1 Bogor',
    ])->assertSessionHasNoErrors()->assertRedirect('/games/quiz-duel?pin=482913');

    expect(session(GameReturnUrl::SESSION_KEY))->toBeNull();
});

it('ignores foreign or non-game return urls after google sign-in', function (string $intended): void {
    $user = User::factory()->withoutTwoFactor()->create(['email' => 'rani@shared-link-qa.test']);
    $user->connectedAccounts()->create(['provider' => 'google', 'provider_id' => 'shared-link-google']);
    sharedLinkLoginWithGoogle();

    $this->withSession(['state' => 'test-state', 'url.intended' => $intended])
        ->get('/auth/google/callback?state=test-state&code=abc')
        ->assertRedirect(route('portal'));
})->with([
    'other host' => 'https://evil.example/games/quiz-duel/join/482913',
    'protocol relative' => '//evil.example/games/quiz-duel',
    'admin page' => '/admin/users',
    'javascript' => 'javascript:alert(1)',
]);

it('accepts only game paths and six digit pins', function (?string $url, ?string $expected): void {
    $this->app->instance('request', Request::create('http://localhost/'));

    expect(app(GameReturnUrl::class)->safePath($url))->toBe($expected);
})->with([
    ['/games/quiz-duel/join/482913', '/games/quiz-duel/join/482913'],
    ['/games/snakes-and-ladders?pin=482913', '/games/snakes-and-ladders?pin=482913'],
    ['/games/snakes-and-ladders?pin=12<script>', '/games/snakes-and-ladders'],
    ['/join/482913', '/join/482913'],
    ['/play/turbo-trivia/482913', '/play/turbo-trivia/482913'],
    ['http://localhost/games/sky-quiz', '/games/sky-quiz'],
    ['/admin/users', null],
    ['//evil.example/games/x', null],
    ['https://evil.example/games/sky-quiz', null],
    ['/games/../admin', null],
    [null, null],
]);
