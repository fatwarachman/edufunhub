<?php

use App\Models\GameHistory;
use App\Models\GameMatch;
use App\Models\SequenceAttempt;
use App\Models\SequenceSet;
use App\Models\User;
use App\Services\SequenceAnalytics;
use Illuminate\Testing\TestResponse;
use Inertia\Testing\AssertableInertia as Assert;

beforeEach(function (): void {
    $this->withoutVite();
    config(['game-service.secret' => str_repeat('r', 40)]);
});

/**
 * @param  array<string, mixed>  $payload
 */
function postRushResult(array $payload): TestResponse
{
    $body = (string) json_encode($payload);
    $timestamp = (string) now()->getTimestamp();

    return test()->call('POST', '/api/internal/game-results', [], [], [], [
        'HTTP_X_GAME_TIMESTAMP' => $timestamp,
        'HTTP_X_GAME_SIGNATURE' => hash_hmac('sha256', $timestamp.'.'.$body, config('game-service.secret')),
        'CONTENT_TYPE' => 'application/json',
        'HTTP_ACCEPT' => 'application/json',
    ], $body);
}

function signedRushGet(string $url): TestResponse
{
    $timestamp = (string) now()->getTimestamp();

    return test()->get($url, [
        'X-Game-Timestamp' => $timestamp,
        'X-Game-Signature' => hash_hmac('sha256', $timestamp.'.', config('game-service.secret')),
    ]);
}

/**
 * @param  array<string, mixed>  $override
 * @return array<string, mixed>
 */
function rushResult(User $user, array $override = []): array
{
    return array_merge([
        'event_id' => 'or-'.$user->id.'-room-1790000000000',
        'user_id' => $user->id,
        'game_key' => 'order-rush',
        'mission' => 'room',
        'grade' => 10,
        'points' => 125,
        'correct' => 10,
        'wrong' => 3,
        'duration_seconds' => 180,
        'completed_at' => now()->toIso8601String(),
        'answers' => [],
        'match' => [
            'key' => 'or-482913-1790000000000',
            'mode' => 'room',
            'pin' => '482913',
            'level' => 10,
            'grade' => 10,
            'started_at' => now()->subMinutes(3)->toIso8601String(),
            'ended_at' => now()->toIso8601String(),
            'finished' => true,
            'players' => [[
                'user_id' => $user->id, 'name' => $user->name, 'grade' => 10, 'rank' => 1,
                'score' => 1540, 'correct' => 10, 'wrong' => 3, 'accuracy' => 76.9,
            ]],
        ],
        'sequence_stats' => [
            ['set' => 'utp-t568b', 'category' => 'UTP_T568B', 'attempts' => 6, 'solved' => 4, 'wrong' => 2, 'total_ms' => 16000, 'slot_errors' => [0, 0, 2, 0, 0, 0, 0, 0]],
            ['set' => 'tcp-handshake', 'category' => 'TCP_HANDSHAKE', 'attempts' => 7, 'solved' => 6, 'wrong' => 1, 'total_ms' => 9000, 'slot_errors' => [0, 1, 0]],
        ],
    ], $override);
}

it('renders the game page with the order rush socket and the portal avatar', function (): void {
    $user = User::factory()->withPlayerDetails()->create();

    $this->actingAs($user)->get('/games/order-rush?pin=482913&role=host')->assertOk()
        ->assertInertia(fn (Assert $page) => $page
            ->component('games/order-rush')
            ->where('wsUrl', '/game-ws/order-rush')
            ->where('pin', '482913')
            ->where('role', 'host')
            ->where('serviceReady', true)
            ->has('player.character.color'));

    $this->actingAs($user)->get('/games/order-rush?pin=12&role=admin')
        ->assertInertia(fn (Assert $page) => $page->where('pin', null)->where('role', null));
});

it('requires login for the game page', function (): void {
    $this->get('/games/order-rush')->assertRedirect('/login');
});

