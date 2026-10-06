<?php

use App\Models\PlayerProfile;
use App\Models\ScreenTimeDaily;
use App\Models\ScreenTimeSession;
use App\Models\User;
use Illuminate\Support\Carbon;
use Inertia\Testing\AssertableInertia as Assert;

beforeEach(function (): void {
    config(['scout.driver' => 'null', 'screen-time.timezone' => 'Asia/Jakarta', 'screen-time.daily_limit_minutes' => 300]);
    $this->withoutVite();
    Carbon::setTestNow(Carbon::parse('2026-10-15 03:00:00', 'UTC'));
});

afterEach(function (): void {
    Carbon::setTestNow();
});

function beat(User $user, int $seconds, string $area = 'portal')
{
    return test()->actingAs($user)->postJson('/screen-time/beat', ['seconds_active' => $seconds, 'area' => $area]);
}

function screenDay(User $user, string $date, string $area, int $seconds): void
{
    ScreenTimeDaily::query()->create(['user_id' => $user->id, 'date' => $date, 'area' => $area, 'seconds' => $seconds]);
}

it('stores and increments the daily row per local date and area', function (): void {
    $user = User::factory()->create();

    beat($user, 30)->assertNoContent();
    beat($user, 25)->assertNoContent();
    beat($user, 40, 'game:sky-quiz')->assertNoContent();

    $rows = ScreenTimeDaily::query()->where('user_id', $user->id)->orderBy('area')->get();
    expect($rows)->toHaveCount(2)
        ->and($rows[0]->area)->toBe('game:sky-quiz')
        ->and($rows[0]->seconds)->toBe(40)
        ->and($rows[1]->area)->toBe('portal')
        ->and($rows[1]->seconds)->toBe(55)
        ->and($rows[1]->date)->toBe('2026-10-15');
});

it('uses the configured timezone for the day boundary', function (): void {
    Carbon::setTestNow(Carbon::parse('2026-10-15 18:30:00', 'UTC'));
    $user = User::factory()->create();

    beat($user, 10)->assertNoContent();

    expect(ScreenTimeDaily::query()->first()->date)->toBe('2026-10-16');
});

it('increments a row created through Eloquent instead of duplicating it', function (): void {
    $user = User::factory()->create();
    screenDay($user, '2026-10-15', 'portal', 100);

    beat($user, 20)->assertNoContent();

    expect(ScreenTimeDaily::query()->count())->toBe(1)
        ->and(ScreenTimeDaily::query()->value('seconds'))->toBe(120);
});

it('clamps the daily total to 24 hours', function (): void {
    $user = User::factory()->create();
    screenDay($user, '2026-10-15', 'portal', 86_380);

    beat($user, 60, 'chat')->assertNoContent();
    beat($user, 60, 'chat')->assertNoContent();

    expect((int) ScreenTimeDaily::query()->where('user_id', $user->id)->sum('seconds'))->toBe(86_400)
        ->and(ScreenTimeDaily::query()->where('area', 'chat')->value('seconds'))->toBe(20);
});

it('rejects bad input', function (array $payload): void {
    $user = User::factory()->create();

    $this->actingAs($user)->postJson('/screen-time/beat', $payload)->assertUnprocessable();
    expect(ScreenTimeDaily::query()->count())->toBe(0);
})->with([
    'zero seconds' => [['seconds_active' => 0, 'area' => 'portal']],
    'too many seconds' => [['seconds_active' => 61, 'area' => 'portal']],
    'not an integer' => [['seconds_active' => 'abc', 'area' => 'portal']],
    'uppercase area' => [['seconds_active' => 10, 'area' => 'Portal']],
    'area with slash' => [['seconds_active' => 10, 'area' => 'games/sky']],
    'area too long' => [['seconds_active' => 10, 'area' => str_repeat('a', 41)]],
    'missing area' => [['seconds_active' => 10]],
]);

it('rejects guests', function (): void {
    $this->postJson('/screen-time/beat', ['seconds_active' => 10, 'area' => 'portal'])->assertUnauthorized();
    expect(ScreenTimeDaily::query()->count())->toBe(0);
});

it('throttles beat floods', function (): void {
    $user = User::factory()->create();

    foreach (range(1, 10) as $ignored) {
        beat($user, 5)->assertNoContent();
    }
    beat($user, 5)->assertTooManyRequests();

    expect(ScreenTimeDaily::query()->value('seconds'))->toBe(50);
});

it('continues a session within the gap and starts a new one after it or on area change', function (): void {
    $user = User::factory()->create();

    beat($user, 30);
    Carbon::setTestNow(now()->addSeconds(30));
    beat($user, 30);
    Carbon::setTestNow(now()->addSeconds(30));
    beat($user, 30, 'game:crossword');
    Carbon::setTestNow(now()->addSeconds(30));
    beat($user, 30, 'game:crossword');
    Carbon::setTestNow(now()->addSeconds(200));
    beat($user, 20, 'game:crossword');

    $sessions = ScreenTimeSession::query()->where('user_id', $user->id)->orderBy('id')->get();
    expect($sessions)->toHaveCount(3)
        ->and($sessions[0]->area)->toBe('portal')
        ->and($sessions[0]->seconds)->toBe(60)
        ->and($sessions[1]->area)->toBe('game:crossword')
        ->and($sessions[1]->seconds)->toBe(60)
        ->and($sessions[2]->seconds)->toBe(20);
});

