<?php

use App\Ai\Agents\AbilityAnalyst;
use App\Jobs\GenerateAbilityAssessment;
use App\Models\GameHistory;
use App\Models\PlayerProfile;
use App\Models\Question;
use App\Models\QuestionAnswer;
use App\Models\Role;
use App\Models\Setting;
use App\Models\User;
use App\Models\UserAbilityAssessment;
use App\Models\UserBadge;
use App\Services\Ai\AbilityProfileBuilder;
use Illuminate\Support\Facades\Crypt;
use Illuminate\Support\Facades\Queue;
use Illuminate\Support\Facades\RateLimiter;
use Inertia\Testing\AssertableInertia as Assert;

beforeEach(function (): void {
    config(['scout.driver' => 'null', 'queue.default' => 'sync', 'ai.ability_assessment.connection' => null]);
    $this->withoutVite();
    $this->admin = User::factory()->superadmin()->create();
    RateLimiter::clear('');
});

function configureAbilityAi(): void
{
    Setting::set('ai.base_url', 'https://ai.test/v1', 'ai');
    Setting::set('ai.api_key', Crypt::encryptString('sk-test-1234'), 'ai');
    Setting::set('ai.model', 'gpt-4o-mini', 'ai');
}

/**
 * Player in grade 4 with 3 games: sky-quiz recent (8/10, 9/10), quiz-duel old (2/10),
 * and question answers in math (4/5 correct) and science (1/5 correct).
 */
function abilityPlayer(): User
{
    $player = User::factory()->create(['name' => 'Rahasia Nama', 'email' => 'rahasia@ability-test.test']);
    PlayerProfile::factory()->for($player)->create(['grade' => 4, 'birth_date' => now()->subYears(10)->subDays(3)->toDateString(), 'school_name' => 'SDN 2 Depok']);

    $recentA = GameHistory::factory()->for($player)->create(['game_key' => 'sky-quiz', 'game_name' => 'Sky Quiz', 'points' => 80, 'correct' => 8, 'wrong' => 2, 'duration_seconds' => 100, 'played_at' => now()->subDays(1)]);
    GameHistory::factory()->for($player)->create(['game_key' => 'sky-quiz', 'game_name' => 'Sky Quiz', 'points' => 90, 'correct' => 9, 'wrong' => 1, 'duration_seconds' => 200, 'played_at' => now()->subDays(2)]);
    $old = GameHistory::factory()->for($player)->create(['game_key' => 'quiz-duel', 'game_name' => 'Quiz Duel', 'points' => 20, 'correct' => 2, 'wrong' => 8, 'duration_seconds' => 60, 'played_at' => now()->subDays(40)]);

    $math = Question::factory()->count(5)->create(['subject' => 'math', 'band' => 1, 'times_answered' => 10, 'times_correct' => 2]);
    $science = Question::factory()->count(5)->create(['subject' => 'science', 'band' => 0, 'times_answered' => 10, 'times_correct' => 9]);
    foreach ($math as $index => $question) {
        QuestionAnswer::query()->create(['question_id' => $question->id, 'game_history_id' => $recentA->id, 'game_key' => 'sky-quiz', 'correct' => $index < 4]);
    }
    foreach ($science as $index => $question) {
        QuestionAnswer::query()->create(['question_id' => $question->id, 'game_history_id' => $old->id, 'game_key' => 'quiz-duel', 'correct' => $index < 1]);
    }
    UserBadge::factory()->for($player)->create(['badge' => 'starter']);

    return $player;
}

function abilityReply(array $overrides = []): array
{
    return array_replace([
        'summary' => 'Peserta kuat di matematika untuk anak kelas 4 dan perlu dukungan di IPA.',
        'strengths' => ['Matematika: akurasi 80%', 'Konsisten bermain'],
        'weaknesses' => ['IPA: akurasi 20%'],
        'subject_scores' => [['subject' => 'math', 'score' => 82], ['subject' => 'IPA', 'score' => 140]],
        'game_insights' => ['Sky Quiz membaik dalam 30 hari terakhir.'],
        'recommendations' => ['Ajak membaca buku IPA bergambar 15 menit sehari.'],
        'learning_style' => 'Visual-kinestetik',
        'progress_vs_previous' => 'Analisa pertama.',
        'confidence' => 'sedang',
    ], $overrides);
}

