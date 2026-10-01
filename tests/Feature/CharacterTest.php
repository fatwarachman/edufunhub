<?php

use App\Models\PlayerProfile;
use App\Models\User;
use Illuminate\Database\UniqueConstraintViolationException;
use Inertia\Testing\AssertableInertia as Assert;

beforeEach(function (): void {
    config(['scout.driver' => 'null']);
    $this->withoutVite();
});

test('guest cannot update character', function (): void {
    $this->patch('/character', ['color' => 'teal', 'accessory' => 'cap'])->assertRedirect(route('login'));
});

test('character saves across requests and updates same profile', function (): void {
    $user = User::factory()->unverified()->create();
    $this->actingAs($user)->patch('/character', ['color' => 'teal', 'accessory' => 'cap', 'nickname' => 'Pemain'])
        ->assertRedirect(route('character.show'));
    $this->get('/character')->assertInertia(fn (Assert $page) => $page->component('user/character', false)
        ->where('character', ['color' => 'teal', 'accessory' => 'cap', 'nickname' => 'Pemain']));
    $this->patch('/character', ['color' => 'violet', 'accessory' => 'glasses', 'nickname' => null])->assertSessionHasNoErrors();
    $this->assertDatabaseCount('player_profiles', 1);
    $this->assertDatabaseHas('player_profiles', ['user_id' => $user->id, 'color' => 'violet', 'nickname' => null]);
    $this->get('/dashboard')->assertInertia(fn (Assert $page) => $page->component('user/dashboard', false)->where('character.color', 'violet'));
});

test('rejects invalid customization and ownership or score tampering', function (string $field, mixed $value): void {
    $user = User::factory()->create();
    $other = PlayerProfile::factory()->create();
    $payload = array_replace(['color' => 'amber', 'accessory' => 'none'], [$field => $value]);
    $this->actingAs($user)->patch('/character', $payload)->assertSessionHasErrors($field);
    $this->assertDatabaseCount('player_profiles', 1);
    expect($other->fresh()->color)->toBe('amber');
    $this->assertDatabaseCount('point_ledgers', 0);
})->with([
    ['color', 'red'], ['color', ['amber']], ['accessory', 'crown'], ['accessory', null],
    ['nickname', str_repeat('x', 41)], ['nickname', ['name']], ['user_id', 999], ['points', 100],
]);

test('user writes cannot modify another profile', function (): void {
    $other = PlayerProfile::factory()->create(['color' => 'coral']);
    $user = User::factory()->create();
    $this->actingAs($user)->patch('/character', ['color' => 'teal', 'accessory' => 'cap', 'id' => $other->id])
        ->assertSessionHasNoErrors();
    expect($other->fresh()->color)->toBe('coral');
    $this->assertDatabaseHas('player_profiles', ['user_id' => $user->id, 'color' => 'teal']);
});

test('database enforces one profile per user', function (): void {
    $profile = PlayerProfile::factory()->create();
    expect(fn () => PlayerProfile::factory()->create(['user_id' => $profile->user_id]))
        ->toThrow(UniqueConstraintViolationException::class);
});
