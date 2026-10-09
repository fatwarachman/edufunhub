<?php

use App\Models\GameAccess;
use App\Models\User;

beforeEach(function (): void {
    $this->admin = User::factory()->create(['is_superadmin' => true, 'last_seen_at' => now()]);
});

it('includes current_game when filtering online users who opened a game', function (): void {
    $player = User::factory()->create(['last_seen_at' => now()->subMinutes(2)]);
    GameAccess::factory()->create([
        'user_id' => $player->id,
        'game_key' => 'ping-pong',
        'accessed_at' => now()->subMinutes(3),
    ]);

    $response = $this->actingAs($this->admin)
        ->get('/admin/users?activity=online&sort=last_seen_at&direction=desc');

    $response->assertSuccessful();

    $users = $response->original->getData()['page']['props']['users']['data'];
    $playerData = collect($users)->firstWhere('id', $player->id);

    expect($playerData)->not->toBeNull();
    expect($playerData['current_game'])->toBe('ping-pong');
});

it('sets current_game to null for online users who did not open a game', function (): void {
    $player = User::factory()->create(['last_seen_at' => now()->subMinutes(1)]);

    $response = $this->actingAs($this->admin)
        ->get('/admin/users?activity=online');

    $response->assertSuccessful();

    $users = $response->original->getData()['page']['props']['users']['data'];
    $playerData = collect($users)->firstWhere('id', $player->id);

    expect($playerData)->not->toBeNull();
    expect($playerData['current_game'])->toBeNull();
});

it('does not include current_game when activity filter is not online', function (): void {
    $player = User::factory()->create(['last_seen_at' => now()]);
    GameAccess::factory()->create([
        'user_id' => $player->id,
        'game_key' => 'sky-quiz',
        'accessed_at' => now(),
    ]);

    $response = $this->actingAs($this->admin)
        ->get('/admin/users');

    $response->assertSuccessful();

    $users = $response->original->getData()['page']['props']['users']['data'];
    $playerData = collect($users)->firstWhere('id', $player->id);

    expect($playerData)->not->toBeNull();
    expect($playerData)->not->toHaveKey('current_game');
});

it('picks the most recent game when user opened multiple games', function (): void {
    $player = User::factory()->create(['last_seen_at' => now()]);
    GameAccess::factory()->create([
        'user_id' => $player->id,
        'game_key' => 'sky-quiz',
        'accessed_at' => now()->subMinutes(10),
    ]);
    GameAccess::factory()->create([
        'user_id' => $player->id,
        'game_key' => 'ping-pong',
        'accessed_at' => now()->subMinutes(2),
    ]);

    $response = $this->actingAs($this->admin)
        ->get('/admin/users?activity=online');

    $users = $response->original->getData()['page']['props']['users']['data'];
    $playerData = collect($users)->firstWhere('id', $player->id);

    expect($playerData['current_game'])->toBe('ping-pong');
});

it('ignores game accesses older than the online window', function (): void {
    $player = User::factory()->create(['last_seen_at' => now()]);
    GameAccess::factory()->create([
        'user_id' => $player->id,
        'game_key' => 'crossword',
        'accessed_at' => now()->subMinutes(User::ONLINE_MINUTES + 5),
    ]);

    $response = $this->actingAs($this->admin)
        ->get('/admin/users?activity=online');

    $users = $response->original->getData()['page']['props']['users']['data'];
    $playerData = collect($users)->firstWhere('id', $player->id);

    expect($playerData['current_game'])->toBeNull();
});
