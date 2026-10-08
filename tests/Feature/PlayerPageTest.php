<?php

use App\Models\Friendship;
use App\Models\GameHistory;
use App\Models\PointLedger;
use App\Models\User;
use App\Models\UserBadge;
use Illuminate\Support\Arr;
use Illuminate\Support\Facades\Http;
use Inertia\Testing\AssertableInertia as Assert;

beforeEach(function (): void {
    config(['chat-service.secret' => 'player-page-test-chat-secret-32-chars!!', 'chat-service.publish_url' => 'http://chat.test/internal/publish']);
    Http::fake(['chat.test/*' => Http::response(['delivered' => 1])]);
    $this->withoutVite();
});

function pagePlayer(string $nickname, array $profile = []): User
{
    $user = User::factory()->create(['name' => $nickname.' Full', 'email' => strtolower($nickname).'@player-page.test', 'locale' => 'id']);
    $user->playerProfile()->create(['grade' => 5, 'nickname' => $nickname, 'birth_date' => now()->subYears(11)->subDays(2)->toDateString(), 'school_name' => 'SDN 1 Bogor', 'school_city' => 'Kota Bogor', ...$profile]);

    return $user->fresh();
}

function awardPoints(User $user, int $points): void
{
    PointLedger::factory()->for($user)->create(['points' => $points, 'reason' => 'sky-quiz:test']);
}

describe('player page', function (): void {
    it('shows public details, badges, top games and the friendship status', function (): void {
        [$viewer, $other] = [pagePlayer('Ana'), pagePlayer('Budi', ['grade' => 7])];
        awardPoints($other, 120);
        UserBadge::query()->create(['user_id' => $other->id, 'badge' => 'starter', 'earned_at' => now()]);
        GameHistory::factory()->count(2)->for($other)->create(['game_key' => 'sky-quiz', 'game_name' => 'Sky Quiz']);
        GameHistory::factory()->for($other)->create(['game_key' => 'crossword', 'game_name' => 'Crossword']);

        $this->actingAs($viewer)->get(route('players.show', $other))->assertOk()->assertInertia(fn (Assert $page) => $page
            ->component('players/show')
            ->where('player.id', $other->id)
            ->where('player.name', 'Budi')
            ->where('player.grade', 7)
            ->where('player.age', 11)
            ->where('player.school_name', 'SDN 1 Bogor')
            ->where('player.school_city', 'Kota Bogor')
            ->missing('player.email')
            ->missing('player.birth_date')
            ->where('stats.points', 120)
            ->where('stats.rank', 1)
            ->where('stats.games', 3)
            ->where('badges.0.key', 'starter')
            ->where('topGames.0.key', 'sky-quiz')
            ->where('topGames.0.plays', 2)
            ->where('topGames.1.key', 'crossword')
            ->where('isMe', false)
            ->where('relation', 'none')
            ->where('friendshipId', null));
    });

    it('reports every friendship state', function (string $state, string $expected): void {
        [$viewer, $other] = [pagePlayer('Ana'), pagePlayer('Budi')];
        match ($state) {
            'friends' => Friendship::query()->create(['requester_id' => $other->id, 'addressee_id' => $viewer->id, 'status' => Friendship::ACCEPTED]),
            'sent' => Friendship::query()->create(['requester_id' => $viewer->id, 'addressee_id' => $other->id, 'status' => Friendship::PENDING]),
            'received' => Friendship::query()->create(['requester_id' => $other->id, 'addressee_id' => $viewer->id, 'status' => Friendship::PENDING]),
        };

        $this->actingAs($viewer)->get(route('players.show', $other))->assertInertia(fn (Assert $page) => $page
            ->where('relation', $expected)
            ->where('friendshipId', Friendship::query()->value('id')));
    })->with([
        'friends' => ['friends', 'friends'],
        'sent' => ['sent', 'sent'],
        'received' => ['received', 'received'],
    ]);

    it('marks the viewer own page', function (): void {
        $viewer = pagePlayer('Ana');

        $this->actingAs($viewer)->get(route('players.show', $viewer))->assertInertia(fn (Assert $page) => $page
            ->where('isMe', true)
            ->where('relation', 'self'));
    });

    it('404s for unknown, disabled and profile-less accounts', function (): void {
        $viewer = pagePlayer('Ana');
        $disabled = pagePlayer('Budi');
        $disabled->forceFill(['disabled_at' => now()])->save();
        $noProfile = User::factory()->create();

        $this->actingAs($viewer)->get('/players/999999')->assertNotFound();
        $this->actingAs($viewer)->get(route('players.show', $disabled))->assertNotFound();
        $this->actingAs($viewer)->get(route('players.show', $noProfile))->assertNotFound();
        $this->actingAs($viewer)->get('/players/abc')->assertNotFound();
    });

    it('is for signed-in users only', function (): void {
        $this->get(route('players.show', pagePlayer('Budi')))->assertRedirect(route('login'));
    });

    it('lets the viewer send a friend request from the page', function (): void {
        [$viewer, $other] = [pagePlayer('Ana'), pagePlayer('Budi')];

        $this->actingAs($viewer)->from(route('players.show', $other))->post('/friends', ['user_id' => $other->id])
            ->assertRedirect(route('players.show', $other))
            ->assertSessionHasNoErrors();

        $this->actingAs($viewer)->get(route('players.show', $other))->assertInertia(fn (Assert $page) => $page->where('relation', 'sent'));
    });
});

