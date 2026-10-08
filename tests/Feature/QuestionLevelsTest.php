<?php

use App\Http\Requests\StoreGameResultRequest;
use App\Models\PlayerProfile;
use App\Models\Question;
use App\Models\QuestionGeneration;
use App\Models\User;
use App\Services\GameServiceSigner;
use App\Services\PointRules;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Queue;
use Inertia\Testing\AssertableInertia as Assert;

const LEVELS_GAME_SECRET = 'question-levels-test-secret-32-chars!!';

beforeEach(function (): void {
    config(['scout.driver' => 'null', 'game-service.secret' => LEVELS_GAME_SECRET]);
    $this->withoutVite();
    $this->admin = User::factory()->superadmin()->create();
});

function levelQuestion(array $overrides = []): Question
{
    return Question::factory()->create(array_merge(['subject' => 'math', 'band' => 1, 'is_active' => true], $overrides));
}

/** @return array<string, mixed> */
function levelsDecodeGameToken(string $token): array
{
    $payload = explode('.', $token)[0];

    return json_decode(base64_decode(strtr($payload, '-_', '+/')), true);
}

describe('question levels', function (): void {
    it('pays medium twice and expert three times the normal points', function (): void {
        $per = PointRules::current()['per_correct'];

        expect(levelQuestion(['level' => 1])->worth())->toBe($per)
            ->and(levelQuestion(['level' => 2])->worth())->toBe(2 * $per)
            ->and(levelQuestion(['level' => 3])->worth())->toBe(3 * $per)
            ->and(levelQuestion(['level' => 3, 'points' => 40])->worth())->toBe(120);
    });

    it('defaults new and existing questions to easy and sends the level to the game service', function (): void {
        $question = levelQuestion();
        $expert = levelQuestion(['level' => 3]);

        expect($question->fresh()->level)->toBe(1);

        $timestamp = (string) now()->getTimestamp();
        $bank = $this->getJson('/api/internal/question-bank', [
            'X-Game-Timestamp' => $timestamp,
            'X-Game-Signature' => hash_hmac('sha256', $timestamp.'.', LEVELS_GAME_SECRET),
        ])->assertOk()->json('questions');

        $levels = collect($bank)->pluck('level', 'key');
        expect($levels[$question->key])->toBe(1)->and($levels[$expert->key])->toBe(3);
    });

    it('normalizes unknown levels to easy', function (mixed $level): void {
        expect(Question::normalizeLevel($level))->toBe(1);
    })->with([0, 4, -1, null, 'expert']);

    it('lets admins save and filter questions by level', function (): void {
        $this->actingAs($this->admin)->post('/admin/questions', [
            'type' => 'choice',
            'band' => 1,
            'level' => 3,
            'subject' => 'math',
            'prompt_id' => 'Berapa 12 x 12?',
            'options' => [['id' => '144'], ['id' => '124'], ['id' => '142']],
            'answer' => 0,
            'games' => ['sky-quiz'],
            'is_active' => true,
        ])->assertSessionHasNoErrors();

        $saved = Question::query()->latest('id')->firstOrFail();
        expect($saved->toGamePayload()['prompt']['id'] ?? null)->toBe('Berapa 12 x 12?');
        expect($saved->level)->toBe(3);
        levelQuestion(['level' => 1]);

        $this->actingAs($this->admin)->get('/admin/questions?subject=math&level=3')
            ->assertInertia(fn (Assert $page) => $page
                ->where('filters.level', '3')
                ->has('questions.data', 1)
                ->where('questions.data.0.level', 3));
    });

    it('rejects an unknown level', function (): void {
        $this->actingAs($this->admin)->post('/admin/questions', [
            'type' => 'choice', 'band' => 1, 'level' => 5, 'subject' => 'math',
            'prompt_id' => 'Q?', 'options' => [['id' => 'a'], ['id' => 'b'], ['id' => 'c']], 'answer' => 0,
            'games' => ['sky-quiz'], 'is_active' => true,
        ])->assertSessionHasErrors('level');
    });

    it('generates AI questions at the chosen level', function (): void {
        Http::fake(['ai.test/v1/models' => Http::response(['object' => 'list', 'data' => [['id' => 'gpt-4o-mini', 'object' => 'model', 'owned_by' => 'lab']]])]);
        $this->actingAs($this->admin)->put('/admin/ai-settings', ['base_url' => 'https://ai.test/v1/', 'api_key' => 'sk-test-1234']);
        $this->put('/admin/ai-settings/model', ['model' => 'gpt-4o-mini']);
        Queue::fake();

        $this->post('/admin/questions/generate', [
            'scope' => 'all', 'per_combination' => 2, 'games' => ['sky-quiz'], 'level' => 2,
        ])->assertSessionHasNoErrors();

        $generation = QuestionGeneration::query()->latest('id')->first();
        expect($generation)->not->toBeNull()->and($generation->level)->toBe(2);
    });
});

describe('player level', function (): void {
    it('saves the grade together with the question level', function (): void {
        $user = User::factory()->create();
        $user->playerProfile()->create(['grade' => 4]);

        $this->actingAs($user)->patch('/grade', ['grade' => 9, 'question_level' => 3])->assertSessionHasNoErrors();

        $profile = $user->playerProfile()->first();
        expect($profile->grade)->toBe(9)->and($profile->question_level)->toBe(3);

        $this->actingAs($user)->get('/dashboard')->assertInertia(fn (Assert $page) => $page->where('questionLevel', 3));
    });

    it('keeps the level when only the grade changes and rejects unknown levels', function (): void {
        $user = User::factory()->create();
        $user->playerProfile()->create(['grade' => 4, 'question_level' => 2]);

        $this->actingAs($user)->patch('/grade', ['grade' => 5])->assertSessionHasNoErrors();
        expect($user->playerProfile()->first()->question_level)->toBe(2);

        $this->actingAs($user)->patch('/grade', ['grade' => 5, 'question_level' => 7])
            ->assertSessionHasErrors(['question_level' => __('character.level_invalid')]);
    });

    it('signs the player level into game tokens', function (): void {
        $user = User::factory()->create();
        $user->playerProfile()->create(['grade' => 8, 'question_level' => 3]);
        $player = ['name' => 'Ana', 'grade' => 8, 'color' => 'amber', 'accessory' => 'none'];

        $claims = levelsDecodeGameToken(app(GameServiceSigner::class)->issueToken($user->fresh(), 'sky-quiz', $player));
        expect($claims['level'])->toBe(3);

        $fresh = User::factory()->create();
        $claims = levelsDecodeGameToken(app(GameServiceSigner::class)->issueToken($fresh, 'sky-quiz', $player));
        expect($claims['level'])->toBe(1);
    });

    it('defaults new player profiles to easy', function (): void {
        $user = User::factory()->create();
        $profile = $user->playerProfile()->create(['grade' => 3]);
        expect($profile)->toBeInstanceOf(PlayerProfile::class);

        expect($profile->fresh()->question_level)->toBe(1);
    });
});

describe('result limits', function (): void {
    it('accepts expert-level scores up to the raised game cap', function (): void {
        $rules = (new StoreGameResultRequest)->rules();

        expect($rules['points'])->toContain('between:0,9300');
    });
});
