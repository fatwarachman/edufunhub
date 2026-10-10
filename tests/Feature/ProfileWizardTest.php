<?php

use App\Models\PlayerProfile;
use App\Models\Role;
use App\Models\User;
use Inertia\Testing\AssertableInertia as Assert;
use Laravel\Socialite\Facades\Socialite;
use Laravel\Socialite\Two\GoogleProvider;
use Laravel\Socialite\Two\User as GoogleUser;

beforeEach(function (): void {
    config(['scout.driver' => 'null']);
    $this->withoutVite();
});

function wizardPayload(array $overrides = []): array
{
    return [
        'name' => '  Rani   Putri ',
        'birth_date' => now()->subYears(10)->subDay()->toDateString(),
        'grade' => 4,
        'school_name' => '  SDN 1 Bogor ',
        'school_city' => 'Kota Bogor',
        'school_level' => 'SD',
        'whatsapp_number' => '0812-3456-7890',
        'whatsapp_notifications' => true,
        ...$overrides,
    ];
}

test('new accounts get the wizard prop with their prefill', function (): void {
    $user = User::factory()->profilePending()->create(['name' => 'Rani']);
    PlayerProfile::factory()->for($user)->create(['grade' => 3, 'birth_date' => '2015-02-01', 'school_name' => 'SDN 2 Bogor']);

    $this->actingAs($user)->get(route('portal'))->assertInertia(fn (Assert $page) => $page
        ->where('profileWizard.name', 'Rani')
        ->where('profileWizard.grade', 3)
        ->where('profileWizard.birth_date', '2015-02-01')
        ->where('profileWizard.school_name', 'SDN 2 Bogor')
        ->where('profileWizard.whatsapp_number', null));
});

test('the wizard is hidden for completed, admin and teacher accounts', function (Closure $makeUser): void {
    $this->actingAs($makeUser())->get(route('portal'))->assertInertia(fn (Assert $page) => $page
        ->where('profileWizard', null));
})->with([
    'completed' => [fn (): User => User::factory()->create()],
    'superadmin' => [fn (): User => User::factory()->profilePending()->create(['is_superadmin' => true])],
    'teacher' => [function (): User {
        $user = User::factory()->profilePending()->create();
        $user->roles()->attach(Role::query()->firstOrCreate(['slug' => Role::TEACHER], ['name' => 'Guru', 'is_system' => true]));

        return $user;
    }],
]);

test('guests never get the wizard prop', function (): void {
    $this->get(route('login'))->assertInertia(fn (Assert $page) => $page->where('profileWizard', null));
});

test('a player who signs up with google sees the wizard on first login', function (): void {
    config(['services.google.client_id' => 'test-client', 'services.google.client_secret' => 'test-secret', 'services.google.redirect' => '/auth/google/callback']);
    $identity = (new GoogleUser)->setRaw(['email_verified' => true])
        ->map(['id' => 'google-wizard-1', 'email' => 'murid-baru@example.test', 'name' => 'Murid Baru'])->setToken('t');
    $provider = Mockery::mock(GoogleProvider::class);
    $provider->shouldReceive('user')->once()->andReturn($identity);
    Socialite::shouldReceive('driver')->with('google')->once()->andReturn($provider);

    $this->withSession(['state' => 'test-state'])
        ->get(route('google.callback', ['code' => 'c', 'state' => 'test-state']))
        ->assertRedirect(route('portal'));

    $user = User::query()->where('email', 'murid-baru@example.test')->sole();
    expect($user->profile_completed_at)->toBeNull();

    $this->actingAs($user)->get(route('portal'))->assertInertia(fn (Assert $page) => $page
        ->where('profileWizard.name', 'Murid Baru'));
});

test('completing the wizard stores every field and hides it', function (): void {
    $user = User::factory()->profilePending()->create(['name' => 'Old']);

    $this->actingAs($user)->from(route('portal'))
        ->post(route('profile-wizard.store'), wizardPayload())
        ->assertSessionHasNoErrors()
        ->assertRedirect(route('portal'));

    $user->refresh();
    $profile = $user->playerProfile;

    expect($user->name)->toBe('Rani Putri')
        ->and($user->whatsapp_number)->toBe('6281234567890')
        ->and($user->whatsapp_notifications)->toBeTrue()
        ->and($user->profile_completed_at)->not->toBeNull()
        ->and($profile->grade)->toBe(4)
        ->and($profile->school_name)->toBe('SDN 1 Bogor')
        ->and($profile->school_city)->toBe('Kota Bogor')
        ->and($profile->birth_date->toDateString())->toBe(now()->subYears(10)->subDay()->toDateString())
        ->and($user->hasCompletePlayerDetails())->toBeTrue();

    $this->actingAs($user)->get(route('portal'))->assertInertia(fn (Assert $page) => $page
        ->where('profileWizard', null));
});

test('completing the wizard updates an existing profile without duplicating it', function (): void {
    $user = User::factory()->profilePending()->create();
    PlayerProfile::factory()->for($user)->create(['grade' => 1, 'nickname' => 'Rani']);

    $this->actingAs($user)->post(route('profile-wizard.store'), wizardPayload(['grade' => 0]))->assertSessionHasNoErrors();

    expect(PlayerProfile::query()->where('user_id', $user->id)->count())->toBe(1)
        ->and($user->fresh()->playerProfile->grade)->toBe(0)
        ->and($user->fresh()->playerProfile->nickname)->toBe('Rani');
});

test('the wizard rejects missing or invalid values', function (array $overrides, string $field): void {
    $user = User::factory()->profilePending()->create();

    $this->actingAs($user)->post(route('profile-wizard.store'), wizardPayload($overrides))->assertSessionHasErrors($field);

    expect($user->fresh()->profile_completed_at)->toBeNull();
})->with([
    'missing name' => [['name' => '  '], 'name'],
    'name too short' => [['name' => 'A'], 'name'],
    'name too long' => [['name' => str_repeat('a', 81)], 'name'],
    'missing birth date' => [['birth_date' => ''], 'birth_date'],
    'future birth date' => [['birth_date' => now()->addDay()->toDateString()], 'birth_date'],
    'too young' => [['birth_date' => now()->subYears(2)->toDateString()], 'birth_date'],
    'missing grade' => [['grade' => ''], 'grade'],
    'grade out of range' => [['grade' => 13], 'grade'],
    'negative grade' => [['grade' => -1], 'grade'],
    'missing school' => [['school_name' => ' '], 'school_name'],
    'missing whatsapp' => [['whatsapp_number' => ''], 'whatsapp_number'],
    'invalid whatsapp' => [['whatsapp_number' => '12345'], 'whatsapp_number'],
    'letters as whatsapp' => [['whatsapp_number' => 'nomorku'], 'whatsapp_number'],
]);

test('guests cannot submit the wizard', function (): void {
    $this->post(route('profile-wizard.store'), wizardPayload())->assertRedirect(route('login'));
});