it('is only for super admins', function (): void {
    $this->get('/admin/screen-time')->assertRedirect();
    $this->actingAs(User::factory()->create())->get('/admin/screen-time')->assertForbidden();
    $this->actingAs(User::factory()->create(['is_superadmin' => true]))->get('/admin/screen-time')
        ->assertOk()
        ->assertInertia(fn (Assert $page) => $page
            ->component('admin/screen-time/index')
            ->where('limitMinutes', 300)
            ->missing('overview')
            ->missing('users'));
});

it('aggregates screen time and counts days over the 5 hour limit', function (): void {
    $admin = User::factory()->create(['is_superadmin' => true]);
    $heavy = User::factory()->create(['name' => 'Heavy Account']);
    PlayerProfile::factory()->for($heavy)->create(['nickname' => 'Heavy', 'grade' => 5, 'school_name' => 'SD Satu']);
    $light = User::factory()->create(['name' => 'Light']);

    screenDay($heavy, '2026-10-15', 'portal', 4 * 3600);
    screenDay($heavy, '2026-10-15', 'game:sky-quiz', 3600);
    screenDay($heavy, '2026-10-14', 'chat', 2 * 3600);
    screenDay($heavy, '2026-10-13', 'game:crossword', 6 * 3600);
    screenDay($light, '2026-10-15', 'portal', 1800);
    screenDay($light, '2026-10-01', 'portal', 9 * 3600);
    ScreenTimeSession::query()->create(['user_id' => $light->id, 'area' => 'portal', 'started_at' => '2026-10-15 02:00:00', 'ended_at' => '2026-10-15 02:30:00', 'seconds' => 1800]);

    $this->actingAs($admin)->get('/admin/screen-time?days=7')
        ->assertInertia(fn (Assert $page) => $page
            ->loadDeferredProps(['overview', 'users'], fn (Assert $reload) => $reload
                ->where('overview.summary.total_seconds', 13 * 3600 + 1800)
                ->where('overview.summary.active_users', 2)
                ->where('overview.summary.user_days', 4)
                ->where('overview.summary.avg_seconds_per_user_day', (int) round((13 * 3600 + 1800) / 4))
                ->where('overview.summary.over_users', 1)
                ->where('overview.summary.today_users', 2)
                ->where('overview.summary.today_over_users', 1)
                ->has('overview.daily', 7)
                ->where('overview.daily.6.date', '2026-10-15')
                ->where('overview.daily.6.over_users', 1)
                ->where('overview.daily.6.users', 2)
                ->where('overview.areas.0.area', 'game:crossword')
                ->where('overview.areas.0.category', 'games')
                ->where('overview.heatmap.0.weekday', 3)
                ->where('overview.heatmap.0.hour', 9)
                ->where('overview.heatmap.0.seconds', 1800)
                ->where('users.total', 2)
                ->where('users.data.0.user_id', $heavy->id)
                ->where('users.data.0.name', 'Heavy')
                ->where('users.data.0.grade', 5)
                ->where('users.data.0.school_name', 'SD Satu')
                ->where('users.data.0.avg_seconds', 13 * 3600 / 3)
                ->where('users.data.0.max_day_seconds', 6 * 3600)
                ->where('users.data.0.over_days', 2)
                ->where('users.data.1.over_days', 0)
                ->where('drilldown', null)));

    $this->actingAs($admin)->get('/admin/screen-time?days=30&sort=over&direction=asc&search=light')
        ->assertInertia(fn (Assert $page) => $page
            ->loadDeferredProps('users', fn (Assert $reload) => $reload
                ->where('users.total', 1)
                ->where('users.data.0.user_id', $light->id)
                ->where('users.data.0.over_days', 1)));
});

it('shows one user drill-down with daily bars and area split', function (): void {
    $admin = User::factory()->create(['is_superadmin' => true]);
    $user = User::factory()->create(['name' => 'Rani']);
    screenDay($user, '2026-10-15', 'portal', 3600);
    screenDay($user, '2026-10-15', 'game:sky-quiz', 5 * 3600);
    screenDay($user, '2026-10-12', 'chat', 600);

    $this->actingAs($admin)->get("/admin/screen-time?days=7&user={$user->id}")
        ->assertInertia(fn (Assert $page) => $page
            ->where('filters.user', $user->id)
            ->loadDeferredProps('users', fn (Assert $reload) => $reload
                ->where('drilldown.user.id', $user->id)
                ->where('drilldown.user.name', 'Rani')
                ->has('drilldown.daily', 7)
                ->where('drilldown.daily.6.seconds', 6 * 3600)
                ->where('drilldown.daily.6.portal', 3600)
                ->where('drilldown.daily.6.games', 5 * 3600)
                ->where('drilldown.daily.3.chat', 600)
                ->where('drilldown.summary.active_days', 2)
                ->where('drilldown.summary.over_days', 1)
                ->where('drilldown.summary.max_day_seconds', 6 * 3600)
                ->where('drilldown.areas.0.area', 'game:sky-quiz')
                ->has('drilldown.areas', 3)));

    $this->actingAs($admin)->get('/admin/screen-time?user=999999')
        ->assertInertia(fn (Assert $page) => $page
            ->loadDeferredProps('users', fn (Assert $reload) => $reload->where('drilldown', null)));
});
