<?php

use App\Models\CrosswordWord;
use App\Models\GameMatch;
use App\Models\User;
use Illuminate\Testing\TestResponse;
use Inertia\Testing\AssertableInertia as Assert;

beforeEach(function (): void {
    config(['scout.driver' => 'null', 'game-service.secret' => str_repeat('h', 40)]);
    $this->withoutVite();
});

/** @param  array<string, mixed>  $payload */
function reportResult(array $payload): TestResponse
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
 * @param  list<array<string, mixed>>  $players
 * @param  array<string, mixed>  $extra
 * @return array<string, mixed>
 */
function crosswordMatch(string $key, array $players, array $extra = []): array
{
    return [
        'key' => $key, 'mode' => 'room', 'pin' => '482913', 'level' => 3, 'grade' => 2,
        'started_at' => now()->subMinutes(10)->toIso8601String(), 'ended_at' => now()->toIso8601String(),
        'finished' => true, 'players' => $players, ...$extra,
    ];
}

/** @param  array<string, mixed>  $match */
function crosswordResult(User $user, array $match, int $points, int $correct): array
{
    return [
        'event_id' => 'cw-'.$user->id.'-level-'.crc32($match['key']), 'user_id' => $user->id,
        'game_key' => 'crossword', 'mission' => 'level-3', 'grade' => 2, 'points' => $points,
        'correct' => $correct, 'wrong' => 0, 'duration_seconds' => 600, 'completed_at' => now()->toIso8601String(),
        'answers' => [], 'match' => $match,
    ];
}

it('records one shared match from every player result', function (): void {
    $rani = User::factory()->create(['name' => 'Rani']);
    $bima = User::factory()->create(['name' => 'Bima']);
    $word = CrosswordWord::query()->where('key', 'cw-3-KLOROFIL')->firstOrFail();
    $match = crosswordMatch('cw-482913-1', [
        ['user_id' => $rani->id, 'name' => 'Rani', 'grade' => 2, 'rank' => 2, 'score' => 100, 'correct' => 1, 'wrong' => 1],
        ['user_id' => $bima->id, 'name' => 'Bima', 'grade' => 9, 'rank' => 1, 'score' => 330, 'correct' => 3, 'wrong' => 0],
    ], ['words' => [['key' => $word->key, 'solved' => true], ['key' => 'cw-3-UNKNOWN', 'solved' => false]]]);

    reportResult(crosswordResult($rani, $match, 25, 1))->assertCreated();
    reportResult(crosswordResult($bima, $match, 65, 3))->assertCreated();

    $recorded = GameMatch::query()->with('players')->sole();
    expect($recorded->mode)->toBe('room')
        ->and($recorded->pin)->toBe('482913')
        ->and($recorded->level)->toBe(3)
        ->and($recorded->players_count)->toBe(2)
        ->and($recorded->players->pluck('user_id')->all())->toBe([$rani->id, $bima->id])
        ->and($recorded->players->pluck('rank')->all())->toBe([2, 1])
        ->and($recorded->players->every(fn ($seat) => $seat->game_history_id !== null))->toBeTrue()
        ->and($word->fresh()->times_used)->toBe(1)
        ->and($word->fresh()->times_solved)->toBe(1);
});

it('keeps local seats and bots without an account and ignores unknown user ids', function (): void {
    $host = User::factory()->create();
    $match = [
        'key' => 'qd-1790', 'mode' => 'bot', 'grade' => 4, 'finished' => true,
        'started_at' => now()->subMinutes(2)->toIso8601String(), 'ended_at' => now()->toIso8601String(),
        'players' => [
            ['user_id' => $host->id, 'name' => 'Host', 'grade' => 4, 'rank' => 1, 'score' => 300, 'correct' => 4, 'wrong' => 1],
            ['name' => 'Robo', 'grade' => 4, 'bot' => true, 'rank' => 2, 'score' => 120, 'correct' => 2, 'wrong' => 3],
        ],
    ];

    reportResult([
        'event_id' => 'qd-'.$host->id.'-duel-1790', 'user_id' => $host->id, 'game_key' => 'quiz-duel', 'mission' => 'duel',
        'grade' => 4, 'points' => 65, 'correct' => 4, 'wrong' => 1, 'duration_seconds' => 90, 'completed_at' => now()->toIso8601String(),
        'answers' => [], 'match' => $match,
    ])->assertCreated();

    $seats = GameMatch::query()->sole()->players;
    expect($seats[1]->user_id)->toBeNull()->and($seats[1]->is_bot)->toBeTrue()->and(GameMatch::query()->sole()->level)->toBeNull();
});

