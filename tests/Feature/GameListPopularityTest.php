<?php

use App\Models\GameAccess;
use App\Models\User;
use App\Services\PlayerPortal;
use Illuminate\Support\Facades\Cache;
use Inertia\Testing\AssertableInertia as Assert;

beforeEach(function (): void {
    $this->withoutVite();
    Cache::forget(PlayerPortal::POPULARITY_CACHE_KEY);
});

it('gives guests play counts and dense most played ranks per game', function (): void {
    GameAccess::factory()->count(4)->create(['game_key' => 'sky-quiz']);
    GameAccess::factory()->count(4)->create(['game_key' => 'snakes-and-ladders']);
    GameAccess::factory()->count(2)->create(['game_key' => 'crossword']);
    GameAccess::factory()->count(2)->create(['game_key' => 'mini-lab']);
    GameAccess::factory()->create(['game_key' => 'flag-quest']);
    GameAccess::factory()->count(9)->create(['game_key' => 'market-math', 'accessed_at' => now()->subDays(45)]);

    $this->assertGuest()->get('/gamelist')->assertOk()->assertInertia(fn (Assert $page) => $page
        ->component('games/index')
        ->where('popularityDays', PlayerPortal::POPULARITY_DAYS)
        ->where('popularity.sky-quiz', ['plays' => 4, 'popularRank' => 1])
        ->where('popularity.snakes-and-ladders', ['plays' => 4, 'popularRank' => 1])
        ->where('popularity.crossword', ['plays' => 2, 'popularRank' => 3])
        ->where('popularity.mini-lab', ['plays' => 2, 'popularRank' => 3])
        ->where('popularity.flag-quest', ['plays' => 1, 'popularRank' => null])
        ->where('popularity.market-math', ['plays' => 0, 'popularRank' => null])
        ->has('gameMenu', 6));
});

it('lists every catalog game with zero plays when nothing was played', function (): void {
    $this->get('/gamelist')->assertOk()->assertInertia(function (Assert $page): void {
        $popularity = collect($page->toArray()['props']['popularity']);
        $catalogKeys = collect(config('game-catalog.categories'))->flatMap(fn (array $category): array => array_column($category['games'], 'key'));

        expect($popularity->keys()->sort()->values()->all())->toBe($catalogKeys->sort()->values()->all())
            ->and($popularity->sum('plays'))->toBe(0)
            ->and($popularity->pluck('popularRank')->filter()->all())->toBe([]);
    });
});

it('shares only counts, never player data', function (): void {
    $player = User::factory()->create(['email' => 'secret-player@example.test', 'name' => 'Secret Player']);
    GameAccess::factory()->for($player)->count(3)->create(['game_key' => 'crossword']);

    $response = $this->get('/gamelist')->assertOk();

    expect($response->getContent())->not->toContain('secret-player@example.test')
        ->not->toContain('Secret Player');
    $response->assertInertia(fn (Assert $page) => $page
        ->where('popularity.crossword', ['plays' => 3, 'popularRank' => 1]));
});

it('caches the popularity for five minutes', function (): void {
    GameAccess::factory()->count(2)->create(['game_key' => 'crossword']);
    $this->get('/gamelist')->assertInertia(fn (Assert $page) => $page->where('popularity.crossword.plays', 2));

    GameAccess::factory()->count(5)->create(['game_key' => 'crossword']);
    $this->get('/gamelist')->assertInertia(fn (Assert $page) => $page->where('popularity.crossword.plays', 2));

    expect(Cache::has(PlayerPortal::POPULARITY_CACHE_KEY))->toBeTrue();

    $this->travel(PlayerPortal::POPULARITY_CACHE_SECONDS + 1)->seconds();
    $this->get('/gamelist')->assertInertia(fn (Assert $page) => $page->where('popularity.crossword.plays', 7));
});

it('works for signed-in players too', function (): void {
    $player = User::factory()->withPlayerDetails()->create();
    GameAccess::factory()->create(['game_key' => 'quiz-duel']);

    $this->actingAs($player)->get('/gamelist')->assertOk()->assertInertia(fn (Assert $page) => $page
        ->component('games/index')
        ->where('popularity.quiz-duel', ['plays' => 1, 'popularRank' => 1]));
});
