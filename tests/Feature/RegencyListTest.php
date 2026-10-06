<?php

use App\Models\User;
use App\Services\RegencyDirectory;
use Illuminate\Support\Facades\Cache;

beforeEach(function (): void {
    config(['scout.driver' => 'null']);
    Cache::forget(RegencyDirectory::CACHE_KEY);
});

it('lists every Indonesian city and regency for guests', function (): void {
    $response = $this->getJson(route('player-details.regencies'))
        ->assertOk()
        ->assertHeader('Cache-Control', 'max-age=86400, public')
        ->assertJsonCount(514, 'regencies')
        ->assertJsonStructure(['regencies' => [['name', 'province']]]);

    $names = collect($response->json('regencies'))->pluck('name');

    expect($names)->toContain('Kota Bogor', 'Kabupaten Bogor')
        ->and($names->unique())->toHaveCount(514)
        ->and($response->json('regencies'))->toContain(['name' => 'Kota Bogor', 'province' => 'Jawa Barat']);
});

it('serves the regency list to signed in players', function (): void {
    $this->actingAs(User::factory()->create())
        ->getJson(route('player-details.regencies'))
        ->assertOk()
        ->assertJsonCount(514, 'regencies');
});

it('throttles the regency list', function (): void {
    foreach (range(1, 30) as $attempt) {
        $this->getJson(route('player-details.regencies'))->assertOk();
    }

    $this->getJson(route('player-details.regencies'))->assertTooManyRequests();
});

it('saves a city picked from the regency list', function (): void {
    $user = User::factory()->create();

    $this->actingAs($user)
        ->patch(route('player-details.update'), [
            'birth_date' => now()->subYears(10)->toDateString(),
            'school_name' => 'SDN 1 Bogor',
            'school_city' => 'Kabupaten Bogor',
        ])
        ->assertSessionHasNoErrors()
        ->assertRedirect();

    expect($user->playerProfile()->sole()->school_city)->toBe('Kabupaten Bogor');
});

it('keeps accepting legacy free text cities', function (): void {
    $user = User::factory()->create();

    $this->actingAs($user)
        ->patch(route('player-details.update'), [
            'birth_date' => now()->subYears(10)->toDateString(),
            'school_name' => 'SDN 1 Bogor',
            'school_city' => 'Bogor Barat',
        ])
        ->assertSessionHasNoErrors();

    expect($user->playerProfile()->sole()->school_city)->toBe('Bogor Barat');
});
