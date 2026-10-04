<?php

use App\Models\User;
use Inertia\Testing\AssertableInertia as Assert;

beforeEach(function (): void {
    $this->withoutVite();
});

it('shares the grouped game menu with every catalog game', function (): void {
    $this->get('/gamelist')->assertOk()->assertInertia(fn (Assert $page) => $page
        ->component('games/index')
        ->has('gameMenu', 5)
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
        ->where('gameMenu.3.key', 'puzzle')
        ->where('gameMenu.3.games.0.key', 'crossword')
        ->where('gameMenu.3.games.0.minGrade', 0)
        ->where('gameMenu.4.key', 'arcade')
        ->where('gameMenu.4.games.0.key', 'knowledge-train')
        ->where('gameMenu.4.games.0.awardsPoints', true)
        ->missing('gameMenu.0.games.0.recommended'));
});

it('shares the game menu on player pages too', function (): void {
    $player = User::factory()->withPlayerDetails()->create();

    $this->actingAs($player)->get('/portal')->assertOk()->assertInertia(fn (Assert $page) => $page
        ->has('gameMenu', 5)
        ->where('gameMenu.4.games.0.url', '/games/knowledge-train'));
});

it('links every game from the landing page menu', function (string $url): void {
    $landing = file_get_contents(public_path('new-landing/index.html'));

    expect($landing)->toContain('href="'.$url.'"');
})->with(['/games/flag-quest', '/games/sky-quiz', '/games/quiz-duel', '/games/knowledge-train', '/games/snakes-and-ladders']);
