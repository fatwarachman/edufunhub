<?php

use App\Ai\Agents\QuestionWriter;
use App\Jobs\IndexQuestionBlueprint;
use App\Models\Question;
use App\Models\QuestionBlueprint;
use App\Models\QuestionBlueprintChunk;
use App\Models\QuestionGeneration;
use App\Models\Setting;
use App\Models\User;
use App\Services\Ai\BlueprintChunker;
use App\Services\Ai\BlueprintIndexer;
use App\Services\Ai\BlueprintRetriever;
use App\Services\Ai\BlueprintTextExtractor;
use App\Services\Ai\EmbeddingClient;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Crypt;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Queue;
use Illuminate\Support\Facades\Storage;
use Inertia\Testing\AssertableInertia as Assert;

beforeEach(function (): void {
    config(['scout.driver' => 'null']);
    $this->withoutVite();
    Storage::fake('local');
    $this->admin = User::factory()->superadmin()->create();
    $this->actingAs($this->admin);
});

function blueprintFixture(string $name): string
{
    return base_path('tests/Fixtures/blueprints/'.$name);
}

/** A blueprint of about 30k characters with one section per grade. */
function longBlueprint(): string
{
    $topics = [1 => 'PENJUMLAHAN', 2 => 'PENGURANGAN', 3 => 'PERKALIAN', 4 => 'PECAHAN', 5 => 'BANGUN DATAR', 6 => 'STATISTIKA DASAR',
        7 => 'BILANGAN BULAT', 8 => 'PERSAMAAN LINEAR', 9 => 'TEOREMA PYTHAGORAS', 10 => 'FUNGSI KUADRAT', 11 => 'TRIGONOMETRI', 12 => 'LIMIT FUNGSI'];
    $text = "KISI-KISI MATEMATIKA SD SMP SMA\n";
    foreach ($topics as $grade => $topic) {
        $text .= "\nKELAS {$grade} {$topic}\nKompetensi: siswa kelas {$grade} memahami ".mb_strtolower($topic).".\n"
            .str_repeat('Indikator soal: menyelesaikan masalah '.mb_strtolower($topic)." dalam konteks sehari-hari dengan langkah yang runtut. \n", 25);
    }

    return $text;
}

function blueprintUpload(string $fixture, ?string $as = null): UploadedFile
{
    return new UploadedFile(blueprintFixture($fixture), $as ?? $fixture, null, null, true);
}

describe('text extraction', function (): void {
    it('reads the text of every supported format', function (string $file, string $extension, array $expected): void {
        $text = app(BlueprintTextExtractor::class)->extract(blueprintFixture($file), $extension);

        foreach ($expected as $needle) {
            expect($text)->toContain($needle);
        }
    })->with([
        'pdf with embedded unicode font' => ['kisi-unicode.pdf', 'pdf', ['Kisi-kisi Soal Bahasa Inggris Kelas 8', '“cat” & “dog”', 'Menentukan ide pokok paragraf']],
        'pdf with standard font' => ['kisi-standard.pdf', 'pdf', ['sistem pernapasan manusia', 'fungsi paru-paru']],
        'docx with a table' => ['kisi.docx', 'docx', ['Kisi-kisi Matematika Kelas 4', 'Indikator | Bentuk soal', 'Menyederhanakan pecahan | Pilihan ganda']],
        'xlsx' => ['kisi.xlsx', 'xlsx', ['No | Kompetensi Dasar | Indikator Soal', '2 | Teks narasi | Menentukan tokoh utama cerita rakyat']],
    ]);

    it('rejects files without readable text', function (): void {
        $path = tempnam(sys_get_temp_dir(), 'bp');
        file_put_contents($path, "%PDF-1.4\n1 0 obj << /Type /Page >> endobj\n%%EOF");

        expect(fn () => app(BlueprintTextExtractor::class)->extract($path, 'pdf'))->toThrow(RuntimeException::class);
        @unlink($path);
    });
});