describe('ability profile builder', function (): void {
    it('builds an anonymous, aggregated profile with the expected numbers', function (): void {
        $player = abilityPlayer();
        $peer = User::factory()->create();
        PlayerProfile::factory()->for($peer)->create(['grade' => 4]);
        $peerPlay = GameHistory::factory()->for($peer)->create(['game_key' => 'sky-quiz', 'correct' => 5, 'wrong' => 5, 'played_at' => now()->subDay()]);
        $mathQuestion = Question::query()->where('subject', 'math')->first();
        QuestionAnswer::query()->create(['question_id' => $mathQuestion->id, 'game_history_id' => $peerPlay->id, 'game_key' => 'sky-quiz', 'correct' => false]);
        QuestionAnswer::query()->create(['question_id' => $mathQuestion->id, 'game_history_id' => $peerPlay->id, 'game_key' => 'sky-quiz', 'correct' => true]);

        $data = app(AbilityProfileBuilder::class)->build($player);
        $json = app(AbilityProfileBuilder::class)->toJson($data);

        expect(array_keys($data))->toBe(['profile', 'period', 'totals', 'games', 'subjects', 'grade_bands', 'difficulty', 'rankings', 'consistency', 'badges', 'recent_results', 'previous_assessments'])
            ->and($json)->not->toContain('Rahasia')->not->toContain('rahasia@')
            ->and($data['profile'])->toMatchArray(['alias' => 'Peserta', 'age' => 10, 'grade' => 4, 'grade_label' => 'kelas 4', 'school_level' => 'sd', 'school' => 'SDN 2 Depok'])
            ->and($data['totals'])->toMatchArray(['plays' => 3, 'distinct_games' => 2, 'points' => 190, 'correct' => 19, 'wrong' => 11, 'accuracy' => 63.3, 'active_days' => 3, 'avg_duration_seconds' => 120, 'plays_last_30d' => 2, 'plays_previous_30d' => 1])
            ->and($data['period']['span_days'])->toBe(40);

        $sky = collect($data['games'])->firstWhere('key', 'sky-quiz');
        expect($sky)->toMatchArray(['plays' => 2, 'correct' => 17, 'wrong' => 3, 'accuracy' => 85.0, 'avg_duration_seconds' => 150, 'peer_accuracy' => 50.0])
            ->and($sky['trend'])->toMatchArray(['plays_last_30d' => 2, 'plays_previous_30d' => 0, 'accuracy_last_30d' => 85.0, 'accuracy_previous_30d' => null]);
        expect(collect($data['games'])->firstWhere('key', 'quiz-duel')['trend']['accuracy_previous_30d'])->toBe(20.0);

        $subjects = collect($data['subjects'])->keyBy('key');
        expect($subjects['math'])->toMatchArray(['name' => 'Matematika', 'answered' => 5, 'correct' => 4, 'accuracy' => 80.0, 'peer_accuracy' => 50.0, 'peer_players' => 1])
            ->and($subjects['science'])->toMatchArray(['answered' => 5, 'accuracy' => 20.0, 'peer_accuracy' => null]);

        expect(collect($data['grade_bands'])->keyBy('band')->map->accuracy->all())->toBe([0 => 20.0, 1 => 80.0])
            ->and(collect($data['difficulty'])->keyBy('tier')->map->accuracy->all())->toBe(['hard' => 80.0, 'easy' => 20.0])
            ->and($data['rankings']['strongest_subjects'][0])->toBe('Matematika (80%)')
            ->and($data['rankings']['weakest_subjects'][0])->toBe('IPA (20%)')
            ->and($data['rankings']['strongest_games'][0])->toBe('Sky Quiz (85%)')
            ->and($data['consistency'])->toMatchArray(['active_days' => 3, 'current_streak_days' => 2, 'longest_streak_days' => 2, 'days_since_last_play' => 1])
            ->and($data['badges']['count'])->toBe(1)
            ->and($data['badges']['earned'][0]['key'])->toBe('starter')
            ->and($data['recent_results'])->toHaveCount(3)
            ->and($data['recent_results'][0])->toMatchArray(['game' => 'sky-quiz', 'accuracy' => 80.0])
            ->and($data['previous_assessments'])->toBe([]);
    });

    it('includes the last three finished assessments as context', function (): void {
        $player = abilityPlayer();
        foreach (range(1, 4) as $day) {
            UserAbilityAssessment::factory()->for($player)->done(['summary' => "Analisa ke-{$day}"])->create(['created_at' => now()->subDays(10 - $day)]);
        }
        UserAbilityAssessment::factory()->for($player)->failed()->create();

        $previous = app(AbilityProfileBuilder::class)->build($player)['previous_assessments'];

        expect($previous)->toHaveCount(3)
            ->and(array_column($previous, 'summary'))->toBe(['Analisa ke-4', 'Analisa ke-3', 'Analisa ke-2'])
            ->and($previous[0]['subject_scores'])->toBe(['math' => 80, 'science' => 55]);
    });
});

