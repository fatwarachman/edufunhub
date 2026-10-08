<?php

use App\Ai\Agents\AbilityAnalyst;
use App\Models\PlayerProfile;
use App\Models\Setting;
use App\Models\User;
use App\Models\UserAbilityAssessment;
use App\Services\AbilityComparison;
use App\Services\PlayerAbility;
use Illuminate\Support\Facades\Crypt;
use Illuminate\Support\Facades\RateLimiter;
use Inertia\Testing\AssertableInertia as Assert;

beforeEach(function (): void {
    config(['scout.driver' => 'null', 'queue.default' => 'sync', 'ai.ability_assessment.connection' => null]);
    $this->withoutVite();
    $this->admin = User::factory()->superadmin()->create();
    RateLimiter::clear('');
    Setting::set('ai.base_url', 'https://ai.test/v1', 'ai');
    Setting::set('ai.api_key', Crypt::encryptString('sk-test-1234'), 'ai');
    Setting::set('ai.model', 'gpt-4o-mini', 'ai');
});

function historyPlayer(): User
{
    $player = User::factory()->create();
    PlayerProfile::factory()->for($player)->create(['grade' => 4, 'nickname' => 'Kancil']);

    return $player;
}

/** Two finished analyses: math 60→75, science 50→40, art only in the newer one. */
function twoAnalyses(User $player): array
{
    $older = UserAbilityAssessment::factory()->for($player)->done([
        'summary' => 'Analisa pertama.',
        'subject_scores' => ['math' => 60, 'science' => 50],
        'strengths' => ['Berhitung cepat'],
        'weaknesses' => ['Membaca soal panjang', 'IPA dasar'],
    ])->create(['created_at' => now()->subDays(10), 'updated_at' => now()->subDays(10)]);

    $newer = UserAbilityAssessment::factory()->for($player)->done([
        'summary' => 'Analisa kedua.',
        'subject_scores' => ['math' => 75, 'science' => 40, 'art' => 90],
        'strengths' => ['Berhitung cepat', 'Konsisten bermain'],
        'weaknesses' => ['IPA dasar'],
    ])->create(['created_at' => now()->subDay(), 'updated_at' => now()->subDay()]);

    return [$older, $newer];
}

it('keeps one row per run, never overwriting the earlier finished analysis', function (): void {
    $player = historyPlayer();
    AbilityAnalyst::fake([
        abilityReplyFor(['summary' => 'Analisa pertama yang cukup panjang.', 'subject_scores' => ['math' => 60]]),
        abilityReplyFor(['summary' => 'Analisa kedua yang cukup panjang.', 'subject_scores' => ['math' => 72], 'progress_vs_previous' => '']),
    ]);

    $this->actingAs($this->admin)->post("/admin/users/{$player->id}/ability-assessments")->assertSessionHasNoErrors();
    $first = UserAbilityAssessment::query()->sole();
    $firstResult = $first->result;
    $this->travel(1)->minutes();
    $this->post("/admin/users/{$player->id}/ability-assessments")->assertSessionHasNoErrors();

    $rows = UserAbilityAssessment::query()->where('user_id', $player->id)->orderBy('id')->get();
    expect($rows)->toHaveCount(2)
        ->and($rows->pluck('status')->all())->toBe(['done', 'done'])
        ->and($rows[0]->id)->toBe($first->id)
        ->and($rows[0]->result)->toBe($firstResult)
        ->and($rows[0]->result['summary'])->toBe('Analisa pertama yang cukup panjang.')
        ->and($rows[1]->result['summary'])->toBe('Analisa kedua yang cukup panjang.')
        ->and($rows[1]->result['subject_scores'])->toBe(['math' => 72])
        ->and($rows[1]->result['progress_vs_previous'])->toContain('naik 12 poin')
        ->and($rows[1]->input_snapshot['previous_assessments'][0]['summary'])->toBe('Analisa pertama yang cukup panjang.');
});

it('keeps the progress text the model wrote and leaves the first analysis without a generated one', function (): void {
    $player = historyPlayer();
    AbilityAnalyst::fake([
        abilityReplyFor(['progress_vs_previous' => '']),
        abilityReplyFor(['progress_vs_previous' => 'Membaik di matematika.']),
    ]);

    $this->actingAs($this->admin)->post("/admin/users/{$player->id}/ability-assessments");
    $this->travel(1)->minutes();
    $this->post("/admin/users/{$player->id}/ability-assessments");

    $rows = UserAbilityAssessment::query()->orderBy('id')->get();
    expect($rows[0]->result['progress_vs_previous'])->toBe('')
        ->and($rows[1]->result['progress_vs_previous'])->toBe('Membaik di matematika.');
});

