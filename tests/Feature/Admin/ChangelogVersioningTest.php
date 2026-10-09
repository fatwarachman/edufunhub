<?php

use App\Models\ChangelogEntry;
use App\Models\User;
use Inertia\Testing\AssertableInertia as Assert;

beforeEach(function (): void {
    config(['scout.driver' => 'null']);
    $this->withoutVite();
    $this->superadmin = User::factory()->create(['is_superadmin' => true, 'locale' => 'id']);
});

/** @param list<array<string, mixed>> $releases */
function changelogFile(array $releases): string
{
    $path = tempnam(sys_get_temp_dir(), 'changelog').'.php';
    file_put_contents($path, '<?php return '.var_export($releases, true).';');

    return $path;
}

/** @return array<string, mixed> */
function changelogChange(string $key, string $type = 'feature'): array
{
    return [
        'key' => $key,
        'type' => $type,
        'title' => ['id' => "Judul {$key}", 'en' => "Title {$key}"],
        'body' => ['id' => "Isi {$key}", 'en' => "Body {$key}"],
    ];
}

it('ships a valid recorded changelog that starts at 0.0.0', function (): void {
    $this->artisan('changelog:sync')->assertSuccessful();

    $versions = ChangelogEntry::query()->whereNotNull('source_key')->pluck('version')->unique();

    expect($versions)->toContain('0.0.0')
        ->and($versions->every(fn (string $version): bool => ChangelogEntry::isValidVersion($version)))->toBeTrue()
        ->and(ChangelogEntry::query()->whereNull('title_en')->whereNotNull('source_key')->exists())->toBeFalse()
        ->and(ChangelogEntry::currentVersion())->toBe($versions->sort(fn ($a, $b) => ChangelogEntry::compareVersions($b, $a))->first());
});

it('upserts recorded changes, drops removed ones and keeps manual notes', function (): void {
    $manual = ChangelogEntry::factory()->create(['version' => '0.0.1', 'source_key' => null]);

    $this->artisan('changelog:sync', ['--path' => changelogFile([
        ['version' => '0.1.0', 'date' => '2026-10-09', 'changes' => [changelogChange('games'), changelogChange('clock', 'fix')]],
        ['version' => '0.0.0', 'date' => '2026-10-01', 'changes' => [changelogChange('baseline')]],
    ])])->assertSuccessful();

    expect(ChangelogEntry::query()->whereNotNull('source_key')->count())->toBe(3)
        ->and(ChangelogEntry::query()->firstWhere('source_key', '0.1.0:clock'))
        ->type->toBe('fix')
        ->title->toBe('Judul clock')
        ->title_en->toBe('Title clock')
        ->is_published->toBeTrue();

    $this->artisan('changelog:sync', ['--path' => changelogFile([
        ['version' => '0.1.0', 'date' => '2026-10-09', 'changes' => [[...changelogChange('games'), 'title' => ['id' => 'Baru', 'en' => 'New']]]],
        ['version' => '0.0.0', 'date' => '2026-10-01', 'changes' => [changelogChange('baseline')]],
    ])])->assertSuccessful();

    expect(ChangelogEntry::query()->whereNotNull('source_key')->pluck('source_key')->sort()->values()->all())->toBe(['0.0.0:baseline', '0.1.0:games'])
        ->and(ChangelogEntry::query()->firstWhere('source_key', '0.1.0:games')->title)->toBe('Baru')
        ->and($manual->fresh())->not->toBeNull();
});

it('rejects a changelog file with invalid versions or missing copy', function (array $release): void {
    $this->artisan('changelog:sync', ['--path' => changelogFile([$release])])->assertFailed();

    expect(ChangelogEntry::query()->count())->toBe(0);
})->with([
    'not semver' => [['version' => 'v1.0', 'date' => '2026-10-09', 'changes' => [changelogChange('a')]]],
    'leading zero' => [['version' => '01.0.0', 'date' => '2026-10-09', 'changes' => [changelogChange('a')]]],
    'bad date' => [['version' => '0.1.0', 'date' => '9 Oct', 'changes' => [changelogChange('a')]]],
    'no changes' => [['version' => '0.1.0', 'date' => '2026-10-09', 'changes' => []]],
    'bad type' => [['version' => '0.1.0', 'date' => '2026-10-09', 'changes' => [changelogChange('a', 'chore')]]],
    'missing english' => [['version' => '0.1.0', 'date' => '2026-10-09', 'changes' => [[...changelogChange('a'), 'body' => ['id' => 'Isi', 'en' => '']]]]],
    'duplicate key' => [['version' => '0.1.0', 'date' => '2026-10-09', 'changes' => [changelogChange('a'), changelogChange('a')]]],
]);

