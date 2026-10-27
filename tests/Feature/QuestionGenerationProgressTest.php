<?php

use App\Ai\Agents\QuestionWriter;
use App\Jobs\GenerateQuestions;
use App\Models\Question;
use App\Models\QuestionGeneration;
use App\Models\QuestionGenerationItem;
use App\Models\Setting;
use App\Models\Subject;
use App\Models\User;
use App\Services\Ai\AiSettings;
use App\Services\Ai\OpenAiCompatibleClient;
use App\Services\Ai\QuestionGenerator;
use Illuminate\Support\Facades\Crypt;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Queue;
use Illuminate\Support\Sleep;
use Inertia\Testing\AssertableInertia as Assert;

beforeEach(function (): void {
    config(['scout.driver' => 'null']);
    $this->withoutVite();
    $this->admin = User::factory()->superadmin()->create();
});

function progressGeneration(array $subjects = ['math'], array $grades = [1], int $per = 5): QuestionGeneration
{
    $generation = QuestionGeneration::query()->create([
        'model' => 'test-model', 'subjects' => $subjects, 'grades' => $grades, 'per_combination' => $per,
        'games' => ['sky-quiz'], 'activate' => false, 'status' => 'queued', 'total_jobs' => count($subjects) * count($grades),
    ]);
    $generation->createItems();

    return $generation;
}

/**
 * Bind a generator that reports the given batches through the progress
 * callback, then optionally throws.
 *
 * @param  list<array{0: int, 1: int}>  $batches
 */
function fakeGenerator(array $batches, ?Throwable $throw = null): object
{
    $fake = new class(app(OpenAiCompatibleClient::class), app(AiSettings::class)) extends QuestionGenerator
    {
        /** @var list<array{0: int, 1: int}> */
        public array $batches = [];

        public ?Throwable $throw = null;

        /** @var list<array{status: string, created: int}> */
        public array $seen = [];

        /** @var (Closure(): void)|null */
        public ?Closure $afterFirstBatch = null;

        public function generate(QuestionGeneration $generation, string $subject, int $grade, int $count, ?Closure $onProgress = null, ?Closure $shouldStop = null): array
        {
            $created = 0;
            $skipped = 0;
            foreach ($this->batches as $index => $batch) {
                if ($shouldStop !== null && $shouldStop()) {
                    return ['created' => $created, 'skipped' => $skipped, 'stopped' => true];
                }
                [$created, $skipped] = $batch;
                if ($index === 0 && $this->afterFirstBatch !== null) {
                    ($this->afterFirstBatch)();
                }
                $onProgress?->__invoke($created, $skipped);
                $item = $generation->items()->where('subject', $subject)->where('grade', $grade)->sole();
                $this->seen[] = ['status' => $item->status, 'created' => $item->created_count];
            }
            if ($this->throw !== null) {
                throw $this->throw;
            }

            return ['created' => $created, 'skipped' => $skipped, 'stopped' => false];
        }
    };
    $fake->batches = $batches;
    $fake->throw = $throw;
    app()->instance(QuestionGenerator::class, $fake);

    return $fake;
}

it('creates one queued progress item per subject and grade when a request starts', function (): void {
    Http::fake(['ai.test/v1/models' => Http::response(['object' => 'list', 'data' => [['id' => 'gpt-4o-mini', 'object' => 'model', 'owned_by' => 'lab']]])]);
    $this->actingAs($this->admin)->put('/admin/ai-settings', ['base_url' => 'https://ai.test/v1/', 'api_key' => 'sk-test-1234']);
    $this->put('/admin/ai-settings/model', ['model' => 'gpt-4o-mini']);
    Queue::fake();

    $this->post('/admin/questions/generate', ['scope' => 'custom', 'subjects' => ['math', 'science'], 'grades' => [0, 4, 7], 'per_combination' => 3, 'games' => ['sky-quiz']])
        ->assertSessionHasNoErrors();

    $generation = QuestionGeneration::query()->sole();
    $items = $generation->items()->orderBy('id')->get();
    expect($items)->toHaveCount(6)
        ->and($items->pluck('status')->unique()->all())->toBe(['queued'])
        ->and($items->pluck('target')->unique()->all())->toBe([3])
        ->and($items->map(fn (QuestionGenerationItem $item): string => "{$item->subject}-{$item->grade}")->all())
        ->toBe(['math-0', 'math-4', 'math-7', 'science-0', 'science-4', 'science-7']);
    Queue::assertPushed(GenerateQuestions::class, 6);
});

