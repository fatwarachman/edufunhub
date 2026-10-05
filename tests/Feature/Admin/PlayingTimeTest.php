<?php

use App\Models\GameHistory;
use App\Models\PlayerProfile;
use App\Models\User;
use Inertia\Testing\AssertableInertia as Assert;

beforeEach(function (): void {
    config(['scout.driver' => 'null']);
    $this->withoutVite();
    $this->admin = User::factory()->create(['is_superadmin' => true]);
});

function playFor(User $user, string $game, ?int $seconds, int $daysAgo = 0): void
{
    GameHistory::factory()->for($user)->create([
        'game_key' => $game,
        'duration_seconds' => $seconds,
        'played_at' => now()->subDays($daysAgo),
    ]);
}

it('is only for super admins', function (): void {
    $this->actingAs(User::factory()->create())->get('/admin/playing-time')->assertForbidden();
    $this->actingAs($this->admin)->get('/admin/playing-time')->assertOk()->assertInertia(fn (Assert $page) => $page->component('admin/playing-time/index'));
});

it('ranks players by playing time with a per game breakdown', function (): void {
    $rani = User::factory()->create(['name' => 'Rani Account']);
    PlayerProfile::factory()->for($rani)->create(['nickname' => 'Rani', 'grade' => 5, 'school_name' => 'SD Satu']);
    $budi = User::factory()->create();
    PlayerProfile::factory()->for($budi)->create(['nickname' => 'Budi']);

    playFor($rani, 'crossword', 600);
    playFor($rani, 'crossword', 300);
    playFor($rani, 'sky-quiz', 300);
    playFor($rani, 'sky-quiz', null);
    playFor($budi, 'sky-quiz', 120);

    $this->actingAs($this->admin)->get('/admin/playing-time')->assertInertia(fn (Assert $page) => $page
        ->where('report.summary.seconds', 1320)
        ->where('report.summary.plays', 5)
        ->where('report.summary.timed_plays', 4)
        ->where('report.summary.untimed_plays', 1)
        ->where('report.summary.players', 2)
        ->where('report.summary.avg_session', 330)
        ->where('report.summary.avg_per_player', 660)
        ->where('report.games.0.key', 'crossword')
        ->where('report.games.0.seconds', 900)
        ->where('report.games.0.avg_session', 450)
        ->where('report.games.0.longest', 600)
        ->where('report.games.1.key', 'sky-quiz')
        ->where('report.games.1.seconds', 420)
        ->where('report.games.1.players', 2)
        ->has('report.players', 2)
        ->where('report.players.0.name', 'Rani')
        ->where('report.players.0.user_id', $rani->id)
        ->where('report.players.0.seconds', 1200)
        ->where('report.players.0.plays', 4)
        ->where('report.players.0.timed_plays', 3)
        ->where('report.players.0.avg_session', 400)
        ->where('report.players.0.top_game', 'crossword')
        ->where('report.players.0.games.0.key', 'crossword')
        ->where('report.players.0.games.0.seconds', 900)
        ->where('report.players.0.games.0.share', 75)
        ->where('report.players.0.games.1.share', 25)
        ->where('report.players.1.name', 'Budi')
        ->where('report.players.1.seconds', 120));
});

it('filters playing time by range, game and player search', function (): void {
    $rani = User::factory()->create();
    PlayerProfile::factory()->for($rani)->create(['nickname' => 'Rani']);
    $budi = User::factory()->create(['email' => 'budi@example.test']);
    PlayerProfile::factory()->for($budi)->create(['nickname' => 'Budi']);

    playFor($rani, 'crossword', 500, 40);
    playFor($rani, 'sky-quiz', 60, 1);
    playFor($budi, 'sky-quiz', 90, 2);

    $this->actingAs($this->admin)->get('/admin/playing-time?days=7')->assertInertia(fn (Assert $page) => $page
        ->where('filters.days', 7)
        ->where('report.summary.seconds', 150)
        ->has('report.daily', 7)
        ->has('report.games', 1));

    $this->get('/admin/playing-time?game=crossword')->assertInertia(fn (Assert $page) => $page
        ->where('filters.game', 'crossword')
        ->where('report.summary.seconds', 500)
        ->has('report.players', 1)
        ->where('report.players.0.user_id', $rani->id));

    $this->get('/admin/playing-time?search=budi@example')->assertInertia(fn (Assert $page) => $page
        ->has('report.players', 1)
        ->where('report.players.0.user_id', $budi->id)
        ->where('report.summary.seconds', 650));
});

it('ignores unknown filters', function (): void {
    $this->actingAs($this->admin)->get('/admin/playing-time?days=13&game=chess')->assertInertia(fn (Assert $page) => $page
        ->where('filters.days', 0)
        ->where('filters.game', null)
        ->has('report.daily', 30));
});

it('shows playing time per game on the user detail and game pages', function (): void {
    $player = User::factory()->withPlayerDetails()->create();
    playFor($player, 'crossword', 200);
    playFor($player, 'crossword', 100);

    $this->actingAs($this->admin)->get("/admin/users/{$player->id}")->assertInertia(fn (Assert $page) => $page
        ->where('perGame.0.key', 'crossword')
        ->where('perGame.0.play_seconds', 300)
        ->where('stats.play_seconds', 300));

    $this->get('/admin/games/crossword')->assertInertia(fn (Assert $page) => $page
        ->where('stats.summary.total_duration', 300)
        ->where('stats.summary.avg_duration', 150));
});
