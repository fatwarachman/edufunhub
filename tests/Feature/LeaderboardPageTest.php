<?php

use App\Models\PlayerProfile;
use App\Models\PointLedger;
use App\Models\User;
use Carbon\CarbonInterface;
use Illuminate\Support\Facades\Cache;
use Inertia\Testing\AssertableInertia as Assert;

beforeEach(function (): void {
    config(['scout.driver' => 'null']);
    $this->withoutVite();
    Cache::flush();
});

function leaderboardPlayer(string $nickname, ?string $school = null, ?string $city = null, array $attributes = []): User
{
    $user = User::factory()->create($attributes);
    PlayerProfile::factory()->for($user)->create([
        'nickname' => $nickname,
        'school_name' => $school,
        'school_city' => $city,
        'birth_date' => '2014-01-01',
    ]);

    return $user;
}

function leaderboardPoints(User $user, int $points, string $reason, ?CarbonInterface $at = null): void
{
    $ledger = PointLedger::factory()->for($user)->create(['points' => $points, 'reason' => $reason]);

    if ($at !== null) {
        $ledger->forceFill(['created_at' => $at])->save();
    }
}

test('guests are redirected to login', function (): void {
    $this->get('/leaderboard')->assertRedirect(route('login'));
});

test('empty leaderboard page renders without data', function (): void {
    $viewer = leaderboardPlayer('Solo', 'SD Kosong', 'Bogor');

    $this->actingAs($viewer)->get('/leaderboard')->assertOk()->assertInertia(fn (Assert $page) => $page
        ->component('leaderboard/index', false)
        ->where('overall.week.entries', [])
        ->where('overall.month.me', null)
        ->where('overall.all.entries', [])
        ->has('games', 18)
        ->missing('schools')
        ->missing('gameBoards')
        ->loadDeferredProps('boards', fn (Assert $reload) => $reload
            ->where('schools.entries', [])
            ->where('schools.mine', null)
            ->where('schools.mySchool.name', 'SD Kosong')
            ->where('schools.mySchool.entries', [])
            ->where('gameBoards.0.key', 'flag-quest')
            ->where('gameBoards.0.entries', [])
            ->where('gameBoards.0.me', null)));
});

test('overall boards cover three periods and flag the viewer', function (): void {
    $viewer = leaderboardPlayer('Aku', 'SD Satu', 'Bogor');
    $rival = leaderboardPlayer('Rival', 'SD Dua', 'Depok');
    leaderboardPoints($viewer, 50, 'crossword:level-1');
    leaderboardPoints($rival, 300, 'flag-quest:lakeside', now()->subDays(20));
    leaderboardPoints($rival, 400, 'quiz-duel:duel', now()->subDays(60));

    $this->actingAs($viewer)->get('/leaderboard')->assertOk()->assertInertia(fn (Assert $page) => $page
        ->where('overall.week.entries.0.name', 'Aku')
        ->where('overall.week.entries.0.isMe', true)
        ->where('overall.week.me', ['rank' => 1, 'points' => 50])
        ->where('overall.month.entries.0.name', 'Rival')
        ->where('overall.month.me', ['rank' => 2, 'points' => 50])
        ->where('overall.all.entries.0.points', 700)
        ->where('overall.all.entries.1.isMe', true));
});

test('school board sums members, groups spellings and ranks players inside my school', function (): void {
    $viewer = leaderboardPlayer('Aku', 'SDN 1 Bogor', 'Kota Bogor');
    $classmate = leaderboardPlayer('Teman', ' sdn 1  BOGOR ', 'kota bogor');
    $other = leaderboardPlayer('Lain', 'SD Harapan', 'Depok');
    $sameNameOtherCity = leaderboardPlayer('Jauh', 'SDN 1 Bogor', 'Kab Bogor');
    $noSchool = leaderboardPlayer('Tanpa', null);
    $disabled = leaderboardPlayer('Mati', 'SDN 1 Bogor', 'Kota Bogor', ['disabled_at' => now()]);

    leaderboardPoints($viewer, 100, 'crossword:level-1');
    leaderboardPoints($viewer, -40, 'shop:wizard-hat');
    leaderboardPoints($classmate, 150, 'flag-quest:lakeside');
    leaderboardPoints($other, 200, 'sky-quiz:sky');
    leaderboardPoints($sameNameOtherCity, 30, 'sky-quiz:sky');
    leaderboardPoints($noSchool, 999, 'sky-quiz:sky');
    leaderboardPoints($disabled, 5000, 'sky-quiz:sky');

    $this->actingAs($viewer)->get('/leaderboard')->assertOk()->assertInertia(fn (Assert $page) => $page
        ->loadDeferredProps('boards', fn (Assert $reload) => $reload
            ->has('schools.entries', 3)
            ->where('schools.entries.0.name', 'SDN 1 Bogor')
            ->where('schools.entries.0.city', 'Kota Bogor')
            ->where('schools.entries.0.players', 2)
            ->where('schools.entries.0.points', 210)
            ->where('schools.entries.0.isMine', true)
            ->where('schools.entries.1.name', 'SD Harapan')
            ->where('schools.entries.1.isMine', false)
            ->where('schools.entries.2.city', 'Kab Bogor')
            ->where('schools.entries.2.points', 30)
            ->where('schools.mine.rank', 1)
            ->has('schools.mySchool.entries', 2)
            ->where('schools.mySchool.entries.0.name', 'Teman')
            ->where('schools.mySchool.entries.1.isMe', true)
            ->where('schools.mySchool.me', ['rank' => 2, 'points' => 60])));
});

