<?php

use App\Ai\Agents\AbilityAnalyst;
use App\Jobs\GenerateAbilityAssessment;
use App\Models\GameHistory;
use App\Models\PlayerProfile;
use App\Models\Setting;
use App\Models\User;
use App\Models\UserAbilityAssessment;
use App\Services\AbilityComparison;
use App\Services\Ai\AbilityAnalyzer;
use App\Services\Ai\AutoAbilityAssessment;
use App\Services\WhatsApp\AbilityReportMessage;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\Crypt;
use Illuminate\Support\Facades\Queue;
use Illuminate\Testing\TestResponse;
use Inertia\Testing\AssertableInertia as Assert;

const AUTO_ABILITY_SECRET = 'auto-ability-secret-with-at-least-32-chars';

beforeEach(function (): void {
    config([
        'scout.driver' => 'null',
        'queue.default' => 'sync',
        'ai.ability_assessment.connection' => null,
        'game-service.secret' => AUTO_ABILITY_SECRET,
        'screen-time.timezone' => 'Asia/Jakarta',
    ]);
    $this->withoutVite();
    Setting::set('ai.base_url', 'https://ai.test/v1', 'ai');
    Setting::set('ai.api_key', Crypt::encryptString('sk-test-1234'), 'ai');
    Setting::set('ai.model', 'gpt-4o-mini', 'ai');
    $this->player = User::factory()->create(['name' => 'Auto Player', 'locale' => 'id']);
    PlayerProfile::factory()->for($this->player)->create(['grade' => 5, 'nickname' => 'Rani']);
});

function autoReply(array $overrides = []): array
{
    return array_replace([
        'summary' => 'Peserta berkembang baik.',
        'strengths' => ['Teliti'],
        'weaknesses' => ['Soal cerita'],
        'subject_scores' => [['subject' => 'math', 'score' => 70], ['subject' => 'science', 'score' => 60]],
        'game_insights' => [],
        'recommendations' => ['Latihan 10 menit.'],
        'learning_style' => 'Visual',
        'progress_vs_previous' => 'Analisa pertama.',
        'confidence' => 'sedang',
    ], $overrides);
}

/** Report one finished game with $answered questions (all correct but one). */
function reportAnswered(User $user, int $answered, ?Carbon $at = null): TestResponse
{
    $body = json_encode([
        'event_id' => 'fq-'.$user->id.'-lakeside-'.random_int(1, PHP_INT_MAX),
        'user_id' => $user->id,
        'game_key' => 'flag-quest',
        'mission' => 'lakeside',
        'grade' => 5,
        'points' => 10,
        'correct' => $answered - 1,
        'wrong' => 1,
        'duration_seconds' => 120,
        'completed_at' => ($at ?? now())->toIso8601String(),
    ]);
    $timestamp = (string) now()->getTimestamp();

    return test()->call('POST', '/api/internal/game-results', [], [], [], [
        'CONTENT_TYPE' => 'application/json',
        'HTTP_ACCEPT' => 'application/json',
        'HTTP_X_GAME_TIMESTAMP' => $timestamp,
        'HTTP_X_GAME_SIGNATURE' => hash_hmac('sha256', $timestamp.'.'.$body, AUTO_ABILITY_SECRET),
    ], $body);
}

function autoRuns(User $user): array
{
    return UserAbilityAssessment::query()->where('user_id', $user->id)->where('trigger', UserAbilityAssessment::TRIGGER_AUTO)
        ->orderBy('id')->get()
        ->map(fn (UserAbilityAssessment $a): array => [$a->trigger_day->toDateString(), $a->trigger_index, $a->trigger_answered])
        ->all();
}

it('counts milestones: first at 100, then every 150 the same day', function (int $answered, int $reached): void {
    expect(app(AutoAbilityAssessment::class)->reached($answered))->toBe($reached);
})->with([
    'none' => [99, 0],
    'first' => [100, 1],
    'between' => [249, 1],
    'second' => [250, 2],
    'third' => [400, 3],
    'fourth' => [560, 4],
]);