describe('triggering an analysis', function (): void {
    it('is only for super admins', function (): void {
        configureAbilityAi();
        $player = abilityPlayer();
        $admin = User::factory()->create();
        $admin->roles()->attach(Role::query()->firstOrCreate(['slug' => 'admin'], ['name' => 'Admin'])->id);

        $this->actingAs(User::factory()->create())->post("/admin/users/{$player->id}/ability-assessments")->assertForbidden();
        $this->actingAs($admin)->post("/admin/users/{$player->id}/ability-assessments")->assertForbidden();
        expect(UserAbilityAssessment::query()->count())->toBe(0);

        $this->get("/admin/users/{$player->id}")->assertInertia(fn (Assert $page) => $page
            ->loadDeferredProps(fn (Assert $reload) => $reload->where('abilityAssessments.can_run', false)));
    });

    it('refuses before the AI connection is configured', function (): void {
        $player = abilityPlayer();

        $this->actingAs($this->admin)->post("/admin/users/{$player->id}/ability-assessments")
            ->assertSessionHasErrors(['assessment' => __('ai.not_configured')]);
        expect(UserAbilityAssessment::query()->count())->toBe(0);
    });

    it('queues one job, stores the snapshot and blocks a second run while pending', function (): void {
        Queue::fake();
        configureAbilityAi();
        $player = abilityPlayer();

        $this->actingAs($this->admin)->post("/admin/users/{$player->id}/ability-assessments")->assertSessionHasNoErrors()->assertRedirect();
        $this->post("/admin/users/{$player->id}/ability-assessments")->assertSessionHasErrors(['assessment' => __('ai.assessment_running')]);

        $assessment = UserAbilityAssessment::query()->sole();
        expect($assessment->status)->toBe('pending')
            ->and($assessment->requested_by)->toBe($this->admin->id)
            ->and($assessment->model)->toBe('gpt-4o-mini')
            ->and($assessment->input_snapshot['profile']['alias'])->toBe('Peserta');
        Queue::assertPushed(GenerateAbilityAssessment::class, 1);
        Queue::assertPushedOn('low', GenerateAbilityAssessment::class);
        $this->assertDatabaseHas('activity_log', ['description' => 'Started AI ability analysis', 'subject_id' => $player->id, 'causer_id' => $this->admin->id]);
    });

    it('lets a new run start once a pending analysis went stale', function (): void {
        Queue::fake();
        configureAbilityAi();
        $player = abilityPlayer();
        $stale = UserAbilityAssessment::factory()->for($player)->create(['created_at' => now()->subMinutes(UserAbilityAssessment::STALE_MINUTES + 1)]);

        $this->actingAs($this->admin)->post("/admin/users/{$player->id}/ability-assessments")->assertSessionHasNoErrors();

        expect($stale->fresh()->status)->toBe('failed')->and($stale->fresh()->error)->toBe(__('ai.assessment_timed_out'))
            ->and(UserAbilityAssessment::query()->where('status', 'pending')->count())->toBe(1);
    });

    it('throttles the endpoint', function (): void {
        Queue::fake();
        configureAbilityAi();
        $players = collect(range(1, 6))->map(fn () => User::factory()->create());

        $this->actingAs($this->admin);
        foreach ($players->take(5) as $player) {
            $this->post("/admin/users/{$player->id}/ability-assessments")->assertRedirect();
        }
        $this->post("/admin/users/{$players->last()->id}/ability-assessments")->assertStatus(429);
    });
});