it('orders versions by Semantic Versioning precedence', function (string $lower, string $higher): void {
    expect(ChangelogEntry::compareVersions($lower, $higher))->toBe(-1)
        ->and(ChangelogEntry::compareVersions($higher, $lower))->toBe(1);
})->with([
    ['0.0.0', '0.0.1'],
    ['0.9.0', '0.10.0'],
    ['0.10.3', '1.0.0'],
    ['1.0.0-alpha', '1.0.0-alpha.1'],
    ['1.0.0-alpha.1', '1.0.0-alpha.beta'],
    ['1.0.0-beta.2', '1.0.0-beta.11'],
    ['1.0.0-rc.1', '1.0.0'],
]);

it('reports 0.0.0 as the current version when nothing is published', function (): void {
    ChangelogEntry::factory()->draft()->create(['version' => '0.3.0']);

    expect(ChangelogEntry::currentVersion())->toBe('0.0.0');
});

it('groups the admin changelog by release, newest version first', function (): void {
    ChangelogEntry::factory()->create(['version' => '0.2.0', 'type' => 'feature', 'source_key' => '0.2.0:a']);
    ChangelogEntry::factory()->create(['version' => '0.10.0', 'type' => 'fix', 'source_key' => '0.10.0:b']);
    ChangelogEntry::factory()->create(['version' => '0.10.0', 'type' => 'feature']);
    ChangelogEntry::factory()->draft()->create(['version' => '0.11.0']);

    $this->actingAs($this->superadmin)->get('/admin/changelog')->assertInertia(fn (Assert $page) => $page
        ->component('admin/changelog')
        ->where('currentVersion', '0.10.0')
        ->has('releases', 3)
        ->where('releases.0.version', '0.11.0')
        ->where('releases.0.published', false)
        ->where('releases.1.version', '0.10.0')
        ->where('releases.1.counts.fix', 1)
        ->where('releases.1.counts.feature', 1)
        ->where('releases.2.version', '0.2.0')
        ->where('releases.2.entries.0.recorded', true)
        ->where('types', ['feature', 'improvement', 'fix']));
});

it('limits the changelog page to super admins', function (): void {
    $this->get('/admin/changelog')->assertRedirect();
    $this->actingAs(User::factory()->create())->get('/admin/changelog')->assertForbidden();
});

it('validates manual notes against Semantic Versioning', function (string $version, bool $valid): void {
    $response = $this->actingAs($this->superadmin)->post('/admin/changelog', [
        'version' => $version,
        'title' => 'Catatan',
        'body' => 'Isi catatan',
        'type' => 'improvement',
        'is_published' => true,
    ]);

    $valid ? $response->assertSessionHasNoErrors() : $response->assertSessionHasErrors('version');
})->with([
    ['0.2.1', true],
    ['v0.3.0', true],
    ['1.0.0-beta.1', true],
    ['1.0', false],
    ['01.2.3', false],
    ['latest', false],
]);

it('stores a manual note with its English copy and normalises a leading v', function (): void {
    $this->actingAs($this->superadmin)->post('/admin/changelog', [
        'version' => 'v0.3.0',
        'title' => 'Catatan rilis',
        'title_en' => 'Release note',
        'body' => 'Isi',
        'body_en' => 'Body',
        'type' => 'feature',
        'is_published' => false,
    ])->assertRedirect();

    expect(ChangelogEntry::query()->sole())
        ->version->toBe('0.3.0')
        ->title_en->toBe('Release note')
        ->source_key->toBeNull()
        ->published_at->toBeNull();
});

it('keeps recorded changes read-only in the admin panel', function (): void {
    $entry = ChangelogEntry::factory()->create(['source_key' => '0.1.0:games', 'title' => 'Asli']);

    $this->actingAs($this->superadmin)->put("/admin/changelog/{$entry->id}", [
        'version' => '0.1.0',
        'title' => 'Diubah',
        'body' => 'Isi',
        'type' => 'fix',
        'is_published' => true,
    ])->assertSessionHasErrors('entry');

    $this->actingAs($this->superadmin)->delete("/admin/changelog/{$entry->id}")->assertSessionHasErrors('entry');

    expect($entry->fresh()->title)->toBe('Asli');
});

it('keeps the original publish date when a published note is edited', function (): void {
    $entry = ChangelogEntry::factory()->create(['source_key' => null, 'published_at' => '2026-10-01 10:00:00']);

    $this->actingAs($this->superadmin)->put("/admin/changelog/{$entry->id}", [
        'version' => $entry->version,
        'title' => 'Judul baru',
        'body' => $entry->body,
        'type' => $entry->type,
        'is_published' => true,
    ])->assertRedirect();

    expect($entry->fresh()->published_at->toDateTimeString())->toBe('2026-10-01 10:00:00');
});

it('lists the changelog in the admin sidebar for super admins only', function (): void {
    $navigation = file_get_contents(resource_path('js/lib/admin-navigation.ts'));

    expect($navigation)->toMatch("/title: 'Changelog',\\s*href: '\\/admin\\/changelog',\\s*icon: History,\\s*superadminOnly: true,/");
});
