<?php

use App\Jobs\GenerateQuestions;
use App\Models\QuestionGeneration;
use App\Models\QuestionGenerationItem;
use App\Models\User;
use App\Services\Ai\AiSettings;
use App\Services\Ai\OpenAiCompatibleClient;
use App\Services\Ai\QuestionGenerator;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Queue;
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
        'games' => ['sky-quiz'], 'status' => 'queued', 'total_jobs' => count($subjects) * count($grades),
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

        public function generate(QuestionGeneration $generation, string $subject, int $grade, int $count, ?Closure $onProgress = null): array
        {
            $created = 0;
            $skipped = 0;
            foreach ($this->batches as [$created, $skipped]) {
                $onProgress?->__invoke($created, $skipped);
                $item = $generation->items()->where('subject', $subject)->where('grade', $grade)->sole();
                $this->seen[] = ['status' => $item->status, 'created' => $item->created_count];
            }
            if ($this->throw !== null) {
                throw $this->throw;
            }

            return ['created' => $created, 'skipped' => $skipped];
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
        ->where('generations.0.items.0', ['subject' => 'math', 'grade' => 1, 'status' => 'done', 'created' => 5, 'skipped' => 0, 'target' => 5, 'error' => null])
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
