<?php

use App\Models\CrosswordWord;
use App\Models\User;
use Illuminate\Testing\TestResponse;
use Inertia\Testing\AssertableInertia as Assert;

beforeEach(function (): void {
    config(['scout.driver' => 'null', 'game-service.secret' => str_repeat('w', 40)]);
    $this->withoutVite();
    $this->admin = User::factory()->create(['is_superadmin' => true]);
});

function crosswordBank(): TestResponse
{
    $timestamp = (string) now()->getTimestamp();

    return test()->getJson('/api/internal/crossword-bank', [
        'X-Game-Timestamp' => $timestamp,
        'X-Game-Signature' => hash_hmac('sha256', $timestamp.'.', config('game-service.secret')),
    ]);
}

it('imports the built-in word bank for every level', function (): void {
    foreach (CrosswordWord::LEVELS as $level => [, $words]) {
        expect(CrosswordWord::query()->active()->where('level', $level)->count())->toBeGreaterThanOrEqual($words * 2);
    }
    expect(CrosswordWord::query()->where('key', 'cw-1-SAPI')->value('clue_id'))->toBe('Hewan ternak penghasil susu');
});

it('serves the active bank to the signed game service only', function (): void {
    $hidden = CrosswordWord::query()->where('key', 'cw-1-SAPI')->firstOrFail();
    $hidden->update(['is_active' => false]);

    $response = crosswordBank()->assertOk()->assertJsonStructure(['version', 'words' => [['key', 'level', 'answer', 'clue' => ['id', 'en']]]]);
    expect(collect($response->json('words'))->pluck('key'))->not->toContain('cw-1-SAPI');

    $version = $response->json('version');
    CrosswordWord::factory()->create(['level' => 2, 'answer' => 'KATULISTIWA']);
    expect(crosswordBank()->json('version'))->not->toBe($version);

    $this->getJson('/api/internal/crossword-bank')->assertForbidden();
    $this->getJson('/api/internal/crossword-bank', ['X-Game-Timestamp' => (string) now()->getTimestamp(), 'X-Game-Signature' => 'nope'])->assertForbidden();
});

it('lists words with per-level health and filters', function (): void {
    $this->actingAs($this->admin)->get('/admin/crossword-words?level=3&search=klorofil')->assertOk()->assertInertia(fn (Assert $page) => $page
        ->component('admin/crossword-words/index')
        ->has('levels', 4)
        ->where('levels.0.size', 9)
        ->where('levels.3.words_per_grid', 11)
        ->where('words.total', 1)
        ->where('words.data.0.answer', 'KLOROFIL'));
});

it('adds a word: answer is cleaned to A-Z capitals', function (): void {
    $this->actingAs($this->admin)->post('/admin/crossword-words', [
        'level' => 2, 'answer' => 'tata surya', 'clue_id' => 'Matahari dan planet-planetnya', 'clue_en' => 'The Sun and its planets', 'is_active' => true,
    ])->assertRedirect('/admin/crossword-words?level=2');

    $word = CrosswordWord::query()->where('answer', 'TATASURYA')->firstOrFail();
    expect($word->level)->toBe(2)->and($word->created_by)->toBe($this->admin->id)->and($word->key)->toStartWith('cw-');
    expect(collect(crosswordBank()->json('words'))->firstWhere('answer', 'TATASURYA')['clue']['en'])->toBe('The Sun and its planets');
});

it('validates words', function (array $override, string $field): void {
    $this->actingAs($this->admin)->post('/admin/crossword-words', array_replace([
        'level' => 1, 'answer' => 'KUCING', 'clue_id' => 'Hewan peliharaan yang mengeong', 'is_active' => true,
    ], $override))->assertSessionHasErrors($field);
})->with([
    'too short' => [['answer' => 'AB'], 'answer'],
    'too long for the largest grid' => [['answer' => str_repeat('A', 16)], 'answer'],
    'only symbols' => [['answer' => '123-!'], 'answer'],
    'duplicate in level' => [['answer' => 'sapi'], 'answer'],
    'unknown level' => [['level' => 7], 'level'],
    'missing clue' => [['clue_id' => ''], 'clue_id'],
]);

it('allows the same word on another level', function (): void {
    $this->actingAs($this->admin)->post('/admin/crossword-words', [
        'level' => 2, 'answer' => 'SAPI', 'clue_id' => 'Hewan ruminansia penghasil daging', 'is_active' => true,
    ])->assertSessionHasNoErrors();
});

it('edits, hides and deletes words', function (): void {
    $word = CrosswordWord::factory()->create(['level' => 1, 'answer' => 'KUCING']);

    $this->actingAs($this->admin)->put("/admin/crossword-words/{$word->id}", [
        'level' => 1, 'answer' => 'KUCING', 'clue_id' => 'Hewan yang mengeong', 'is_active' => true,
    ])->assertSessionHasNoErrors();
    expect($word->fresh()->clue_id)->toBe('Hewan yang mengeong');

    $this->patch("/admin/crossword-words/{$word->id}/toggle")->assertSessionHasNoErrors();
    expect($word->fresh()->is_active)->toBeFalse();

    $this->delete("/admin/crossword-words/{$word->id}")->assertRedirect();
    expect(CrosswordWord::query()->find($word->id))->toBeNull();
});

it('refuses to leave a level without enough active words', function (): void {
    $minimum = CrosswordWord::minimumActive(1);
    $words = CrosswordWord::query()->active()->where('level', 1)->get();
    CrosswordWord::query()->whereKey($words->slice($minimum)->pluck('id'))->update(['is_active' => false]);
    $last = $words->first();

    $this->actingAs($this->admin)->patch("/admin/crossword-words/{$last->id}/toggle")->assertSessionHasErrors('word');
    $this->delete("/admin/crossword-words/{$last->id}")->assertSessionHasErrors('word');
    $this->put("/admin/crossword-words/{$last->id}", [...$last->only(['answer', 'clue_id']), 'level' => 2, 'is_active' => true])->assertSessionHasErrors('word');

    expect(CrosswordWord::query()->active()->where('level', 1)->count())->toBe($minimum);
});

it('is only for super admins', function (): void {
    $this->actingAs(User::factory()->create())->get('/admin/crossword-words')->assertForbidden();
    $this->post('/admin/crossword-words', ['level' => 1, 'answer' => 'KUDA', 'clue_id' => 'Hewan tunggangan'])->assertForbidden();
});
