<?php

use App\Ai\Agents\QuestionWriter;
use App\Jobs\GenerateQuestions;
use App\Models\Question;
use App\Models\QuestionGeneration;
use App\Models\Role;
use App\Models\Setting;
use App\Models\Subject;
use App\Models\User;
use App\Services\Ai\AiSettings;
use App\Services\PointRules;
use Illuminate\Http\Client\Request;
use Illuminate\Support\Facades\Crypt;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Queue;
use Illuminate\Testing\TestResponse;
use Inertia\Testing\AssertableInertia as Assert;

const RULES_GAME_SECRET = 'rules-and-ai-test-secret-with-32-chars!';

beforeEach(function (): void {
    config(['scout.driver' => 'null', 'game-service.secret' => RULES_GAME_SECRET]);
    $this->withoutVite();
    $this->admin = User::factory()->superadmin()->create();
});

function rulesBank(): TestResponse
{
    $timestamp = (string) now()->getTimestamp();

    return test()->getJson('/api/internal/question-bank', [
        'X-Game-Timestamp' => $timestamp,
        'X-Game-Signature' => hash_hmac('sha256', $timestamp.'.', RULES_GAME_SECRET),
    ]);
}

function connectAi(array $models = ['gpt-4o-mini', 'qwen-2.5']): void
{
    Http::fake(['ai.test/v1/models' => Http::response(['object' => 'list', 'data' => collect($models)->map(fn (string $id): array => ['id' => $id, 'object' => 'model', 'owned_by' => 'lab'])->all()])]);
    test()->actingAs(test()->admin)->put('/admin/ai-settings', ['base_url' => 'https://ai.test/v1/', 'api_key' => 'sk-test-secret-1234']);
}

describe('point rules', function (): void {
    it('uses the guide defaults: 10 per correct answer, nothing for a draw', function (): void {
        expect(PointRules::current())->toBe(['per_correct' => 10, 'win' => 20, 'draw' => 0, 'participation' => 5]);

        $this->actingAs($this->admin)->get('/admin/point-rules')->assertOk()->assertInertia(fn (Assert $page) => $page
            ->component('admin/point-rules')
            ->where('rules.per_correct', 10)
            ->where('rules.draw', 0)
            ->where('maxQuestionPoints', Question::MAX_POINTS));
    });

    it('saves new rules and sends them with the question bank', function (): void {
        $version = rulesBank()->json('version');

        $this->actingAs($this->admin)->put('/admin/point-rules', ['per_correct' => 15, 'win' => 30, 'draw' => 5, 'participation' => 0])
            ->assertSessionHasNoErrors();

        expect(PointRules::current())->toBe(['per_correct' => 15, 'win' => 30, 'draw' => 5, 'participation' => 0]);
        rulesBank()->assertJsonPath('points.per_correct', 15)->assertJsonPath('points.draw', 5);
        expect(rulesBank()->json('version'))->not->toBe($version);
    });

    it('validates the bounds', function (array $override, string $field): void {
        $this->actingAs($this->admin)->put('/admin/point-rules', array_replace(PointRules::DEFAULTS, $override))->assertSessionHasErrors($field);
    })->with([
        'zero per answer' => [['per_correct' => 0], 'per_correct'],
        'too much per answer' => [['per_correct' => 101], 'per_correct'],
        'negative draw' => [['draw' => -1], 'draw'],
        'participation above 50' => [['participation' => 51], 'participation'],
        'missing win' => [['win' => null], 'win'],
    ]);

    it('lets an admin mark bonus questions that the games receive', function (): void {
        $question = Question::factory()->create(['subject' => 'math', 'type' => 'choice', 'games' => ['sky-quiz']]);

        $this->actingAs($this->admin)->put("/admin/questions/{$question->id}", [
            ...$question->only(['type', 'band', 'subject', 'prompt_id', 'prompt_en', 'options', 'answer', 'games']),
            'is_active' => true,
            'points' => 40,
        ])->assertSessionHasNoErrors();

        expect($question->fresh()->points)->toBe(40)->and($question->fresh()->worth())->toBe(40);
        expect(collect(rulesBank()->json('questions'))->firstWhere('key', $question->key)['points'])->toBe(40);

        $this->put("/admin/questions/{$question->id}", [...$question->only(['type', 'band', 'subject', 'prompt_id', 'options', 'answer', 'games']), 'is_active' => true, 'points' => 500])
            ->assertSessionHasErrors('points');

        $this->put("/admin/questions/{$question->id}", [...$question->only(['type', 'band', 'subject', 'prompt_id', 'options', 'answer', 'games']), 'is_active' => true, 'points' => null])
            ->assertSessionHasNoErrors();
        expect($question->fresh()->points)->toBeNull()->and($question->fresh()->worth())->toBe(10);
    });

    it('is only for super admins', function (): void {
        $this->actingAs(User::factory()->create())->get('/admin/point-rules')->assertForbidden();
        $this->actingAs(User::factory()->create())->put('/admin/point-rules', PointRules::DEFAULTS)->assertForbidden();
    });
});

