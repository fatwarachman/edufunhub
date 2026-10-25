<?php

use App\Ai\Agents\QuestionWriter;
use App\Models\Question;
use App\Models\QuestionGeneration;
use App\Models\Setting;
use App\Models\User;
use App\Services\Ai\QuestionGenerator;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\Crypt;
use Inertia\Testing\AssertableInertia as Assert;

beforeEach(function (): void {
    config(['scout.driver' => 'null', 'screen-time.timezone' => 'Asia/Jakarta']);
    $this->withoutVite();
    Question::query()->delete();
    $this->admin = User::factory()->superadmin()->create();
    $this->actingAs($this->admin);
});

afterEach(fn () => Carbon::setTestNow());

function reviewBatch(array $attributes = []): QuestionGeneration
{
    return QuestionGeneration::query()->create([
        'model' => 'test-model', 'subjects' => ['math'], 'grades' => [3], 'per_combination' => 5,
        'games' => ['sky-quiz'], 'activate' => false, 'status' => 'done', 'total_jobs' => 1, 'done_jobs' => 1,
        'requested_by' => test()->admin->id, ...$attributes,
    ]);
}

describe('pagination', function (): void {
    it('paginates the all-subjects list with page numbers', function (): void {
        Question::factory()->count(45)->create();

        $this->get('/admin/questions?subject=all&page=2')->assertOk()->assertInertia(fn (Assert $page) => $page
            ->where('questions.total', 45)
            ->where('questions.current_page', 2)
            ->where('questions.last_page', 3)
            ->has('questions.data', 20)
            ->where('perPageOptions', [20, 50, 100])
            ->where('questions.links.2.active', true));
    });

    it('lets the admin pick the page size and ignores unknown sizes', function (): void {
        Question::factory()->count(60)->create();

        $this->get('/admin/questions?subject=all&per_page=50')->assertInertia(fn (Assert $page) => $page
            ->where('questions.per_page', 50)
            ->has('questions.data', 50)
            ->where('filters.per_page', '50'));

        $this->get('/admin/questions?subject=all&per_page=5000')->assertInertia(fn (Assert $page) => $page
            ->where('questions.per_page', 20)
            ->missing('filters.per_page'));
    });

    it('keeps filters in the page links', function (): void {
        Question::factory()->count(25)->create(['subject' => 'math']);

        $this->get('/admin/questions?subject=math&per_page=20')->assertInertia(fn (Assert $page) => expect($page->toArray()['props']['questions']['next_page_url'])
            ->toContain('subject=math')->toContain('per_page=20')->toContain('page=2'));
    });
});

describe('AI batch review', function (): void {
    it('lists only the questions of one AI batch, 50 per page, with a batch summary', function (): void {
        $batch = reviewBatch(['created_count' => 3, 'english_only' => true]);
        $other = reviewBatch(['created_count' => 2]);
        Question::factory()->count(3)->create(['source' => Question::SOURCE_AI, 'generation_id' => $batch->id, 'is_active' => false]);
        Question::factory()->count(2)->create(['source' => Question::SOURCE_AI, 'generation_id' => $other->id]);
        Question::factory()->count(4)->create(['source' => 'admin']);

        $this->get("/admin/questions?generation={$batch->id}")->assertOk()->assertInertia(fn (Assert $page) => $page
            ->where('mode', 'list')
            ->where('questions.total', 3)
            ->where('questions.per_page', 50)
            ->where('questions.data.0.generation_id', $batch->id)
            ->where('batch.id', $batch->id)
            ->where('batch.inactive', 3)
            ->where('batch.english_only', true)
            ->where('batch.requested_by', $this->admin->name)
            ->has('batches', 2)
            ->where('batches.0.id', $other->id));
    });

    it('ignores a non-numeric batch and reports a missing one', function (): void {
        Question::factory()->count(2)->create();

        $this->get('/admin/questions?subject=all&generation=abc')->assertInertia(fn (Assert $page) => $page
            ->where('questions.total', 2)
            ->missing('filters.generation')
            ->where('batch', null));

        $this->get('/admin/questions?generation=999999')->assertInertia(fn (Assert $page) => $page
            ->where('mode', 'list')
            ->where('questions.total', 0)
            ->where('batch', null));
    });

    it('does not offer batches that produced no questions', function (): void {
        reviewBatch(['created_count' => 0, 'status' => 'failed']);
        $good = reviewBatch(['created_count' => 1]);

        $this->get('/admin/questions?subject=all')->assertInertia(fn (Assert $page) => $page
            ->has('batches', 1)
            ->where('batches.0.id', $good->id));
    });
});

