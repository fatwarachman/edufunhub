<?php

use App\Ai\Agents\QuestionWriter;
use App\Models\Question;
use App\Models\User;
use App\Services\Ai\QuestionGenerator;
use Illuminate\Support\Facades\Http;

beforeEach(function (): void {
    config(['scout.driver' => 'null', 'queue.default' => 'sync']);
    $this->withoutVite();
    $this->admin = User::factory()->superadmin()->create();
    $this->actingAs($this->admin);
    Http::fake(['ai.test/v1/models' => Http::response(['object' => 'list', 'data' => [['id' => 'gpt-4o-mini', 'object' => 'model', 'owned_by' => 'lab']]])]);
    $this->put('/admin/ai-settings', ['base_url' => 'https://ai.test/v1/', 'api_key' => 'sk-test-1234']);
    $this->put('/admin/ai-settings/model', ['model' => 'gpt-4o-mini']);
});

it('creates emoji picture questions for TK with option emoji, and drops fake pictures', function (): void {
    QuestionWriter::fake([[
        'questions' => [
            [
                'prompt_id' => 'Ada berapa apel pada gambar?', 'prompt_en' => 'How many apples are in the picture?',
                'picture' => ['🍎', '🍎', '🍎'], 'option_emoji' => [],
                'options' => [['id' => '3', 'en' => '3'], ['id' => '2', 'en' => '2'], ['id' => '4', 'en' => '4'], ['id' => '5', 'en' => '5']],
                'answer' => 0, 'hint_id' => 'Hitung satu per satu.', 'hint_en' => 'Count one by one.',
            ],
            [
                'prompt_id' => 'Hewan mana yang hidup di air?', 'prompt_en' => 'Which animal lives in water?',
                'picture' => ['<img src=x>', 'abc'], 'option_emoji' => ['🐟', '🐈', 'X', '🐄'],
                'options' => [['id' => 'Ikan', 'en' => 'Fish'], ['id' => 'Kucing', 'en' => 'Cat'], ['id' => 'Ayam', 'en' => 'Chicken'], ['id' => 'Sapi', 'en' => 'Cow']],
                'answer' => 0, 'hint_id' => 'Ikan berenang.', 'hint_en' => 'Fish swim.',
            ],
        ],
    ]]);

    $this->post('/admin/questions/generate', ['scope' => 'custom', 'subjects' => ['science'], 'grades' => [0], 'per_combination' => 2, 'games' => ['sky-quiz']])
        ->assertSessionHasNoErrors();

    $questions = Question::query()->where('source', Question::SOURCE_AI)->orderBy('id')->get();
    expect($questions)->toHaveCount(2)
        ->and($questions[0]->visual)->toBe(['kind' => 'emoji', 'items' => ['🍎', '🍎', '🍎']])
        ->and($questions[0]->grades)->toBe([0])
        ->and($questions[1]->visual)->toBeNull()
        ->and($questions[1]->options[0]['id'])->toBe('🐟 Ikan')
        ->and($questions[1]->options[2]['id'])->toBe('Ayam');

    QuestionWriter::assertPrompted(fn ($prompt) => str_contains($prompt->prompt, 'Picture questions (TK and SD)'));
});

it('keeps SMP and SMA questions text only', function (): void {
    QuestionWriter::fake([[
        'questions' => [[
            'prompt_id' => 'Rumus luas lingkaran adalah…', 'prompt_en' => 'The area of a circle is…',
            'picture' => ['⭕'], 'option_emoji' => ['⭕', '⭕', '⭕'],
            'options' => [['id' => 'πr²', 'en' => 'πr²'], ['id' => '2πr', 'en' => '2πr'], ['id' => 'πd', 'en' => 'πd']],
            'answer' => 0, 'hint_id' => 'Luas = πr².', 'hint_en' => 'Area = πr².',
        ]],
    ]]);

    $this->post('/admin/questions/generate', ['scope' => 'custom', 'subjects' => ['math'], 'grades' => [8], 'per_combination' => 1, 'games' => ['sky-quiz']])
        ->assertSessionHasNoErrors();

    $question = Question::query()->where('source', Question::SOURCE_AI)->sole();
    expect($question->visual)->toBeNull()->and($question->options[0]['id'])->toBe('πr²');
    expect(QuestionGenerator::picturesAllowed(0))->toBeTrue()
        ->and(QuestionGenerator::picturesAllowed(6))->toBeTrue()
        ->and(QuestionGenerator::picturesAllowed(7))->toBeFalse();
});

it('validates emoji visuals on the question form', function (): void {
    $payload = [
        'type' => 'choice', 'band' => 0, 'level' => 1, 'subject' => 'math',
        'prompt_id' => 'Ada berapa bintang?', 'prompt_en' => 'How many stars?',
        'options' => [['id' => '2', 'en' => '2'], ['id' => '3', 'en' => '3'], ['id' => '4', 'en' => '4']],
        'answer' => 0, 'games' => ['sky-quiz'], 'is_active' => true,
    ];

    $this->post('/admin/questions', [...$payload, 'visual' => ['kind' => 'emoji', 'items' => ['⭐', '⭐']]])->assertSessionHasNoErrors();
    expect(Question::query()->latest('id')->first()->visual)->toBe(['kind' => 'emoji', 'items' => ['⭐', '⭐']]);

    $this->post('/admin/questions', [...$payload, 'prompt_id' => 'Soal lain?', 'visual' => ['kind' => 'emoji', 'items' => ['<b>']]])
        ->assertSessionHasErrors('visual.items.0');
    $this->post('/admin/questions', [...$payload, 'prompt_id' => 'Soal ketiga?', 'visual' => ['kind' => 'emoji', 'items' => array_fill(0, 21, '⭐')]])
        ->assertSessionHasErrors('visual.items');
});