it('marks its item running, counts every batch and closes it as done', function (): void {
    $generation = progressGeneration(['math', 'science'], [1], 7);
    $fake = fakeGenerator([[5, 1], [7, 2]]);

    (new GenerateQuestions($generation, 'math', 1))->handle(app(QuestionGenerator::class));

    expect($fake->seen)->toBe([['status' => 'running', 'created' => 5], ['status' => 'running', 'created' => 7]]);
    $item = $generation->items()->where('subject', 'math')->sole();
    expect($item->status)->toBe('done')
        ->and($item->created_count)->toBe(7)
        ->and($item->skipped_count)->toBe(2)
        ->and($item->started_at)->not->toBeNull()
        ->and($item->finished_at)->not->toBeNull()
        ->and($generation->items()->where('subject', 'science')->value('status'))->toBe('queued');

    $fresh = $generation->fresh();
    expect($fresh->status)->toBe('running')->and($fresh->done_jobs)->toBe(1)->and($fresh->created_count)->toBe(7);

    fakeGenerator([[7, 0]]);
    (new GenerateQuestions($generation, 'science', 1))->handle(app(QuestionGenerator::class));
    expect($generation->fresh()->status)->toBe('done')->and($generation->fresh()->created_count)->toBe(14);
});

it('marks the item failed and keeps the questions made before the error', function (): void {
    $generation = progressGeneration(['math'], [3], 10);
    fakeGenerator([[5, 0]], new RuntimeException('model overloaded'));

    (new GenerateQuestions($generation, 'math', 3))->handle(app(QuestionGenerator::class));

    $item = $generation->items()->sole();
    expect($item->status)->toBe('failed')
        ->and($item->created_count)->toBe(5)
        ->and($item->error)->toContain('model overloaded');
    $fresh = $generation->fresh();
    expect($fresh->status)->toBe('done')->and($fresh->created_count)->toBe(5)->and($fresh->error)->toContain('math/3');
});

it('counts a job only once when the worker also reports it failed', function (): void {
    $generation = progressGeneration(['math'], [2], 5);
    fakeGenerator([[5, 0]]);

    $job = new GenerateQuestions($generation, 'math', 2);
    $job->handle(app(QuestionGenerator::class));
    $job->failed(new RuntimeException('late timeout'));

    $fresh = $generation->fresh();
    expect($fresh->done_jobs)->toBe(1)->and($fresh->status)->toBe('done')->and($fresh->error)->toBeNull()
        ->and($generation->items()->sole()->status)->toBe('done');
});

it('tracks requests created before progress items existed', function (): void {
    $generation = QuestionGeneration::query()->create([
        'model' => 'm', 'subjects' => ['math'], 'grades' => [1], 'per_combination' => 2, 'games' => ['sky-quiz'], 'status' => 'queued', 'total_jobs' => 1,
    ]);
    fakeGenerator([[2, 0]]);

    (new GenerateQuestions($generation, 'math', 1))->handle(app(QuestionGenerator::class));

    expect($generation->items()->sole()->only(['status', 'created_count', 'target']))->toBe(['status' => 'done', 'created_count' => 2, 'target' => 2])
        ->and($generation->fresh()->status)->toBe('done');
});

it('sends the progress items of every request to the page, old requests with none', function (): void {
    $legacy = QuestionGeneration::query()->create([
        'model' => 'm', 'subjects' => ['math'], 'grades' => [1], 'per_combination' => 2, 'games' => ['sky-quiz'], 'status' => 'done', 'total_jobs' => 1, 'done_jobs' => 1,
    ]);
    $live = progressGeneration(['math', 'science'], [1, 2], 5);
    $live->update(['status' => 'running']);
    $live->items()->where('subject', 'math')->where('grade', 1)->update(['status' => 'done', 'created_count' => 5]);
    $live->items()->where('subject', 'math')->where('grade', 2)->update(['status' => 'running', 'created_count' => 2]);

    $this->actingAs($this->admin)->get('/admin/questions/generate')->assertInertia(fn (Assert $page) => $page
        ->component('admin/questions/generate')
        ->has('generations', 2)
        ->where('generations.0.id', $live->id)
        ->has('generations.0.items', 4)
        ->where('generations.0.items.0', ['subject' => 'math', 'topic' => null, 'grade' => 1, 'status' => 'done', 'created' => 5, 'skipped' => 0, 'target' => 5, 'error' => null])
        ->where('generations.0.items.1.status', 'running')
        ->where('generations.0.items.1.created', 2)
        ->where('generations.0.items.2.status', 'queued')
        ->where('generations.1.id', $legacy->id)
        ->where('generations.1.items', []));
});

it('routes generation jobs through the configured queue connection', function (): void {
    config(['ai.question_generation.connection' => 'background']);
    $generation = progressGeneration();

    expect((new GenerateQuestions($generation, 'math', 1))->connection)->toBe('background');
});

