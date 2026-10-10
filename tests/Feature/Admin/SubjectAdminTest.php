<?php

use App\Models\Question;
use App\Models\Subject;
use App\Models\User;
use Illuminate\Testing\TestResponse;
use Inertia\Testing\AssertableInertia as Assert;

const SUBJECT_GAME_SECRET = 'subject-game-secret-of-at-least-32-chars';

beforeEach(function (): void {
    config(['scout.driver' => 'null', 'game-service.secret' => SUBJECT_GAME_SECRET]);
    $this->withoutVite();
    $this->admin = User::factory()->create(['is_superadmin' => true, 'locale' => 'id']);
});

function subjectBank(): TestResponse
{
    $timestamp = (string) now()->getTimestamp();

    return test()->getJson('/api/internal/question-bank', [
        'X-Game-Timestamp' => $timestamp,
        'X-Game-Signature' => hash_hmac('sha256', $timestamp.'.', SUBJECT_GAME_SECRET),
    ]);
}

/** @return array<string, mixed> */
function subjectPayload(array $overrides = []): array
{
    return [
        'name_id' => 'Seni Budaya',
        'name_en' => 'Arts',
        'icon' => 'palette',
        'color' => '#FF9ECF',
        'ai_hint' => 'Seni Budaya (arts and culture: music, dance, crafts)',
        'is_active' => true,
        ...$overrides,
    ];
}

it('ships the seven built-in subjects', function (): void {
    expect(Subject::activeKeys())->toBe(['math', 'science', 'language', 'social', 'english', 'civics', 'tkj'])
        ->and(Subject::query()->where('is_system', true)->count())->toBe(7);
});

it('lists subjects with question counts for super admins only', function (): void {
    $total = Question::query()->where('subject', 'math')->count();
    $active = Question::query()->where('subject', 'math')->where('is_active', true)->count();
    Question::factory()->count(2)->create(['subject' => 'math']);
    Question::factory()->create(['subject' => 'math', 'is_active' => false]);

    $this->actingAs($this->admin)->get('/admin/subjects')
        ->assertOk()
        ->assertInertia(fn (Assert $page) => $page
            ->component('admin/subjects/index')
            ->has('subjects', 7)
            ->where('subjects.0.key', 'math')
            ->where('subjects.0.questions', $total + 3)
            ->where('subjects.0.active_questions', $active + 2)
            ->has('icons'));

    $this->actingAs(User::factory()->create())->get('/admin/subjects')->assertForbidden();
});

it('adds a subject with a key derived from its name', function (): void {
    $this->actingAs($this->admin)->post('/admin/subjects', subjectPayload())->assertSessionHasNoErrors();

    $subject = Subject::query()->where('key', 'seni-budaya')->firstOrFail();
    expect($subject->name_en)->toBe('Arts')
        ->and($subject->color)->toBe('#ff9ecf')
        ->and($subject->is_system)->toBeFalse()
        ->and($subject->sort_order)->toBeGreaterThan(60)
        ->and(Subject::activeKeys())->toContain('seni-budaya')
        ->and(Subject::aiDescription('seni-budaya'))->toBe('Seni Budaya (arts and culture: music, dance, crafts)');
});

it('rejects invalid subjects', function (array $override, string $field): void {
    $this->actingAs($this->admin)->post('/admin/subjects', subjectPayload($override))->assertSessionHasErrors($field);
})->with([
    'missing name' => [['name_id' => ''], 'name_id'],
    'duplicate name' => [['name_id' => 'Matematika'], 'name_id'],
    'reserved key' => [['key' => 'mix'], 'key'],
    'duplicate key' => [['key' => 'math', 'name_id' => 'Matematika Lanjut'], 'key'],
    'bad key' => [['key' => '9 lives!', 'name_id' => 'Sembilan'], 'key'],
    'unknown icon' => [['icon' => 'rocket-ship'], 'icon'],
    'bad colour' => [['color' => 'red'], 'color'],
]);

it('shares active subjects with every page and the Go bank', function (): void {
    Subject::factory()->create(['key' => 'music', 'name_id' => 'Musik', 'name_en' => 'Music']);
    Subject::factory()->inactive()->create(['key' => 'dance', 'name_id' => 'Tari']);

    $this->actingAs($this->admin)->get('/admin/subjects')
        ->assertInertia(fn (Assert $page) => $page
            ->has('subjects', 9)
            ->where('subjects.7.key', 'music'));

    $this->actingAs(User::factory()->create())->get('/terms')
        ->assertInertia(fn (Assert $page) => $page
            ->where('subjects.7.key', 'music')
            ->where('subjects.7.name.en', 'Music')
            ->has('subjects', 8));

    $bank = subjectBank()->assertOk();
    expect($bank->json('subjects'))->toBe(['math', 'science', 'language', 'social', 'english', 'civics', 'tkj', 'music']);

    $version = $bank->json('version');
    Subject::query()->where('key', 'dance')->update(['is_active' => true]);
    Subject::query()->where('key', 'dance')->first()->touch();
    expect(subjectBank()->json('version'))->not->toBe($version);
});

