<?php

use App\Models\User;
use Inertia\Testing\AssertableInertia as Assert;

beforeEach(function (): void {
    $this->withoutVite();
});

it('shares the grouped game menu with every catalog game', function (): void {
    $this->get('/gamelist')->assertOk()->assertInertia(fn (Assert $page) => $page
        ->component('games/index')
        ->has('gameMenu', 6)
        ->where('gameMenu.0.key', 'adventure')
        ->where('gameMenu.0.games.0.key', 'flag-quest')
        ->where('gameMenu.0.games.0.guestPlayable', false)
        ->where('gameMenu.1.key', 'board')
        ->where('gameMenu.1.games.0.guestPlayable', true)
        ->where('gameMenu.2.key', 'quiz')
        ->where('gameMenu.2.games.0.key', 'sky-quiz')
        ->where('gameMenu.2.games.1.key', 'quiz-duel')
        ->where('gameMenu.2.games.1.url', '/games/quiz-duel')
        ->where('gameMenu.2.games.1.minGrade', 0)
        ->where('gameMenu.2.games.2.key', 'floor-drop')
        ->where('gameMenu.2.games.2.url', '/games/floor-drop')
        ->where('gameMenu.2.games.3.key', 'economy-heist')
        ->where('gameMenu.2.games.3.url', '/games/economy-heist')
        ->where('gameMenu.2.games.4.key', 'order-rush')
        ->where('gameMenu.2.games.4.url', '/games/order-rush')
        ->where('gameMenu.2.games.4.minGrade', 10)
        ->where('gameMenu.2.games.5.key', 'turbo-trivia')
        ->where('gameMenu.2.games.5.url', '/games/turbo-trivia')
        ->where('gameMenu.2.games.5.minGrade', 1)
        ->where('gameMenu.3.key', 'puzzle')
        ->where('gameMenu.3.games.0.key', 'crossword')
        ->where('gameMenu.3.games.0.minGrade', 0)
        ->where('gameMenu.4.key', 'arcade')
        ->where('gameMenu.4.games.0.key', 'knowledge-train')
        ->where('gameMenu.4.games.0.awardsPoints', true)
        ->where('gameMenu.4.games.1.key', 'port-sorter')
        ->where('gameMenu.4.games.1.url', '/games/port-sorter')
        ->where('gameMenu.4.games.1.minGrade', 10)
        ->where('gameMenu.5.key', 'explore')
        ->where('gameMenu.5.games.0.key', 'market-math')
        ->where('gameMenu.5.games.3.url', '/games/mini-lab')
        ->missing('gameMenu.0.games.0.recommended'));
});

it('shares the game menu on player pages too', function (): void {
    $player = User::factory()->withPlayerDetails()->create();

    $this->actingAs($player)->get('/portal')->assertOk()->assertInertia(fn (Assert $page) => $page
        ->has('gameMenu', 6)
        ->where('gameMenu.4.games.0.url', '/games/knowledge-train'));
});

it('links every game from the landing page menu', function (string $url): void {
    $landing = file_get_contents(public_path('new-landing/index.html'));

    expect($landing)->toContain('href="'.$url.'"');
})->with(['/games/flag-quest', '/games/sky-quiz', '/games/quiz-duel', '/games/knowledge-train', '/games/snakes-and-ladders', '/games/market-math', '/games/number-garden', '/games/explore-indonesia', '/games/mini-lab', '/games/floor-drop', '/games/economy-heist', '/games/order-rush', '/games/port-sorter', '/games/turbo-trivia']);

it('labels the list-view accordion and filter counts in both locales', function (): void {
    foreach (['id', 'en'] as $locale) {
        $catalog = json_decode(
            file_get_contents(resource_path("js/locales/{$locale}-player.json")),
            true,
            flags: JSON_THROW_ON_ERROR,
        );

        expect($catalog['gameList'])->toHaveKeys(['showDetails', 'hideDetails', 'filterCount'])
            ->and($catalog['gameList']['showDetails'])->toContain('{{title}}')
            ->and($catalog['gameList']['hideDetails'])->toContain('{{title}}')
            ->and($catalog['portal'])->toHaveKeys(['all', 'filterLabel']);
    }
});

it('describes list-view game details and popularity in both locales', function (): void {
    $keys = ['modeLabel', 'modeGroup', 'modeSolo', 'pointsLabel', 'pointsYes', 'pointsNo', 'accessLabel', 'accessGuest', 'accessAccount'];

    foreach (['id', 'en'] as $locale) {
        $catalog = json_decode(
            file_get_contents(resource_path("js/locales/{$locale}-player.json")),
            true,
            flags: JSON_THROW_ON_ERROR,
        );

        expect($catalog['gameList']['details'])->toHaveKeys($keys)
            ->and(array_filter($catalog['gameList']['details'], fn (string $text): bool => trim($text) === ''))->toBe([])
            ->and($catalog['portal']['mostPlayed'])->toContain('{{rank}}')
            ->and($catalog['portal']['plays'])->toContain('{{formatted}}')->toContain('{{days}}')
            ->and($catalog['portal']['playsNone'])->toContain('{{days}}');
    }
});

it('describes every coming-soon game in both locales', function (): void {
    $games = ['monsterCafe', 'saboteurLab', 'bossDefense', 'pixelPainter', 'tetrisQuiz', 'osiPingPong'];

    foreach (['id', 'en'] as $locale) {
        $catalog = json_decode(
            file_get_contents(resource_path("js/locales/{$locale}-player.json")),
            true,
            flags: JSON_THROW_ON_ERROR,
        );
        $upcoming = $catalog['gameList']['upcoming'];

        expect($catalog['gameList'])->not->toHaveKey('nextRelease');

        expect($upcoming)->toHaveKeys(['title', 'intro', 'badge', 'conceptLabel', 'gameplayLabel', 'funLabel'])
            ->and(array_keys($upcoming['games']))->toBe($games);

        foreach ($upcoming['games'] as $game) {
            expect($game)->toHaveKeys(['title', 'inspiration', 'concept', 'gameplay', 'fun'])
                ->and($game['gameplay'])->toBeArray()->not->toBeEmpty();
        }
    }
});
