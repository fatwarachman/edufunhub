<?php

use App\Services\PlayerPortal;
use Illuminate\Support\Facades\Cache;
use Inertia\Testing\AssertableInertia as Assert;

use function Pest\Laravel\travelTo;

beforeEach(function (): void {
    $this->withoutVite();
    Cache::forget(PlayerPortal::POPULARITY_CACHE_KEY);
});

/**
 * Replace the catalog with a small set of games and release dates.
 *
 * @param  array<string, string|null>  $released  Game key => released_at (Y-m-d) or null.
 */
function latestGamesCatalog(array $released): void
{
    $games = collect(config('game-catalog.categories'))
        ->flatMap(fn (array $category): array => $category['games'])
        ->keyBy('key');

    config(['game-catalog.categories' => [[
        'key' => 'quiz',
        'titleKey' => 'player.quiz',
        'games' => collect($released)->map(function (?string $date, string $key) use ($games): array {
            $game = $games[$key];
            unset($game['released_at']);

            return $date === null ? $game : [...$game, 'released_at' => $date];
        })->values()->all(),
    ]]]);
}

it('ships a release date for every catalog game', function (): void {
    $games = collect(config('game-catalog.categories'))->flatMap(fn (array $category): array => $category['games']);

    expect($games)->not->toBeEmpty();

    foreach ($games as $game) {
        expect($game)->toHaveKey('released_at')
            ->and($game['released_at'])->toMatch('/^\d{4}-\d{2}-\d{2}$/');
    }
});

it('lists games released in the last three days, newest first', function (): void {
    travelTo('2026-10-10 15:00:00');
    latestGamesCatalog([
        'sky-quiz' => '2026-10-01',
        'block-battle' => '2026-10-08',
        'ping-pong' => '2026-10-10',
        'monster-cafe' => '2026-10-09',
        'crossword' => '2026-10-07',
        'quiz-duel' => null,
    ]);

    $this->get('/gamelist')->assertOk()->assertInertia(fn (Assert $page) => $page
        ->component('games/index')
        ->where('newGameDays', PlayerPortal::NEW_GAME_DAYS)
        ->where('newGames', [
            ['key' => 'ping-pong', 'releasedAt' => '2026-10-10'],
            ['key' => 'monster-cafe', 'releasedAt' => '2026-10-09'],
            ['key' => 'block-battle', 'releasedAt' => '2026-10-08'],
        ]));
});

it('keeps catalog order for games released on the same day', function (): void {
    travelTo('2026-10-08 08:00:00');
    latestGamesCatalog([
        'block-battle' => '2026-10-08',
        'ping-pong' => '2026-10-08',
        'monster-cafe' => '2026-10-08',
    ]);

    expect(collect(app(PlayerPortal::class)->newGames())->pluck('key')->all())
        ->toBe(['block-battle', 'ping-pong', 'monster-cafe']);
});

it('drops a game once its three day window has passed', function (): void {
    latestGamesCatalog(['block-battle' => '2026-10-08']);

    travelTo('2026-10-10 23:59:59');
    expect(app(PlayerPortal::class)->newGames())->toHaveCount(1);

    travelTo('2026-10-11 00:00:00');
    expect(app(PlayerPortal::class)->newGames())->toBe([]);
});

it('ignores release dates in the future', function (): void {
    travelTo('2026-10-08 12:00:00');
    latestGamesCatalog(['block-battle' => '2026-10-09']);

    expect(app(PlayerPortal::class)->newGames())->toBe([]);
});

it('sends an empty list when nothing is new so the page hides the section', function (): void {
    travelTo('2026-12-01 12:00:00');
    latestGamesCatalog(['sky-quiz' => '2026-09-30', 'quiz-duel' => null]);

    $this->get('/gamelist')->assertOk()->assertInertia(fn (Assert $page) => $page
        ->where('newGames', []));
});

it('describes the latest games section in both locales', function (): void {
    foreach (['id', 'en'] as $locale) {
        $catalog = json_decode(
            file_get_contents(resource_path("js/locales/{$locale}-player.json")),
            true,
            flags: JSON_THROW_ON_ERROR,
        );

        expect($catalog['gameList']['latest'])->toHaveKeys(['title', 'intro_one', 'intro_other', 'badge', 'released'])
            ->and($catalog['gameList']['latest']['released'])->toContain('{{date}}')
            ->and($catalog['gameList']['latest']['intro_other'])->toContain('{{count}}');
    }
});

it('renders the latest section only when there are new games', function (): void {
    $page = file_get_contents(resource_path('js/pages/games/index.tsx'));

    expect($page)->toContain('data-testid="gamelist-latest"')
        ->and($page)->toContain("const showLatest = filter === 'all' && !searching && latest.length > 0;")
        ->and($page)->toContain('{showLatest && (');
});
