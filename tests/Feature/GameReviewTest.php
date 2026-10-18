<?php

use App\Models\GameHistory;
use App\Models\Question;
use App\Models\User;
use Illuminate\Testing\TestResponse;
use Inertia\Testing\AssertableInertia as Assert;

beforeEach(function (): void {
    $this->withoutVite();
    config(['game-service.secret' => str_repeat('k', 40)]);
});

/** @param array<string, mixed> $payload */
function postReviewResult(array $payload): TestResponse
{
    $body = (string) json_encode($payload);
    $timestamp = (string) now()->getTimestamp();

    return test()->call('POST', '/api/internal/game-results', [], [], [], [
        'HTTP_X_GAME_TIMESTAMP' => $timestamp,
        'HTTP_X_GAME_SIGNATURE' => hash_hmac('sha256', $timestamp.'.'.$body, config('game-service.secret')),
        'CONTENT_TYPE' => 'application/json',
        'HTTP_ACCEPT' => 'application/json',
    ], $body);
}

/**
 * Records an EduKart race for $user (with a bot) answering a choice question
 * wrong and a true/false question right.
 *
 * @return array{choice: Question, truth: Question, play: GameHistory}
 */
function recordReviewedRace(User $user, string $matchKey = 'ek-482913-1790000000000'): array
{
    $choice = Question::factory()->create([
        'games' => ['edu-kart'],
        'subject' => 'science',
        'prompt_id' => 'Planet terdekat dengan Matahari?',
        'options' => [['id' => 'Merkurius', 'en' => 'Mercury'], ['id' => 'Mars', 'en' => 'Mars'], ['id' => 'Venus', 'en' => 'Venus']],
        'answer' => 0,
        'hint_id' => 'Merkurius paling dekat.',
    ]);
    $truth = Question::factory()->trueFalse(false)->create(['games' => ['edu-kart'], 'subject' => 'science']);

    postReviewResult([
        'event_id' => 'ek-'.$user->id.'-room-'.crc32($matchKey),
        'user_id' => $user->id,
        'game_key' => 'edu-kart',
        'mission' => 'room',
        'grade' => 5,
        'points' => 40,
        'correct' => 1,
        'wrong' => 1,
        'duration_seconds' => 125,
        'completed_at' => now()->toIso8601String(),
        'answers' => [
            ['key' => $choice->key, 'correct' => false, 'choice' => 2],
            ['key' => $truth->key, 'correct' => true, 'choice' => 0],
        ],
        'match' => [
            'key' => $matchKey,
            'mode' => 'bot',
            'pin' => '482913',
            'level' => 1,
            'grade' => 5,
            'started_at' => now()->subMinutes(2)->toIso8601String(),
            'ended_at' => now()->toIso8601String(),
            'finished' => true,
            'players' => [
                ['user_id' => $user->id, 'name' => $user->name, 'grade' => 5, 'rank' => 1, 'score' => 40, 'correct' => 1, 'wrong' => 1],
                ['user_id' => null, 'name' => 'Bot 1', 'grade' => 5, 'rank' => 2, 'score' => 0, 'correct' => 0, 'wrong' => 2, 'bot' => true],
            ],
        ],
    ])->assertCreated();

    return ['choice' => $choice, 'truth' => $truth, 'play' => GameHistory::query()->where('user_id', $user->id)->latest('id')->firstOrFail()];
}

it('requires sign in for the game review', function (): void {
    $this->get('/games/review/1')->assertRedirect('/login');
    $this->get('/games/review/match/ek-1-2')->assertRedirect('/login');
});

it('shows every recorded question with the picked and the right answer', function (): void {
    $user = User::factory()->withPlayerDetails()->create();
    ['choice' => $choice, 'play' => $play] = recordReviewedRace($user);

    $this->actingAs($user)->get('/games/review/'.$play->id)->assertOk()->assertInertia(fn (Assert $page) => $page
        ->component('games/review', false)
        ->where('play.id', $play->id)
        ->where('play.game_key', 'edu-kart')
        ->where('play.correct', 1)
        ->where('play.wrong', 1)
        ->where('play.accuracy', 50)
        ->where('play.rank', 1)
        ->has('questions', 2)
        ->where('questions.0.number', 1)
        ->where('questions.0.type', Question::TYPE_CHOICE)
        ->where('questions.0.prompt.id', 'Planet terdekat dengan Matahari?')
        ->where('questions.0.options.0.id', 'Merkurius')
        ->where('questions.0.answer', 0)
        ->where('questions.0.choice', 2)
        ->where('questions.0.correct', false)
        ->where('questions.0.hint.id', 'Merkurius paling dekat.')
        ->where('questions.1.type', Question::TYPE_TRUE_FALSE)
        ->where('questions.1.answer', 0)
        ->where('questions.1.choice', 0)
        ->where('questions.1.correct', true)
        ->has('questions.1.options', 0));

    expect($choice->fresh()->key)->toBe($choice->key);
});

it('opens the review of a finished race by its match key', function (): void {
    $user = User::factory()->withPlayerDetails()->create();
    ['play' => $play] = recordReviewedRace($user, 'ek-482913-1790000000555');

    $this->actingAs($user)->get('/games/review/match/ek-482913-1790000000555')
        ->assertRedirect('/games/review/'.$play->id);
});

it('waits on the match key until the referee result is recorded', function (): void {
    $user = User::factory()->withPlayerDetails()->create();

    $this->actingAs($user)->get('/games/review/match/ek-482913-1790000000999')->assertOk()->assertInertia(fn (Assert $page) => $page
        ->component('games/review', false)
        ->where('play', null)
        ->where('pending', true)
        ->has('questions', 0));
});

it('never shows another players review', function (): void {
    $owner = User::factory()->withPlayerDetails()->create();
    $other = User::factory()->withPlayerDetails()->create();
    ['play' => $play] = recordReviewedRace($owner, 'ek-482913-1790000000777');

    $this->actingAs($other)->get('/games/review/'.$play->id)->assertNotFound();
    $this->actingAs($other)->get('/games/review/match/ek-482913-1790000000777')->assertOk()
        ->assertInertia(fn (Assert $page) => $page->where('pending', true)->where('play', null));
});

it('rejects malformed match keys', function (): void {
    $user = User::factory()->withPlayerDetails()->create();

    $this->actingAs($user)->get('/games/review/match/'.str_repeat('a', 81))->assertNotFound();
    $this->actingAs($user)->get('/games/review/abc')->assertNotFound();
});

it('ships matching review labels in both locales', function (): void {
    $id = json_decode((string) file_get_contents(resource_path('js/locales/id-player.json')), true);
    $en = json_decode((string) file_get_contents(resource_path('js/locales/en-player.json')), true);

    expect(array_keys($id['gameReview']))->toBe(array_keys($en['gameReview']))
        ->and($id['finale']['review'])->toBe('Analisa soal & jawaban')
        ->and($en['finale']['review'])->toBe('Review questions & answers');
});
