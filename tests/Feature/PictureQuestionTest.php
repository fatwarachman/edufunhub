<?php

use App\Models\Question;
use App\Models\User;
use App\Services\GameServiceSigner;
use App\Services\QuestionVisual;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Storage;

const PICTURE_GAME_SECRET = 'picture-question-test-secret-32-chars!!';

beforeEach(function (): void {
    config(['scout.driver' => 'null', 'game-service.secret' => PICTURE_GAME_SECRET]);
    $this->withoutVite();
    Storage::fake('public');
    $this->teacher = User::factory()->teacher()->create();
});

/** A real PNG upload (no GD needed). */
function picturePng(string $name, int $width, int $height, int $padBytes = 0): UploadedFile
{
    $chunk = fn (string $type, string $data): string => pack('N', strlen($data)).$type.$data.pack('N', crc32($type.$data));
    $row = "\0".str_repeat("\x1f\x2a\x44", $width);
    $png = "\x89PNG\r\n\x1a\n"
        .$chunk('IHDR', pack('NNCCCCC', $width, $height, 8, 2, 0, 0, 0))
        .$chunk('IDAT', gzcompress(str_repeat($row, $height)))
        .($padBytes > 0 ? $chunk('tEXt', 'pad'."\0".random_bytes($padBytes)) : '')
        .$chunk('IEND', '');

    return UploadedFile::fake()->createWithContent($name, $png);
}

function uploadPicture(mixed $test, User $user, UploadedFile $file, string $purpose): string
{
    return $test->actingAs($user)->post('/teacher/questions/media', ['image' => $file, 'purpose' => $purpose], ['Accept' => 'application/json'])
        ->assertCreated()->json('src');
}

it('lets a teacher build a TK picture question with picture answer options', function (): void {
    $question = uploadPicture($this, $this->teacher, picturePng('apel.png', 400, 300), 'question');
    $cat = uploadPicture($this, $this->teacher, picturePng('kucing.png', 200, 200), 'option');
    $fish = uploadPicture($this, $this->teacher, picturePng('ikan.png', 200, 160), 'option');

    $this->actingAs($this->teacher)->post('/teacher/questions', [
        'type' => 'choice',
        'grades' => [0, 1],
        'subject' => 'science',
        'level' => 1,
        'prompt_id' => 'Hewan mana yang bisa berenang?',
        'prompt_en' => 'Which animal can swim?',
        'visual' => ['kind' => 'image', 'src' => $question, 'alt' => ['id' => 'Kolam', 'en' => 'Pond']],
        'options' => [
            ['id' => '', 'en' => '', 'media' => ['kind' => 'image', 'src' => $fish]],
            ['id' => 'Kucing', 'en' => 'Cat', 'media' => ['kind' => 'image', 'src' => $cat]],
            ['id' => 'Ayam', 'en' => 'Chicken'],
            ['id' => '', 'en' => ''],
        ],
        'answer' => 0,
        'games' => ['sky-quiz', 'quiz-duel'],
        'is_active' => true,
    ])->assertSessionHasNoErrors()->assertRedirect();

    $saved = Question::query()->latest('id')->firstOrFail();
    expect($saved->grades)->toBe([0, 1])
        ->and($saved->options)->toHaveCount(3)
        ->and($saved->options[0])->toBe(['id' => '', 'en' => '', 'media' => ['kind' => 'image', 'src' => $fish]])
        ->and($saved->options[1]['media']['src'])->toBe($cat)
        ->and($saved->options[2])->not->toHaveKey('media')
        ->and($saved->visual['src'])->toBe($question);

    $timestamp = (string) time();
    $bank = $this->getJson('/api/internal/question-bank', [
        'X-Game-Timestamp' => $timestamp,
        'X-Game-Signature' => app(GameServiceSigner::class)->sign($timestamp, ''),
    ])->assertOk()->json('questions');
    $payload = collect($bank)->firstWhere('key', $saved->key);

    expect($payload['grades'])->toBe([0, 1])
        ->and($payload['options'][0]['media'])->toBe(['kind' => 'image', 'src' => $fish])
        ->and($payload['options'][2])->not->toHaveKey('media')
        ->and($payload['visual']['kind'])->toBe('image');
});