it('signs host and player tokens for separate audiences', function (): void {
    $user = User::factory()->withPlayerDetails()->create();
    $claims = fn (string $token): array => json_decode(base64_decode(strtr(explode('.', $token)[0], '-_', '+/')), true);

    $player = $this->actingAs($user)->postJson('/games/order-rush/token')->assertOk()->json('token');
    $host = $this->actingAs($user)->postJson('/games/order-rush/token', ['role' => 'host'])->assertOk()->json('token');

    expect($claims($player)['game'])->toBe('order-rush')
        ->and($claims($host)['game'])->toBe('order-rush-host')
        ->and($claims($player)['sub'])->toBe($user->id);
});

it('serves the seeded TKJ bank to the signed game service only', function (): void {
    $this->get('/api/internal/sequence-bank')->assertForbidden();

    $response = signedRushGet('/api/internal/sequence-bank')->assertOk();
    $sets = collect($response->json('sets'))->keyBy('key');

    expect($response->json('version'))->toBeString()
        ->and($sets)->toHaveCount(11)
        ->and(collect($sets['utp-t568b']['items'])->pluck('label.id')->all())
        ->toBe(['Putih-Orange', 'Orange', 'Putih-Hijau', 'Biru', 'Putih-Biru', 'Hijau', 'Putih-Cokelat', 'Cokelat'])
        ->and($sets['utp-t568b']['items'][0])->toMatchArray(['color' => '#f8fafc', 'stripe' => '#f97316'])
        ->and(collect($sets['fiber-12']['items'])->pluck('label.id')->all())
        ->toBe(['Biru', 'Orange', 'Hijau', 'Cokelat', 'Abu-abu', 'Putih', 'Merah', 'Hitam', 'Kuning', 'Ungu', 'Pink', 'Tosca'])
        ->and(collect($sets['dhcp-dora']['items'])->pluck('label.id')->all())->toBe(['Discover', 'Offer', 'Request', 'Acknowledge'])
        ->and($sets['tcp-handshake']['kind'])->toBe('protocol');

    SequenceSet::query()->where('key', 'pdu')->update(['is_active' => false]);
    expect(signedRushGet('/api/internal/sequence-bank')->json('sets'))->toHaveCount(10);
});

it('records order rush results with match accuracy and per-set analytics', function (): void {
    $user = User::factory()->create(['locale' => 'id']);

    postRushResult(rushResult($user))->assertCreated();
    postRushResult(rushResult($user))->assertOk()->assertJson(['status' => 'duplicate']);

    $history = GameHistory::query()->where('user_id', $user->id)->sole();
    expect($history->game_key)->toBe('order-rush')
        ->and($history->game_name)->toBe('Order Rush TKJ')
        ->and($user->pointLedgers()->sum('points'))->toBe(125)
        ->and(GameMatch::query()->where('match_key', 'or-482913-1790000000000')->exists())->toBeTrue()
        ->and(SequenceAttempt::query()->count())->toBe(2);

    $attempt = SequenceAttempt::query()->where('set_key', 'utp-t568b')->sole();
    expect($attempt->slot_errors)->toBe([0, 0, 2, 0, 0, 0, 0, 0])
        ->and($attempt->game_history_id)->toBe($history->id);

    $summary = collect(app(SequenceAnalytics::class)->summary())->keyBy('key');
    expect($summary['utp-t568b']['error_rate'])->toBe(33.3)
        ->and($summary['utp-t568b']['worst_slot'])->toBe(2)
        ->and($summary['utp-t568b']['labels'][2])->toBe('White-Green')
        ->and($summary->keys()->first())->toBe('utp-t568b');
});

it('rejects forged or out-of-range order rush results', function (array $override): void {
    $user = User::factory()->create();

    postRushResult(rushResult($user, $override))->assertUnprocessable();
    expect(GameHistory::query()->count())->toBe(0);
})->with([
    'points above cap' => [['points' => 4151]],
    'foreign event id' => [['event_id' => 'eh-1-room-1']],
    'too many slots' => [['sequence_stats' => [['set' => 'x', 'category' => 'X', 'attempts' => 1, 'solved' => 0, 'wrong' => 1, 'total_ms' => 0, 'slot_errors' => array_fill(0, 25, 1)]]]],
    'negative attempts' => [['sequence_stats' => [['set' => 'x', 'category' => 'X', 'attempts' => -1, 'solved' => 0, 'wrong' => 0, 'total_ms' => 0, 'slot_errors' => []]]]],
]);

