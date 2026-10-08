<?php

use App\Models\GameHistory;
use App\Models\Question;
use App\Models\QuestionAnswer;
use App\Models\User;
use App\Services\QuestionAnalytics;
use Inertia\Testing\AssertableInertia as Assert;

const CHOICE_STATS_SECRET = 'question-choice-stats-test-secret-32chars';

beforeEach(function (): void {
    config(['scout.driver' => 'null', 'game-service.secret' => CHOICE_STATS_SECRET]);
    $this->withoutVite();
});

/**
 * @param  list<array<string, mixed>>  $answers
 * @return array{0: string, 1: array<string, string>}
 */
function choiceStatsSignedResult(User $user, array $answers): array
{
    $body = json_encode([
        'event_id' => 'sq-'.$user->id.'-sky-'.random_int(1000000000000, 9999999999999),
        'user_id' => $user->id,
        'game_key' => 'sky-quiz',
        'mission' => 'sky',
        'grade' => 5,
        'points' => 30,
        'correct' => 1,
        'wrong' => 1,
        'duration_seconds' => 60,
        'completed_at' => now()->toIso8601String(),
        'answers' => $answers,
    ]);
    $timestamp = (string) now()->getTimestamp();

    return [$body, [
        'HTTP_X_GAME_TIMESTAMP' => $timestamp,
        'HTTP_X_GAME_SIGNATURE' => hash_hmac('sha256', $timestamp.'.'.$body, CHOICE_STATS_SECRET),
        'CONTENT_TYPE' => 'application/json',
        'HTTP_ACCEPT' => 'application/json',
    ]];
}

/**
 * Seed answers for a question: [choice => count]; null choice = older rows.
 *
 * @param  array<int|string, int>  $distribution
 */
function choiceStatsSeed(Question $question, array $distribution, int $unrecorded = 0): void
{
    $history = GameHistory::factory()->create();
    foreach ($distribution as $choice => $count) {
        for ($i = 0; $i < $count; $i++) {
            QuestionAnswer::query()->create([
                'question_id' => $question->id,
                'game_history_id' => $history->id,
                'game_key' => 'sky-quiz',
                'correct' => (int) $choice === (int) $question->answer,
                'choice' => (int) $choice,
            ]);
        }
    }
    for ($i = 0; $i < $unrecorded; $i++) {
        QuestionAnswer::query()->create([
            'question_id' => $question->id,
            'game_history_id' => $history->id,
            'game_key' => 'sky-quiz',
            'correct' => false,
        ]);
    }
}

it('stores the picked option sent by the game service', function (): void {
    $user = User::factory()->create();
    $choice = Question::factory()->create(['answer' => 1]);
    $truth = Question::factory()->trueFalse(true)->create();
    $timeout = Question::factory()->create();

    [$body, $server] = choiceStatsSignedResult($user, [
        ['key' => $choice->key, 'correct' => false, 'choice' => 3],
        ['key' => $truth->key, 'correct' => true, 'choice' => 1],
        ['key' => $timeout->key, 'correct' => false],
    ]);
    $this->call('POST', '/api/internal/game-results', [], [], [], $server, $body)->assertCreated();

    expect(QuestionAnswer::query()->where('question_id', $choice->id)->sole()->choice)->toBe(3)
        ->and(QuestionAnswer::query()->where('question_id', $truth->id)->sole()->choice)->toBe(1)
        ->and(QuestionAnswer::query()->where('question_id', $timeout->id)->sole()->choice)->toBeNull();
});

it('ignores a choice that does not exist on the question', function (): void {
    $user = User::factory()->create();
    $choice = Question::factory()->create();
    $truth = Question::factory()->trueFalse()->create();

    [$body, $server] = choiceStatsSignedResult($user, [
        ['key' => $choice->key, 'correct' => false, 'choice' => 5],
        ['key' => $truth->key, 'correct' => false, 'choice' => 2],
    ]);
    $this->call('POST', '/api/internal/game-results', [], [], [], $server, $body)->assertCreated();

    expect(QuestionAnswer::query()->whereNotNull('choice')->count())->toBe(0)
        ->and(QuestionAnswer::query()->count())->toBe(2);
});