describe('created-at filter', function (): void {
    it('filters by a relative window', function (): void {
        Carbon::setTestNow('2026-11-10 12:00:00');
        Question::factory()->create(['created_at' => now()->subMinutes(30)]);
        Question::factory()->create(['created_at' => now()->subHours(5)]);
        Question::factory()->create(['created_at' => now()->subDays(3)]);
        Question::factory()->create(['created_at' => now()->subDays(20)]);

        foreach (['1h' => 1, '24h' => 2, '7d' => 3, '30d' => 4] as $window => $total) {
            $this->get("/admin/questions?created={$window}")->assertInertia(fn (Assert $page) => $page
                ->where('mode', 'list')
                ->where('questions.total', $total));
        }

        $this->get('/admin/questions?subject=all&created=forever')->assertInertia(fn (Assert $page) => $page
            ->where('questions.total', 4)
            ->missing('filters.created'));
    });

    it('filters by a date range in the admin timezone', function (): void {
        // 2026-11-09 23:30 WIB = 16:30 UTC; 2026-11-10 00:30 WIB = 2026-11-09 17:30 UTC.
        Question::factory()->create(['created_at' => '2026-11-09 16:30:00']);
        Question::factory()->create(['created_at' => '2026-11-09 17:30:00']);
        Question::factory()->create(['created_at' => '2026-11-10 18:00:00']);

        $this->get('/admin/questions?created_from=2026-11-10&created_to=2026-11-10')->assertInertia(fn (Assert $page) => $page
            ->where('questions.total', 1)
            ->where('timezone', 'Asia/Jakarta'));

        $this->get('/admin/questions?created_from=2026-11-10')->assertInertia(fn (Assert $page) => $page->where('questions.total', 2));
        $this->get('/admin/questions?created_to=2026-11-09')->assertInertia(fn (Assert $page) => $page->where('questions.total', 1));

        $this->get('/admin/questions?subject=all&created_from=2026-02-31')->assertInertia(fn (Assert $page) => $page
            ->where('questions.total', 3)
            ->missing('filters.created_from'));
    });

    it('sorts by creation time and exposes created_at', function (): void {
        $old = Question::factory()->create(['created_at' => now()->subDays(2)]);
        $new = Question::factory()->create(['created_at' => now()]);

        $this->get('/admin/questions?subject=all&sort=newest')->assertInertia(fn (Assert $page) => $page
            ->where('questions.data.0.id', $new->id)
            ->has('questions.data.0.created_at'));
        $this->get('/admin/questions?subject=all&sort=oldest')->assertInertia(fn (Assert $page) => $page
            ->where('questions.data.0.id', $old->id));
    });
});

describe('English-only AI questions', function (): void {
    beforeEach(function (): void {
        config(['queue.default' => 'sync', 'ai.question_generation.connection' => 'sync']);
        Setting::set('ai.base_url', 'https://ai.test/v1', 'ai');
        Setting::set('ai.api_key', Crypt::encryptString('test-key'), 'ai');
        Setting::set('ai.model', 'gpt-4o-mini', 'ai');
    });

    function englishItem(): array
    {
        return [
            'prompt_id' => 'Apa bahasa Inggris dari "kucing"?', 'prompt_en' => 'What is the English word for the animal that says "meow"?',
            'options' => [['id' => 'Kucing', 'en' => 'Cat'], ['id' => 'Anjing', 'en' => 'Dog'], ['id' => 'Ayam', 'en' => 'Hen'], ['id' => 'Sapi', 'en' => 'Cow']],
            'answer' => 0, 'picture' => [], 'option_emoji' => [], 'hint_id' => 'Kucing = cat.', 'hint_en' => 'A cat says meow.',
        ];
    }

    it('writes English subject questions fully in English when asked', function (): void {
        QuestionWriter::fake([['questions' => [englishItem()]]]);

        $this->post('/admin/questions/generate', ['scope' => 'custom', 'subjects' => ['english'], 'grades' => [8], 'per_combination' => 1, 'games' => ['sky-quiz'], 'english_only' => true])
            ->assertSessionHasNoErrors();

        $generation = QuestionGeneration::query()->sole();
        $question = Question::query()->sole();
        expect($generation->english_only)->toBeTrue()
            ->and($question->prompt_id)->toBe('What is the English word for the animal that says "meow"?')
            ->and($question->prompt_en)->toBe($question->prompt_id)
            ->and(array_column($question->options, 'id'))->toBe(['Cat', 'Dog', 'Hen', 'Cow'])
            ->and($question->hint_id)->toBe('A cat says meow.');

        QuestionWriter::assertPrompted(fn ($prompt) => str_contains($prompt->prompt, 'Language: English only'));
    });

    it('keeps other subjects bilingual in the same request', function (): void {
        QuestionWriter::fake([['questions' => [englishItem()]], ['questions' => [englishItem()]]]);

        $this->post('/admin/questions/generate', ['scope' => 'custom', 'subjects' => ['math', 'english'], 'grades' => [8], 'per_combination' => 1, 'games' => ['sky-quiz'], 'english_only' => true])
            ->assertSessionHasNoErrors();

        $math = Question::query()->where('subject', 'math')->sole();
        $english = Question::query()->where('subject', 'english')->sole();
        expect($math->prompt_id)->toBe('Apa bahasa Inggris dari "kucing"?')
            ->and($english->prompt_id)->toStartWith('What is');
    });

    it('stores false when English is not picked and stays bilingual by default', function (): void {
        QuestionWriter::fake([['questions' => [englishItem()]]]);

        $this->post('/admin/questions/generate', ['scope' => 'custom', 'subjects' => ['math'], 'grades' => [8], 'per_combination' => 1, 'games' => ['sky-quiz'], 'english_only' => true])
            ->assertSessionHasNoErrors();

        expect(QuestionGeneration::query()->sole()->english_only)->toBeFalse();
        QuestionWriter::assertNotPrompted(fn ($prompt) => str_contains($prompt->prompt, 'English only'));
    });

    it('rejects English-only items whose options collapse into duplicates', function (): void {
        $question = ['prompt_id' => 'Pilih yang benar', 'prompt_en' => 'Pick the right one', 'visual' => null,
            'options' => [['id' => 'Satu', 'en' => 'One'], ['id' => 'Uno', 'en' => 'One'], ['id' => 'Dua', 'en' => 'Two']],
            'answer' => 0, 'hint_id' => null, 'hint_en' => null];

        expect(QuestionGenerator::englishOnly($question))->toBeNull();
    });

    it('offers the english subject key to the generate page', function (): void {
        $this->get('/admin/questions/generate')->assertInertia(fn (Assert $page) => $page->where('englishSubject', 'english'));
    });
});
