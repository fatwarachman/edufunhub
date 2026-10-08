<?php

use App\Http\Requests\Admin\UpdatePlayerSchoolGradeRequest;
use App\Models\PlayerProfile;
use App\Models\Role;
use App\Models\School;
use App\Models\User;
use Inertia\Testing\AssertableInertia as Assert;
use Spatie\Activitylog\Models\Activity;

function adminSchoolGradePlayer(array $profile = []): User
{
    $user = User::factory()->create();
    PlayerProfile::factory()->for($user)->create([
        'grade' => 3,
        'school_name' => 'SDN 1 Bogor',
        'school_city' => 'Kota Bogor',
        'school_level' => 'SD',
        'school_npsn' => null,
        ...$profile,
    ]);

    return $user;
}

beforeEach(function (): void {
    $this->superadmin = User::factory()->superadmin()->create();
});

test('npsn overrides the school name, city and level sent by the client', function (): void {
    $school = School::factory()->in('Kota Bandung', 'SMP')->create(['name' => 'SMP NEGERI 5 BANDUNG', 'npsn' => '20219999']);
    $player = adminSchoolGradePlayer();

    $this->actingAs($this->superadmin)
        ->from("/admin/users/{$player->id}")
        ->patch("/admin/users/{$player->id}/player-details", [
            'grade' => 8,
            'school_npsn' => '20219999',
            'school_name' => 'Fake School Name',
            'school_city' => 'Kota Bogor',
            'school_level' => 'SD',
        ])
        ->assertSessionHasNoErrors()
        ->assertRedirect("/admin/users/{$player->id}")
        ->assertSessionHas('success', 'Grade and school updated.');

    expect($player->playerProfile->refresh())
        ->grade->toBe(8)
        ->school_name->toBe($school->name)
        ->school_city->toBe('Kota Bandung')
        ->school_level->toBe('SMP')
        ->school_npsn->toBe('20219999');
});

test('a manual school without npsn keeps the typed values', function (): void {
    $player = adminSchoolGradePlayer(['school_npsn' => null]);

    $this->actingAs($this->superadmin)
        ->patch("/admin/users/{$player->id}/player-details", [
            'grade' => 0,
            'school_name' => '  TK   Pelangi  Ceria ',
            'school_city' => 'Kota Depok',
            'school_level' => 'TK',
            'school_npsn' => '',
        ])
        ->assertSessionHasNoErrors();

    expect($player->playerProfile->refresh())
        ->grade->toBe(0)
        ->school_name->toBe('TK Pelangi Ceria')
        ->school_city->toBe('Kota Depok')
        ->school_level->toBe('TK')
        ->school_npsn->toBeNull();
});

test('switching from a listed school to a manual one clears the npsn', function (): void {
    School::factory()->in('Kota Bogor', 'SD')->create(['npsn' => '20200001']);
    $player = adminSchoolGradePlayer(['school_npsn' => '20200001']);

    $this->actingAs($this->superadmin)
        ->patch("/admin/users/{$player->id}/player-details", [
            'grade' => 4,
            'school_name' => 'SD Rumah Belajar',
            'school_city' => 'Kota Bogor',
            'school_level' => 'SD',
        ])
        ->assertSessionHasNoErrors();

    expect($player->playerProfile->refresh()->school_npsn)->toBeNull();
});

test('the old SMK level is saved as SMA', function (): void {
    $player = adminSchoolGradePlayer();

    $this->actingAs($this->superadmin)
        ->patch("/admin/users/{$player->id}/player-details", [
            'grade' => 11,
            'school_name' => 'SMK Teknologi Nusantara',
            'school_city' => 'Kota Bogor',
            'school_level' => 'smk',
        ])
        ->assertSessionHasNoErrors();

    expect($player->playerProfile->refresh()->school_level)->toBe('SMA');
});

test('invalid grades are rejected', function (mixed $grade): void {
    $player = adminSchoolGradePlayer();

    $this->actingAs($this->superadmin)
        ->patch("/admin/users/{$player->id}/player-details", [
            'grade' => $grade,
            'school_name' => 'SDN 2 Bogor',
            'school_city' => 'Kota Bogor',
            'school_level' => 'SD',
        ])
        ->assertSessionHasErrors(['grade' => __('character.grade_invalid')]);

    expect($player->playerProfile->refresh()->grade)->toBe(3);
})->with([
    'too high' => [13],
    'negative' => [-1],
    'not a number' => ['abc'],
    'missing' => [null],
]);