it('rejects a choice outside 0..5', function (mixed $value): void {
    $user = User::factory()->create();
    $question = Question::factory()->create();

    [$body, $server] = choiceStatsSignedResult($user, [['key' => $question->key, 'correct' => false, 'choice' => $value]]);
    $this->call('POST', '/api/internal/game-results', [], [], [], $server, $body)
        ->assertUnprocessable()
        ->assertJsonValidationErrors('answers.0.choice');

    expect(QuestionAnswer::query()->count())->toBe(0);
})->with([6, -1, 'b']);

it('counts each option and its share of recorded answers', function (): void {
    $question = Question::factory()->create(['answer' => 0]);
    choiceStatsSeed($question, [0 => 6, 1 => 2, 2 => 2], unrecorded: 3);

    $stats = app(QuestionAnalytics::class)->detail($question);

    expect($stats['choice_totals'])->toBe(['recorded' => 10, 'unrecorded' => 3])
        ->and(collect($stats['choices'])->pluck('count')->all())->toBe([6, 2, 2, 0])
        ->and(collect($stats['choices'])->pluck('percent')->all())->toBe([60.0, 20.0, 20.0, 0.0])
        ->and($stats['choices'][0])->toMatchArray(['index' => 0, 'text' => 'Benar', 'is_correct' => true])
        ->and($stats['choices'][3]['is_correct'])->toBeFalse();
});

it('derives the understanding level from the distribution', function (array $distribution, string $level, string $reason, ?int $topWrong): void {
    $question = Question::factory()->create(['answer' => 0]);
    choiceStatsSeed($question, $distribution);

    $understanding = app(QuestionAnalytics::class)->detail($question)['understanding'];

    expect($understanding['level'])->toBe($level)
        ->and($understanding['reason'])->toBe($reason)
        ->and($understanding['top_wrong']['index'] ?? null)->toBe($topWrong);
})->with([
    'understood' => [[0 => 8, 1 => 1, 2 => 1], 'understood', 'mostly_correct', 1],
    'partial' => [[0 => 6, 1 => 2, 2 => 2], 'partial', 'mixed_results', 1],
    'misconception dominant' => [[0 => 5, 2 => 4, 1 => 1], 'misconception', 'dominant_wrong_option', 2],
    'misconception beats correct' => [[0 => 3, 3 => 4, 1 => 2, 2 => 1], 'misconception', 'wrong_beats_correct', 3],
    'not understood' => [[0 => 4, 1 => 2, 2 => 2, 3 => 2], 'not_understood', 'mostly_wrong', 1],
    'insufficient' => [[0 => 1, 1 => 8], 'insufficient', 'too_few_answers', null],
]);

it('treats a question with no recorded choices as insufficient', function (): void {
    $question = Question::factory()->create();
    choiceStatsSeed($question, [], unrecorded: 20);

    $stats = app(QuestionAnalytics::class)->detail($question);

    expect($stats['understanding']['level'])->toBe('insufficient')
        ->and($stats['choice_totals'])->toBe(['recorded' => 0, 'unrecorded' => 20])
        ->and(collect($stats['choices'])->pluck('percent')->unique()->all())->toBe([null]);
});

it('reports true and false choices for true/false questions', function (): void {
    $question = Question::factory()->trueFalse(false)->create();
    choiceStatsSeed($question, [0 => 9, 1 => 3]);

    $stats = app(QuestionAnalytics::class)->detail($question);

    expect($stats['choices'])->toHaveCount(2)
        ->and($stats['choices'][0])->toMatchArray(['index' => 0, 'is_correct' => true, 'count' => 9, 'percent' => 75.0])
        ->and($stats['understanding']['level'])->toBe('understood');
});

it('passes choices and understanding to the admin question page', function (): void {
    $admin = User::factory()->superadmin()->create();
    $question = Question::factory()->create(['answer' => 0]);
    choiceStatsSeed($question, [0 => 3, 1 => 7]);

    $this->actingAs($admin)->get("/admin/questions/{$question->id}")
        ->assertOk()
        ->assertInertia(fn (Assert $page) => $page
            ->component('admin/questions/show')
            ->has('stats.choices', 4)
            ->where('stats.choices.1.count', 7)
            ->where('stats.choices.1.percent', 70)
            ->where('stats.choice_totals.recorded', 10)
            ->where('stats.understanding.level', 'misconception')
            ->where('stats.understanding.top_wrong.index', 1));
});
