<?php

use App\Models\User;
use Illuminate\Http\Client\Request;
use Illuminate\Support\Facades\Http;
use Inertia\Testing\AssertableInertia as Assert;

const ACTIVE_GAMES_SECRET = 'active-games-secret-with-at-least-32-chars';

beforeEach(function (): void {
    config([
        'scout.driver' => 'null',
        'game-service.secret' => ACTIVE_GAMES_SECRET,
        'game-service.presence_url' => 'http://game.test/internal/presence',
    ]);
    $this->withoutVite();
});

test('portal lists running rooms so a player can continue after closing the browser', function (): void {
    $user = User::factory()->withPlayerDetails()->create();
    Http::fake(['game.test/*' => Http::response(['rooms' => [
        ['game' => 'snakes-and-ladders', 'pin' => '482913', 'phase' => 'playing', 'host' => false],
        ['game' => 'floor-drop', 'pin' => '111222', 'phase' => 'QUESTION_ACTIVE', 'host' => true],
        ['game' => 'turbo-trivia', 'pin' => '333444', 'phase' => 'RACE', 'host' => false],
        ['game' => 'unknown-game', 'pin' => '999999', 'phase' => 'playing', 'host' => false],
        ['game' => 'crossword', 'pin' => 'bad', 'phase' => 'lobby', 'host' => true],
    ]])]);

    $this->actingAs($user)->get('/portal')
        ->assertOk()
        ->assertInertia(fn (Assert $page) => $page
            ->component('portal/index')
            ->missing('activeGames')
            ->loadDeferredProps(fn (Assert $reload) => $reload
                ->has('activeGames', 4)
                ->where('activeGames.0.game_key', 'snakes-and-ladders')
                ->where('activeGames.0.titleKey', 'player.snakes')
                ->where('activeGames.0.pin', '482913')
                ->where('activeGames.0.phase', 'playing')
                ->where('activeGames.0.url', '/games/snakes-and-ladders?pin=482913')
                ->where('activeGames.1.url', '/games/floor-drop?role=host')
                ->where('activeGames.1.host', true)
                ->where('activeGames.2.url', '/play/turbo-trivia/333444')
                ->where('activeGames.3.game_key', 'crossword')
                ->where('activeGames.3.pin', null)
                ->where('activeGames.3.url', '/games/crossword')
            ));

    Http::assertSent(function (Request $request) use ($user): bool {
        $timestamp = $request->header('X-Game-Timestamp')[0] ?? '';

        return str_starts_with($request->url(), 'http://game.test/internal/presence')
            && $request['user'] == $user->id
            && $request->header('X-Game-Signature')[0] === hash_hmac('sha256', $timestamp.'.', ACTIVE_GAMES_SECRET);
    });
});

test('portal shows no running rooms when the game service is unreachable', function (): void {
    $user = User::factory()->withPlayerDetails()->create();
    Http::fake(['game.test/*' => Http::response('down', 503)]);

    $this->actingAs($user)->get('/portal')
        ->assertOk()
        ->assertInertia(fn (Assert $page) => $page
            ->loadDeferredProps(fn (Assert $reload) => $reload->has('activeGames', 0)));
});

test('portal does not ask the game service without a configured secret', function (): void {
    config(['game-service.secret' => null]);
    $user = User::factory()->withPlayerDetails()->create();
    Http::fake();

    $this->actingAs($user)->get('/portal')
        ->assertOk()
        ->assertInertia(fn (Assert $page) => $page
            ->loadDeferredProps(fn (Assert $reload) => $reload->has('activeGames', 0)));

    Http::assertNothingSent();
});

test('active games locale keys exist in both languages', function (): void {
    foreach (['id', 'en'] as $locale) {
        $catalog = json_decode((string) file_get_contents(resource_path("js/locales/{$locale}-player.json")), true);

        expect($catalog['portal']['activeGames'])->toHaveKeys(['title', 'intro', 'resume', 'pin', 'host', 'phase', 'loading'])
            ->and($catalog['snakes']['duration'])->toHaveKeys(['label', 'untilFinish', 'hintTimed', 'timeLeft'])
            ->and($catalog['snakes']['leave'])->toHaveKeys(['button', 'title', 'body', 'confirm', 'cancel', 'done'])
            ->and($catalog['snakes']['finishBonus'])->toHaveKeys(['rule', 'won', 'finished']);
    }
});