describe('ai settings', function (): void {
    it('saves the connection with an encrypted key and loads every model', function (): void {
        connectAi(['zeta-large', 'alpha-mini', 'alpha-mini']);

        $stored = Setting::query()->where('key', 'ai.api_key')->value('value');
        expect($stored)->not->toContain('sk-test')->and(Crypt::decryptString($stored))->toBe('sk-test-secret-1234');
        Http::assertSent(fn ($request) => $request->url() === 'https://ai.test/v1/models' && $request->hasHeader('Authorization', 'Bearer sk-test-secret-1234'));

        $this->get('/admin/ai-settings')->assertInertia(fn (Assert $page) => $page
            ->component('admin/ai-settings')
            ->where('connection.base_url', 'https://ai.test/v1')
            ->where('connection.has_key', true)
            ->where('connection.key_hint', '…1234')
            ->where('connection.configured', false)
            ->where('models', [['id' => 'alpha-mini', 'owned_by' => 'lab'], ['id' => 'zeta-large', 'owned_by' => 'lab']])
            ->missing('connection.api_key'));
    });

    it('picks only a listed model', function (): void {
        connectAi();

        $this->put('/admin/ai-settings/model', ['model' => 'not-listed'])->assertSessionHasErrors('model');
        $this->put('/admin/ai-settings/model', ['model' => 'qwen-2.5'])->assertSessionHasNoErrors();

        expect(app(AiSettings::class)->model())->toBe('qwen-2.5')->and(app(AiSettings::class)->configured())->toBeTrue();
    });

    it('keeps the saved key when the field is left empty and can remove it', function (): void {
        connectAi();
        $this->put('/admin/ai-settings', ['base_url' => 'https://ai.test/v1', 'api_key' => ''])->assertSessionHasNoErrors();
        expect(app(AiSettings::class)->apiKey())->toBe('sk-test-secret-1234');

        $this->delete('/admin/ai-settings/key')->assertSessionHasNoErrors();
        expect(app(AiSettings::class)->hasKey())->toBeFalse();
    });

    it('reports server errors without saving models', function (int $status): void {
        Http::fake(['ai.test/v1/models' => Http::response(['error' => 'nope'], $status)]);

        $this->actingAs($this->admin)->put('/admin/ai-settings', ['base_url' => 'https://ai.test/v1', 'api_key' => 'sk-wrong-key-0000'])
            ->assertSessionHasErrors(['models' => __('ai.http_error', ['status' => $status])]);
        expect(app(AiSettings::class)->cachedModels())->toBe([]);
    })->with([401, 500]);

    it('rejects a base url that is not a url', function (): void {
        $this->actingAs($this->admin)->put('/admin/ai-settings', ['base_url' => 'ai.test', 'api_key' => 'sk-test-secret-1234'])->assertSessionHasErrors('base_url');
    });

    it('is only for super admins', function (): void {
        $this->actingAs(User::factory()->create())->get('/admin/ai-settings')->assertForbidden();
    });
});

