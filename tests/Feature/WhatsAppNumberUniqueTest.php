<?php

use App\Models\User;
use App\Services\WhatsApp\PhoneNumber;
use Illuminate\Database\UniqueConstraintViolationException;
use Illuminate\Support\Facades\DB;

beforeEach(function (): void {
    config(['scout.driver' => 'null']);
    $this->withoutVite();
});

function uniqueWizardPayload(string $number): array
{
    return [
        'name' => 'Rani Putri',
        'birth_date' => now()->subYears(10)->toDateString(),
        'grade' => 4,
        'school_name' => 'SDN 1 Bogor',
        'whatsapp_number' => $number,
        'whatsapp_notifications' => true,
    ];
}

function uniqueDetailsPayload(string $number): array
{
    return ['birth_date' => '2015-03-01', 'school_name' => 'SD Ceria', 'whatsapp_number' => $number];
}

test('accepted prefixes are stored in the 62 form', function (string $input): void {
    $user = User::factory()->profilePending()->create();

    $this->actingAs($user)->post(route('profile-wizard.store'), uniqueWizardPayload($input))->assertSessionHasNoErrors();

    expect($user->fresh()->whatsapp_number)->toBe('6281234567890');
})->with([
    'leading 0' => ['081234567890'],
    'leading 62' => ['6281234567890'],
    'leading +62' => ['+6281234567890'],
    'separators' => ['+62 812-3456.7890'],
    'brackets' => ['(0812) 3456 7890'],
]);

test('numbers without a 0, 62 or +62 prefix are rejected', function (string $input): void {
    $user = User::factory()->profilePending()->create();

    $this->actingAs($user)->post(route('profile-wizard.store'), uniqueWizardPayload($input))
        ->assertSessionHasErrors(['whatsapp_number' => __('whatsapp.validation.player_number')]);

    expect($user->fresh()->whatsapp_number)->toBeNull();
})->with([
    'bare 8' => ['81234567890'],
    'other country' => ['+6591234567'],
    'double zero' => ['006281234567890'],
    'zero after prefix' => ['+62081234567890'],
    'too short' => ['0812345'],
    'too long' => ['08123456789012'],
    'letters' => ['0812abc67890'],
    'plus in the middle' => ['0812+34567890'],
]);

test('a number already owned by another account is rejected in every format', function (string $input): void {
    User::factory()->create(['whatsapp_number' => '6281234567890']);
    $user = User::factory()->profilePending()->create();

    $this->actingAs($user)->post(route('profile-wizard.store'), uniqueWizardPayload($input))
        ->assertSessionHasErrors(['whatsapp_number' => __('whatsapp.validation.taken')]);

    expect($user->fresh()->profile_completed_at)->toBeNull();
})->with(['081234567890', '6281234567890', '+62 812 3456 7890']);

test('the profile page also refuses a number owned by another account', function (): void {
    User::factory()->create(['whatsapp_number' => '6281234567890']);
    $user = User::factory()->create();

    $this->actingAs($user)->patch(route('player-details.update'), uniqueDetailsPayload('0812-3456-7890'))
        ->assertSessionHasErrors(['whatsapp_number' => __('whatsapp.validation.taken')]);

    expect($user->fresh()->whatsapp_number)->toBeNull();
});

test('players can keep their own number when saving again', function (): void {
    $user = User::factory()->create(['whatsapp_number' => '6281234567890']);

    $this->actingAs($user)->patch(route('player-details.update'), uniqueDetailsPayload('081234567890'))->assertSessionHasNoErrors();

    expect($user->fresh()->whatsapp_number)->toBe('6281234567890');
});

test('several accounts may leave the number empty', function (): void {
    [$ana, $budi] = User::factory()->count(2)->create();

    $this->actingAs($ana)->patch(route('player-details.update'), uniqueDetailsPayload(''))->assertSessionHasNoErrors();
    $this->actingAs($budi)->patch(route('player-details.update'), uniqueDetailsPayload(''))->assertSessionHasNoErrors();

    expect(User::query()->whereNull('whatsapp_number')->count())->toBe(2);
});

test('the database refuses duplicate numbers that skip validation', function (): void {
    User::factory()->create(['whatsapp_number' => '6281234567890']);

    expect(fn () => User::factory()->create(['whatsapp_number' => '6281234567890']))
        ->toThrow(UniqueConstraintViolationException::class);
});

test('the duplicate cleanup keeps the oldest owner and sends the rest back to the wizard', function (): void {
    $migration = require database_path('migrations/2026_11_01_090002_make_whatsapp_number_unique_on_users_table.php');
    $migration->down();

    $older = User::factory()->create(['whatsapp_number' => '6281234567890', 'whatsapp_welcomed_at' => now()]);
    $newer = User::factory()->create(['whatsapp_number' => '6281234567890', 'whatsapp_welcomed_at' => now()]);
    $other = User::factory()->create(['whatsapp_number' => '6289876543210']);

    $migration->up();

    expect($older->fresh()->whatsapp_number)->toBe('6281234567890')
        ->and($older->fresh()->profile_completed_at)->not->toBeNull()
        ->and($newer->fresh()->whatsapp_number)->toBeNull()
        ->and($newer->fresh()->whatsapp_welcomed_at)->toBeNull()
        ->and($newer->fresh()->profile_completed_at)->toBeNull()
        ->and($other->fresh()->whatsapp_number)->toBe('6289876543210')
        ->and(DB::table('users')->where('whatsapp_number', '6281234567890')->count())->toBe(1);
});

test('the normalizer maps only the allowed prefixes', function (?string $input, ?string $expected): void {
    expect(PhoneNumber::normalizeIndonesian($input))->toBe($expected);
})->with([
    ['081234567890', '6281234567890'],
    ['6281234567890', '6281234567890'],
    ['+6281234567890', '6281234567890'],
    ['  ', null],
    [null, null],
    ['81234567890', '81234567890'],
    ['006281234567890', '006281234567890'],
]);
