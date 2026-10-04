<?php

use App\Http\Requests\StoreGameResultRequest;
use App\Models\GameHistory;
use App\Models\PlayerProfile;
use App\Models\Question;
use App\Models\User;
use Inertia\Testing\AssertableInertia as Assert;

beforeEach(function (): void {
    $this->withoutVite();
    config(['game-service.secret' => str_repeat('k', 40)]);
});

/**
 * @param  array<string, mixed>  $payload
 * @return array{0: string, 1: array<string, string>}
 */
function signTrainResult(array $payload): array
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
function trainServerHeaders(array $headers): array
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
function trainResult(User $user, array $overrides = []): array
{
    return array_merge([
        'event_id' => 'kt-'.$user->id.'-train-1790000000000',
        'user_id' => $user->id,
        'game_key' => 'knowledge-train',
        'mission' => 'train',
        'grade' => 5,
        'points' => 140,
        'correct' => 10,
        'wrong' => 0,
        'duration_seconds' => 60,
        'completed_at' => now()->toIso8601String(),
    ], $overrides);
}

it('requires sign in for the train', function (): void {
    $this->get('/games/knowledge-train')->assertRedirect('/login');
    $this->postJson('/games/knowledge-train/token')->assertUnauthorized();
});

it('shows the train with the player grade, points and websocket url', function (): void {
    $user = User::factory()->create(['name' => 'Budi']);
    PlayerProfile::factory()->for($user)->create(['nickname' => 'Andika', 'grade' => 6]);
    $user->pointLedgers()->create(['points' => 30, 'reason' => 'seed', 'event_id' => 'seed-train']);

    $this->actingAs($user)->get('/games/knowledge-train')->assertOk()->assertInertia(fn (Assert $page) => $page
        ->component('games/knowledge-train', false)
        ->where('player.name', 'Andika')
        ->where('player.grade', 6)
        ->where('points', 30)
        ->where('serviceReady', true)
        ->where('wsUrl', '/game-ws/train'));
});

it('issues a train token carrying the profile grade', function (): void {
    $user = User::factory()->create();
    PlayerProfile::factory()->for($user)->create(['grade' => 2]);

    $token = $this->actingAs($user)->postJson('/games/knowledge-train/token')->assertOk()->json('token');
    [$payload] = explode('.', $token);
    $claims = json_decode(base64_decode(strtr($payload, '-_', '+/')), true);

    expect($claims['game'])->toBe('knowledge-train')
        ->and($claims['grade'])->toBe(2)
        ->and($claims['sub'])->toBe($user->id);
});

it('requires a grade and complete details before a train token', function (): void {
    $noGrade = User::factory()->withPlayerDetails()->create();
    $this->actingAs($noGrade)->postJson('/games/knowledge-train/token')->assertStatus(422);

    $incomplete = User::factory()->create();
    PlayerProfile::factory()->for($incomplete)->incomplete()->create(['grade' => 4]);
    $this->actingAs($incomplete)->postJson('/games/knowledge-train/token')->assertForbidden();
});

it('records a signed train result with points and bank answers', function (): void {
    $user = User::factory()->create(['locale' => 'id']);
    $question = Question::factory()->create(['games' => ['knowledge-train']]);
    [$body, $headers] = signTrainResult(trainResult($user, [
        'answers' => [['key' => $question->key, 'correct' => true]],
    ]));

    $this->call('POST', '/api/internal/game-results', [], [], [], trainServerHeaders($headers), $body)
        ->assertCreated();

    $history = GameHistory::query()->sole();
    expect($history->game_key)->toBe('knowledge-train')
        ->and($history->game_name)->toBe('Kereta Pengetahuan')
        ->and($history->points)->toBe(140)
        ->and($user->pointLedgers()->sum('points'))->toBe(140)
        ->and($question->fresh()->times_answered)->toBe(1);
});

it('rejects train results above the train point cap or with a foreign event id', function (array $overrides): void {
    $user = User::factory()->create();
    [$body, $headers] = signTrainResult(trainResult($user, $overrides));

    $this->call('POST', '/api/internal/game-results', [], [], [], trainServerHeaders($headers), $body)
        ->assertUnprocessable();

    expect(GameHistory::query()->count())->toBe(0);
})->with([
    'too many points' => [['points' => StoreGameResultRequest::GAMES['knowledge-train']['max_points'] + 1]],
    'duel event id' => [['event_id' => 'qd-1-duel-1']],
    'wrong mission' => [['mission' => 'duel']],
]);

it('lists the train in its own arcade category for every grade', function (): void {
    $user = User::factory()->withPlayerDetails()->create();
    PlayerProfile::query()->where('user_id', $user->id)->update(['grade' => 0]);

    $this->actingAs($user)->get('/portal')->assertOk()->assertInertia(fn (Assert $page) => $page
        ->where('categories.4.key', 'arcade')
        ->where('categories.4.games.0.key', 'knowledge-train')
        ->where('categories.4.games.0.url', '/games/knowledge-train'));
});

it('keeps true or false questions out of the train', function (): void {
    $admin = User::factory()->create(['is_superadmin' => true]);

    $this->actingAs($admin)->post('/admin/questions', [
        'type' => 'true_false',
        'band' => 1,
        'subject' => 'science',
        'prompt_id' => 'Bumi itu bulat.',
        'answer' => 1,
        'games' => ['knowledge-train'],
        'is_active' => true,
    ])->assertSessionHasErrors(['games' => __('questions.choice_only_games')]);
});
