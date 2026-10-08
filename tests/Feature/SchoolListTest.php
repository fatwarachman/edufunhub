<?php

use App\Models\PlayerProfile;
use App\Models\School;
use App\Models\User;
use Illuminate\Support\Arr;
use Illuminate\Support\Facades\Artisan;

beforeEach(function (): void {
    config(['scout.driver' => 'null']);
});

function schoolListPlayer(): User
{
    $user = User::factory()->create(['locale' => 'id']);
    $user->playerProfile()->create(['birth_date' => '2015-01-01', 'school_name' => 'SDN Lama']);

    return $user;
}

it('lists the schools of one city and level for guests', function (): void {
    School::factory()->in('Kota Bogor', 'SD')->create(['name' => 'SD NEGERI BANTARJATI 1', 'district' => 'BOGOR UTARA']);
    School::factory()->in('Kota Bogor', 'SD', 'MI')->create(['name' => 'MI AL HIDAYAH', 'district' => 'TANAH SAREAL']);
    School::factory()->in('Kota Bogor', 'SMP')->create(['name' => 'SMP NEGERI 1 BOGOR']);
    School::factory()->in('Kabupaten Bogor', 'SD')->create(['name' => 'SD NEGERI CIBINONG 1']);

    $response = $this->getJson(route('player-details.school-list', ['regency' => 'Kota Bogor', 'level' => 'SD']))
        ->assertOk()
        ->assertJsonPath('total', 2)
        ->assertJsonStructure(['schools' => [['npsn', 'name', 'district', 'form']], 'total']);

    expect(collect($response->json('schools'))->pluck('name')->all())->toBe(['MI AL HIDAYAH', 'SD NEGERI BANTARJATI 1'])
        ->and($response->json('schools.0.form'))->toBe('MI');
});

it('narrows the list by school name or district', function (): void {
    School::factory()->in('Kota Bogor', 'SD')->create(['name' => 'SD NEGERI BANTARJATI 1', 'district' => 'BOGOR UTARA']);
    School::factory()->in('Kota Bogor', 'SD')->create(['name' => 'SD NEGERI PANARAGAN', 'district' => 'BOGOR TENGAH']);

    $this->getJson(route('player-details.school-list', ['regency' => 'Kota Bogor', 'level' => 'SD', 'q' => 'bantar']))
        ->assertOk()->assertJsonPath('total', 1)->assertJsonPath('schools.0.name', 'SD NEGERI BANTARJATI 1');

    $this->getJson(route('player-details.school-list', ['regency' => 'Kota Bogor', 'level' => 'SD', 'q' => 'tengah']))
        ->assertOk()->assertJsonPath('total', 1)->assertJsonPath('schools.0.name', 'SD NEGERI PANARAGAN');

    $this->getJson(route('player-details.school-list', ['regency' => 'Kota Bogor', 'level' => 'SD', 'q' => '100%_']))
        ->assertOk()->assertJsonPath('total', 0)->assertJsonPath('schools', []);
});

it('caps the list and reports the full count', function (): void {
    School::factory()->count(School::LIST_LIMIT + 5)->in('Kota Bogor', 'SD')->create();

    $this->getJson(route('player-details.school-list', ['regency' => 'Kota Bogor', 'level' => 'SD']))
        ->assertOk()
        ->assertJsonCount(School::LIST_LIMIT, 'schools')
        ->assertJsonPath('total', School::LIST_LIMIT + 5);
});