test('invalid school fields are rejected', function (array $input, string $field): void {
    $player = adminSchoolGradePlayer();

    $this->actingAs($this->superadmin)
        ->patch("/admin/users/{$player->id}/player-details", [
            'grade' => 5,
            'school_name' => 'SDN 2 Bogor',
            'school_city' => 'Kota Bogor',
            'school_level' => 'SD',
            ...$input,
        ])
        ->assertSessionHasErrors([$field]);

    expect($player->playerProfile->refresh()->school_name)->toBe('SDN 1 Bogor');
})->with([
    'unknown npsn' => [['school_npsn' => '99999999'], 'school_npsn'],
    'unknown level' => [['school_level' => 'KULIAH'], 'school_level'],
    'missing school name' => [['school_name' => '  '], 'school_name'],
    'school name too long' => [['school_name' => str_repeat('A', PlayerProfile::SCHOOL_NAME_MAX + 1)], 'school_name'],
]);

test('an account without a learner profile is refused and gets no profile', function (): void {
    $user = User::factory()->create();

    $this->actingAs($this->superadmin)
        ->patch("/admin/users/{$user->id}/player-details", [
            'grade' => 5,
            'school_name' => 'SDN 2 Bogor',
            'school_city' => 'Kota Bogor',
            'school_level' => 'SD',
        ])
        ->assertSessionHasErrors(['profile' => UpdatePlayerSchoolGradeRequest::PROFILE_MISSING]);

    expect($user->playerProfile()->exists())->toBeFalse()
        ->and(Activity::query()->where('description', 'Updated learner grade and school')->count())->toBe(0);
});

test('plain admins cannot change grade or school', function (): void {
    $admin = User::factory()->create();
    $admin->roles()->attach(Role::query()->firstOrCreate(['slug' => Role::ADMIN], ['name' => 'Admin'])->id);
    $player = adminSchoolGradePlayer();

    $this->actingAs($admin)
        ->patch("/admin/users/{$player->id}/player-details", ['grade' => 9, 'school_name' => 'SMP Lain'])
        ->assertForbidden();

    expect($player->playerProfile->refresh()->grade)->toBe(3);
});

test('players cannot change their own grade through the admin route', function (): void {
    $player = adminSchoolGradePlayer();

    $this->actingAs($player)
        ->patch("/admin/users/{$player->id}/player-details", ['grade' => 12, 'school_name' => 'SMA Lain'])
        ->assertForbidden();

    expect($player->playerProfile->refresh()->grade)->toBe(3);
});

test('guests are redirected to login', function (): void {
    $player = adminSchoolGradePlayer();

    $this->patch("/admin/users/{$player->id}/player-details", ['grade' => 9])
        ->assertRedirect('/login');

    expect($player->playerProfile->refresh()->grade)->toBe(3);
});

test('the change is logged with the admin, the learner and old and new values', function (): void {
    School::factory()->in('Kota Bogor', 'SMP')->create(['npsn' => '20200777', 'name' => 'SMP NEGERI 7 BOGOR']);
    $player = adminSchoolGradePlayer();

    $this->actingAs($this->superadmin)
        ->patch("/admin/users/{$player->id}/player-details", [
            'grade' => 7,
            'school_npsn' => '20200777',
            'school_name' => 'whatever',
        ])
        ->assertSessionHasNoErrors();

    $log = Activity::query()->where('description', 'Updated learner grade and school')->sole();

    expect($log->causer_id)->toBe($this->superadmin->id)
        ->and($log->subject_type)->toBe(User::class)
        ->and($log->subject_id)->toBe($player->id)
        ->and($log->event)->toBe('updated')
        ->and($log->properties['old'])->toMatchArray(['grade' => 3, 'school_name' => 'SDN 1 Bogor', 'school_level' => 'SD', 'school_npsn' => null])
        ->and($log->properties['attributes'])->toMatchArray(['grade' => 7, 'school_name' => 'SMP NEGERI 7 BOGOR', 'school_city' => 'Kota Bogor', 'school_level' => 'SMP', 'school_npsn' => '20200777']);
});

test('the user detail page shares school fields and the viewer role', function (): void {
    $player = adminSchoolGradePlayer(['school_npsn' => null]);
    $admin = User::factory()->create();
    $admin->roles()->attach(Role::query()->firstOrCreate(['slug' => Role::ADMIN], ['name' => 'Admin'])->id);

    $this->actingAs($this->superadmin)->get("/admin/users/{$player->id}")->assertInertia(fn (Assert $page) => $page
        ->component('admin/users/show')
        ->where('viewerIsSuperadmin', true)
        ->where('user.player_profile.school_city', 'Kota Bogor')
        ->where('user.player_profile.school_level', 'SD')
        ->where('user.player_profile.school_npsn', null));

    $this->actingAs($admin)->get("/admin/users/{$player->id}")->assertInertia(fn (Assert $page) => $page
        ->where('viewerIsSuperadmin', false));
});