describe('leaderboard relations', function (): void {
    it('adds the friendship relation to portal and dashboard leaderboard entries', function (): void {
        [$viewer, $friend, $stranger] = [pagePlayer('Ana'), pagePlayer('Budi'), pagePlayer('Cici')];
        awardPoints($viewer, 50);
        awardPoints($friend, 300);
        awardPoints($stranger, 200);
        Friendship::query()->create(['requester_id' => $viewer->id, 'addressee_id' => $friend->id, 'status' => Friendship::ACCEPTED]);

        $this->actingAs($viewer)->get(route('portal'))->assertInertia(fn (Assert $page) => $page
            ->where('leaderboards.all.entries.0.userId', $friend->id)
            ->where('leaderboards.all.entries.0.relation', 'friends')
            ->where('leaderboards.all.entries.1.userId', $stranger->id)
            ->where('leaderboards.all.entries.1.relation', 'none')
            ->where('leaderboards.all.entries.1.friendshipId', null)
            ->where('leaderboards.all.entries.2.isMe', true)
            ->where('leaderboards.week.entries.0.relation', 'friends'));

        $this->actingAs($viewer)->get(route('dashboard'))->assertInertia(fn (Assert $page) => $page
            ->loadDeferredProps('board', fn (Assert $reload) => $reload
                ->where('leaderboards.all.entries.0.relation', 'friends')
                ->where('leaderboards.all.entries.1.relation', 'none')));
    });
});

describe('dashboard settings', function (): void {
    it('keeps the dashboard settings read-only and edits on the profile page', function (): void {
        $source = file_get_contents(resource_path('js/pages/user/dashboard.tsx'));
        $profile = file_get_contents(resource_path('js/pages/user/profile.tsx'));

        expect($source)->not->toContain('<PlayerDetailsCard')
            ->not->toContain('<GradeCard')
            ->toContain('ProfileSummaryCard')
            ->toContain('href="/profile#player-details"')
            ->and($profile)->toContain('<PlayerDetailsCard')->toContain('<GradeCard');
    });

    it('has no links left to the old dashboard edit anchors', function (): void {
        $hits = collect(['pages/portal/index.tsx', 'pages/user/profile.tsx', 'pages/games/sky-quiz.tsx', 'pages/games/flag-quest.tsx'])
            ->filter(fn (string $file): bool => preg_match('~/dashboard#(grade|player-details)~', file_get_contents(resource_path('js/'.$file))) === 1);

        expect($hits->all())->toBe([]);
    });
});

describe('game menu', function (): void {
    it('keeps "all games" outside the scrolling list', function (): void {
        $menu = file_get_contents(resource_path('js/components/game-menu.tsx'));
        $all = strpos($menu, 'data-testid="game-menu-all"');
        $scroll = strpos($menu, 'className="edu-game-menu-scroll"');

        expect($all)->toBeInt()->and($scroll)->toBeInt()->and($all)->toBeLessThan($scroll)
            ->and(file_get_contents(resource_path('css/edu-nav.css')))->toContain('.edu-game-menu-scroll {');
    });
});

it('ships matching id and en keys for the new copy', function (): void {
    $id = json_decode(file_get_contents(resource_path('js/locales/id-player.json')), true);
    $en = json_decode(file_get_contents(resource_path('js/locales/en-player.json')), true);

    foreach (['playerMenu', 'playerPage'] as $group) {
        expect(array_keys(Arr::dot($id[$group])))->toBe(array_keys(Arr::dot($en[$group])));
    }
    expect($id['playerDash'])->toHaveKeys(['settingsReadOnly', 'settingsEdit'])
        ->and($en['playerDash'])->toHaveKeys(['settingsReadOnly', 'settingsEdit']);
});