it('groups equivalent schools under one level', function (): void {
    School::factory()->in('Kota Bogor', 'SMA')->create(['name' => 'SMA NEGERI 1 BOGOR']);
    School::factory()->in('Kota Bogor', 'SMA', 'SMK')->create(['name' => 'SMK NEGERI 1 BOGOR']);
    School::factory()->in('Kota Bogor', 'SMA', 'MA')->create(['name' => 'MA NEGERI 1 BOGOR']);
    School::factory()->in('Kota Bogor', 'SMP', 'MTS')->create(['name' => 'MTS NEGERI 1 BOGOR']);
    School::factory()->in('Kota Bogor', 'SD', 'MI')->create(['name' => 'MI NEGERI 1 BOGOR']);

    $high = $this->getJson(route('player-details.school-list', ['regency' => 'Kota Bogor', 'level' => 'SMA']))->assertOk();
    expect(collect($high->json('schools'))->pluck('form')->all())->toBe(['MA', 'SMA', 'SMK']);

    $this->getJson(route('player-details.school-list', ['regency' => 'Kota Bogor', 'level' => 'SMK']))
        ->assertOk()->assertJsonPath('total', 3);
    $this->getJson(route('player-details.school-list', ['regency' => 'Kota Bogor', 'level' => 'SMP']))
        ->assertOk()->assertJsonPath('schools.0.form', 'MTS');
    $this->getJson(route('player-details.school-list', ['regency' => 'Kota Bogor', 'level' => 'SD']))
        ->assertOk()->assertJsonPath('schools.0.form', 'MI');

    expect(School::LEVELS)->toBe(['TK', 'SD', 'SMP', 'SMA', 'SLB']);
});

it('stores an old SMK level as SMA sederajat', function (): void {
    $user = schoolListPlayer();

    $this->actingAs($user)
        ->patch(route('player-details.update'), ['birth_date' => '2008-05-01', 'school_city' => 'Kota Bogor', 'school_level' => 'SMK', 'school_name' => 'SMK Swasta Bogor'])
        ->assertSessionHasNoErrors();

    expect($user->playerProfile()->first()->school_level)->toBe('SMA');
});

it('requires a city and a known level', function (array $query, string $field): void {
    $this->getJson(route('player-details.school-list', $query))->assertUnprocessable()->assertJsonValidationErrors($field);
})->with([
    'no city' => [['level' => 'SD'], 'regency'],
    'no level' => [['regency' => 'Kota Bogor'], 'level'],
    'unknown level' => [['regency' => 'Kota Bogor', 'level' => 'KULIAH'], 'level'],
]);

it('throttles the school list', function (): void {
    foreach (range(1, 120) as $attempt) {
        $this->getJson(route('player-details.school-list', ['regency' => 'Kota Bogor', 'level' => 'SD']))->assertOk();
    }

    $this->getJson(route('player-details.school-list', ['regency' => 'Kota Bogor', 'level' => 'SD']))->assertTooManyRequests();
});

it('saves the official school when the player picks one from the list', function (): void {
    $school = School::factory()->in('Kota Bogor', 'SMP')->create(['npsn' => '20219999', 'name' => 'SMP NEGERI 1 BOGOR']);
    $user = schoolListPlayer();

    $this->actingAs($user)
        ->patch(route('player-details.update'), [
            'birth_date' => '2012-05-01',
            'school_city' => 'Kabupaten Garut',
            'school_level' => 'SD',
            'school_name' => 'Nama palsu',
            'school_npsn' => $school->npsn,
        ])
        ->assertSessionHasNoErrors();

    $profile = $user->playerProfile()->first();
    expect($profile->only(['school_name', 'school_city', 'school_level', 'school_npsn']))->toBe([
        'school_name' => 'SMP NEGERI 1 BOGOR',
        'school_city' => 'Kota Bogor',
        'school_level' => 'SMP',
        'school_npsn' => '20219999',
    ]);
});

it('keeps a typed school that is not in the list', function (): void {
    $user = schoolListPlayer();

    $this->actingAs($user)
        ->patch(route('player-details.update'), [
            'birth_date' => '2012-05-01',
            'school_city' => 'Kota Bogor',
            'school_level' => 'sd',
            'school_name' => '  SD Alam   Bogor ',
        ])
        ->assertSessionHasNoErrors();

    expect($user->playerProfile()->first()->only(['school_name', 'school_city', 'school_level', 'school_npsn']))->toBe([
        'school_name' => 'SD Alam Bogor',
        'school_city' => 'Kota Bogor',
        'school_level' => 'SD',
        'school_npsn' => null,
    ]);
});