it('lets authors use new subjects but not hidden ones', function (): void {
    Subject::factory()->create(['key' => 'music', 'name_id' => 'Musik']);
    Subject::factory()->inactive()->create(['key' => 'dance', 'name_id' => 'Tari']);

    $question = [
        'type' => 'choice', 'band' => 1, 'prompt_id' => 'Alat musik dipetik?', 'prompt_en' => 'Plucked instrument?',
        'options' => [['id' => 'Gitar', 'en' => 'Guitar'], ['id' => 'Drum', 'en' => 'Drum'], ['id' => 'Seruling', 'en' => 'Flute']],
        'answer' => 0, 'games' => ['sky-quiz'], 'is_active' => true,
    ];

    $this->actingAs($this->admin)->post('/admin/questions', [...$question, 'subject' => 'music'])->assertSessionHasNoErrors();
    expect(Question::query()->where('subject', 'music')->count())->toBe(1);

    $this->actingAs($this->admin)->post('/admin/questions', [...$question, 'subject' => 'dance'])->assertSessionHasErrors('subject');
});

it('keeps a hidden subject valid when editing its existing questions', function (): void {
    $subject = Subject::factory()->create(['key' => 'music', 'name_id' => 'Musik']);
    $question = Question::factory()->create(['subject' => 'music', 'band' => 1]);
    $subject->update(['is_active' => false]);

    $this->actingAs($this->admin)->put("/admin/questions/{$question->id}", [
        'type' => 'choice', 'band' => 1, 'subject' => 'music', 'prompt_id' => 'Diperbarui?', 'prompt_en' => '',
        'options' => $question->options, 'answer' => 0, 'games' => ['sky-quiz'], 'is_active' => true,
    ])->assertSessionHasNoErrors();

    expect($question->fresh()->prompt_id)->toBe('Diperbarui?');
});

it('edits a subject without changing its key', function (): void {
    $subject = Subject::factory()->create(['key' => 'music', 'name_id' => 'Musik']);

    $this->actingAs($this->admin)->put("/admin/subjects/{$subject->id}", subjectPayload(['name_id' => 'Seni Musik', 'key' => 'changed']))
        ->assertSessionHasNoErrors();

    expect($subject->fresh())->key->toBe('music')->name_id->toBe('Seni Musik');
});

it('hides and shows a subject but never the last visible one', function (): void {
    $math = Subject::query()->where('key', 'math')->firstOrFail();

    $this->actingAs($this->admin)->patch("/admin/subjects/{$math->id}/toggle")->assertSessionHasNoErrors();
    expect(Subject::activeKeys())->not->toContain('math');

    $this->actingAs($this->admin)->patch("/admin/subjects/{$math->id}/toggle");
    expect(Subject::activeKeys())->toContain('math');

    Subject::query()->whereKeyNot($math->id)->update(['is_active' => false]);
    $math->touch();
    $this->actingAs($this->admin)->patch("/admin/subjects/{$math->id}/toggle")->assertSessionHasErrors('subject');
    expect($math->fresh()->is_active)->toBeTrue();
});

it('reorders subjects', function (): void {
    $science = Subject::query()->where('key', 'science')->firstOrFail();

    $this->actingAs($this->admin)->patch("/admin/subjects/{$science->id}/move", ['direction' => 'up'])->assertRedirect();
    expect(array_slice(Subject::activeKeys(), 0, 2))->toBe(['science', 'math']);

    $first = Subject::query()->where('key', 'science')->firstOrFail();
    $this->actingAs($this->admin)->patch("/admin/subjects/{$first->id}/move", ['direction' => 'up'])->assertRedirect();
    expect(Subject::activeKeys()[0])->toBe('science');
});

it('deletes only unused custom subjects', function (): void {
    $math = Subject::query()->where('key', 'math')->firstOrFail();
    $this->actingAs($this->admin)->delete("/admin/subjects/{$math->id}")->assertSessionHasErrors('subject');

    $music = Subject::factory()->create(['key' => 'music', 'name_id' => 'Musik']);
    $question = Question::factory()->create(['subject' => 'music']);
    $this->actingAs($this->admin)->delete("/admin/subjects/{$music->id}")->assertSessionHasErrors('subject');

    $question->delete();
    $this->actingAs($this->admin)->delete("/admin/subjects/{$music->id}")->assertSessionHasNoErrors();
    expect(Subject::query()->where('key', 'music')->exists())->toBeFalse();
});
