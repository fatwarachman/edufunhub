<?php

use App\Http\Requests\StoreGameResultRequest;
use App\Models\GameHistory;
use App\Models\PlayerProfile;
use App\Models\Question;
use App\Models\User;
use Inertia\Testing\AssertableInertia as Assert;

beforeEach(function (): void {
    $this->withoutVite();
    config(['game-service.secret' => str_repeat('d', 40)]);
});

/**
 * @param  array<string, mixed>  $payload
 * @return array{0: string, 1: array<string, string>}
 */
function signDuelResult(array $payload): array
{
    $body = json_encode($payload);
    $timestamp = (string) now()->getTimestamp();

    return [$body, [
        'X-Game-Timestamp' => $timestamp,
        'X-Game-Signature' => hash_hmac('sha256', $timestamp.'.'.$body, config('game-service.secret')),
        'Content-Type' => 'application/json',
        'Accept' => 'application/json',
    ]];
}

/**
 * @param  array<string, string>  $headers
 * @return array<string, string>
 */
function duelServerHeaders(array $headers): array
{
    return collect($headers)->mapWithKeys(function (string $value, string $name): array {
        $key = strtoupper(str_replace('-', '_', $name));

        return [in_array($key, ['CONTENT_TYPE', 'CONTENT_LENGTH'], true) ? $key : 'HTTP_'.$key => $value];
    })->all();
}

/**
 * @param  array<string, mixed>  $overrides
 * @return array<string, mixed>
 */
function duelResult(User $user, array $overrides = []): array
{
    return array_merge([
        'event_id' => 'qd-'.$user->id.'-duel-1790000000000',
        'user_id' => $user->id,
        'game_key' => 'quiz-duel',
        'mission' => 'duel',
        'grade' => 5,
        'points' => 70,
        'correct' => 5,
        'wrong' => 0,
        'duration_seconds' => 60,
        'completed_at' => now()->toIso8601String(),
    ], $overrides);
}

it('requires sign in for the duel', function (): void {
    $this->get('/games/quiz-duel')->assertRedirect('/login');
    $this->postJson('/games/quiz-duel/token')->assertUnauthorized();
});

it('shows the duel with the player grade, points and websocket url', function (): void {
    $user = User::factory()->create(['name' => 'Budi']);
    PlayerProfile::factory()->for($user)->create(['nickname' => 'Andika', 'grade' => 6]);
    $user->pointLedgers()->create(['points' => 30, 'reason' => 'seed', 'event_id' => 'seed-duel']);

    $this->actingAs($user)->get('/games/quiz-duel')->assertOk()->assertInertia(fn (Assert $page) => $page
        ->component('games/quiz-duel', false)
        ->where('player.name', 'Andika')
        ->where('player.grade', 6)
        ->where('points', 30)
        ->where('serviceReady', true)
        ->where('wsUrl', '/game-ws/duel'));
});

it('issues a duel token carrying the profile grade', function (): void {
    $user = User::factory()->create();
    PlayerProfile::factory()->for($user)->create(['grade' => 0]);

    $token = $this->actingAs($user)->postJson('/games/quiz-duel/token')->assertOk()->json('token');
    [$payload] = explode('.', $token);
    $claims = json_decode(base64_decode(strtr($payload, '-_', '+/')), true);

    expect($claims['game'])->toBe('quiz-duel')
        ->and($claims['grade'])->toBe(0)
        ->and($claims['sub'])->toBe($user->id);
});

it('requires a grade and complete details before a duel token', function (): void {
    $noGrade = User::factory()->withPlayerDetails()->create();
    $this->actingAs($noGrade)->postJson('/games/quiz-duel/token')->assertStatus(422);

    $incomplete = User::factory()->create();
    PlayerProfile::factory()->for($incomplete)->incomplete()->create(['grade' => 4]);
    $this->actingAs($incomplete)->postJson('/games/quiz-duel/token')->assertForbidden();
});

it('records a signed duel result with points and bank answers', function (): void {
    $user = User::factory()->create(['locale' => 'id']);
    $question = Question::factory()->create(['games' => ['quiz-duel']]);
    [$body, $headers] = signDuelResult(duelResult($user, [
        'answers' => [['key' => $question->key, 'correct' => true]],
    ]));

    $this->call('POST', '/api/internal/game-results', [], [], [], duelServerHeaders($headers), $body)
        ->assertCreated();

    $history = GameHistory::query()->sole();
    expect($history->game_key)->toBe('quiz-duel')
        ->and($history->game_name)->toBe('Duel Kuis Kelas')
        ->and($history->points)->toBe(70)
        ->and($user->pointLedgers()->sum('points'))->toBe(70)
        ->and($question->fresh()->times_answered)->toBe(1);
});

it('rejects duel results above the duel point cap or with a foreign event id', function (array $overrides): void {
    $user = User::factory()->create();
    [$body, $headers] = signDuelResult(duelResult($user, $overrides));

    $this->call('POST', '/api/internal/game-results', [], [], [], duelServerHeaders($headers), $body)
        ->assertUnprocessable();

    expect(GameHistory::query()->count())->toBe(0);
})->with([
    'too many points' => [['points' => StoreGameResultRequest::GAMES['quiz-duel']['max_points'] + 1]],
    'sky event id' => [['event_id' => 'sq-1-sky-1']],
    'wrong mission' => [['mission' => 'sky']],
]);

it('lists the duel in the portal catalog', function (): void {
    $user = User::factory()->withPlayerDetails()->create();
    PlayerProfile::query()->where('user_id', $user->id)->update(['grade' => 3]);

    $this->actingAs($user)->get('/portal')->assertOk()->assertInertia(fn (Assert $page) => $page
        ->where('categories.2.games.1.key', 'quiz-duel')
        ->where('categories.2.games.1.url', '/games/quiz-duel'));
});

it('keeps true or false questions out of the duel', function (): void {
    $admin = User::factory()->create(['is_superadmin' => true]);

    $this->actingAs($admin)->post('/admin/questions', [
        'type' => 'true_false',
        'band' => 1,
        'subject' => 'science',
        'prompt_id' => 'Bumi itu bulat.',
        'answer' => 1,
        'games' => ['quiz-duel'],
        'is_active' => true,
    ])->assertSessionHasErrors(['games' => __('questions.choice_only_games')]);
});
