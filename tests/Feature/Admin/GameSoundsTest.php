<?php

use App\Models\User;
use App\Services\GameSounds;
use Inertia\Testing\AssertableInertia as Assert;

beforeEach(function (): void {
    $this->withoutVite();
});

it('shows the sound settings page to super admins with the defaults', function (): void {
    $this->actingAs(User::factory()->create(['is_superadmin' => true]))
        ->get('/admin/sound-settings')
        ->assertOk()
        ->assertInertia(fn (Assert $page) => $page
            ->component('admin/sound-settings')
            ->where('settings', GameSounds::DEFAULTS)
            ->where('settings.correct', 'bell')
            ->where('settings.wrong', 'buzzer')
            ->where('options.correct', GameSounds::CORRECT)
            ->where('options.wrong', GameSounds::WRONG));
});

it('blocks sound settings for regular admins and players', function (): void {
    $player = User::factory()->create();

    $this->actingAs($player)->get('/admin/sound-settings')->assertForbidden();
    $this->actingAs($player)->put('/admin/sound-settings', GameSounds::DEFAULTS)->assertForbidden();
});

it('saves sound settings and shares them with every page', function (): void {
    $admin = User::factory()->create(['is_superadmin' => true]);

    $this->actingAs($admin)
        ->put('/admin/sound-settings', ['enabled' => false, 'volume' => 35, 'correct' => 'chime', 'wrong' => 'boing'])
        ->assertRedirect()
        ->assertSessionHasNoErrors();

    expect(GameSounds::current())->toBe(['enabled' => false, 'volume' => 35, 'correct' => 'chime', 'wrong' => 'boing']);

    $player = User::factory()->withPlayerDetails()->create();
    $this->actingAs($player)->get('/portal')->assertInertia(fn (Assert $page) => $page
        ->where('gameSounds.enabled', false)
        ->where('gameSounds.volume', 35)
        ->where('gameSounds.correct', 'chime')
        ->where('gameSounds.wrong', 'boing'));
});

it('rejects unknown sounds and out of range volume', function (array $payload, string $field): void {
    $this->actingAs(User::factory()->create(['is_superadmin' => true]))
        ->put('/admin/sound-settings', [...GameSounds::DEFAULTS, ...$payload])
        ->assertSessionHasErrors($field);

    expect(GameSounds::current())->toBe(GameSounds::DEFAULTS);
})->with([
    'unknown correct sound' => [['correct' => 'airhorn'], 'correct'],
    'unknown wrong sound' => [['wrong' => 'scream'], 'wrong'],
    'volume too loud' => [['volume' => 150], 'volume'],
    'negative volume' => [['volume' => -1], 'volume'],
    'missing enabled' => [['enabled' => null], 'enabled'],
]);
