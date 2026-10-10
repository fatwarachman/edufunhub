<?php

use App\Models\GameHistory;
use App\Models\User;
use App\Services\HotGames;
use Carbon\CarbonImmutable;
use Inertia\Testing\AssertableInertia as Assert;

beforeEach(function (): void {
    config(['scout.driver' => 'null', 'screen-time.timezone' => 'Asia/Jakarta']);
    $this->withoutVite();
    // 10 Oct 2026, 15:00 in Jakarta.
    $this->travelTo(CarbonImmutable::parse('2026-10-10 08:00:00', 'UTC'));
    $this->admin = User::factory()->superadmin()->create();
});

/** A play at a Jakarta local time. */
function hotPlay(User $user, string $game, string $local, array $extra = []): GameHistory
{
    return GameHistory::factory()->for($user)->create([
        'game_key' => $game,
        'played_at' => CarbonImmutable::parse($local, 'Asia/Jakarta')->utc(),
        ...$extra,
    ]);
}

it('ranks today\'s games by plays with player counts in the local day', function (): void {
    [$a, $b, $c] = User::factory()->count(3)->create();
    hotPlay($a, 'sky-quiz', '2026-10-10 07:00', ['correct' => 8, 'wrong' => 2, 'points' => 30]);
    hotPlay($a, 'sky-quiz', '2026-10-10 09:00', ['correct' => 6, 'wrong' => 4, 'points' => 20]);
    hotPlay($b, 'sky-quiz', '2026-10-10 10:00');
    hotPlay($b, 'quiz-duel', '2026-10-10 11:00');
    hotPlay($c, 'quiz-duel', '2026-10-10 12:00');
    hotPlay($c, 'crossword', '2026-10-10 00:30');
    // 23:30 local yesterday (16:30 UTC on the 9th) and 00:10 local tomorrow do not count today.
    hotPlay($a, 'crossword', '2026-10-09 23:30');
    hotPlay($a, 'crossword', '2026-10-09 22:00');

    $this->actingAs($this->admin)->get('/admin/hot-games')->assertOk()
        ->assertInertia(fn (Assert $page) => $page
            ->component('admin/hot-games/index')
            ->where('date', '2026-10-10')
            ->where('isToday', true)
            ->where('next', null)
            ->where('timezone', 'Asia/Jakarta')
            ->where('totals', ['plays' => 6, 'players' => 3, 'games' => 3])
            ->has('ranking', 3)
            ->where('ranking.0.game', 'sky-quiz')
            ->where('ranking.0.rank', 1)
            ->where('ranking.0.plays', 3)
            ->where('ranking.0.players', 2)
            ->where('ranking.0.accuracy', 70)
            ->where('ranking.1.game', 'quiz-duel')
            ->where('ranking.1.players', 2)
            ->where('ranking.2.game', 'crossword')
            ->where('history.0.date', '2026-10-09')
            ->where('history.0.plays', 2)
            ->where('history.0.top.0', ['game' => 'crossword', 'name' => 'Sky Quiz', 'in_catalog' => true, 'plays' => 2, 'players' => 1])
            ->has('history', HotGames::HISTORY_DAYS));
});

it('opens an earlier day and its neighbours', function (): void {
    hotPlay(User::factory()->create(), 'flag-quest', '2026-10-05 14:00');

    $this->actingAs($this->admin)->get('/admin/hot-games?date=2026-10-05')
        ->assertInertia(fn (Assert $page) => $page
            ->where('date', '2026-10-05')
            ->where('isToday', false)
            ->where('previous', '2026-10-04')
            ->where('next', '2026-10-06')
            ->where('ranking.0.game', 'flag-quest')
            ->where('history.0.date', '2026-10-04'));
});

it('falls back to today for future or malformed days', function (string $date): void {
    $this->actingAs($this->admin)->get('/admin/hot-games?date='.$date)
        ->assertOk()
        ->assertInertia(fn (Assert $page) => $page->where('date', '2026-10-10'));
})->with(['future' => '2026-10-11', 'malformed' => '10-10-2026', 'impossible' => '2026-02-31', 'too old' => '2020-01-01']);

it('shows one game on one day with players, hours and every play (ties go to more players)', function (): void {
    [$a, $b] = User::factory()->count(2)->create();
    $a->playerProfile()->create(['nickname' => 'Rani', 'grade' => 11, 'birth_date' => '2010-01-01', 'school_name' => 'SMK Bogor', 'color' => 'amber', 'accessory' => 'none']);
    hotPlay($a, 'sky-quiz', '2026-10-10 09:15', ['points' => 40, 'correct' => 9, 'wrong' => 1, 'duration_seconds' => 120]);
    hotPlay($a, 'sky-quiz', '2026-10-10 09:45', ['points' => 10, 'correct' => 1, 'wrong' => 9, 'duration_seconds' => 60]);
    hotPlay($b, 'sky-quiz', '2026-10-10 13:00', ['points' => 20]);
    hotPlay($b, 'quiz-duel', '2026-10-10 13:00');
    hotPlay($b, 'quiz-duel', '2026-10-10 13:30');
    hotPlay($b, 'quiz-duel', '2026-10-10 14:00');
    hotPlay($b, 'sky-quiz', '2026-10-09 09:00');

    $this->actingAs($this->admin)->get('/admin/hot-games/sky-quiz')->assertOk()
        ->assertInertia(fn (Assert $page) => $page
            ->component('admin/hot-games/show')
            ->where('game.key', 'sky-quiz')
            ->where('summary.rank', 1)
            ->where('summary.games_played', 2)
            ->where('summary.plays', 3)
            ->where('summary.players', 2)
            ->where('summary.points', 70)
            ->where('summary.peak_hour', 9)
            ->where('hourly.9', ['hour' => 9, 'plays' => 2, 'players' => 1])
            ->where('hourly.13.plays', 1)
            ->has('hourly', 24)
            ->where('players.0.user_id', $a->id)
            ->where('players.0.name', 'Rani')
            ->where('players.0.plays', 2)
            ->where('players.0.points', 50)
            ->where('players.0.accuracy', 50)
            ->where('schools.0', ['school' => 'SMK Bogor', 'plays' => 2, 'players' => 1])
            ->has('plays', 3)
            ->where('plays.0.user_id', $b->id));

    $this->actingAs($this->admin)->get('/admin/hot-games/sky-quiz?date=2026-10-09')
        ->assertInertia(fn (Assert $page) => $page->where('summary.plays', 1)->where('summary.rank', 1));
});

it('returns 404 for unknown games and is closed to everyone but super admins', function (): void {
    $this->get('/admin/hot-games')->assertRedirect();
    $this->actingAs(User::factory()->create())->get('/admin/hot-games')->assertForbidden();
    $this->actingAs($this->admin)->get('/admin/hot-games/not-a-game')->assertNotFound();
});

it('keeps plays of games removed from the catalog without a detail link', function (): void {
    hotPlay(User::factory()->create(), 'ping-pong-network', '2026-10-10 08:00', ['game_name' => 'Ping Pong Network']);
    hotPlay(User::factory()->create(), 'sky-quiz', '2026-10-09 08:00');

    $this->actingAs($this->admin)->get('/admin/hot-games')
        ->assertInertia(fn (Assert $page) => $page
            ->where('ranking.0.game', 'ping-pong-network')
            ->where('ranking.0.name', 'Ping Pong Network')
            ->where('ranking.0.in_catalog', false)
            ->where('history.0.top.0.in_catalog', true));

    $this->actingAs($this->admin)->get('/admin/hot-games/ping-pong-network')->assertNotFound();
});