it('compares two analyses deterministically', function (): void {
    $player = historyPlayer();
    [$older, $newer] = twoAnalyses($player);

    $comparison = app(AbilityComparison::class)->compare($newer, $older);
    $subjects = collect($comparison['subjects'])->keyBy('subject');

    expect($comparison['previous']['id'])->toBe($older->id)
        ->and($comparison['current']['id'])->toBe($newer->id)
        ->and($comparison['previous']['average'])->toBe(55.0)
        ->and($comparison['current']['average'])->toBe(68.3)
        ->and($comparison['average_delta'])->toBe(13.3)
        ->and($comparison['direction'])->toBe('up')
        ->and($subjects['math'])->toBe(['subject' => 'math', 'previous' => 60, 'current' => 75, 'delta' => 15, 'direction' => 'up'])
        ->and($subjects['science'])->toMatchArray(['previous' => 50, 'current' => 40, 'delta' => -10, 'direction' => 'down'])
        ->and($subjects['art'])->toMatchArray(['previous' => null, 'current' => 90, 'delta' => null, 'direction' => 'new'])
        ->and(array_column($comparison['subjects'], 'subject'))->toBe(['math', 'science', 'art'])
        ->and([$comparison['improved'], $comparison['declined'], $comparison['unchanged']])->toBe([1, 1, 0])
        ->and($comparison['strengths_gained'])->toBe(['Konsisten bermain'])
        ->and($comparison['strengths_lost'])->toBe([])
        ->and($comparison['weaknesses_resolved'])->toBe(['Membaca soal panjang'])
        ->and($comparison['weaknesses_new'])->toBe([]);

    expect(app(AbilityComparison::class)->previousFor($newer)->id)->toBe($older->id)
        ->and(app(AbilityComparison::class)->previousFor($older))->toBeNull()
        ->and(app(AbilityComparison::class)->compare($older, null))->toBeNull();
});

it('marks equal scores as unchanged', function (): void {
    $player = historyPlayer();
    $a = UserAbilityAssessment::factory()->for($player)->done(['subject_scores' => ['math' => 70]])->create(['created_at' => now()->subDay()]);
    $b = UserAbilityAssessment::factory()->for($player)->done(['subject_scores' => ['math' => 70]])->create();

    $comparison = app(AbilityComparison::class)->compare($b, $a);

    expect($comparison['subjects'][0]['direction'])->toBe('same')
        ->and($comparison['direction'])->toBe('same')
        ->and($comparison['unchanged'])->toBe(1);
});

it('gives the admin page the full history and the latest-vs-previous comparison', function (): void {
    $player = historyPlayer();
    [$older, $newer] = twoAnalyses($player);
    $failed = UserAbilityAssessment::factory()->for($player)->failed()->create(['created_at' => now()->subDays(5)]);

    $this->actingAs($this->admin)->get("/admin/users/{$player->id}")->assertInertia(fn (Assert $page) => $page
        ->loadDeferredProps(fn (Assert $reload) => $reload
            ->has('abilityAssessments.items', 3)
            ->where('abilityAssessments.total', 3)
            ->where('abilityAssessments.items.0.id', $newer->id)
            ->where('abilityAssessments.items.0.average', 68.3)
            ->where('abilityAssessments.items.1.id', $failed->id)
            ->where('abilityAssessments.items.1.status', 'failed')
            ->where('abilityAssessments.items.2.id', $older->id)
            ->where('abilityAssessments.items.2.result.summary', 'Analisa pertama.')
            ->where('abilityAssessments.items.2.input', null)
            ->where('abilityAssessments.comparison.current.id', $newer->id)
            ->where('abilityAssessments.comparison.previous.id', $older->id)
            ->where('abilityAssessments.comparison.average_delta', 13.3)
            ->where('abilityAssessments.comparison.subjects.0.subject', 'math')
            ->where('abilityAssessments.comparison.subjects.0.delta', 15)));
});

it('lists up to twenty analyses on the admin page', function (): void {
    $player = historyPlayer();
    foreach (range(1, 22) as $day) {
        UserAbilityAssessment::factory()->for($player)->done()->create(['created_at' => now()->subDays(30 - $day)]);
    }

    $this->actingAs($this->admin)->get("/admin/users/{$player->id}")->assertInertia(fn (Assert $page) => $page
        ->loadDeferredProps(fn (Assert $reload) => $reload
            ->has('abilityAssessments.items', AbilityComparison::HISTORY)
            ->where('abilityAssessments.total', 22)));
});