describe('managing blueprints', function (): void {
    it('uploads a blueprint, keeps the file privately and stores its text', function (): void {
        Queue::fake();
        $this->post('/admin/questions/blueprints', ['title' => 'Kisi-kisi Matematika', 'subject_key' => 'math', 'file' => blueprintUpload('kisi.docx')])
            ->assertSessionHasNoErrors()->assertRedirect();

        $blueprint = QuestionBlueprint::query()->sole();
        Queue::assertPushed(IndexQuestionBlueprint::class, fn (IndexQuestionBlueprint $job): bool => $job->blueprint->is($blueprint));
        expect($blueprint->index_status)->toBe(QuestionBlueprint::INDEX_PENDING);
        expect($blueprint->subject_key)->toBe('math')
            ->and($blueprint->extension)->toBe('docx')
            ->and($blueprint->original_name)->toBe('kisi.docx')
            ->and($blueprint->uploaded_by)->toBe($this->admin->id)
            ->and($blueprint->content)->toContain('Menyederhanakan pecahan');
        Storage::disk('local')->assertExists($blueprint->path);
        expect($blueprint->path)->toStartWith(QuestionBlueprint::FOLDER.'/');
    });

    it('rejects unsupported, oversized and text-less files', function (): void {
        $this->post('/admin/questions/blueprints', ['title' => 'Exe', 'file' => UploadedFile::fake()->create('virus.exe', 10)])
            ->assertSessionHasErrors('file');
        $this->post('/admin/questions/blueprints', ['title' => 'Big', 'file' => UploadedFile::fake()->create('big.pdf', QuestionBlueprint::MAX_KB + 1, 'application/pdf')])
            ->assertSessionHasErrors('file');
        $this->post('/admin/questions/blueprints', ['title' => 'Scan', 'file' => UploadedFile::fake()->createWithContent('scan.txt', '12 34')])
            ->assertSessionHasErrors(['file' => __('blueprint.no_text')]);

        expect(QuestionBlueprint::query()->count())->toBe(0);
    });

    it('lists blueprints on the generate page', function (): void {
        $blueprint = QuestionBlueprint::factory()->create(['title' => 'Kisi PAS', 'uploaded_by' => $this->admin->id]);

        $this->get('/admin/questions/generate')->assertInertia(fn (Assert $page) => $page
            ->has('blueprints', 1)
            ->where('blueprints.0.id', $blueprint->id)
            ->where('blueprints.0.uploaded_by', $this->admin->name)
            ->missing('blueprints.0.path')
            ->where('blueprintLimits.budget', BlueprintRetriever::BUDGET)
            ->where('blueprints.0.index_status', $blueprint->index_status));
    });

    it('lists every blueprint on the blueprint library page', function (): void {
        $active = QuestionBlueprint::factory()->create(['title' => 'Kisi PAS Matematika', 'subject_key' => 'math', 'uploaded_by' => $this->admin->id]);
        $inactive = QuestionBlueprint::factory()->inactive()->create(['title' => 'Kisi lama']);

        $this->get('/admin/questions/blueprints')->assertOk()->assertInertia(fn (Assert $page) => $page
            ->component('admin/questions/blueprints')
            ->has('blueprints', 2)
            ->where('blueprints.0.id', $inactive->id)
            ->where('blueprints.0.is_active', false)
            ->where('blueprints.1.id', $active->id)
            ->where('blueprints.1.uploaded_by', $this->admin->name)
            ->missing('blueprints.0.path')
            ->where('blueprintLimits.maxKb', QuestionBlueprint::MAX_KB)
            ->where('subjects', fn ($subjects): bool => collect($subjects)->contains('math'))
            ->where('maxBlueprints', QuestionGeneration::MAX_BLUEPRINTS));
    });

    it('lets the admin correct the text, download the original and delete it', function (): void {
        Storage::disk('local')->put('question-blueprints/a.txt', 'asli');
        $blueprint = QuestionBlueprint::factory()->create(['path' => 'question-blueprints/a.txt', 'original_name' => 'kisi asli.txt']);

        $this->put("/admin/questions/blueprints/{$blueprint->id}", ['title' => 'Baru', 'subject_key' => '', 'is_active' => false, 'content' => "Indikator baru:   menentukan gagasan utama paragraf.\n\n\n\nSelesai."])
            ->assertSessionHasNoErrors();
        $blueprint->refresh();
        expect($blueprint->title)->toBe('Baru')
            ->and($blueprint->is_active)->toBeFalse()
            ->and($blueprint->content)->toBe("Indikator baru: menentukan gagasan utama paragraf.\n\nSelesai.");

        $this->get("/admin/questions/blueprints/{$blueprint->id}/download")->assertOk()->assertDownload('kisi asli.txt');

        $this->delete("/admin/questions/blueprints/{$blueprint->id}")->assertRedirect();
        expect(QuestionBlueprint::query()->count())->toBe(0);
        Storage::disk('local')->assertMissing('question-blueprints/a.txt');
    });

    it('is only for super admins', function (): void {
        $blueprint = QuestionBlueprint::factory()->create();
        $this->actingAs(User::factory()->teacher()->create());

        $this->get('/admin/questions/blueprints')->assertForbidden();
        $this->post('/admin/questions/blueprints', ['title' => 'X', 'file' => blueprintUpload('kisi.docx')])->assertForbidden();
        $this->get("/admin/questions/blueprints/{$blueprint->id}/download")->assertForbidden();
        $this->delete("/admin/questions/blueprints/{$blueprint->id}")->assertForbidden();
        expect(QuestionBlueprint::query()->count())->toBe(1);
    });
});

