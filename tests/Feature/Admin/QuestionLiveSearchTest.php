<?php

use App\Models\Question;
use App\Models\User;

beforeEach(function (): void {
    config(['scout.driver' => 'null']);
    $this->withoutVite();
    Question::query()->delete();
    $this->admin = User::factory()->superadmin()->create();
});

it('returns matching questions with the total count', function (): void {
    Question::factory()->create(['prompt_id' => 'Berapa hasil 7 x 8?', 'key' => 'q-math-mult']);
    Question::factory()->create(['prompt_id' => 'Ibu kota Indonesia adalah?', 'key' => 'q-geo-capital']);
    Question::factory()->create(['prompt_id' => 'Hasil 9 x 9 adalah?', 'prompt_en' => 'What is 9 x 9?', 'key' => 'q-math-nine']);

    $this->actingAs($this->admin)
        ->getJson('/admin/questions/search?q=hasil')
        ->assertOk()
        ->assertJsonPath('term', 'hasil')
        ->assertJsonPath('total', 2)
        ->assertJsonCount(2, 'results')
        ->assertJsonStructure(['results' => [['id', 'key', 'subject', 'band', 'level', 'type', 'prompt_id', 'is_active', 'source']]]);
});

it('matches question keys and english prompts', function (string $term, string $key): void {
    Question::factory()->create(['prompt_id' => 'Soal satu', 'prompt_en' => 'Volcano question', 'key' => 'q-alpha-001']);
    Question::factory()->create(['prompt_id' => 'Soal dua', 'prompt_en' => 'River question', 'key' => 'q-beta-002']);

    $this->actingAs($this->admin)
        ->getJson('/admin/questions/search?q='.urlencode($term))
        ->assertOk()
        ->assertJsonPath('total', 1)
        ->assertJsonPath('results.0.key', $key);
})->with([
    'key' => ['beta-00', 'q-beta-002'],
    'english prompt' => ['volcano', 'q-alpha-001'],
]);

it('caps suggestions at eight but reports every match', function (): void {
    Question::factory()->count(12)->create(['prompt_id' => 'Pertanyaan pecahan sederhana']);

    $this->actingAs($this->admin)
        ->getJson('/admin/questions/search?q=pecahan')
        ->assertOk()
        ->assertJsonPath('total', 12)
        ->assertJsonCount(8, 'results');
});

it('treats like wildcards literally', function (): void {
    Question::factory()->create(['prompt_id' => 'Diskon 50% dari harga']);
    Question::factory()->create(['prompt_id' => 'Diskon lima puluh']);

    $this->actingAs($this->admin)
        ->getJson('/admin/questions/search?q='.urlencode('50%'))
        ->assertOk()
        ->assertJsonPath('total', 1);
});

it('rejects too short or too long search terms', function (string $term): void {
    $this->actingAs($this->admin)
        ->getJson('/admin/questions/search?q='.urlencode($term))
        ->assertUnprocessable()
        ->assertJsonValidationErrors('q');
})->with([
    'empty' => [''],
    'one character' => ['a'],
    'too long' => [str_repeat('a', 101)],
]);

it('blocks non superadmins', function (): void {
    $this->actingAs(User::factory()->create(['is_superadmin' => false]))
        ->getJson('/admin/questions/search?q=hasil')
        ->assertForbidden();
});

it('requires authentication', function (): void {
    $this->getJson('/admin/questions/search?q=hasil')->assertUnauthorized();
});