it('rejects an unknown npsn or level', function (array $override, string $field): void {
    $this->actingAs(schoolListPlayer())
        ->patch(route('player-details.update'), [
            'birth_date' => '2012-05-01',
            'school_name' => 'SD Alam Bogor',
            ...$override,
        ])
        ->assertSessionHasErrors($field);
})->with([
    'unknown npsn' => [['school_npsn' => '99999999'], 'school_npsn'],
    'unknown level' => [['school_level' => 'KULIAH'], 'school_level'],
]);

it('shares the school level and npsn with the dashboard and profile', function (): void {
    $user = schoolListPlayer();
    $user->playerProfile()->update(['school_level' => 'SD', 'school_npsn' => '20201032', 'grade' => 3]);

    $this->actingAs($user)->get(route('dashboard'))->assertInertia(fn ($page) => $page
        ->where('playerDetails.school_level', 'SD')
        ->where('playerDetails.school_npsn', '20201032'));

    $this->actingAs($user)->get(route('profile.show'))->assertInertia(fn ($page) => $page
        ->where('player.school_level', 'SD')
        ->where('player.school_npsn', '20201032'));
});

it('imports the bundled school list once', function (): void {
    $path = tempnam(sys_get_temp_dir(), 'schools').'.gz';
    file_put_contents($path, gzencode(implode("\n", [
        '20201032;SD NEGERI CIBADAK 01;Kabupaten Bogor;CIAMPEA;SD;SD',
        '69956191;MI DARUL MAWA;Kota Bogor;KOTA BOGOR TIMUR;SD;MI',
        'broken line',
        '12345678;SEKOLAH ANEH;Kota Bogor;X;KULIAH;PT',
    ])."\n"));

    expect(Artisan::call('schools:import', ['--path' => $path]))->toBe(0)
        ->and(School::query()->count())->toBe(2)
        ->and(School::query()->where('npsn', '69956191')->value('form'))->toBe('MI');

    School::query()->where('npsn', '69956191')->update(['name' => 'X']);
    Artisan::call('schools:import', ['--path' => $path, '--if-empty' => true]);
    expect(School::query()->where('npsn', '69956191')->value('name'))->toBe('X');

    Artisan::call('schools:import', ['--path' => $path]);
    expect(School::query()->where('npsn', '69956191')->value('name'))->toBe('MI DARUL MAWA');

    unlink($path);
});

it('ships a school list for every city and regency', function (): void {
    $regencies = collect(json_decode((string) file_get_contents(database_path('data/regencies.json')), true))->pluck('name')->flip();
    $handle = gzopen(database_path('data/schools.csv.gz'), 'rb');
    $cities = [];
    $levels = [];
    $rows = 0;
    while (($line = gzgets($handle)) !== false) {
        [, , $city, , $level] = explode(';', rtrim($line));
        $cities[$city] = true;
        $levels[$level] = true;
        $rows++;
    }
    gzclose($handle);

    expect($rows)->toBeGreaterThan(400000)
        ->and(array_diff_key($cities, $regencies->all()))->toBe([])
        ->and(count($cities))->toBe($regencies->count())
        ->and(array_keys($levels))->toEqualCanonicalizing(School::LEVELS);
});

it('ships matching school picker texts in both languages', function (): void {
    $id = json_decode((string) file_get_contents(resource_path('js/locales/id-player.json')), true)['schoolPicker'];
    $en = json_decode((string) file_get_contents(resource_path('js/locales/en-player.json')), true)['schoolPicker'];

    expect(array_keys($id['levels']))->toBe(School::LEVELS)
        ->and(array_keys(Arr::dot($id)))->toEqualCanonicalizing(array_keys(Arr::dot($en)));
});

it('keeps the profile limits in sync with the schools table', function (): void {
    expect(PlayerProfile::SCHOOL_NAME_MAX)->toBe(120)->and(PlayerProfile::SCHOOL_CITY_MAX)->toBe(100);
});
