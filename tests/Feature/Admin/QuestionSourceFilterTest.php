<?php

use App\Models\Question;
use App\Models\User;
use Illuminate\Support\Facades\DB;
use Inertia\Testing\AssertableInertia as Assert;

beforeEach(function (): void {
    config(['scout.driver' => 'null']);
    $this->withoutVite();
    Question::query()->delete();
    $this->admin = User::factory()->superadmin()->create();
    $this->teacher = User::factory()->teacher()->create(['name' => 'Bu Sari', 'email' => 'sari-secret@example.test']);

    Question::factory()->count(3)->create(['source' => Question::SOURCE_AI]);
    Question::factory()->count(2)->create(['source' => 'teacher', 'created_by' => $this->teacher->id]);
    Question::factory()->create(['source' => 'import', 'created_by' => $this->teacher->id, 'points' => 10]);
    Question::factory()->count(4)->create(['source' => 'admin', 'created_by' => $this->admin->id]);
    Question::factory()->count(5)->create(['source' => 'system', 'points' => 0]);
});

/** @return list<string> */
function listedSources(Assert $page): array
{
    return collect($page->toArray()['props']['questions']['data'])->pluck('source')->unique()->sort()->values()->all();
}

it('filters the list by creator type', function (string $source, int $total, array $sources): void {
    $this->actingAs($this->admin)->get("/admin/questions?source={$source}")->assertOk()->assertInertia(function (Assert $page) use ($source, $total, $sources): void {
        $page->where('filters.source', $source);
        $page->component('admin/questions/index')->where('mode', 'list')->where('questions.total', $total);
        expect(listedSources($page))->toBe($sources);
    });
})->with([
    'ai' => ['ai', 3, ['ai']],
    'teacher' => ['teacher', 3, ['import', 'teacher']],
    'admin' => ['admin', 4, ['admin']],
    'system' => ['system', 5, ['system']],
]);

it('returns per-creator counts in one aggregate', function (): void {
    $this->actingAs($this->admin)->get('/admin/questions?subject=all')->assertInertia(fn (Assert $page) => $page
        ->where('questions.total', 15)
        ->where('sourceCounts', ['all' => 15, 'ai' => 3, 'teacher' => 3, 'admin' => 4, 'system' => 5])
        ->where('summary.teacher', 3)
        ->where('summary.ai', 3));
});

it('keeps creator counts independent of the creator filter but scoped to other filters', function (): void {
    $this->actingAs($this->admin)->get('/admin/questions?source=ai&bonus=1')->assertInertia(fn (Assert $page) => $page
        ->where('questions.total', 0)
        ->where('sourceCounts.all', 1)
        ->where('sourceCounts.teacher', 1)
        ->where('sourceCounts.ai', 0));
});

it('ignores unknown creator values', function (): void {
    $this->actingAs($this->admin)->get('/admin/questions?subject=all&source=hacker')->assertOk()->assertInertia(fn (Assert $page) => $page
        ->where('questions.total', 15)
        ->missing('filters.source'));

    $this->get('/admin/questions?source=hacker')->assertInertia(fn (Assert $page) => $page->where('mode', 'subjects'));
});

it('keeps the legacy source=bonus link working as the bonus filter', function (): void {
    $this->actingAs($this->admin)->get('/admin/questions?source=bonus')->assertOk()->assertInertia(fn (Assert $page) => $page
        ->where('mode', 'list')
        ->where('questions.total', 1)
        ->where('questions.data.0.points', 10)
        ->where('filters.bonus', '1')
        ->missing('filters.source'));

    $this->get('/admin/questions?bonus=1')->assertInertia(fn (Assert $page) => $page->where('questions.total', 1));
});

it('exposes teacher authors by name only and filters by teacher', function (): void {
    $other = User::factory()->teacher()->create(['name' => 'Pak Budi']);
    Question::factory()->create(['source' => 'teacher', 'created_by' => $other->id]);

    $response = $this->actingAs($this->admin)->get('/admin/questions?source=teacher');
    $response->assertInertia(fn (Assert $page) => $page
        ->where('questions.total', 4)
        ->where('questions.data', fn ($rows): bool => collect($rows)->pluck('author')->unique()->sort()->values()->all() === ['Bu Sari', 'Pak Budi'])
        ->where('teachers', [['id' => $this->teacher->id, 'name' => 'Bu Sari'], ['id' => $other->id, 'name' => 'Pak Budi']]));
    expect($response->getContent())->not->toContain('sari-secret@example.test');

    $this->get("/admin/questions?source=teacher&author={$other->id}")->assertInertia(fn (Assert $page) => $page
        ->where('questions.total', 1)
        ->where('questions.data.0.author', 'Pak Budi'));

    $this->get("/admin/questions?source=ai&author={$other->id}")->assertInertia(fn (Assert $page) => $page
        ->where('questions.total', 3)
        ->missing('filters.author')
        ->where('teachers', []));
});

it('paginates teacher questions by 20', function (): void {
    Question::factory()->count(25)->create(['source' => 'teacher', 'created_by' => $this->teacher->id]);

    $this->actingAs($this->admin)->get('/admin/questions?source=teacher')->assertInertia(fn (Assert $page) => $page
        ->where('questions.per_page', 20)
        ->where('questions.total', 28)
        ->has('questions.data', 20));
});

it('loads authors without N+1 queries', function (): void {
    $teachers = User::factory()->teacher()->count(5)->create();
    $teachers->each(fn (User $teacher) => Question::factory()->count(2)->create(['source' => 'teacher', 'created_by' => $teacher->id]));
    $this->actingAs($this->admin)->get('/admin/questions?source=teacher')->assertOk();

    DB::enableQueryLog();
    $this->get('/admin/questions?source=teacher')->assertOk();
    $userQueries = collect(DB::getQueryLog())->filter(fn (array $query): bool => str_contains($query['query'], 'from "users"'));
    DB::disableQueryLog();

    expect($userQueries->count())->toBeLessThanOrEqual(4);
});

it('forbids non-admins', function (): void {
    $this->actingAs($this->teacher)->get('/admin/questions?source=teacher')->assertForbidden();
});
