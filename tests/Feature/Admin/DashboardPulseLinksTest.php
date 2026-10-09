<?php

use App\Models\GameHistory;
use App\Models\User;
use Illuminate\Support\Carbon;
use Inertia\Testing\AssertableInertia as Assert;

beforeEach(function (): void {
    config(['scout.driver' => 'null']);
    $this->withoutVite();
    Carbon::setTestNow('2026-10-09 10:00:00');
    $this->admin = User::factory()->create(['is_superadmin' => true, 'created_at' => now()->subDays(10), 'last_seen_at' => now()->subHours(2)]);
});

afterEach(function (): void {
    Carbon::setTestNow();
});

it('lists only users who joined today when the dashboard new today card is opened', function (): void {
    $fresh = User::factory()->create(['name' => 'Fresh Rani', 'created_at' => now()->subHour()]);
    $yesterday = User::factory()->create(['name' => 'Old Budi', 'created_at' => now()->subDay()->endOfDay()->subMinute()]);

    $this->actingAs($this->admin)->get('/admin/users?activity=joined_today')->assertOk()->assertInertia(fn (Assert $page) => $page
        ->component('admin/users/index')
        ->where('filters.activity', 'joined_today')
        ->where('users.total', 1)
        ->where('users.data.0.id', $fresh->id));

    expect($yesterday->id)->not->toBe($fresh->id);
});

it('lists only users seen within the online window, most recent first, including the viewing admin', function (): void {
    $older = User::factory()->create(['created_at' => now()->subDays(5), 'last_seen_at' => now()->subMinutes(User::ONLINE_MINUTES - 1)]);
    $newest = User::factory()->create(['created_at' => now()->subDays(5), 'last_seen_at' => now()->subMinute()]);
    User::factory()->create(['created_at' => now()->subDays(5), 'last_seen_at' => now()->subMinutes(User::ONLINE_MINUTES + 1)]);
    User::factory()->create(['created_at' => now()->subDays(5), 'last_seen_at' => null]);

    $this->actingAs($this->admin)->get('/admin/users?activity=online&sort=last_seen_at&direction=desc')->assertOk()->assertInertia(fn (Assert $page) => $page
        ->where('filters.activity', 'online')
        ->where('users.total', 3)
        ->where('users.data.0.id', $this->admin->id)
        ->where('users.data.1.id', $newest->id)
        ->where('users.data.2.id', $older->id));
});

it('matches the dashboard online count with the online user list', function (): void {
    User::factory()->count(2)->create(['last_seen_at' => now()->subMinutes(3)]);
    User::factory()->create(['last_seen_at' => now()->subHour()]);

    $this->actingAs($this->admin)->get('/admin/dashboard')->assertInertia(fn (Assert $page) => $page->where('kpis.online_15m', 3));
    $this->get('/admin/users?activity=online')->assertInertia(fn (Assert $page) => $page->where('users.total', 3));
});

it('ignores an unknown activity filter', function (): void {
    User::factory()->count(2)->create(['created_at' => now()->subDays(3)]);

    $this->actingAs($this->admin)->get('/admin/users?activity=nope')->assertOk()->assertInertia(fn (Assert $page) => $page
        ->where('filters.activity', 'nope')
        ->where('users.total', 3));
});

it('shows only games played today when the dashboard plays today card is opened', function (): void {
    $player = User::factory()->create();
    GameHistory::factory()->for($player)->create(['game_key' => 'sky-quiz', 'duration_seconds' => 120, 'played_at' => now()->startOfDay()->addMinute()]);
    GameHistory::factory()->for($player)->create(['game_key' => 'crossword', 'duration_seconds' => 60, 'played_at' => now()->subHours(3)]);
    GameHistory::factory()->for($player)->create(['game_key' => 'crossword', 'duration_seconds' => 900, 'played_at' => now()->subDay()->endOfDay()]);

    $this->actingAs($this->admin)->get('/admin/dashboard')->assertInertia(fn (Assert $page) => $page->where('kpis.plays_today', 2));
    $this->get('/admin/playing-time?days=1')->assertOk()->assertInertia(fn (Assert $page) => $page
        ->where('filters.days', 1)
        ->where('report.summary.plays', 2)
        ->where('report.summary.seconds', 180)
        ->has('report.daily', 7));
});

it('keeps longer playing time ranges counting back full days', function (): void {
    $player = User::factory()->create();
    GameHistory::factory()->for($player)->create(['game_key' => 'sky-quiz', 'duration_seconds' => 60, 'played_at' => now()->subDays(7)->startOfDay()->addHour()]);
    GameHistory::factory()->for($player)->create(['game_key' => 'sky-quiz', 'duration_seconds' => 60, 'played_at' => now()->subDays(8)]);

    $this->actingAs($this->admin)->get('/admin/playing-time?days=7')->assertInertia(fn (Assert $page) => $page
        ->where('report.summary.plays', 1)
        ->has('report.daily', 7));
});

it('links the dashboard pulse cards to the matching lists', function (): void {
    $page = file_get_contents(resource_path('js/pages/admin/dashboard.tsx'));

    expect($page)
        ->toContain("'/admin/playing-time?days=1'")
        ->toContain('href="/admin/users?activity=joined_today"')
        ->toContain('href="/admin/users?activity=online&sort=last_seen_at&direction=desc"');
});