it('stops a request: queued pairs are skipped, the running pair keeps its questions', function (): void {
    $generation = progressGeneration(['math'], [1, 2, 3], 10);
    $fake = fakeGenerator([[5, 0], [10, 0]]);
    $fake->afterFirstBatch = function () use ($generation): void {
        $this->actingAs($this->admin)
            ->post("/admin/questions/generate/{$generation->id}/cancel")
            ->assertSessionHasNoErrors();
    };

    (new GenerateQuestions($generation, 'math', 1))->handle(app(QuestionGenerator::class));
    (new GenerateQuestions($generation, 'math', 2))->handle(app(QuestionGenerator::class));

    $items = $generation->items()->orderBy('grade')->get();
    expect($items->pluck('status')->all())->toBe(['cancelled', 'cancelled', 'cancelled'])
        ->and($items[0]->created_count)->toBe(5)
        ->and($items[1]->started_at)->toBeNull()
        ->and($items[2]->created_count)->toBe(0);

    $fresh = $generation->fresh();
    expect($fresh->status)->toBe('cancelled')
        ->and($fresh->cancelled_at)->not->toBeNull()
        ->and($fresh->done_jobs)->toBe(3)
        ->and($fresh->created_count)->toBe(5)
        ->and($fresh->finished_at)->not->toBeNull();
});

it('closes a request right away when it is stopped before any job ran', function (): void {
    $generation = progressGeneration(['math', 'science'], [1], 5);

    $this->actingAs($this->admin)->post("/admin/questions/generate/{$generation->id}/cancel")
        ->assertRedirect()
        ->assertSessionHas('success');

    $fresh = $generation->fresh();
    expect($fresh->status)->toBe('cancelled')->and($fresh->done_jobs)->toBe(2)
        ->and($generation->items()->pluck('status')->unique()->all())->toBe(['cancelled']);

    fakeGenerator([[5, 0]]);
    (new GenerateQuestions($generation, 'math', 1))->handle(app(QuestionGenerator::class));
    expect($generation->fresh()->created_count)->toBe(0);
});

it('refuses to stop a finished request and limits stopping to superadmins', function (): void {
    $done = progressGeneration();
    $done->update(['status' => 'done', 'finished_at' => now()]);
    $live = progressGeneration();

    $this->actingAs($this->admin)->post("/admin/questions/generate/{$done->id}/cancel")->assertSessionHasErrors('generation');
    expect($done->fresh()->status)->toBe('done');

    $this->actingAs(User::factory()->create())->post("/admin/questions/generate/{$live->id}/cancel")->assertForbidden();
    expect($live->fresh()->cancelled_at)->toBeNull();
});

it('asks the model about a newly added subject by its catalog description', function (): void {
    Setting::set('ai.base_url', 'https://ai.test/v1', 'ai');
    Setting::set('ai.api_key', Crypt::encryptString('sk-test-1234'), 'ai');
    Setting::set('ai.model', 'gpt-4o-mini', 'ai');
    $subject = Subject::query()->create([
        'key' => 'teknologi-informasi', 'name_id' => 'Teknologi Informasi', 'name_en' => 'Information Technology',
        'ai_hint' => 'Pelajaran teknologi informasi: komputer, internet, dan AI.', 'is_active' => true,
    ]);
    $generation = progressGeneration([$subject->key], [5], 1);
    QuestionWriter::fake([['questions' => [[
        'prompt_id' => 'Apa kepanjangan CPU?', 'prompt_en' => 'What does CPU stand for?',
        'options' => [['id' => 'Central Processing Unit', 'en' => 'Central Processing Unit'], ['id' => 'Computer Power Unit', 'en' => 'Computer Power Unit'], ['id' => 'Core Program Utility', 'en' => 'Core Program Utility'], ['id' => 'Control Panel Unit', 'en' => 'Control Panel Unit']],
        'answer' => 0, 'hint_id' => null, 'hint_en' => null,
    ]]]]);

    (new GenerateQuestions($generation, $subject->key, 5))->handle(app(QuestionGenerator::class));

    QuestionWriter::assertPrompted(fn ($prompt) => str_contains($prompt->prompt, 'Pelajaran teknologi informasi'));
    expect($generation->items()->sole()->only(['status', 'error']))->toBe(['status' => 'done', 'error' => null])
        ->and(Question::query()->where('subject', $subject->key)->count())->toBe(1);
});