it('lets super admins manage the sequence bank', function (): void {
    $admin = User::factory()->superadmin()->create();

    $this->actingAs($admin)->get('/admin/sequence-sets')->assertOk()
        ->assertInertia(fn (Assert $page) => $page
            ->component('admin/sequence-sets/index')
            ->has('sets', 11)
            ->where('days', 30));

    $this->actingAs($admin)->post('/admin/sequence-sets', [
        'title_id' => 'Langkah Crimping',
        'category' => 'crimping steps',
        'kind' => 'protocol',
        'items' => [
            ['label_id' => 'Kupas jaket'],
            ['label_id' => 'Susun warna'],
            ['label_id' => 'Potong rata'],
            ['label_id' => 'Crimping'],
        ],
    ])->assertRedirect()->assertSessionHasNoErrors();

    $set = SequenceSet::query()->where('key', 'langkah-crimping')->sole();
    expect($set->category)->toBe('CRIMPING_STEPS')
        ->and($set->toGamePayload()['items'][0]['label'])->toBe(['id' => 'Kupas jaket', 'en' => 'Kupas jaket']);

    $this->actingAs($admin)->put("/admin/sequence-sets/{$set->id}", [
        'key' => 'renamed',
        'title_id' => 'Langkah Crimping RJ45',
        'category' => 'CRIMPING',
        'kind' => 'cable',
        'items' => [['label_id' => 'A', 'color' => '#ffffff'], ['label_id' => 'B']],
    ])->assertSessionHasErrors('items.1.color');

    $this->actingAs($admin)->patch("/admin/sequence-sets/{$set->id}/toggle")->assertRedirect();
    expect($set->fresh()->is_active)->toBeFalse();

    $this->actingAs($admin)->delete("/admin/sequence-sets/{$set->id}")->assertRedirect();
    expect(SequenceSet::query()->whereKey($set->id)->exists())->toBeFalse();
});

it('validates sequence sets', function (array $payload, string $error): void {
    $admin = User::factory()->superadmin()->create();

    $this->actingAs($admin)->post('/admin/sequence-sets', array_merge([
        'title_id' => 'Urutan Uji',
        'category' => 'TEST',
        'kind' => 'protocol',
        'items' => [['label_id' => 'A'], ['label_id' => 'B']],
    ], $payload))->assertSessionHasErrors($error);
})->with([
    'one piece' => [['items' => [['label_id' => 'A']]], 'items'],
    'thirteen pieces' => [['items' => array_map(fn (int $i): array => ['label_id' => "P{$i}"], range(1, 13))], 'items'],
    'duplicate labels' => [['items' => [['label_id' => 'A'], ['label_id' => 'A']]], 'items.0.label_id'],
    'bad colour' => [['items' => [['label_id' => 'A', 'color' => 'red'], ['label_id' => 'B']]], 'items.0.color'],
    'unknown kind' => [['kind' => 'video'], 'kind'],
    'taken key' => [['key' => 'utp-t568b'], 'key'],
]);

it('keeps at least one active sequence set', function (): void {
    $admin = User::factory()->superadmin()->create();
    SequenceSet::query()->where('key', '!=', 'pdu')->update(['is_active' => false]);
    $last = SequenceSet::query()->where('key', 'pdu')->sole();

    $this->actingAs($admin)->patch("/admin/sequence-sets/{$last->id}/toggle")->assertSessionHasErrors('sequence_set');
    $this->actingAs($admin)->delete("/admin/sequence-sets/{$last->id}")->assertSessionHasErrors('sequence_set');
    expect($last->fresh()->is_active)->toBeTrue();
});

it('hides the sequence bank from regular users', function (): void {
    $user = User::factory()->create();

    $this->actingAs($user)->get('/admin/sequence-sets')->assertForbidden();
    $this->actingAs($user)->post('/admin/sequence-sets', [])->assertForbidden();
});

