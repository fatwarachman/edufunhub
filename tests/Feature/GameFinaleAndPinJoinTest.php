<?php

use App\Models\PointLedger;
use App\Models\QuestionGeneration;
use App\Models\User;
use Illuminate\Http\Client\Request;
use Illuminate\Support\Facades\Http;
use Inertia\Testing\AssertableInertia as Assert;

const FINALE_SECRET = 'finale-and-pin-secret-with-at-least-32-chars';

beforeEach(function (): void {
    config([
        'scout.driver' => 'null',
        'game-service.secret' => FINALE_SECRET,
        'game-service.room_url' => 'http://game.test/internal/room',
    ]);
    $this->withoutVite();
});

function finalePlayer(string $nickname): User
{
    $user = User::factory()->withPlayerDetails()->create();
    $user->playerProfile()->update(['nickname' => $nickname]);

    return $user->fresh();
}

test('a PIN finds its game and links to the player page with the PIN', function (): void {
    $user = finalePlayer('Rani');
    Http::fake(['game.test/*' => Http::response(['rooms' => [
        ['game' => 'crossword', 'phase' => 'lobby', 'open' => true],
    ]])]);

    $this->actingAs($user)->getJson('/join/482913/rooms')
        ->assertOk()
        ->assertJsonCount(1, 'rooms')
        ->assertJsonPath('rooms.0.game_key', 'crossword')
        ->assertJsonPath('rooms.0.titleKey', 'player.crossword')
        ->assertJsonPath('rooms.0.open', true)
        ->assertJsonPath('rooms.0.url', '/games/crossword?pin=482913');

    Http::assertSent(function (Request $request): bool {
        $timestamp = $request->header('X-Game-Timestamp')[0] ?? '';

        return str_starts_with($request->url(), 'http://game.test/internal/room')
            && $request['pin'] === '482913'
            && $request->header('X-Game-Signature')[0] === hash_hmac('sha256', $timestamp.'.', FINALE_SECRET);
    });
});

test('PIN links of projector games open the player pad', function (): void {
    $user = finalePlayer('Rani');
    Http::fake(['game.test/*' => Http::response(['rooms' => [
        ['game' => 'turbo-trivia', 'phase' => 'LOBBY', 'open' => true],
        ['game' => 'floor-drop', 'phase' => 'QUESTION_ACTIVE', 'open' => false],
        ['game' => 'unknown-game', 'phase' => 'lobby', 'open' => true],
        ['game' => 'sky-quiz', 'phase' => 'lobby', 'open' => true],
    ]])]);

    $this->actingAs($user)->getJson('/join/111222/rooms')
        ->assertOk()
        ->assertJsonCount(2, 'rooms')
        ->assertJsonPath('rooms.0.url', '/play/turbo-trivia/111222')
        ->assertJsonPath('rooms.1.game_key', 'floor-drop')
        ->assertJsonPath('rooms.1.open', false)
        ->assertJsonPath('rooms.1.url', '/games/floor-drop?pin=111222');
});

test('the short join link goes straight into the only game with that PIN', function (): void {
    $user = finalePlayer('Rani');
    Http::fake(['game.test/*' => Http::response(['rooms' => [
        ['game' => 'market-math', 'phase' => 'lobby', 'open' => true],
    ]])]);

    $this->actingAs($user)->get('/join/333444')->assertRedirect('/games/market-math?pin=333444');
});

test('the short join link opens the PIN dialog when no or several games match', function (array $rooms): void {
    $user = finalePlayer('Rani');
    Http::fake(['game.test/*' => Http::response(['rooms' => $rooms])]);

    $this->actingAs($user)->get('/join/555666')->assertRedirect(route('portal', ['join' => '555666']));
})->with([
    'none' => [[]],
    'several' => [[
        ['game' => 'crossword', 'phase' => 'lobby', 'open' => true],
        ['game' => 'mini-lab', 'phase' => 'lobby', 'open' => true],
    ]],
]);

test('an unreachable game service finds no rooms', function (): void {
    $user = finalePlayer('Rani');
    Http::fake(['game.test/*' => Http::response('down', 503)]);

    $this->actingAs($user)->getJson('/join/123456/rooms')->assertOk()->assertJsonCount(0, 'rooms');
});

