<?php

use App\Models\Question;
use App\Models\Subject;
use App\Models\User;
use App\Services\GameServiceSigner;
use App\Services\QuestionVisual;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Storage;
use Inertia\Testing\AssertableInertia as Assert;

const VISUAL_GAME_SECRET = 'question-visual-test-secret-32-chars!!';

beforeEach(function (): void {
    config(['scout.driver' => 'null', 'game-service.secret' => VISUAL_GAME_SECRET]);
    $this->withoutVite();
    Storage::fake('public');
    $this->admin = User::factory()->superadmin()->create();
});

/** @return array<string, mixed> */
function visualQuestionPayload(array $overrides = []): array
{
    return array_merge([
        'type' => 'choice',
        'band' => 3,
        'level' => 1,
        'subject' => 'tkj',
        'prompt_id' => 'Topologi jaringan pada gambar adalah…',
        'prompt_en' => 'Which topology is shown?',
        'options' => [['id' => 'Star', 'en' => 'Star'], ['id' => 'Bus', 'en' => 'Bus'], ['id' => 'Ring', 'en' => 'Ring']],
        'answer' => 0,
        'games' => ['sky-quiz', 'quiz-duel'],
        'is_active' => true,
    ], $overrides);
}

/** A real PNG upload without needing the GD extension. */
function visualPng(string $name, int $width, int $height): UploadedFile
{
    $chunk = fn (string $type, string $data): string => pack('N', strlen($data)).$type.$data.pack('N', crc32($type.$data));
    $row = "\0".str_repeat("\x1f\x2a\x44", $width);
    $png = "\x89PNG\r\n\x1a\n"
        .$chunk('IHDR', pack('NNCCCCC', $width, $height, 8, 2, 0, 0, 0))
        .$chunk('IDAT', gzcompress(str_repeat($row, $height)))
        .$chunk('IEND', '');

    return UploadedFile::fake()->createWithContent($name, $png);
}

function visualBankPayload(): array
{
    $timestamp = (string) time();

    return test()->getJson('/api/internal/question-bank', [
        'X-Game-Timestamp' => $timestamp,
        'X-Game-Signature' => app(GameServiceSigner::class)->sign($timestamp, ''),
    ])->assertOk()->json();
}

describe('TKJ subject and built-in visual questions', function (): void {
    it('seeds the TKJ subject and visual questions for grades 10 to 12', function (): void {
        expect(Subject::query()->where('key', 'tkj')->value('name_id'))->toBe('TKJ');

        $questions = Question::query()->where('subject', 'tkj')->where('source', 'system')->get();
        $data = require database_path('data/tkj-visual-questions.php');

        expect($questions)->toHaveCount(count($data))
            ->and($questions->every(fn (Question $q): bool => $q->grades === [10, 11, 12] && $q->band === 3 && is_array($q->visual)))->toBeTrue()
            ->and($questions->pluck('visual.kind')->unique()->sort()->values()->all())->toBe(['cable', 'terminal', 'topology']);
    });

    it('keeps every built-in visual valid and every answer in range', function (): void {
        foreach (require database_path('data/tkj-visual-questions.php') as $question) {
            expect(QuestionVisual::normalize($question['visual']))->not->toBeNull()
                ->and($question['answer'])->toBeLessThan(count($question['options']))
                ->and(collect($question['options'])->pluck('id')->unique())->toHaveCount(count($question['options']));
        }
    });

    it('sends the visual to the game service with the question', function (): void {
        $payload = collect(visualBankPayload()['questions'])->firstWhere('key', 'tkj-v-topo-star');

        expect($payload['visual'])->toBe(['kind' => 'topology', 'shape' => 'star'])
            ->and($payload['subject'])->toBe('tkj');

        $plain = Question::factory()->create();
        expect(collect(visualBankPayload()['questions'])->firstWhere('key', $plain->key)['visual'])->toBeNull();
    });
});

