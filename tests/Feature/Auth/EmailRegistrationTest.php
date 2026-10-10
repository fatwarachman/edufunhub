<?php

use App\Http\Middleware\EnsureSuperadmin;
use App\Models\Role;
use App\Models\Setting;
use App\Models\User;
use App\Services\RegistrationSettings;
use Illuminate\Auth\Events\Registered;
use Illuminate\Support\Facades\Event;
use Inertia\Testing\AssertableInertia as Assert;
use Spatie\Activitylog\Models\Activity;

beforeEach(function (): void {
    config(['scout.driver' => 'null']);
    $this->withoutVite();
});

function emailSignUpPayload(array $overrides = []): array
{
    return [
        'name' => '  Rani   Putri ',
        'email' => 'Rani.Putri@Example.com',
        'password' => 'Rahasia123!',
        'password_confirmation' => 'Rahasia123!',
        ...$overrides,
    ];
}

function enableEmailSignUp(bool $enabled = true): void
{
    app(RegistrationSettings::class)->setEmailEnabled($enabled);
}

test('email sign-up is off by default and the page hides the form', function (): void {
    expect(app(RegistrationSettings::class)->emailEnabled())->toBeFalse();

    $this->get(route('register'))->assertOk()->assertInertia(fn (Assert $page) => $page
        ->component('auth/register')
        ->where('emailRegistrationEnabled', false));

    $this->post(route('register.store'), emailSignUpPayload())->assertNotFound();

    $this->assertGuest();
    expect(User::query()->where('email', 'rani.putri@example.com')->exists())->toBeFalse();
});

test('the page offers the email form when the switch is on', function (): void {
    enableEmailSignUp();

    $this->get(route('register'))->assertOk()->assertInertia(fn (Assert $page) => $page
        ->component('auth/register')
        ->where('emailRegistrationEnabled', true));
});

test('email sign-up creates a signed-in player who still has to finish the wizard', function (): void {
    Event::fake([Registered::class]);
    enableEmailSignUp();

    $this->post(route('register.store'), emailSignUpPayload())->assertRedirect(route('portal'));

    $user = User::query()->where('email', 'rani.putri@example.com')->sole();
    $this->assertAuthenticatedAs($user);

    expect($user->name)->toBe('Rani Putri')
        ->and($user->is_superadmin)->toBeFalse()
        ->and($user->profile_completed_at)->toBeNull()
        ->and($user->locale)->toBe(app()->getLocale())
        ->and($user->hasRole(Role::PARTICIPANT))->toBeTrue()
        ->and($user->isAdmin())->toBeFalse()
        ->and(password_verify('Rahasia123!', $user->password))->toBeTrue();

    Event::assertDispatched(Registered::class, fn (Registered $event): bool => $event->user->getAuthIdentifier() === $user->id);

    $this->get(route('portal'))->assertInertia(fn (Assert $page) => $page
        ->where('profileWizard.name', 'Rani Putri')
        ->where('profileWizard.birth_date', null));
});

test('email sign-up returns the player to a pending game link', function (): void {
    enableEmailSignUp();

    $this->withSession(['game_return_url' => '/join/123456'])
        ->post(route('register.store'), emailSignUpPayload())
        ->assertRedirect('/join/123456');
});

test('email sign-up rejects duplicate emails, including trashed and differently cased ones', function (string $email): void {
    enableEmailSignUp();
    $existing = User::factory()->create(['email' => 'taken@example.com']);
    if ($email === 'trashed@example.com') {
        User::factory()->create(['email' => 'trashed@example.com'])->delete();
    }

    $this->from(route('register'))
        ->post(route('register.store'), emailSignUpPayload(['email' => $email]))
        ->assertRedirect(route('register'))
        ->assertSessionHasErrors('email');

    $this->assertGuest();
    expect(User::withTrashed()->whereRaw('LOWER(email) = ?', [strtolower($email)])->count())->toBe(1)
        ->and($existing->fresh())->not->toBeNull();
})->with(['taken@example.com', 'TAKEN@Example.com', 'trashed@example.com']);