describe('generating with a blueprint', function (): void {
    beforeEach(function (): void {
        config(['queue.default' => 'sync', 'ai.question_generation.connection' => 'sync']);
        Setting::set('ai.base_url', 'https://ai.test/v1', 'ai');
        Setting::set('ai.api_key', Crypt::encryptString('test-key'), 'ai');
        Setting::set('ai.model', 'gpt-4o-mini', 'ai');
    });

    function blueprintQuestion(): array
    {
        return [
            'prompt_id' => 'Apa ide pokok paragraf tersebut?', 'prompt_en' => 'What is the main idea of the paragraph?',
            'options' => [['id' => 'A', 'en' => 'A'], ['id' => 'B', 'en' => 'B'], ['id' => 'C', 'en' => 'C'], ['id' => 'D', 'en' => 'D']],
            'answer' => 2, 'picture' => [], 'option_emoji' => [], 'hint_id' => 'Baca kalimat utama.', 'hint_en' => 'Read the topic sentence.',
        ];
    }

    it('sends the blueprint text to the AI and records it on the request', function (): void {
        $blueprint = QuestionBlueprint::factory()->create(['title' => 'Kisi PAS', 'content' => "Indikator 7: menentukan ide pokok paragraf deskriptif.\nLevel kognitif: C2."]);
        QuestionWriter::fake([['questions' => [blueprintQuestion()]]]);

        $this->post('/admin/questions/generate', ['scope' => 'custom', 'subjects' => ['language'], 'grades' => [8], 'per_combination' => 1, 'games' => ['sky-quiz'], 'blueprint_id' => $blueprint->id])
            ->assertSessionHasNoErrors();

        $generation = QuestionGeneration::query()->sole();
        expect($generation->blueprint_id)->toBe($blueprint->id)
            ->and(Question::query()->where('generation_id', $generation->id)->count())->toBe(1)
            ->and($generation->toProgressPayload()['blueprint'])->toBe(['id' => $blueprint->id, 'title' => 'Kisi PAS']);
        QuestionWriter::assertPrompted(fn ($prompt) => str_contains($prompt->prompt, 'Kisi PAS')
            && str_contains($prompt->prompt, 'Indikator 7: menentukan ide pokok paragraf deskriptif.')
            && str_contains($prompt->prompt, '<<<BLUEPRINT'));

        $this->get("/admin/questions?generation={$generation->id}")->assertInertia(fn (Assert $page) => $page->where('batch.blueprint', 'Kisi PAS'));
    });

    it('follows several picked blueprints in one request', function (): void {
        $first = QuestionBlueprint::factory()->create(['title' => 'Kisi PAS', 'content' => 'Indikator 7: menentukan ide pokok paragraf deskriptif.']);
        $second = QuestionBlueprint::factory()->create(['title' => 'Kisi PTS', 'content' => 'Indikator 3: menyimpulkan isi teks narasi pendek.']);
        QuestionWriter::fake([['questions' => [blueprintQuestion()]]]);

        $this->post('/admin/questions/generate', ['scope' => 'custom', 'subjects' => ['language'], 'grades' => [8], 'per_combination' => 1, 'games' => ['sky-quiz'], 'blueprint_ids' => [$second->id, $first->id]])
            ->assertSessionHasNoErrors();

        $generation = QuestionGeneration::query()->sole();
        expect($generation->blueprints->pluck('id')->all())->toBe([$second->id, $first->id])
            ->and($generation->blueprint_id)->toBe($second->id)
            ->and($generation->toProgressPayload()['blueprints'])->toBe([['id' => $second->id, 'title' => 'Kisi PTS'], ['id' => $first->id, 'title' => 'Kisi PAS']]);
        QuestionWriter::assertPrompted(fn ($prompt) => str_contains($prompt->prompt, 'Indikator 7: menentukan ide pokok')
            && str_contains($prompt->prompt, 'Indikator 3: menyimpulkan isi teks')
            && substr_count($prompt->prompt, '<<<BLUEPRINT') === 2);
        $this->get("/admin/questions?generation={$generation->id}")->assertInertia(fn (Assert $page) => $page->where('batch.blueprint', 'Kisi PTS, Kisi PAS'));
        $this->get('/admin/questions/blueprints')->assertInertia(fn (Assert $page) => $page->where('blueprints.0.generations_count', 1)->where('blueprints.1.generations_count', 1));
    });

    it('limits how many blueprints one request may follow', function (): void {
        Queue::fake();
        $ids = QuestionBlueprint::factory()->count(QuestionGeneration::MAX_BLUEPRINTS + 1)->create()->pluck('id')->all();

        $this->post('/admin/questions/generate', ['scope' => 'custom', 'subjects' => ['language'], 'grades' => [8], 'per_combination' => 1, 'games' => ['sky-quiz'], 'blueprint_ids' => $ids])
            ->assertSessionHasErrors('blueprint_ids');
        $this->post('/admin/questions/generate', ['scope' => 'custom', 'subjects' => ['language'], 'grades' => [8], 'per_combination' => 1, 'games' => ['sky-quiz'], 'blueprint_ids' => [$ids[0], $ids[0]]])
            ->assertSessionHasErrors('blueprint_ids.0');
        expect(QuestionGeneration::query()->count())->toBe(0);
    });

    it('starts the generate form with the blueprints ticked on the library', function (): void {
        $first = QuestionBlueprint::factory()->create();
        $second = QuestionBlueprint::factory()->create();
        $inactive = QuestionBlueprint::factory()->inactive()->create();

        $this->get("/admin/questions/generate?blueprints={$second->id},{$inactive->id},abc,{$first->id},{$second->id}")
            ->assertInertia(fn (Assert $page) => $page
                ->where('preselectedBlueprints', [$second->id, $first->id])
                ->where('maxBlueprints', QuestionGeneration::MAX_BLUEPRINTS));
        $this->get('/admin/questions/generate')->assertInertia(fn (Assert $page) => $page->where('preselectedBlueprints', []));
    });

    it('sends only the sections of a long blueprint that match the grade and subject', function (): void {
        $blueprint = QuestionBlueprint::factory()->create(['subject_key' => 'math', 'content' => longBlueprint()]);
        app(BlueprintIndexer::class)->index($blueprint);
        QuestionWriter::fake([['questions' => [blueprintQuestion()]]]);

        $this->post('/admin/questions/generate', ['scope' => 'custom', 'subjects' => ['math'], 'grades' => [8], 'per_combination' => 1, 'games' => ['sky-quiz'], 'blueprint_id' => $blueprint->id])
            ->assertSessionHasNoErrors();

        QuestionWriter::assertPrompted(fn ($prompt) => str_contains($prompt->prompt, 'KELAS 8 PERSAMAAN LINEAR')
            && ! str_contains($prompt->prompt, 'KELAS 1 PENJUMLAHAN')
            && mb_strlen($prompt->prompt) < BlueprintRetriever::BUDGET + 3000);
    });

    it('rejects inactive or unknown blueprints and works without one', function (): void {
        $inactive = QuestionBlueprint::factory()->inactive()->create();
        $payload = ['scope' => 'custom', 'subjects' => ['language'], 'grades' => [8], 'per_combination' => 1, 'games' => ['sky-quiz']];

        $this->post('/admin/questions/generate', [...$payload, 'blueprint_ids' => [$inactive->id]])->assertSessionHasErrors('blueprint_ids.0');
        $this->post('/admin/questions/generate', [...$payload, 'blueprint_ids' => [99999]])->assertSessionHasErrors('blueprint_ids.0');
        $this->post('/admin/questions/generate', [...$payload, 'blueprint_id' => 99999])->assertSessionHasErrors('blueprint_ids.0');

        QuestionWriter::fake([['questions' => [blueprintQuestion()]]]);
        $this->post('/admin/questions/generate', [...$payload, 'blueprint_ids' => []])->assertSessionHasNoErrors();
        expect(QuestionGeneration::query()->sole()->blueprint_id)->toBeNull();
        QuestionWriter::assertNotPrompted(fn ($prompt) => str_contains($prompt->prompt, 'BLUEPRINT'));
    });

    it('keeps requests and their questions when the blueprint is deleted', function (): void {
        $blueprint = QuestionBlueprint::factory()->create();
        QuestionWriter::fake([['questions' => [blueprintQuestion()]]]);
        $this->post('/admin/questions/generate', ['scope' => 'custom', 'subjects' => ['language'], 'grades' => [8], 'per_combination' => 1, 'games' => ['sky-quiz'], 'blueprint_id' => $blueprint->id]);

        $this->delete("/admin/questions/blueprints/{$blueprint->id}");

        expect(QuestionGeneration::query()->sole()->blueprint_id)->toBeNull()
            ->and(Question::query()->where('source', Question::SOURCE_AI)->count())->toBe(1);
    });
});

