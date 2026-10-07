<?php

use App\Models\PlayerProfile;
use App\Models\User;
use Inertia\Testing\AssertableInertia as Assert;

beforeEach(function (): void {
    config(['scout.driver' => 'null']);
    $this->withoutVite();
});

function detailsPayload(array $overrides = []): array
{
    return [
        'birth_date' => now()->subYears(10)->subDay()->toDateString(),
        'school_name' => '  SDN 1 Bogor  ',
        ...$overrides,
    ];
}

test('player details store birth date and trimmed last school', function (): void {
    $user = User::factory()->create();
    $this->actingAs($user)->patch(route('player-details.update'), detailsPayload())->assertRedirect();

    $profile = $user->fresh()->playerProfile;

    expect($profile->birth_date->toDateString())->toBe(now()->subYears(10)->subDay()->toDateString())
        ->and($profile->school_name)->toBe('SDN 1 Bogor')
        ->and($profile->age)->toBe(10);
});

test('player details reject missing or invalid values', function (array $overrides, string $field): void {
    $user = User::factory()->create();
    $this->actingAs($user)->patch(route('player-details.update'), detailsPayload($overrides))->assertSessionHasErrors($field);

    expect($user->fresh()->playerProfile)->toBeNull();
})->with([
    'missing birth date' => [['birth_date' => ''], 'birth_date'],
    'bad format' => [['birth_date' => '10/01/2015'], 'birth_date'],
    'future date' => [['birth_date' => now()->addDay()->toDateString()], 'birth_date'],
    'too young' => [['birth_date' => now()->subYears(2)->toDateString()], 'birth_date'],
    'too old' => [['birth_date' => now()->subYears(101)->toDateString()], 'birth_date'],
    'missing school' => [['school_name' => '   '], 'school_name'],
    'school too short' => [['school_name' => 'SD'], 'school_name'],
    'school too long' => [['school_name' => str_repeat('a', 121)], 'school_name'],
]);

test('player can complete details from dashboard', function (): void {
    $user = User::factory()->create();
    $birthDate = now()->subYears(12)->toDateString();

    $this->actingAs($user)
        ->patch(route('player-details.update'), ['birth_date' => $birthDate, 'school_name' => 'SMPN 2 Bogor'])
        ->assertSessionHasNoErrors()
        ->assertRedirect();

    $this->actingAs($user)->get('/dashboard')->assertInertia(fn (Assert $page) => $page
        ->where('playerDetails.birth_date', $birthDate)
        ->where('playerDetails.school_name', 'SMPN 2 Bogor'));
});

test('updating details keeps existing character and grade', function (): void {
    $user = User::factory()->create();
    PlayerProfile::factory()->for($user)->create(['nickname' => 'Andika', 'grade' => 5, 'color' => 'teal']);

    $this->actingAs($user)->patch(route('player-details.update'), [
        'birth_date' => now()->subYears(11)->toDateString(),
        'school_name' => 'SDN 3 Bogor',
    ]);

    $profile = $user->playerProfile()->sole();
    expect($profile->nickname)->toBe('Andika')->and($profile->grade)->toBe(5)->and($profile->color)->toBe('teal')
        ->and($profile->school_name)->toBe('SDN 3 Bogor');
});

test('player details update requires authentication and valid data', function (): void {
    $this->patch(route('player-details.update'), ['birth_date' => '2015-01-01', 'school_name' => 'SDN 1'])
        ->assertRedirect(route('login'));

    $this->actingAs(User::factory()->create())
        ->patch(route('player-details.update'), ['birth_date' => 'nope', 'school_name' => ''])
        ->assertSessionHasErrors(['birth_date', 'school_name']);
    $this->assertDatabaseCount('player_profiles', 0);
});

test('admin sees participant age and last school', function (): void {
    $admin = User::factory()->create(['is_superadmin' => true]);
    $player = User::factory()->create();
    PlayerProfile::factory()->for($player)->create([
        'birth_date' => now()->subYears(9)->toDateString(),
        'school_name' => 'SDN 4 Bogor',
    ]);

    $this->actingAs($admin)->get(route('admin.users.show', $player))->assertInertia(fn (Assert $page) => $page
        ->where('user.player_profile.school_name', 'SDN 4 Bogor')
        ->where('user.player_profile.age', 9));

    $this->actingAs($admin)->get(route('admin.users.index'))->assertOk();
});