test('email sign-up validates the fields', function (array $overrides, string $field): void {
    enableEmailSignUp();

    $this->post(route('register.store'), emailSignUpPayload($overrides))->assertSessionHasErrors($field);
    $this->assertGuest();
})->with([
    'missing name' => [['name' => ''], 'name'],
    'bad email' => [['email' => 'not-an-email'], 'email'],
    'short password' => [['password' => 'abc', 'password_confirmation' => 'abc'], 'password'],
    'mismatch' => [['password_confirmation' => 'Different123!'], 'password'],
    'honeypot' => [['website' => 'http://spam.test'], 'website'],
]);

test('email sign-up is guest only and throttled', function (): void {
    $middleware = app('router')->getRoutes()->getByName('register.store')->gatherMiddleware();

    expect($middleware)->toContain('guest', 'throttle:5,1,register.store');
});

test('a signed-in user cannot register again', function (): void {
    enableEmailSignUp();

    $this->actingAs(User::factory()->create())
        ->post(route('register.store'), emailSignUpPayload())
        ->assertRedirect();

    expect(User::query()->where('email', 'rani.putri@example.com')->exists())->toBeFalse();
});

test('a super admin can toggle email sign-up and the change is logged', function (): void {
    $superadmin = User::factory()->superadmin()->create();

    $this->actingAs($superadmin)
        ->get(route('admin.settings.index', ['tab' => 'registration']))
        ->assertOk()
        ->assertInertia(fn (Assert $page) => $page
            ->component('admin/settings')
            ->where('registration.email_enabled', false)
            ->where('canManageRegistration', true));

    $this->actingAs($superadmin)
        ->from(route('admin.settings.index', ['tab' => 'registration']))
        ->put(route('admin.settings.registration'), ['email_enabled' => true])
        ->assertRedirect(route('admin.settings.index', ['tab' => 'registration']))
        ->assertSessionHas('success');

    expect(app(RegistrationSettings::class)->emailEnabled())->toBeTrue()
        ->and(Setting::query()->where('key', RegistrationSettings::EMAIL_ENABLED)->value('group'))->toBe('registration');

    $log = Activity::query()->where('description', 'Updated registration settings')->sole();
    expect($log->causer_id)->toBe($superadmin->id)
        ->and($log->properties['old']['email_enabled'])->toBeFalse()
        ->and($log->properties['attributes']['email_enabled'])->toBeTrue();

    $this->actingAs($superadmin)
        ->put(route('admin.settings.registration'), ['email_enabled' => false])
        ->assertRedirect();

    expect(app(RegistrationSettings::class)->emailEnabled())->toBeFalse();
});

test('a plain admin cannot toggle email sign-up', function (): void {
    $admin = User::factory()->create();
    $admin->roles()->attach(Role::query()->firstOrCreate(['slug' => Role::ADMIN], ['name' => 'Admin'])->id);

    $this->actingAs($admin)
        ->get(route('admin.settings.index', ['tab' => 'registration']))
        ->assertInertia(fn (Assert $page) => $page->where('canManageRegistration', false));

    $this->actingAs($admin)
        ->put(route('admin.settings.registration'), ['email_enabled' => true])
        ->assertForbidden();

    expect(app(RegistrationSettings::class)->emailEnabled())->toBeFalse()
        ->and(Activity::query()->where('description', 'Updated registration settings')->count())->toBe(0);
});

test('the toggle requires a boolean', function (): void {
    $this->actingAs(User::factory()->superadmin()->create())
        ->put(route('admin.settings.registration'), ['email_enabled' => 'maybe'])
        ->assertSessionHasErrors('email_enabled');

    expect(app(RegistrationSettings::class)->emailEnabled())->toBeFalse();
});

test('the toggle route is throttled for super admins only', function (): void {
    $middleware = app('router')->getRoutes()->getByName('admin.settings.registration')->gatherMiddleware();

    expect($middleware)->toContain('throttle:20,1,settings.registration', EnsureSuperadmin::class);
});