describe('retrieval (RAG)', function (): void {
    it('splits a blueprint into headed sections with the grades they mention', function (): void {
        $chunks = app(BlueprintChunker::class)->chunk(longBlueprint());

        expect(count($chunks))->toBeGreaterThanOrEqual(12)
            ->and(collect($chunks)->every(fn (array $chunk): bool => mb_strlen($chunk['content']) <= BlueprintChunker::MAX))->toBeTrue();
        $grade8 = collect($chunks)->first(fn (array $chunk): bool => $chunk['heading'] === 'KELAS 8 PERSAMAAN LINEAR');
        expect($grade8['grades'])->toBe([8]);
    });

    it('reads grades from class names, ranges and school levels', function (string $text, array $grades): void {
        expect(BlueprintChunker::grades($text))->toBe($grades);
    })->with([
        'single' => ['untuk kelas 8', [8]],
        'range' => ['Kelas 7-9', [7, 8, 9]],
        'roman' => ['kelas XI', [11]],
        'level' => ['jenjang SMA', [10, 11, 12]],
        'none' => ['indikator pemahaman teks', []],
    ]);

    it('drops page headers and footers that repeat on every page', function (): void {
        $page = fn (int $n): string => "Pusmendik Kisi-Kisi TKA Halaman {$n} dari 12\nBAGIAN {$n} MATERI\n".str_repeat("Isi materi bagian {$n} yang cukup panjang.\n", 10);
        $chunks = app(BlueprintChunker::class)->chunk(implode("\n", array_map($page, range(1, 4))));

        expect(collect($chunks)->pluck('content')->implode("\n"))->not->toContain('Halaman');
    });

    it('indexes an uploaded blueprint in the queue and stores the sections', function (): void {
        $blueprint = QuestionBlueprint::factory()->create(['content' => longBlueprint(), 'index_status' => QuestionBlueprint::INDEX_PENDING]);

        (new IndexQuestionBlueprint($blueprint))->handle(app(BlueprintIndexer::class));

        $blueprint->refresh();
        expect($blueprint->index_status)->toBe(QuestionBlueprint::INDEX_READY)
            ->and($blueprint->chunks_count)->toBe($blueprint->chunks()->count())
            ->and($blueprint->chunks_count)->toBeGreaterThanOrEqual(12)
            ->and($blueprint->embedding_model)->toBeNull()
            ->and($blueprint->indexed_at)->not->toBeNull();
    });

    it('sends a short blueprint whole', function (): void {
        $blueprint = QuestionBlueprint::factory()->create(['content' => "KISI-KISI IPA\nIndikator: menjelaskan fungsi paru-paru."]);
        app(BlueprintIndexer::class)->index($blueprint);

        $result = app(BlueprintRetriever::class)->retrieve($blueprint, 'IPA kelas 5', 5);
        expect($result['mode'])->toBe('whole')->and($result['text'])->toContain('fungsi paru-paru');
    });

    it('still retrieves sections for a blueprint that was never indexed', function (): void {
        $blueprint = QuestionBlueprint::factory()->create(['content' => longBlueprint()]);

        $result = app(BlueprintRetriever::class)->retrieve($blueprint, 'matematika kelas 11 trigonometri', 11);
        expect($result['text'])->toContain('KELAS 11 TRIGONOMETRI')
            ->and(mb_strlen($result['text']))->toBeLessThanOrEqual(BlueprintRetriever::BUDGET);
    });

    it('uses embeddings when an embedding model is set and falls back to keywords when it fails', function (): void {
        Setting::set('ai.base_url', 'https://ai.test/v1', 'ai');
        Setting::set('ai.api_key', Crypt::encryptString('test-key'), 'ai');
        app(EmbeddingClient::class)->saveModel('embed-test');
        $down = false;
        Http::fake(['ai.test/v1/embeddings' => function ($request) use (&$down) {
            if ($down) {
                return Http::response('down', 500);
            }
            $inputs = $request->data()['input'];

            return Http::response(['data' => collect($inputs)->values()->map(fn (string $text, int $index): array => [
                'index' => $index,
                'embedding' => str_contains($text, 'PYTHAGORAS') || str_contains($text, 'segitiga siku') ? [1.0, 0.1, 0.0] : [0.0, 0.1, 1.0],
            ])->all()]);
        }]);

        $blueprint = QuestionBlueprint::factory()->create(['content' => longBlueprint()]);
        app(BlueprintIndexer::class)->index($blueprint);
        $blueprint->refresh();
        expect($blueprint->embedding_model)->toBe('embed-test')
            ->and(count($blueprint->chunks()->first()->vector()))->toBe(3);

        $result = app(BlueprintRetriever::class)->retrieve($blueprint, 'sisi miring segitiga siku', 9);
        expect($result['mode'])->toBe('hybrid')->and($result['text'])->toContain('TEOREMA PYTHAGORAS');

        $down = true;
        app(BlueprintIndexer::class)->index($blueprint);
        $blueprint->refresh();
        expect($blueprint->index_status)->toBe(QuestionBlueprint::INDEX_READY)
            ->and($blueprint->embedding_model)->toBeNull()
            ->and($blueprint->index_error)->toContain('500')
            ->and(QuestionBlueprintChunk::query()->whereNotNull('embedding')->count())->toBe(0);
    });

    it('previews the picked sections for a subject and grade', function (): void {
        $blueprint = QuestionBlueprint::factory()->create(['content' => longBlueprint()]);
        app(BlueprintIndexer::class)->index($blueprint);

        $response = $this->getJson("/admin/questions/blueprints/{$blueprint->id}/preview?subject=math&grade=10")->assertOk();
        $picked = collect($response->json('sections'))->where('picked', true);
        expect($picked->pluck('heading'))->toContain('KELAS 10 FUNGSI KUADRAT')
            ->and($picked->pluck('heading'))->not->toContain('KELAS 2 PENGURANGAN')
            ->and($response->json('mode'))->toBe('keyword');
    });

    it('reindexes on demand and after the text changes', function (): void {
        Queue::fake();
        $blueprint = QuestionBlueprint::factory()->create(['index_status' => QuestionBlueprint::INDEX_READY]);

        $this->post("/admin/questions/blueprints/{$blueprint->id}/reindex")->assertRedirect();
        Queue::assertPushed(IndexQuestionBlueprint::class, 1);

        $this->put("/admin/questions/blueprints/{$blueprint->id}", ['title' => $blueprint->title, 'content' => $blueprint->content])->assertSessionHasNoErrors();
        Queue::assertPushed(IndexQuestionBlueprint::class, 1);

        $this->put("/admin/questions/blueprints/{$blueprint->id}", ['title' => $blueprint->title, 'content' => 'Isi kisi-kisi yang benar-benar baru dan cukup panjang.'])->assertSessionHasNoErrors();
        Queue::assertPushed(IndexQuestionBlueprint::class, 2);
    });

    it('tests the embedding model before saving and reindexes every blueprint', function (): void {
        Queue::fake();
        Setting::set('ai.base_url', 'https://ai.test/v1', 'ai');
        Setting::set('ai.api_key', Crypt::encryptString('test-key'), 'ai');
        QuestionBlueprint::factory()->count(2)->create();

        Http::fake(['ai.test/v1/embeddings' => Http::sequence()
            ->push(['error' => 'no such model'], 404)
            ->push(['data' => [['index' => 0, 'embedding' => [0.1, 0.2]]]])]);
        $this->put('/admin/ai-settings/embedding-model', ['embedding_model' => 'gpt-chat'])->assertSessionHasErrors('embedding_model');
        expect(app(EmbeddingClient::class)->model())->toBeNull();
        Queue::assertNothingPushed();

        $this->put('/admin/ai-settings/embedding-model', ['embedding_model' => 'text-embedding-3-small'])->assertSessionHasNoErrors();
        expect(app(EmbeddingClient::class)->model())->toBe('text-embedding-3-small');
        Queue::assertPushed(IndexQuestionBlueprint::class, 2);

        $this->get('/admin/ai-settings')->assertInertia(fn (Assert $page) => $page->where('embeddingModel', 'text-embedding-3-small'));
    });
});