it('rejects malformed match summaries', function (array $override): void {
    $user = User::factory()->create();
    $match = array_replace(crosswordMatch('cw-1-2', [
        ['user_id' => $user->id, 'name' => 'Solo', 'grade' => 2, 'rank' => 1, 'score' => 10, 'correct' => 1, 'wrong' => 0],
    ], ['mode' => 'solo']), $override);

    reportResult(crosswordResult($user, $match, 15, 1))->assertUnprocessable();
    expect(GameMatch::query()->count())->toBe(0);
})->with([
    'unknown mode' => [['mode' => 'tournament']],
    'bad pin' => [['pin' => '12ab']],
    'no players' => [['players' => []]],
    'rank out of range' => [['players' => [['name' => 'x', 'grade' => 2, 'rank' => 9, 'score' => 0, 'correct' => 0, 'wrong' => 0]]]],
]);

it('shows match history and who a player met, with head-to-head records', function (): void {
    $admin = User::factory()->create(['is_superadmin' => true]);
    $rani = User::factory()->create(['name' => 'Rani']);
    $bima = User::factory()->create(['name' => 'Bima']);

    foreach ([[1, 2], [2, 1], [1, 2]] as $i => [$raniRank, $bimaRank]) {
        $match = crosswordMatch("cw-48291{$i}-{$i}", [
            ['user_id' => $rani->id, 'name' => 'Rani', 'grade' => 2, 'rank' => $raniRank, 'score' => 100, 'correct' => 2, 'wrong' => 1],
            ['user_id' => $bima->id, 'name' => 'Bima', 'grade' => 9, 'rank' => $bimaRank, 'score' => 90, 'correct' => 1, 'wrong' => 0],
        ], ['pin' => "48291{$i}"]);
        reportResult(crosswordResult($rani, $match, 20, 2))->assertCreated();
    }
    $solo = crosswordMatch('cw-111111-9', [['user_id' => $rani->id, 'name' => 'Rani', 'grade' => 2, 'rank' => 1, 'score' => 50, 'correct' => 1, 'wrong' => 0]], ['mode' => 'solo', 'pin' => '111111', 'level' => 1]);
    reportResult([...crosswordResult($rani, $solo, 15, 1), 'mission' => 'level-1'])->assertCreated();

    $this->actingAs($admin)->get("/admin/users/{$rani->id}")->assertOk()->assertInertia(fn (Assert $page) => $page
        ->where('matchHistory.summary.matches', 4)
        ->where('matchHistory.summary.multiplayer_matches', 3)
        ->where('matchHistory.summary.multiplayer_wins', 2)
        ->where('matchHistory.summary.win_rate', 66.7)
        ->where('matchHistory.summary.opponents', 1)
        ->where('matchHistory.opponents.0.name', 'Bima')
        ->where('matchHistory.opponents.0.account', 'Bima')
        ->where('matchHistory.opponents.0.matches', 3)
        ->where('matchHistory.opponents.0.wins', 2)
        ->where('matchHistory.opponents.0.losses', 1)
        ->where('matchHistory.byGame.0.game_key', 'crossword')
        ->where('matchHistory.byGame.0.best_level', 3)
        ->has('matchHistory.monthly', 6)
        ->where('matches.total', 4)
        ->where('matches.data.0.players.0.is_viewer', true));

    $this->get('/admin/matches?search=Bima')->assertOk()->assertInertia(fn (Assert $page) => $page
        ->component('admin/matches/index')
        ->where('summary.matches', 4)
        ->where('summary.multiplayer', 3)
        ->where('matches.total', 3));

    $this->get('/admin/matches?mode=solo')->assertInertia(fn (Assert $page) => $page->where('matches.total', 1));
    $this->get('/admin/matches?search=111111')->assertInertia(fn (Assert $page) => $page->where('matches.total', 1));
});

it('keeps match history for super admins only', function (): void {
    $this->actingAs(User::factory()->create())->get('/admin/matches')->assertForbidden();
});
