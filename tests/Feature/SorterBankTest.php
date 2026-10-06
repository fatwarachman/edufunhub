<?php

use App\Models\SorterSet;
use App\Models\User;
use Illuminate\Testing\TestResponse;
use Inertia\Testing\AssertableInertia as Assert;

beforeEach(function (): void {
    $this->withoutVite();
    config(['game-service.secret' => str_repeat('s', 40)]);
    $this->superadmin = User::factory()->create(['is_superadmin' => true]);
});

function signedSorterGet(string $url): TestResponse
{
    $timestamp = (string) now()->getTimestamp();

    return test()->getJson($url, [
        'X-Game-Timestamp' => $timestamp,
        'X-Game-Signature' => hash_hmac('sha256', $timestamp.'.', config('game-service.secret')),
    ]);
}

/**
 * @param  array<string, mixed>  $overrides
 * @return array<string, mixed>
 */
function sorterPayload(array $overrides = []): array
{
    return array_merge([
        'title_id' => 'Layer OSI Perangkat',
        'title_en' => 'OSI layer of devices',
        'description_id' => 'Pilah perangkat ke layer OSI.',
        'bins' => [
            ['name_id' => 'Layer 1', 'name_en' => 'Layer 1', 'color' => '#2563EB'],
            ['name_id' => 'Layer 2', 'name_en' => '', 'color' => '#c2410c'],
            ['name_id' => 'Layer 3', 'name_en' => 'Layer 3', 'color' => '#7c3aed'],
        ],
        'items' => [
            ['label' => 'Hub', 'hint_id' => 'Penguat sinyal', 'bin' => 'layer-1', 'level' => 1],
            ['label' => 'Switch', 'hint_id' => 'MAC address', 'hint_en' => 'MAC address', 'bin' => 'layer-2', 'level' => 1],
            ['label' => 'Router', 'hint_id' => 'IP address', 'bin' => 'layer-3', 'level' => 2],
        ],
        'is_active' => true,
    ], $overrides);
}

it('seeds the built-in sorter sets that mirror the game service', function (): void {
    $sets = SorterSet::query()->ordered()->get()->keyBy('key');

    expect($sets->keys()->all())->toBe(['ports-basic', 'ports-services'])
        ->and(array_column($sets['ports-basic']->bins, 'name_id'))->toBe(['HTTP/WEB', 'DNS', 'SSH/REMOTE', 'MAIL'])
        ->and($sets['ports-services']->bins)->toHaveCount(6)
        ->and(collect($sets['ports-basic']->items)->firstWhere('label', '3306'))->toMatchArray(['bin' => 'remote', 'level' => 1]);
});

it('serves the active sorter bank only with a valid signature, with bin indexes and 0-based levels', function (): void {
    $this->getJson('/api/internal/sorter-bank')->assertForbidden();

    SorterSet::factory()->create(['key' => 'osi-devices']);
    $response = signedSorterGet('/api/internal/sorter-bank')->assertOk();
    $sets = collect($response->json('sets'))->keyBy('key');

    expect($response->json('version'))->toBeString()
        ->and($sets)->toHaveCount(3)
        ->and($sets['osi-devices']['bins'][1])->toBe(['key' => 'layer-2', 'name' => ['id' => 'LAYER 2', 'en' => 'LAYER 2'], 'color' => '#c2410c'])
        ->and($sets['osi-devices']['items'][2])->toBe(['label' => 'Router', 'hint' => ['id' => 'IP address', 'en' => 'IP address'], 'bin' => 2, 'level' => 0])
        ->and(collect($sets['ports-basic']['items'])->firstWhere('label', '8080')['level'])->toBe(2);

    $before = $response->json('version');
    SorterSet::query()->where('key', 'ports-services')->update(['is_active' => false]);
    $after = signedSorterGet('/api/internal/sorter-bank');

    expect($after->json('sets'))->toHaveCount(2)->and($after->json('version'))->not->toBe($before);
});

it('shows the sorter bank admin page to superadmins only', function (): void {
    $this->actingAs(User::factory()->create())->get('/admin/games/port-sorter/sets')->assertForbidden();

    $this->actingAs($this->superadmin)->get('/admin/games/port-sorter/sets')->assertOk()->assertInertia(fn (Assert $page) => $page
        ->component('admin/sorter-sets/index')
        ->has('sets', 2)
        ->where('sets.0.key', 'ports-basic')
        ->where('limits.minBins', 2)
        ->where('limits.maxBins', 6));
});

it('creates a sorter set with any bins, deriving keys and normalising colours', function (): void {
    $this->actingAs($this->superadmin)->post('/admin/games/port-sorter/sets', sorterPayload())->assertSessionHasNoErrors();

    $set = SorterSet::query()->where('key', 'layer-osi-perangkat')->sole();
    expect(array_column($set->bins, 'key'))->toBe(['layer-1', 'layer-2', 'layer-3'])
        ->and($set->bins[0]['color'])->toBe('#2563eb')
        ->and($set->bins[1]['name_en'])->toBeNull()
        ->and($set->created_by)->toBe($this->superadmin->id)
        ->and($set->toGamePayload()['bins'][1]['name']['en'])->toBe('Layer 2');
});