it('ships the how-to-play video and slides', function (string $file, string $signature) {
    $path = public_path('tutorials/'.$file);

    expect($path)->toBeFile()
        ->and(file_get_contents($path, length: 12))->toContain($signature);
})->with([
    'video' => ['cara-bermain-order-rush.mp4', 'ftyp'],
    'slides' => ['cara-bermain-order-rush.pdf', '%PDF'],
]);

it('seeds straight and crossover cables crimped on both ends', function (): void {
    $sets = collect(signedRushGet('/api/internal/sequence-bank')->json('sets'))->keyBy('key');
    $t568b = ['Putih-Orange', 'Orange', 'Putih-Hijau', 'Biru', 'Putih-Biru', 'Hijau', 'Putih-Cokelat', 'Cokelat'];
    $t568a = ['Putih-Hijau', 'Hijau', 'Putih-Orange', 'Biru', 'Putih-Biru', 'Orange', 'Putih-Cokelat', 'Cokelat'];

    expect(collect($sets['utp-straight']['items'])->pluck('label.id')->all())->toBe([...$t568b, ...$t568b])
        ->and(collect($sets['utp-cross']['items'])->pluck('label.id')->all())->toBe([...$t568b, ...$t568a])
        ->and($sets['utp-cross']['ends'])->toBe([
            ['id' => 'Ujung A (T568B)', 'en' => 'End A (T568B)'],
            ['id' => 'Ujung B (T568A)', 'en' => 'End B (T568A)'],
        ])
        ->and($sets['utp-t568b'])->not->toHaveKey('ends');
});

it('validates two-end cable sets in the admin editor', function (array $override, string $error): void {
    $admin = User::factory()->superadmin()->create();
    $wire = fn (string $label): array => ['label_id' => $label, 'color' => '#2563eb'];

    $this->actingAs($admin)->post('/admin/sequence-sets', [
        'title_id' => 'Kabel Rollover',
        'category' => 'UTP_ROLLOVER',
        'kind' => 'cable',
        'ends' => [['id' => 'Ujung A'], ['id' => 'Ujung B']],
        'items' => array_map($wire, ['A', 'B', 'C', 'B', 'A', 'C']),
        ...$override,
    ])->assertSessionHasErrors($error);

    expect(SequenceSet::query()->where('key', 'kabel-rollover')->exists())->toBeFalse();
})->with([
    'odd piece count' => [['items' => [['label_id' => 'A', 'color' => '#2563eb'], ['label_id' => 'B', 'color' => '#2563eb'], ['label_id' => 'C', 'color' => '#2563eb']]], 'items'],
    'duplicate in one end' => [['items' => [['label_id' => 'A', 'color' => '#2563eb'], ['label_id' => 'A', 'color' => '#2563eb'], ['label_id' => 'B', 'color' => '#2563eb'], ['label_id' => 'C', 'color' => '#2563eb']]], 'items'],
    'protocol with ends' => [['kind' => 'protocol'], 'ends'],
    'three ends' => [['ends' => [['id' => 'A'], ['id' => 'B'], ['id' => 'C']]], 'ends'],
    'unnamed end' => [['ends' => [['id' => 'Ujung A'], ['id' => '']]], 'ends.1.id'],
]);

it('saves a two-end cable set and sends its ends to the game service', function (): void {
    $admin = User::factory()->superadmin()->create();
    $wire = fn (string $label): array => ['label_id' => $label, 'color' => '#2563eb'];

    $this->actingAs($admin)->post('/admin/sequence-sets', [
        'title_id' => 'Kabel Rollover',
        'category' => 'UTP_ROLLOVER',
        'kind' => 'cable',
        'ends' => [['id' => 'Ujung A', 'en' => 'End A'], ['id' => 'Ujung B']],
        'items' => array_map($wire, ['1', '2', '3', '3', '2', '1']),
    ])->assertRedirect()->assertSessionHasNoErrors();

    $payload = SequenceSet::query()->where('key', 'kabel-rollover')->sole()->toGamePayload();
    expect($payload['ends'])->toBe([['id' => 'Ujung A', 'en' => 'End A'], ['id' => 'Ujung B', 'en' => 'Ujung B']])
        ->and($payload['items'])->toHaveCount(6);
});