test('per game board sums only that game and excludes shop and disabled players', function (): void {
    $viewer = leaderboardPlayer('Aku', 'SD Satu');
    $rival = leaderboardPlayer('Rival', 'SD Dua');
    $disabled = leaderboardPlayer('Mati', 'SD Dua', null, ['disabled_at' => now()]);

    leaderboardPoints($viewer, 40, 'crossword:level-1');
    leaderboardPoints($viewer, 60, 'crossword:level-2');
    leaderboardPoints($viewer, 500, 'flag-quest:lakeside');
    leaderboardPoints($viewer, -30, 'shop:wooden-sword');
    leaderboardPoints($rival, 80, 'crossword:level-3');
    leaderboardPoints($rival, 70, 'crosswordx:fake');
    leaderboardPoints($rival, 900, 'game_completed');
    leaderboardPoints($disabled, 9000, 'crossword:level-1');

    $response = $this->actingAs($viewer)->get('/leaderboard')->assertOk();

    $response->assertInertia(fn (Assert $page) => $page
        ->loadDeferredProps('boards', function (Assert $reload): void {
            $boards = collect($reload->toArray()['props']['gameBoards'])->keyBy('key');

            expect($boards->keys()->all())->not->toContain('shop')
                ->and($boards['crossword']['players'])->toBe(2)
                ->and($boards['crossword']['entries'][0])->toMatchArray(['name' => 'Aku', 'points' => 100, 'isMe' => true, 'rank' => 1])
                ->and($boards['crossword']['entries'][1])->toMatchArray(['name' => 'Rival', 'points' => 80, 'isMe' => false])
                ->and($boards['crossword']['me'])->toBe(['rank' => 1, 'points' => 100])
                ->and($boards['flag-quest']['entries'])->toHaveCount(1)
                ->and($boards['flag-quest']['entries'][0]['points'])->toBe(500)
                ->and($boards['quiz-duel']['entries'])->toBe([])
                ->and($boards['quiz-duel']['me'])->toBeNull()
                ->and($boards['crossword']['titleKey'])->toBe('player.crossword');
        }));
});

test('leaderboard props never expose e-mails', function (): void {
    $viewer = leaderboardPlayer('Aku', 'SD Satu', null, ['email' => 'viewer-secret@example.test']);
    $rival = leaderboardPlayer('Rival', 'SD Satu', null, ['email' => 'rival-secret@example.test']);
    leaderboardPoints($viewer, 10, 'crossword:level-1');
    leaderboardPoints($rival, 20, 'crossword:level-1');

    $this->actingAs($viewer)->get('/leaderboard')->assertOk()->assertInertia(function (Assert $page): void {
        $overall = json_encode($page->toArray()['props']['overall']);
        expect($overall)->toContain('Rival')->not->toContain('rival-secret@example.test')->not->toContain('viewer-secret@example.test');

        $page->loadDeferredProps('boards', function (Assert $reload): void {
            $boards = json_encode($reload->toArray()['props']);

            expect($boards)->toContain('Rival')
                ->and($boards)->not->toContain('rival-secret@example.test')
                ->and($boards)->not->toContain('viewer-secret@example.test')
                ->and($boards)->not->toContain('"email"');
        });
    });
});

test('dashboard still renders with its leaderboard', function (): void {
    $viewer = leaderboardPlayer('Aku', 'SD Satu');
    leaderboardPoints($viewer, 10, 'crossword:level-1');

    $this->actingAs($viewer)->get('/dashboard')->assertOk()->assertInertia(fn (Assert $page) => $page
        ->component('user/dashboard', false)
        ->loadDeferredProps('board', fn (Assert $reload) => $reload->where('leaderboards.all.me', ['rank' => 1, 'points' => 10])));
});

test('per game cards get icon, accent and translated titles in both locales', function (): void {
    $viewer = leaderboardPlayer('Aku', 'SD Satu');
    $catalogs = collect(['id', 'en'])->mapWithKeys(fn (string $locale): array => [
        $locale => json_decode((string) file_get_contents(resource_path("js/locales/{$locale}-player.json")), true),
    ]);

    $this->actingAs($viewer)->get('/leaderboard?tab=games')->assertOk()->assertInertia(function (Assert $page) use ($catalogs): void {
        $games = $page->toArray()['props']['games'];

        expect($games)->not->toBeEmpty();

        foreach ($games as $game) {
            expect($game)->toHaveKeys(['key', 'titleKey', 'icon', 'accent'])
                ->and($game['accent'])->toMatch('/^#[0-9a-fA-F]{6}$/');

            foreach ($catalogs as $catalog) {
                expect(data_get($catalog, $game['titleKey']))->toBeString()->not->toBeEmpty();
            }
        }
    });

    foreach ($catalogs as $catalog) {
        expect(data_get($catalog, 'leaderboardPage.games.viewRanking'))->toBeString()->not->toBeEmpty()
            ->and(data_get($catalog, 'leaderboardPage.games.playersLabel'))->toBeString()->not->toBeEmpty();
    }
});
