<?php

use App\Models\GameHistory;
use App\Models\GameMatch;
use App\Models\GameMatchPlayer;
use App\Models\User;
use App\Models\UserBadge;
use App\Notifications\PlayerNotification;
use App\Services\PlayerBadges;
use Illuminate\Support\Facades\Notification;
use Inertia\Testing\AssertableInertia;

/**
 * @param  array<string, mixed>  $attributes
 */
function playGames(User $user, int $count, array $attributes = []): void
{
    GameHistory::factory()->count($count)->create([
        'user_id' => $user->id,
        'correct' => 8,
        'wrong' => 2,
        'played_at' => now()->subHour(),
        ...$attributes,
    ]);
}

it('computes play metrics from finished games', function () {
    $user = User::factory()->withPlayerDetails()->create();
    playGames($user, 3, ['game_key' => 'sky-quiz']);
    playGames($user, 1, ['game_key' => 'quiz-duel', 'correct' => 3, 'wrong' => 7, 'played_at' => now()->subDays(1)]);
    playGames($user, 1, ['game_key' => 'crossword', 'correct' => null, 'wrong' => null, 'played_at' => now()->subDays(2)]);

    $stats = app(PlayerBadges::class)->stats($user);

    expect($stats)->toMatchArray([
        'plays' => 5,
        'completed' => 3,
        'success_rate' => 60,
        'games' => 3,
        'active_days' => 3,
        'wins' => 0,
        'streak' => 3,
    ]);
});

it('counts a won multiplayer match as a completed challenge and a win', function () {
    $user = User::factory()->withPlayerDetails()->create();
    $history = GameHistory::factory()->create(['user_id' => $user->id, 'correct' => 2, 'wrong' => 8]);
    $match = GameMatch::query()->create([
        'match_key' => 'qd-1', 'game_key' => 'quiz-duel', 'mode' => 'room', 'grade' => 4,
        'players_count' => 2, 'finished' => true, 'started_at' => now()->subMinutes(5), 'ended_at' => now(),
    ]);
    GameMatchPlayer::query()->create([
        'game_match_id' => $match->id, 'user_id' => $user->id, 'game_history_id' => $history->id,
        'seat' => 0, 'name' => 'A', 'grade' => 4, 'rank' => 1,
    ]);

    $stats = app(PlayerBadges::class)->stats($user);

    expect($stats['wins'])->toBe(1)->and($stats['completed'])->toBe(1);
});

it('awards a badge once with a notification when every rule is met', function () {
    Notification::fake();
    $user = User::factory()->withPlayerDetails()->create(['locale' => 'id']);
    playGames($user, 10);

    $earned = app(PlayerBadges::class)->evaluate($user);

    expect($earned)->toBe(['starter', 'cool'])
        ->and(UserBadge::query()->where('user_id', $user->id)->pluck('badge')->all())->toEqualCanonicalizing(['starter', 'cool'])
        ->and(app(PlayerBadges::class)->evaluate($user))->toBe([]);

    Notification::assertSentToTimes($user, PlayerNotification::class, 2);
});

it('does not award a badge when only part of its rules are met', function () {
    $user = User::factory()->withPlayerDetails()->create();
    playGames($user, 10, ['correct' => 1, 'wrong' => 9]);

    expect(app(PlayerBadges::class)->evaluate($user, false))->toBe(['starter']);
});

it('keeps an earned badge after the metric drops', function () {
    $user = User::factory()->withPlayerDetails()->create();
    UserBadge::factory()->create(['user_id' => $user->id, 'badge' => 'smart']);

    $summary = app(PlayerBadges::class)->summary($user);

    expect(collect($summary['badges'])->firstWhere('key', 'smart'))
        ->toMatchArray(['earned' => true, 'progress' => 100]);
});

it('awards badges when the game service reports a result', function () {
    $user = User::factory()->withPlayerDetails()->create();
    $body = json_encode([
        'event_id' => 'sq-'.$user->id.'-sky-1790000000000', 'user_id' => $user->id, 'game_key' => 'sky-quiz',
        'mission' => 'sky', 'grade' => 4, 'points' => 10, 'correct' => 8, 'wrong' => 2,
        'duration_seconds' => 60, 'completed_at' => now()->toIso8601String(),
    ]);
    $timestamp = (string) now()->timestamp;
    $signature = hash_hmac('sha256', $timestamp.'.'.$body, (string) config('game-service.secret'));

    $this->call('POST', '/api/internal/game-results', [], [], [], [
        'CONTENT_TYPE' => 'application/json',
        'HTTP_ACCEPT' => 'application/json',
        'HTTP_X_GAME_TIMESTAMP' => $timestamp,
        'HTTP_X_GAME_SIGNATURE' => $signature,
    ], $body)->assertCreated();

    expect(UserBadge::query()->where('user_id', $user->id)->pluck('badge')->all())->toBe(['starter']);
});

it('shows the badge collection on the player dashboard', function () {
    $user = User::factory()->withPlayerDetails()->create();
    playGames($user, 2);
    UserBadge::factory()->create(['user_id' => $user->id, 'badge' => 'starter']);

    $this->actingAs($user)
        ->get('/dashboard')
        ->assertInertia(fn (AssertableInertia $page) => $page
            ->where('badges.stats.plays', 2)
            ->has('badges.badges', count(config('badges.badges')))
            ->where('badges.badges.0.key', 'starter')
            ->where('badges.badges.0.earned', true)
            ->where('badges.badges.1.earned', false));
});

it('lists earned badges in the admin user list and detail', function () {
    $admin = User::factory()->create(['is_superadmin' => true]);
    $player = User::factory()->withPlayerDetails()->create();
    UserBadge::factory()->create(['user_id' => $player->id, 'badge' => 'starter']);
    UserBadge::factory()->create(['user_id' => $player->id, 'badge' => 'genius']);

    $this->actingAs($admin)
        ->get('/admin/users?search='.urlencode($player->email))
        ->assertInertia(fn (AssertableInertia $page) => $page
            ->where('users.data.0.badges.0.key', 'genius')
            ->where('users.data.0.badges.0.name', 'Genius')
            ->where('users.data.0.badges.1.key', 'starter'));

    $this->actingAs($admin)
        ->get('/admin/users/'.$player->id)
        ->assertInertia(fn (AssertableInertia $page) => $page
            ->where('badges.badges.0.name', 'Starter')
            ->where('badges.badges.0.earned', true));
});

it('backfills badges with the refresh command', function () {
    $user = User::factory()->withPlayerDetails()->create();
    playGames($user, 1);

    $this->artisan('badges:refresh')->expectsOutput('Awarded 1 badges.')->assertSuccessful();

    expect(UserBadge::query()->where('user_id', $user->id)->count())->toBe(1);
});