it('rejects broken sorter sets', function (array $overrides, string $error): void {
    $this->actingAs($this->superadmin)->post('/admin/games/port-sorter/sets', sorterPayload($overrides))->assertSessionHasErrors($error);

    expect(SorterSet::query()->count())->toBe(2);
})->with([
    'one bin' => [['bins' => [['name_id' => 'Solo', 'color' => '#111111']], 'items' => [['label' => 'a', 'bin' => 'solo', 'level' => 1]]], 'bins'],
    'seven bins' => [['bins' => array_map(fn (int $i): array => ['name_id' => 'Bin '.$i, 'color' => '#111111'], range(1, 7))], 'bins'],
    'duplicate bin names' => [['bins' => [['name_id' => 'Sama', 'color' => '#111111'], ['name_id' => 'Sama', 'color' => '#222222']]], 'bins.1.key'],
    'bad colour' => [['bins' => [['name_id' => 'A', 'color' => 'red'], ['name_id' => 'B', 'color' => '#222222']]], 'bins.0.color'],
    'unknown bin' => [['items' => [['label' => 'Hub', 'bin' => 'layer-1', 'level' => 1], ['label' => 'Switch', 'bin' => 'layer-9', 'level' => 1], ['label' => 'Router', 'bin' => 'layer-3', 'level' => 1]]], 'items.1.bin'],
    'label too long' => [['items' => [['label' => 'Terlalu panjang sekali', 'bin' => 'layer-1', 'level' => 1], ['label' => 'Switch', 'bin' => 'layer-2', 'level' => 1], ['label' => 'Router', 'bin' => 'layer-3', 'level' => 1]]], 'items.0.label'],
    'duplicate labels' => [['items' => [['label' => 'Hub', 'bin' => 'layer-1', 'level' => 1], ['label' => 'Hub', 'bin' => 'layer-2', 'level' => 1], ['label' => 'Router', 'bin' => 'layer-3', 'level' => 1]]], 'items.1.label'],
    'fewer items than bins' => [['items' => [['label' => 'Hub', 'bin' => 'layer-1', 'level' => 1], ['label' => 'Switch', 'bin' => 'layer-2', 'level' => 1]]], 'items'],
    'level out of range' => [['items' => [['label' => 'Hub', 'bin' => 'layer-1', 'level' => 7], ['label' => 'Switch', 'bin' => 'layer-2', 'level' => 1], ['label' => 'Router', 'bin' => 'layer-3', 'level' => 1]]], 'items.0.level'],
    'level 1 single bin' => [['items' => [['label' => 'Hub', 'bin' => 'layer-1', 'level' => 1], ['label' => 'Switch', 'bin' => 'layer-2', 'level' => 3], ['label' => 'Router', 'bin' => 'layer-3', 'level' => 3]]], 'items'],
]);

it('updates a sorter set but keeps its key, and forbids non-superadmins', function (): void {
    $set = SorterSet::factory()->create(['key' => 'osi-devices']);

    $this->actingAs(User::factory()->create())->put("/admin/games/port-sorter/sets/{$set->id}", sorterPayload())->assertForbidden();

    $this->actingAs($this->superadmin)->put("/admin/games/port-sorter/sets/{$set->id}", sorterPayload(['key' => 'renamed', 'title_id' => 'Judul Baru']))
        ->assertSessionHasNoErrors();

    expect($set->fresh()->key)->toBe('osi-devices')->and($set->fresh()->title_id)->toBe('Judul Baru');
});

it('toggles and deletes sorter sets but always keeps one active', function (): void {
    $basic = SorterSet::query()->where('key', 'ports-basic')->sole();
    $services = SorterSet::query()->where('key', 'ports-services')->sole();

    $this->actingAs($this->superadmin)->patch("/admin/games/port-sorter/sets/{$services->id}/toggle")->assertSessionHasNoErrors();
    expect($services->fresh()->is_active)->toBeFalse();

    $this->patch("/admin/games/port-sorter/sets/{$basic->id}/toggle")->assertSessionHasErrors('sorter_set');
    $this->delete("/admin/games/port-sorter/sets/{$basic->id}")->assertSessionHasErrors('sorter_set');
    expect($basic->fresh()->is_active)->toBeTrue();

    $this->delete("/admin/games/port-sorter/sets/{$services->id}")->assertSessionHasNoErrors();
    expect(SorterSet::query()->count())->toBe(1);
});

it('moves the sorter bank under the port sorter game page and redirects old links', function (): void {
    $set = SorterSet::query()->firstOrFail();

    expect(route('admin.sorter-sets.index', absolute: false))->toBe('/admin/games/port-sorter/sets')
        ->and(route('admin.sorter-sets.toggle', $set, false))->toBe("/admin/games/port-sorter/sets/{$set->id}/toggle");

    $this->actingAs($this->superadmin)->get('/admin/sorter-sets?page=2')->assertStatus(301)->assertRedirect('/admin/games/port-sorter/sets?page=2');
    $this->get("/admin/sorter-sets/{$set->id}")->assertStatus(301)->assertRedirect("/admin/games/port-sorter/sets/{$set->id}");

    $this->get('/admin/games/port-sorter')->assertOk()->assertInertia(fn (Assert $page) => $page->component('admin/games/show')->where('game.key', 'port-sorter'));

    $tabs = (string) file_get_contents(resource_path('js/components/admin/game-tabs.tsx'));
    expect($tabs)->toContain("'/admin/games/port-sorter/sets'")
        ->and((string) file_get_contents(resource_path('js/pages/admin/sorter-sets/index.tsx')))->toContain('<GameTabs game="port-sorter" active="sets" />');
});