it('starts the first analysis at 100 answered questions and sends it to WhatsApp', function (): void {
    Carbon::setTestNow('2026-10-10 03:00:00');
    AbilityAnalyst::fake([autoReply()]);

    reportAnswered($this->player, 60)->assertCreated();
    expect(autoRuns($this->player))->toBe([]);

    reportAnswered($this->player, 40)->assertCreated();

    $assessment = UserAbilityAssessment::query()->sole();
    expect(autoRuns($this->player))->toBe([['2026-10-10', 1, 100]])
        ->and($assessment->status)->toBe(UserAbilityAssessment::DONE)
        ->and($assessment->requested_by)->toBeNull();

    $body = app(AbilityReportMessage::class)->build($this->player, $assessment);
    expect($body)->toContain('Kamu sudah menjawab 100 soal hari ini')
        ->toContain('Ini analisa pertamamu.');
});

it('runs the next analyses of the same day every 150 questions and never twice per milestone', function (): void {
    Carbon::setTestNow('2026-10-10 02:00:00');
    AbilityAnalyst::fake([autoReply(), autoReply(), autoReply()]);

    reportAnswered($this->player, 100);
    reportAnswered($this->player, 100);
    reportAnswered($this->player, 49);
    expect(autoRuns($this->player))->toHaveCount(1);

    reportAnswered($this->player, 1);
    expect(autoRuns($this->player))->toBe([['2026-10-10', 1, 100], ['2026-10-10', 2, 250]]);

    // One long game jumping over two milestones starts a single analysis.
    reportAnswered($this->player, 320);
    expect(autoRuns($this->player))->toBe([['2026-10-10', 1, 100], ['2026-10-10', 2, 250], ['2026-10-10', 4, 570]]);
});

it('restarts at 100 on a new local day (Asia/Jakarta midnight)', function (): void {
    AbilityAnalyst::fake([autoReply(), autoReply()]);

    Carbon::setTestNow('2026-10-10 16:30:00'); // 23:30 WIB
    reportAnswered($this->player, 120);
    reportAnswered($this->player, 90);

    Carbon::setTestNow('2026-10-10 17:30:00'); // 00:30 WIB the next day
    reportAnswered($this->player, 90);
    expect(autoRuns($this->player))->toBe([['2026-10-10', 1, 120]]);

    reportAnswered($this->player, 10);
    expect(autoRuns($this->player))->toBe([['2026-10-10', 1, 120], ['2026-10-11', 1, 100]]);
});

it('compares with the latest earlier analysis, on the same day or not', function (): void {
    Carbon::setTestNow('2026-10-09 05:00:00');
    UserAbilityAssessment::factory()->for($this->player)->done(['subject_scores' => ['math' => 50, 'science' => 70]])->create(['created_at' => now()->subDay()]);
    AbilityAnalyst::fake([autoReply(), autoReply(['subject_scores' => [['subject' => 'math', 'score' => 82], ['subject' => 'science', 'score' => 55]]])]);

    Carbon::setTestNow('2026-10-10 03:00:00');
    reportAnswered($this->player, 100);
    $first = UserAbilityAssessment::query()->latest('id')->first();
    $firstBody = app(AbilityReportMessage::class)->build($this->player, $first);
    expect($firstBody)->toContain('⬆️ Matematika: 50 → *70* (+20)')
        ->toContain('⬇️ IPA: 70 → *60* (-10)')
        ->toContain('Dibanding analisa 8 Oktober 2026, 12:00');

    Carbon::setTestNow('2026-10-10 04:00:00');
    reportAnswered($this->player, 150);
    $second = UserAbilityAssessment::query()->latest('id')->first();
    expect($second->trigger_index)->toBe(2);

    $body = app(AbilityReportMessage::class)->build($this->player, $second);
    expect($body)->toContain('⬆️ Matematika: 70 → *82* (+12)')
        ->toContain('⬇️ IPA: 60 → *55* (-5)')
        ->toContain('Rata-rata nilai naik 3,5 poin (65 → *68,5*)')
        ->toContain('Dibanding analisa 10 Oktober 2026, 10:00');

    expect($second->input_snapshot['previous_assessments'][0]['analyzed_at'])->toBe($first->created_at->toIso8601String());
});