test('PIN lookup needs a signed-in player and a six digit PIN', function (): void {
    $this->get('/join/123456')->assertRedirect(route('login'));
    $this->getJson('/join/123456/rooms')->assertUnauthorized();

    $user = finalePlayer('Rani');
    $this->actingAs($user)->getJson('/join/12345/rooms')->assertNotFound();
    $this->actingAs($user)->getJson('/join/abcdef/rooms')->assertNotFound();
});

test('PIN lookup has its own rate limit', function (): void {
    $user = finalePlayer('Rani');
    Http::fake(['game.test/*' => Http::response(['rooms' => []])]);

    foreach (range(1, 20) as $attempt) {
        $this->actingAs($user)->getJson('/join/123456/rooms')->assertOk();
    }
    $this->actingAs($user)->getJson('/join/123456/rooms')->assertTooManyRequests();
    $this->actingAs($user)->getJson('/leaderboard/games/crossword')->assertOk();
});

test('the end-of-game leaderboard shows the top players of that game right away', function (): void {
    $viewer = finalePlayer('Rani');
    $other = finalePlayer('Budi');
    PointLedger::factory()->for($other)->create(['points' => 50, 'reason' => 'crossword:level-1']);
    PointLedger::factory()->for($viewer)->create(['points' => 30, 'reason' => 'crossword:level-2']);
    PointLedger::factory()->for($viewer)->create(['points' => 900, 'reason' => 'sky-quiz:sky']);
    PointLedger::factory()->for($viewer)->create(['points' => 500, 'reason' => 'shop:item']);

    $this->actingAs($viewer)->getJson('/leaderboard/games/crossword')
        ->assertOk()
        ->assertJsonPath('key', 'crossword')
        ->assertJsonPath('players', 2)
        ->assertJsonPath('entries.0.name', 'Budi')
        ->assertJsonPath('entries.0.points', 50)
        ->assertJsonPath('entries.1.name', 'Rani')
        ->assertJsonPath('entries.1.isMe', true)
        ->assertJsonPath('me.rank', 2)
        ->assertJsonPath('me.points', 30)
        ->assertJsonMissingPath('entries.0.email');

    PointLedger::factory()->for($viewer)->create(['points' => 40, 'reason' => 'crossword:level-1']);

    $this->actingAs($viewer)->getJson('/leaderboard/games/crossword')
        ->assertJsonPath('entries.0.name', 'Rani')
        ->assertJsonPath('me.rank', 1)
        ->assertJsonPath('me.points', 70);
});

test('the end-of-game leaderboard refuses unknown games and guests', function (): void {
    $this->getJson('/leaderboard/games/crossword')->assertUnauthorized();

    $this->actingAs(finalePlayer('Rani'))->getJson('/leaderboard/games/not-a-game')->assertNotFound();
});

test('the question bank shows AI generation still running', function (): void {
    $admin = User::factory()->superadmin()->create();
    $live = QuestionGeneration::query()->create([
        'model' => 'test-model', 'subjects' => ['math'], 'grades' => [1, 2], 'per_combination' => 5,
        'games' => ['sky-quiz'], 'activate' => false, 'status' => 'running', 'total_jobs' => 2, 'done_jobs' => 1,
        'requested_by' => $admin->id,
    ]);
    $live->createItems();
    QuestionGeneration::query()->create([
        'model' => 'test-model', 'subjects' => ['science'], 'grades' => [3], 'per_combination' => 5,
        'games' => ['sky-quiz'], 'activate' => false, 'status' => 'done', 'total_jobs' => 1, 'done_jobs' => 1,
    ]);

    $this->actingAs($admin)->get('/admin/questions')
        ->assertOk()
        ->assertInertia(fn (Assert $page) => $page
            ->component('admin/questions/index')
            ->has('liveGenerations', 1)
            ->where('liveGenerations.0.id', $live->id)
            ->where('liveGenerations.0.status', 'running')
            ->where('liveGenerations.0.requested_by', $admin->name)
            ->has('liveGenerations.0.items', 2)
            ->where('liveGenerations.0.items.0.subject', 'math'));

    $this->actingAs($admin)->get('/admin/questions?subject=math')
        ->assertInertia(fn (Assert $page) => $page->has('liveGenerations', 1));

    $live->update(['status' => 'done']);

    $this->actingAs($admin)->get('/admin/questions')
        ->assertInertia(fn (Assert $page) => $page->has('liveGenerations', 0));
});