/** A valid generated question whose prompt is made unique by $n. */
function retryQuestion(int $n): array
{
    return [
        'prompt_id' => "Hasil {$n} + 1 adalah…", 'prompt_en' => "What is {$n} + 1?",
        'options' => [['id' => (string) ($n + 1), 'en' => (string) ($n + 1)], ['id' => (string) ($n + 2), 'en' => (string) ($n + 2)], ['id' => (string) ($n + 3), 'en' => (string) ($n + 3)], ['id' => (string) ($n + 4), 'en' => (string) ($n + 4)]],
        'answer' => 0, 'picture' => [], 'option_emoji' => [], 'hint_id' => 'Tambah satu.', 'hint_en' => 'Add one.',
    ];
}

function connectRetryAi(): void
{
    Setting::set('ai.base_url', 'https://ai.test/v1', 'ai');
    Setting::set('ai.api_key', Crypt::encryptString('sk-test-1234'), 'ai');
    Setting::set('ai.model', 'gpt-4o-mini', 'ai');
}

it('asks again after an empty batch instead of stopping short of the target', function (): void {
    Sleep::fake();
    connectRetryAi();
    $generation = progressGeneration(['math'], [4], 10);
    QuestionWriter::fake([
        ['questions' => array_map(retryQuestion(...), range(101, 105))],
        ['questions' => []],
        ['questions' => array_map(retryQuestion(...), range(106, 110))],
    ]);

    (new GenerateQuestions($generation, 'math', 4))->handle(app(QuestionGenerator::class));

    expect($generation->items()->sole()->only(['status', 'created_count', 'error']))->toBe(['status' => 'done', 'created_count' => 10, 'error' => null])
        ->and(Question::query()->where('generation_id', $generation->id)->count())->toBe(10);
});

it('reads questions from a reply wrapped in a json code fence', function (): void {
    connectRetryAi();
    $generation = progressGeneration(['math'], [4], 2);
    $reply = "```json\n".json_encode(['questions' => [retryQuestion(201), retryQuestion(202)]])."\n```";
    Http::fake(['ai.test/v1/chat/completions' => Http::response([
        'id' => 'chatcmpl-1', 'object' => 'chat.completion', 'model' => 'gpt-4o-mini',
        'choices' => [['index' => 0, 'message' => ['role' => 'assistant', 'content' => $reply], 'finish_reason' => 'stop']],
        'usage' => ['prompt_tokens' => 10, 'completion_tokens' => 10, 'total_tokens' => 20],
    ])]);

    (new GenerateQuestions($generation, 'math', 4))->handle(app(QuestionGenerator::class));

    expect($generation->items()->sole()->only(['status', 'created_count']))->toBe(['status' => 'done', 'created_count' => 2]);
    Http::assertSentCount(1);
});

it('retries a failed model call and keeps going', function (): void {
    Sleep::fake();
    connectRetryAi();
    $generation = progressGeneration(['math'], [4], 5);
    $calls = 0;
    QuestionWriter::fake(function () use (&$calls): array {
        if (++$calls === 1) {
            throw new RuntimeException('gateway timeout');
        }

        return ['questions' => array_map(retryQuestion(...), range(301, 305))];
    });

    (new GenerateQuestions($generation, 'math', 4))->handle(app(QuestionGenerator::class));

    expect($calls)->toBe(2)
        ->and($generation->items()->sole()->only(['status', 'created_count', 'error']))->toBe(['status' => 'done', 'created_count' => 5, 'error' => null]);
});

it('explains a short run after the model keeps replying empty', function (): void {
    Sleep::fake();
    connectRetryAi();
    $generation = progressGeneration(['math'], [4], 10);
    $calls = 0;
    QuestionWriter::fake(function () use (&$calls): array {
        return ['questions' => ++$calls === 1 ? array_map(retryQuestion(...), range(401, 405)) : []];
    });

    (new GenerateQuestions($generation, 'math', 4))->handle(app(QuestionGenerator::class));

    $item = $generation->items()->sole();
    expect($calls)->toBe(1 + QuestionGenerator::MAX_FAILED_BATCHES + 1)
        ->and($item->status)->toBe('done')
        ->and($item->created_count)->toBe(5)
        ->and($item->error)->toContain('math/4')->toContain('5')->toContain('10');
    expect($generation->fresh()->status)->toBe('done');
});

it('gives up with the model error when every call fails', function (): void {
    Sleep::fake();
    connectRetryAi();
    $generation = progressGeneration(['math'], [4], 5);
    QuestionWriter::fake(fn () => throw new RuntimeException('model overloaded'));

    (new GenerateQuestions($generation, 'math', 4))->handle(app(QuestionGenerator::class));

    expect($generation->items()->sole()->only(['status', 'created_count']))->toBe(['status' => 'failed', 'created_count' => 0])
        ->and($generation->fresh()->status)->toBe('failed');
});