it('has no comparison for the first analysis', function (): void {
    $player = historyPlayer();
    UserAbilityAssessment::factory()->for($player)->done()->create();

    $this->actingAs($this->admin)->get("/admin/users/{$player->id}")->assertInertia(fn (Assert $page) => $page
        ->loadDeferredProps(fn (Assert $reload) => $reload
            ->has('abilityAssessments.items', 1)
            ->where('abilityAssessments.comparison', null)));

    $this->actingAs($player)->get('/ability')->assertInertia(fn (Assert $page) => $page
        ->component('ability/show')
        ->where('progress', null)
        ->has('history', 1)
        ->where('history.0.current', true));
});

it('shows the player progress against the previous analysis without admin fields', function (): void {
    $player = historyPlayer();
    [$older, $newer] = twoAnalyses($player);
    $newer->update(['model' => 'secret-model', 'requested_by' => $this->admin->id]);

    $this->actingAs($player)->get('/ability')->assertInertia(function (Assert $page) use ($older) {
        $page->component('ability/show')
            ->where('ability.summary', 'Analisa kedua.')
            ->where('progress.average_delta', 13.3)
            ->where('progress.direction', 'up')
            ->where('progress.previous_date', $older->created_at->toIso8601String())
            ->where('progress.subjects.0.subject', 'math')
            ->where('progress.subjects.0.delta', 15)
            ->where('progress.strengths_gained', ['Konsisten bermain'])
            ->where('progress.weaknesses_resolved', ['Membaca soal panjang'])
            ->where('progress.text', fn (string $text): bool => str_contains($text, 'naik 13,3 poin') && ! str_contains($text, 'AI'))
            ->has('history', 2)
            ->where('history.0.average', 68.3)
            ->where('history.0.current', true)
            ->where('history.1.average', 55)
            ->missing('progress.previous.id')
            ->missing('progress.current')
            ->missing('ability.model')
            ->missing('ability.confidence')
            ->missing('ability.input_snapshot')
            ->missing('ability.requested_by')
            ->missing('history.0.id');

        $json = json_encode($page->toArray()['props']);
        expect($json)->not->toContain('secret-model')->not->toContain('"confidence"')->not->toContain('input_snapshot');
    });
});

it('compares a shared older analysis with the one before it, for the owner only', function (): void {
    $player = historyPlayer();
    [$older, $newer] = twoAnalyses($player);
    $abilities = app(PlayerAbility::class);
    $olderUrl = $abilities->shareUrl($older);
    $newerUrl = $abilities->shareUrl($newer);

    $this->actingAs($player)->get($olderUrl)->assertInertia(fn (Assert $page) => $page
        ->where('ability.summary', 'Analisa pertama.')
        ->where('progress', null)
        ->where('history.1.current', true));

    $this->get($newerUrl)->assertInertia(fn (Assert $page) => $page
        ->where('progress.average_delta', 13.3));

    $stranger = historyPlayer();
    $this->actingAs($stranger)->get($newerUrl)->assertInertia(fn (Assert $page) => $page
        ->where('ability.summary', 'Analisa kedua.')
        ->where('progress', null)
        ->where('history', []));
});

it('never leaks another player\'s analyses into the progress', function (): void {
    $player = historyPlayer();
    $other = historyPlayer();
    UserAbilityAssessment::factory()->for($other)->done(['summary' => 'Milik orang lain.', 'subject_scores' => ['math' => 5]])->create(['created_at' => now()->subDays(20)]);
    UserAbilityAssessment::factory()->for($player)->done(['subject_scores' => ['math' => 70]])->create();

    $this->actingAs($player)->get('/ability')->assertInertia(fn (Assert $page) => $page
        ->where('progress', null)
        ->has('history', 1));

    $this->actingAs($this->admin)->get("/admin/users/{$player->id}")->assertInertia(fn (Assert $page) => $page
        ->loadDeferredProps(fn (Assert $reload) => $reload
            ->has('abilityAssessments.items', 1)
            ->where('abilityAssessments.comparison', null)));
});

it('does not change the analysis date when its share link is created', function (): void {
    $player = historyPlayer();
    $assessment = UserAbilityAssessment::factory()->for($player)->done()->create(['updated_at' => now()->subDays(4)]);
    $before = $assessment->fresh()->updated_at->toIso8601String();

    app(PlayerAbility::class)->shareUrl($assessment);

    expect($assessment->fresh()->updated_at->toIso8601String())->toBe($before)
        ->and($assessment->fresh()->share_code)->not->toBeNull();
});

function abilityReplyFor(array $overrides = []): array
{
    return array_replace([
        'summary' => 'Peserta kuat di matematika untuk anak kelas 4.',
        'strengths' => ['Matematika'],
        'weaknesses' => ['IPA'],
        'subject_scores' => ['math' => 70],
        'game_insights' => [],
        'recommendations' => ['Latihan 10 menit sehari.'],
        'learning_style' => 'Visual',
        'progress_vs_previous' => '',
        'confidence' => 'sedang',
    ], $overrides);
}