describe('analysis job', function (): void {
    it('stores the normalised AI result', function (): void {
        configureAbilityAi();
        $player = abilityPlayer();
        AbilityAnalyst::fake([abilityReply()]);

        $this->actingAs($this->admin)->post("/admin/users/{$player->id}/ability-assessments")->assertSessionHasNoErrors();

        $assessment = UserAbilityAssessment::query()->sole();
        expect($assessment->status)->toBe('done')
            ->and($assessment->error)->toBeNull()
            ->and($assessment->result['summary'])->toContain('kelas 4')
            ->and($assessment->result['subject_scores'])->toBe(['math' => 82, 'science' => 100])
            ->and($assessment->result['confidence'])->toBe('sedang')
            ->and($assessment->result['recommendations'])->toHaveCount(1);
        AbilityAnalyst::assertPrompted(fn ($prompt) => str_contains($prompt->prompt, '"alias":"Peserta"') && ! str_contains($prompt->prompt, 'Rahasia'));
    });

    it('records a readable error when the model fails', function (): void {
        configureAbilityAi();
        $player = abilityPlayer();
        AbilityAnalyst::fake(fn () => throw new RuntimeException('model overloaded'));

        $this->actingAs($this->admin)->post("/admin/users/{$player->id}/ability-assessments");

        $assessment = UserAbilityAssessment::query()->sole();
        expect($assessment->status)->toBe('failed')->and($assessment->error)->toBe('model overloaded')->and($assessment->result)->toBeNull();
    });

    it('fails when the reply has no usable summary, hiding internal errors', function (): void {
        configureAbilityAi();
        $player = abilityPlayer();
        AbilityAnalyst::fake([abilityReply(['summary' => ''])]);

        $this->actingAs($this->admin)->post("/admin/users/{$player->id}/ability-assessments");
        expect(UserAbilityAssessment::query()->sole()->error)->toBe(__('ai.assessment_incomplete'));

        expect(GenerateAbilityAssessment::readable(new LogicException('SQLSTATE secret /var/www')))->toBe(__('ai.assessment_failed'));
    });

    it('sends the previous analysis as context for the next one', function (): void {
        configureAbilityAi();
        $player = abilityPlayer();
        AbilityAnalyst::fake([abilityReply(['summary' => 'Analisa pertama yang cukup panjang.']), abilityReply(['progress_vs_previous' => 'Membaik.'])]);

        $this->actingAs($this->admin)->post("/admin/users/{$player->id}/ability-assessments")->assertSessionHasNoErrors();
        $this->travel(1)->minutes();
        $this->post("/admin/users/{$player->id}/ability-assessments")->assertSessionHasNoErrors();

        $latest = UserAbilityAssessment::query()->latest('id')->first();
        expect($latest->input_snapshot['previous_assessments'])->toHaveCount(1)
            ->and($latest->input_snapshot['previous_assessments'][0]['summary'])->toBe('Analisa pertama yang cukup panjang.')
            ->and($latest->result['progress_vs_previous'])->toBe('Membaik.');
        AbilityAnalyst::assertPrompted(fn ($prompt) => str_contains($prompt->prompt, 'Analisa pertama yang cukup panjang.'));
    });
});

describe('user page', function (): void {
    it('loads assessments as a deferred prop with a data preview', function (): void {
        configureAbilityAi();
        $player = abilityPlayer();

        $this->actingAs($this->admin)->get("/admin/users/{$player->id}")->assertInertia(fn (Assert $page) => $page
            ->component('admin/users/show')
            ->missing('abilityAssessments')
            ->loadDeferredProps(fn (Assert $reload) => $reload
                ->where('abilityAssessments.configured', true)
                ->where('abilityAssessments.can_run', true)
                ->where('abilityAssessments.running', false)
                ->where('abilityAssessments.items', [])
                ->where('abilityAssessments.preview.profile.alias', 'Peserta')));

        UserAbilityAssessment::factory()->for($player)->done()->create();
        $this->get("/admin/users/{$player->id}")->assertInertia(fn (Assert $page) => $page
            ->loadDeferredProps(fn (Assert $reload) => $reload
                ->where('abilityAssessments.items.0.status', 'done')
                ->where('abilityAssessments.items.0.result.subject_scores.math', 80)
                ->where('abilityAssessments.preview', null)));
    });
});