describe('question generation', function (): void {
    beforeEach(function (): void {
        config(['queue.default' => 'sync']);
        connectAi();
        $this->put('/admin/ai-settings/model', ['model' => 'gpt-4o-mini']);
    });

    it('queues one job per subject and grade for the whole curriculum', function (): void {
        Queue::fake();

        $this->post('/admin/questions/generate', ['scope' => 'all', 'per_combination' => 2, 'games' => ['sky-quiz', 'quiz-duel']])
            ->assertRedirect('/admin/questions/generate')->assertSessionHasNoErrors();

        $generation = QuestionGeneration::query()->sole();
        expect($generation->subjects)->toBe(Subject::activeKeys())
            ->and($generation->grades)->toBe(Question::GRADES)
            ->and($generation->total_jobs)->toBe(6 * 13)
            ->and($generation->model)->toBe('gpt-4o-mini');
        Queue::assertPushed(GenerateQuestions::class, 6 * 13);
        Queue::assertPushedOn('low', GenerateQuestions::class);
    });

    it('generates only the chosen subjects and grades', function (): void {
        Queue::fake();

        $this->post('/admin/questions/generate', ['scope' => 'custom', 'subjects' => ['science'], 'grades' => [0, 4], 'per_combination' => 3, 'games' => ['sky-quiz']])
            ->assertSessionHasNoErrors();

        Queue::assertPushed(GenerateQuestions::class, 2);
        Queue::assertPushed(GenerateQuestions::class, fn (GenerateQuestions $job) => $job->subject === 'science' && $job->grade === 0);
    });

    it('validates the request', function (array $payload, string $field): void {
        Queue::fake();
        $this->post('/admin/questions/generate', array_replace(['scope' => 'custom', 'subjects' => ['math'], 'grades' => [1], 'per_combination' => 2, 'games' => ['sky-quiz']], $payload))
            ->assertSessionHasErrors($field);
        Queue::assertNothingPushed();
    })->with([
        'no subject' => [['subjects' => []], 'subjects'],
        'unknown subject' => [['subjects' => ['music']], 'subjects.0'],
        'grade 13' => [['grades' => [13]], 'grades.0'],
        'too many per pair' => [['per_combination' => QuestionGeneration::MAX_PER_COMBINATION + 1], 'per_combination'],
        'no game' => [['games' => []], 'games'],
        'over the request limit' => [['scope' => 'all', 'per_combination' => 11], 'per_combination'],
    ]);

    it('refuses to generate before a model is chosen', function (): void {
        Queue::fake();
        Setting::set('ai.model', '', 'ai');

        $this->post('/admin/questions/generate', ['scope' => 'custom', 'subjects' => ['math'], 'grades' => [1], 'per_combination' => 1, 'games' => ['sky-quiz']])
            ->assertSessionHasErrors(['ai' => __('ai.not_configured')]);
        Queue::assertNothingPushed();
    });

    it('stores valid AI questions flagged as AI, inactive for review, and skips bad ones', function (): void {
        QuestionWriter::fake([[
            'questions' => [
                ['prompt_id' => 'Hewan yang bertelur adalah…', 'prompt_en' => 'Which animal lays eggs?', 'options' => [['id' => 'Ayam', 'en' => 'Chicken'], ['id' => 'Kucing', 'en' => 'Cat'], ['id' => 'Sapi', 'en' => 'Cow'], ['id' => 'Kambing', 'en' => 'Goat']], 'answer' => 0, 'hint_id' => 'Ayam bertelur.', 'hint_en' => 'Chickens lay eggs.'],
                ['prompt_id' => 'Rusak', 'prompt_en' => 'Broken', 'options' => [['id' => 'A', 'en' => 'A']], 'answer' => 4, 'hint_id' => '', 'hint_en' => ''],
                // Already in the seeded bank for grade 1-3: rejected as a duplicate.
                ['prompt_id' => 'Matahari terbit dari arah…', 'prompt_en' => 'The sun rises in the…', 'options' => [['id' => 'Timur', 'en' => 'East'], ['id' => 'Barat', 'en' => 'West'], ['id' => 'Utara', 'en' => 'North']], 'answer' => 0, 'hint_id' => 'Timur.', 'hint_en' => 'East.'],
            ],
        ], [
            'questions' => [
                ['prompt_id' => 'Bagian tumbuhan yang menyerap air adalah…', 'prompt_en' => 'Which part of a plant absorbs water?', 'options' => [['id' => 'Akar', 'en' => 'Roots'], ['id' => 'Daun', 'en' => 'Leaves'], ['id' => 'Bunga', 'en' => 'Flower']], 'answer' => 0, 'hint_id' => 'Akar menyerap air.', 'hint_en' => 'Roots absorb water.'],
            ],
        ]]);

        $this->post('/admin/questions/generate', ['scope' => 'custom', 'subjects' => ['science'], 'grades' => [2], 'per_combination' => 2, 'games' => ['sky-quiz']])
            ->assertSessionHasNoErrors();

        $generation = QuestionGeneration::query()->sole();
        expect($generation->status)->toBe('done')
            ->and($generation->created_count)->toBe(2)
            ->and($generation->skipped_count)->toBe(2);

        $questions = Question::query()->where('source', Question::SOURCE_AI)->get();
        expect($questions)->toHaveCount(2)
            ->and($questions->every(fn (Question $q): bool => ! $q->is_active && $q->grades === [2] && $q->band === 0 && $q->generation_id === $generation->id && $q->isAiGenerated()))->toBeTrue();
        QuestionWriter::assertPrompted(fn ($prompt) => str_contains($prompt->prompt, 'IPA') && str_contains($prompt->prompt, 'kelas 2'));

        $this->get('/admin/questions?source=ai')->assertInertia(fn (Assert $page) => $page
            ->where('mode', 'list')
            ->where('questions.total', 2)
            ->where('questions.data.0.source', 'ai')
            ->where('summary.ai', 2)
            ->where('summary.ai_pending', 2));
    });

    it('records the error when the model fails', function (): void {
        QuestionWriter::fake(fn () => throw new RuntimeException('model overloaded'));

        $this->post('/admin/questions/generate', ['scope' => 'custom', 'subjects' => ['math'], 'grades' => [5], 'per_combination' => 1, 'games' => ['sky-quiz'], 'activate' => true]);

        $generation = QuestionGeneration::query()->sole();
        expect($generation->status)->toBe('failed')->and($generation->error)->toContain('model overloaded');
        expect(Question::query()->where('source', 'ai')->count())->toBe(0);
    });

    it('asks gateways that stream by default for one JSON reply', function (): void {
        $question = ['prompt_id' => 'Bahasa Inggris dari "kucing" adalah…', 'prompt_en' => 'The English word for "kucing" is…', 'options' => [['id' => 'cat', 'en' => 'cat'], ['id' => 'dog', 'en' => 'dog'], ['id' => 'cow', 'en' => 'cow'], ['id' => 'hen', 'en' => 'hen']], 'answer' => 0, 'hint_id' => 'Kucing = cat.', 'hint_en' => 'Kucing means cat.'];
        Http::fake(['ai.test/v1/chat/completions' => function (Request $request) use ($question) {
            if (($request->data()['stream'] ?? null) !== false) {
                return Http::response("data: {\"choices\":[{\"delta\":{\"content\":\"{\"}}]}\n\n", 200, ['Content-Type' => 'text/event-stream']);
            }

            return Http::response([
                'id' => 'chatcmpl-1',
                'object' => 'chat.completion',
                'model' => 'gpt-4o-mini',
                'choices' => [['index' => 0, 'message' => ['role' => 'assistant', 'content' => json_encode(['questions' => [$question]])], 'finish_reason' => 'stop']],
                'usage' => ['prompt_tokens' => 10, 'completion_tokens' => 10, 'total_tokens' => 20],
            ]);
        }]);

        $this->post('/admin/questions/generate', ['scope' => 'custom', 'subjects' => ['english'], 'grades' => [10], 'per_combination' => 1, 'games' => ['sky-quiz']])
            ->assertSessionHasNoErrors();

        $generation = QuestionGeneration::query()->sole();
        expect($generation->status)->toBe('done')
            ->and($generation->error)->toBeNull()
            ->and($generation->created_count)->toBe(1)
            ->and(Question::query()->where('source', 'ai')->value('prompt_id'))->toBe($question['prompt_id']);
        Http::assertSent(fn (Request $request) => str_ends_with($request->url(), '/chat/completions') && $request->data()['stream'] === false);
    });

    it('explains an unreadable AI reply instead of a PHP type error', function (): void {
        Http::fake(['ai.test/v1/chat/completions' => Http::response('<html>proxy error</html>', 200, ['Content-Type' => 'text/html'])]);

        $this->post('/admin/questions/generate', ['scope' => 'custom', 'subjects' => ['english'], 'grades' => [10], 'per_combination' => 1, 'games' => ['sky-quiz']]);

        $generation = QuestionGeneration::query()->sole();
        expect($generation->status)->toBe('failed')
            ->and($generation->error)->toContain(__('ai.bad_response', ['model' => 'gpt-4o-mini']))
            ->and($generation->error)->not->toContain('validateTextResponse');
    });
});