it('waits while an analysis runs and starts the reached milestone when it finishes', function (): void {
    Carbon::setTestNow('2026-10-10 03:00:00');
    Queue::fake();

    reportAnswered($this->player, 100);
    reportAnswered($this->player, 150);
    expect(autoRuns($this->player))->toBe([['2026-10-10', 1, 100]]);

    Queue::assertPushed(GenerateAbilityAssessment::class, 1);

    AbilityAnalyst::fake([autoReply()]);
    $pending = UserAbilityAssessment::query()->sole();
    (new GenerateAbilityAssessment($pending))->handle(app(AbilityAnalyzer::class), app(AbilityComparison::class));

    expect(autoRuns($this->player))->toBe([['2026-10-10', 1, 100], ['2026-10-10', 2, 250]])
        ->and($pending->fresh()->status)->toBe(UserAbilityAssessment::DONE);
    Queue::assertPushed(GenerateAbilityAssessment::class, 2);
});

it('does nothing when disabled or the AI is not configured, keeping the milestone', function (): void {
    Carbon::setTestNow('2026-10-10 03:00:00');
    app(AutoAbilityAssessment::class)->save(false, 100, 150);
    reportAnswered($this->player, 100)->assertCreated();
    expect(autoRuns($this->player))->toBe([]);

    app(AutoAbilityAssessment::class)->save(true, 100, 150);
    Setting::set('ai.model', '', 'ai');
    reportAnswered($this->player, 5)->assertCreated();
    expect(autoRuns($this->player))->toBe([]);

    Setting::set('ai.model', 'gpt-4o-mini', 'ai');
    AbilityAnalyst::fake([autoReply()]);
    reportAnswered($this->player, 5)->assertCreated();
    expect(autoRuns($this->player))->toBe([['2026-10-10', 1, 110]]);
});

it('uses the thresholds saved by the super admin', function (): void {
    $admin = User::factory()->superadmin()->create();

    $this->actingAs($admin)->get('/admin/ai-settings')->assertInertia(fn (Assert $page) => $page
        ->component('admin/ai-settings')
        ->where('autoAssessment.enabled', true)
        ->where('autoAssessment.first', 100)
        ->where('autoAssessment.next', 150));

    $this->put('/admin/ai-settings/auto-assessment', ['enabled' => true, 'first' => 5, 'next' => 150])->assertSessionHasErrors('first');
    $this->put('/admin/ai-settings/auto-assessment', ['enabled' => true, 'first' => 50, 'next' => 60])->assertSessionHasNoErrors();

    $auto = app(AutoAbilityAssessment::class);
    expect($auto->first())->toBe(50)->and($auto->next())->toBe(60)->and($auto->reached(170))->toBe(3);

    $player = User::factory()->create();
    $this->actingAs($player)->put('/admin/ai-settings/auto-assessment', ['enabled' => false, 'first' => 100, 'next' => 150])->assertForbidden();
    expect(app(AutoAbilityAssessment::class)->enabled())->toBeTrue();
});

it('labels automatic analyses on the admin user page', function (): void {
    Carbon::setTestNow('2026-10-10 03:00:00');
    AbilityAnalyst::fake([autoReply()]);
    reportAnswered($this->player, 100);
    $admin = User::factory()->superadmin()->create();

    $this->actingAs($admin)->get("/admin/users/{$this->player->id}")
        ->assertInertia(fn (Assert $page) => $page->loadDeferredProps(fn (Assert $reload) => $reload
            ->where('abilityAssessments.items.0.trigger', 'auto')
            ->where('abilityAssessments.items.0.trigger_answered', 100)
            ->where('abilityAssessments.items.0.requested_by', null)));
});

it('ignores game histories of other days and players', function (): void {
    Carbon::setTestNow('2026-10-10 03:00:00');
    GameHistory::factory()->for($this->player)->create(['correct' => 90, 'wrong' => 0, 'played_at' => now()->subDay()]);
    GameHistory::factory()->create(['correct' => 200, 'wrong' => 0, 'played_at' => now()]);

    expect(app(AutoAbilityAssessment::class)->answeredOn($this->player, app(AutoAbilityAssessment::class)->dayOf()))->toBe(0);
});