describe('admin question visuals', function (): void {
    it('saves a cable visual keeping only cable fields', function (): void {
        $this->actingAs($this->admin)->post('/admin/questions', visualQuestionPayload([
            'visual' => [
                'kind' => 'cable', 'style' => 'utp', 'shape' => 'ring', 'lines' => ['ignored'],
                'wires' => [['color' => '#F8FAFC', 'stripe' => '#f97316'], ['color' => '#f97316', 'stripe' => '']],
                'caption' => ['id' => 'Pin 1–2', 'en' => ''],
            ],
        ]))->assertSessionHasNoErrors()->assertRedirect();

        expect(Question::query()->latest('id')->first()->visual)->toBe([
            'kind' => 'cable',
            'style' => 'utp',
            'wires' => [['color' => '#f8fafc', 'stripe' => '#f97316'], ['color' => '#f97316']],
            'caption' => ['id' => 'Pin 1–2', 'en' => ''],
        ]);
    });

    it('saves topology and terminal visuals and clears a visual', function (): void {
        $this->actingAs($this->admin)->post('/admin/questions', visualQuestionPayload([
            'visual' => ['kind' => 'terminal', 'lines' => ['C:\\> ping 10.0.0.1', 'Request timed out.']],
        ]))->assertSessionHasNoErrors();
        $question = Question::query()->latest('id')->first();
        expect($question->visual)->toBe(['kind' => 'terminal', 'lines' => ['C:\\> ping 10.0.0.1', 'Request timed out.']]);

        $this->actingAs($this->admin)->put("/admin/questions/{$question->id}", visualQuestionPayload([
            'visual' => ['kind' => 'topology', 'shape' => 'mesh'],
        ]))->assertSessionHasNoErrors();
        expect($question->fresh()->visual)->toBe(['kind' => 'topology', 'shape' => 'mesh']);

        $this->actingAs($this->admin)->put("/admin/questions/{$question->id}", visualQuestionPayload(['visual' => null]))->assertSessionHasNoErrors();
        expect($question->fresh()->visual)->toBeNull();
    });

    it('rejects invalid visuals', function (array $visual, string $field): void {
        $this->actingAs($this->admin)->post('/admin/questions', visualQuestionPayload(['visual' => $visual]))
            ->assertSessionHasErrors($field);
    })->with([
        'unknown kind' => [['kind' => 'video'], 'visual.kind'],
        'cable without wires' => [['kind' => 'cable', 'wires' => []], 'visual.wires'],
        'one wire' => [['kind' => 'cable', 'wires' => [['color' => '#000000']]], 'visual.wires'],
        'bad colour' => [['kind' => 'cable', 'wires' => [['color' => 'red'], ['color' => '#000000']]], 'visual.wires.0.color'],
        'unknown topology' => [['kind' => 'topology', 'shape' => 'hexagon'], 'visual.shape'],
        'empty terminal' => [['kind' => 'terminal', 'lines' => []], 'visual.lines'],
        'image without src' => [['kind' => 'image'], 'visual.src'],
        'external image' => [['kind' => 'image', 'src' => 'https://evil.test/a.png'], 'visual.src'],
        'missing upload' => [['kind' => 'image', 'src' => '/games/question-media/'.str_repeat('a', 40).'.png'], 'visual.src'],
    ]);

    it('uploads a picture, saves it on a question and streams it to players', function (): void {
        $response = $this->actingAs($this->admin)->post('/admin/questions/media', [
            'image' => visualPng('router.png', 320, 200),
        ], ['Accept' => 'application/json'])->assertCreated();

        $src = $response->json('src');
        expect($src)->toMatch('#^/games/question-media/[A-Za-z0-9]{40}\.png$#');
        Storage::disk('public')->assertExists(QuestionVisual::pathFor($src));

        $this->actingAs($this->admin)->post('/admin/questions', visualQuestionPayload([
            'visual' => ['kind' => 'image', 'src' => $src, 'alt' => ['id' => 'Router', 'en' => 'Router']],
        ]))->assertSessionHasNoErrors();
        expect(Question::query()->latest('id')->first()->visual)->toBe(['kind' => 'image', 'src' => $src, 'alt' => ['id' => 'Router', 'en' => 'Router']]);

        $player = User::factory()->create();
        $this->actingAs($player)->get($src)->assertOk()->assertHeader('X-Content-Type-Options', 'nosniff');
    });

    it('only lets super admins upload pictures and rejects non-images', function (): void {
        $this->actingAs(User::factory()->create())->post('/admin/questions/media', [
            'image' => visualPng('a.png', 100, 100),
        ], ['Accept' => 'application/json'])->assertForbidden();

        $this->actingAs($this->admin)->post('/admin/questions/media', [
            'image' => UploadedFile::fake()->create('a.svg', 10, 'image/svg+xml'),
        ], ['Accept' => 'application/json'])->assertUnprocessable()->assertJsonValidationErrors('image');
    });

    it('shows the visual on the edit and detail pages', function (): void {
        $question = Question::query()->where('key', 'tkj-v-utp-b')->firstOrFail();

        $this->actingAs($this->admin)->get("/admin/questions/{$question->id}/edit")->assertOk()
            ->assertInertia(fn (Assert $page) => $page->component('admin/questions/form')
                ->where('question.visual.kind', 'cable')
                ->has('question.visual.wires', 8)
                ->where('topologies', QuestionVisual::TOPOLOGIES));

        $this->actingAs($this->admin)->get("/admin/questions/{$question->id}")->assertOk()
            ->assertInertia(fn (Assert $page) => $page->where('question.visual.style', 'utp'));
    });
});

describe('TKJ game flag', function (): void {
    it('flags the TKJ games in the game menu', function (): void {
        $games = collect($this->get('/gamelist')->assertOk()->viewData('page')['props']['gameMenu'])
            ->flatMap(fn (array $category): array => $category['games'])
            ->keyBy('key');

        expect($games['order-rush']['tags'])->toBe(['tkj'])
            ->and($games['port-sorter']['tags'])->toBe(['tkj'])
            ->and($games['sky-quiz']['tags'])->toBe([]);
    });
});