it('requires text or a picture for every answer option and an existing picture', function (): void {
    $this->actingAs($this->teacher)->post('/teacher/questions', [
        'type' => 'choice', 'grades' => [2], 'subject' => 'science', 'level' => 1,
        'prompt_id' => 'Mana yang benar?',
        'options' => [
            ['id' => '', 'media' => ['kind' => 'image', 'src' => '/games/question-media/'.str_repeat('a', 40).'.png']],
            ['id' => 'B'], ['id' => 'C'],
        ],
        'answer' => 0, 'games' => ['sky-quiz'], 'is_active' => true,
    ])->assertSessionHasErrors('options.0.media.src');
});

it('enforces size, dimension, ratio and type limits on uploads', function (string $purpose, UploadedFile $file, string $message): void {
    $this->actingAs($this->teacher)
        ->post('/teacher/questions/media', ['image' => $file, 'purpose' => $purpose], ['Accept' => 'application/json'])
        ->assertUnprocessable()
        ->assertJsonValidationErrors(['image' => $message]);
})->with([
    'too small' => fn () => ['question', picturePng('tiny.png', 40, 40), __('questions.visual.image_dimensions')],
    'too large side' => fn () => ['question', picturePng('huge.png', 2100, 1000), __('questions.visual.image_dimensions')],
    'stretched banner' => fn () => ['question', picturePng('strip.png', 1200, 300), __('questions.visual.image_ratio')],
    'option over 512 KB' => fn () => ['option', picturePng('big.png', 300, 300, 600 * 1024), __('questions.visual.option_image_size')],
    'question over 1 MB' => fn () => ['question', picturePng('big.png', 300, 300, 1100 * 1024), __('questions.visual.image_size')],
    'svg' => fn () => ['option', UploadedFile::fake()->create('a.svg', 10, 'image/svg+xml'), __('questions.visual.image_file')],
]);

it('accepts a 700 KB question picture but keeps players and guests out of uploads', function (): void {
    uploadPicture($this, $this->teacher, picturePng('ok.png', 800, 600, 700 * 1024), 'question');

    $this->actingAs(User::factory()->create())
        ->post('/teacher/questions/media', ['image' => picturePng('a.png', 100, 100), 'purpose' => 'option'], ['Accept' => 'application/json'])
        ->assertForbidden();

    auth()->guard('web')->logout();
    $this->post('/teacher/questions/media', ['image' => picturePng('a.png', 100, 100)], ['Accept' => 'application/json'])
        ->assertUnauthorized();

    expect(QuestionVisual::OPTION_MAX_KB)->toBe(512)->and(QuestionVisual::QUESTION_MAX_KB)->toBe(1024);
});

it('flags picture questions in the teacher list and shows option pictures on the detail', function (): void {
    $fish = uploadPicture($this, $this->teacher, picturePng('ikan.png', 200, 160), 'option');
    $picture = Question::factory()->byTeacher($this->teacher)->create([
        'subject' => 'science',
        'visual' => ['kind' => 'emoji', 'items' => ['🐟', '🐟'], 'caption' => ['id' => 'Ikan', 'en' => 'Fish']],
        'options' => [['id' => '', 'en' => '', 'media' => ['kind' => 'image', 'src' => $fish]], ['id' => 'Dua', 'en' => 'Two'], ['id' => 'Tiga', 'en' => 'Three']],
        'answer' => 1,
    ]);
    $plain = Question::factory()->byTeacher($this->teacher)->create(['subject' => 'science', 'visual' => null]);

    $this->actingAs($this->teacher)->get('/teacher/questions?subject=science')->assertOk()
        ->assertInertia(fn ($page) => $page
            ->where('questions.data', fn ($rows): bool => collect($rows)->firstWhere('id', $picture->id)['has_picture'] === true
                && collect($rows)->firstWhere('id', $plain->id)['has_picture'] === false));

    $this->actingAs($this->teacher)->get("/teacher/questions/{$picture->id}")->assertOk()
        ->assertInertia(fn ($page) => $page
            ->where('question.visual.kind', 'emoji')
            ->where('question.options.0.media.src', $fish));
});