describe('teacher role', function (): void {
    it('lets a super admin assign and remove the teacher role', function (): void {
        $user = User::factory()->create(['name' => 'Bu Sari']);

        $this->actingAs($this->admin)->patch("/admin/users/{$user->id}/teacher")->assertSessionHasNoErrors();
        expect($user->fresh()->isTeacher())->toBeTrue();
        $this->get("/admin/users/{$user->id}")->assertInertia(fn (Assert $page) => $page->where('user.is_teacher', true));

        $this->actingAs($user)->get('/teacher/questions')->assertOk();
        $this->get('/dashboard')->assertInertia(fn (Assert $page) => $page->where('auth.user.is_teacher', true));

        $this->actingAs($this->admin)->patch("/admin/users/{$user->id}/teacher");
        expect($user->fresh()->isTeacher())->toBeFalse();
        $this->actingAs($user->fresh())->get('/teacher/questions')->assertForbidden();
        $this->get('/dashboard')->assertInertia(fn (Assert $page) => $page->where('auth.user.is_teacher', false));
    });

    it('does not show Ruang Guru to non teachers, super admins included', function (): void {
        $this->actingAs($this->admin)->get('/dashboard')->assertInertia(fn (Assert $page) => $page->where('auth.user.is_teacher', false));
    });

    it('only super admins assign teachers', function (): void {
        $admin = User::factory()->create();
        $admin->roles()->attach(Role::query()->firstOrCreate(['slug' => 'admin'], ['name' => 'Admin']));
        $target = User::factory()->create();

        $this->actingAs($admin)->patch("/admin/users/{$target->id}/teacher")->assertForbidden();
        expect($target->fresh()->isTeacher())->toBeFalse();
    });
});

it('closes the request when a generation job fails in the worker', function (): void {
    $generation = QuestionGeneration::query()->create([
        'model' => 'm', 'subjects' => ['math'], 'grades' => [1], 'per_combination' => 1, 'games' => ['sky-quiz'], 'status' => 'queued', 'total_jobs' => 1,
    ]);

    (new GenerateQuestions($generation, 'math', 1))->failed(new RuntimeException('worker timeout'));

    expect($generation->fresh()->status)->toBe('failed')->and($generation->fresh()->error)->toContain('worker timeout');
});
