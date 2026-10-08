<?php

use App\Models\GameHistory;
use App\Models\PlayerProfile;
use App\Models\Question;
use App\Models\User;
use App\Services\UserActivity;
use Inertia\Testing\AssertableInertia as Assert;
use Spatie\Activitylog\Models\Activity;

const USER_ACTIVITY_SECRET = 'user-activity-test-secret-with-32-chars!!';

beforeEach(function (): void {
    config(['scout.driver' => 'null', 'game-service.secret' => USER_ACTIVITY_SECRET]);
    $this->withoutVite();
    $this->superadmin = User::factory()->create(['is_superadmin' => true]);
});

/**
 * @param  array<string, mixed>  $payload
 */
function postActivityResult(mixed $test, array $payload): void
{
    $body = json_encode($payload);
    $timestamp = now()->getTimestamp();

    $test->call('POST', '/api/internal/game-results', [], [], [], [
        'CONTENT_TYPE' => 'application/json',
        'HTTP_ACCEPT' => 'application/json',
        'HTTP_X_GAME_TIMESTAMP' => (string) $timestamp,
        'HTTP_X_GAME_SIGNATURE' => hash_hmac('sha256', $timestamp.'.'.$body, USER_ACTIVITY_SECRET),
    ], $body)->assertCreated();
}

it('logs a sign in and sign out once each', function (): void {
    $user = User::factory()->withoutTwoFactor()->create();

    $this->post(route('login.store'), ['email' => $user->email, 'password' => 'password']);
    $this->assertAuthenticatedAs($user);
    $this->post(route('logout'));

    expect(Activity::query()->where('log_name', UserActivity::LOG_NAME)->pluck('event')->all())->toBe(['login', 'logout'])
        ->and(Activity::query()->where('event', 'login')->first()->causer_id)->toBe($user->id)
        ->and(DB::table('login_activities')->where('user_id', $user->id)->count())->toBe(1);
});

it('logs opening a game page and finishing a game', function (): void {
    $user = User::factory()->create();
    PlayerProfile::factory()->for($user)->create(['grade' => 5]);

    $this->actingAs($user)->get('/games/snakes-and-ladders')->assertOk();
    $this->actingAs($user)->get('/games/snakes-and-ladders')->assertOk();

    postActivityResult($this, [
        'event_id' => 'sl-'.$user->id.'-room-1790000000000',
        'user_id' => $user->id,
        'game_key' => 'snakes-and-ladders',
        'mission' => 'room',
        'grade' => 5,
        'points' => 40,
        'correct' => 4,
        'wrong' => 1,
        'duration_seconds' => 120,
        'completed_at' => now()->toIso8601String(),
    ]);

    $opened = Activity::query()->where('event', UserActivity::GAME_OPENED)->get();
    $finished = Activity::query()->where('event', UserActivity::GAME_FINISHED)->sole();

    expect($opened)->toHaveCount(1)
        ->and($opened->first()->properties['game_key'])->toBe('snakes-and-ladders')
        ->and($finished->causer_id)->toBe($user->id)
        ->and($finished->subject_type)->toBe(GameHistory::class)
        ->and($finished->properties->only(['game_key', 'points', 'correct', 'wrong'])->all())
        ->toBe(['game_key' => 'snakes-and-ladders', 'points' => 40, 'correct' => 4, 'wrong' => 1])
        ->and(Activity::query()->where('event', UserActivity::BADGE_EARNED)->where('causer_id', $user->id)->exists())->toBeTrue();
});

it('does not log last seen heartbeats as user changes', function (): void {
    $user = User::factory()->create();
    $before = Activity::query()->count();

    $user->forceFill(['last_seen_at' => now()])->save();

    expect(Activity::query()->count())->toBe($before);
});

it('shows user activity with the real user and event on the admin log', function (): void {
    $player = User::factory()->create(['name' => 'Rani Pemain']);
    app(UserActivity::class)->gameOpened($player, 'sky-quiz', 'mobile');
    activity()->causedBy($this->superadmin)->performedOn($player)->log('Updated user');
    activity()->performedOn($player)->event('updated')->log('updated');

    $this->actingAs($this->superadmin)->get('/admin/activity-log')->assertOk()->assertInertia(fn (Assert $page) => $page
        ->component('admin/activity-log')
        ->where('scopes', ['users', 'admin', 'system'])
        ->where('logs.data.0.scope', 'system')
        ->where('logs.data.1.scope', 'admin')
        ->where('logs.data.2.causer.name', 'Rani Pemain')
        ->where('logs.data.2.event', 'game_opened')
        ->where('logs.data.2.scope', 'users')
        ->where('logs.data.2.properties.game_key', 'sky-quiz'));

    $this->actingAs($this->superadmin)->get('/admin/activity-log?scope=users')->assertInertia(fn (Assert $page) => $page
        ->has('logs.data', 1)->where('logs.data.0.causer.name', 'Rani Pemain'));
    $this->actingAs($this->superadmin)->get('/admin/activity-log?scope=system')->assertInertia(fn (Assert $page) => $page
        ->where('logs.data', fn ($rows): bool => collect($rows)->isNotEmpty() && collect($rows)->every(fn (array $row): bool => $row['causer'] === null && $row['scope'] === 'system')));
    $this->actingAs($this->superadmin)->get('/admin/activity-log?scope=admin')->assertInertia(fn (Assert $page) => $page
        ->has('logs.data', 1)->where('logs.data.0.description', 'Updated user'));
    $this->actingAs($this->superadmin)->get('/admin/activity-log?event=game_opened&user_id='.$player->id)->assertInertia(fn (Assert $page) => $page
        ->has('logs.data', 1));
});

it('lists the player activity on the admin user page', function (): void {
    $player = User::factory()->create();
    app(UserActivity::class)->badgeEarned($player, 'starter');

    $this->actingAs($this->superadmin)->get('/admin/users/'.$player->id)->assertOk()->assertInertia(fn (Assert $page) => $page
        ->where('activityLog.0.event', 'badge_earned')
        ->where('activityLog.0.by_self', true)
        ->where('activityLog.0.properties.badge', __('badges.starter.name')));
});

it('links every game question to the question bank', function (): void {
    $practice = json_decode((string) file_get_contents(database_path('data/snakes-practice-questions.json')), true)['questions'];

    expect(Question::query()->where('key', 'like', 'sl-%')->count())->toBe(count($practice))
        ->and(Question::query()->where('key', 'like', 'sl-%')->get()->every(fn (Question $q): bool => $q->games === ['snakes-and-ladders'] && $q->is_active))->toBeTrue()
        ->and(Question::query()->where('key', 'like', 'mc-%')->get()->every(fn (Question $q): bool => in_array('quiz-duel', $q->games, true) && in_array('snakes-and-ladders', $q->games, true)))->toBeTrue();

    $this->actingAs($this->superadmin)->get('/admin/questions?subject=all&game=snakes-and-ladders')->assertInertia(fn (Assert $page) => $page
        ->where('questions.total', Question::query()->whereJsonContains('games', 'snakes-and-ladders')->count()));
});

it('serves bank questions to snakes practice and follows admin changes', function (): void {
    $user = User::factory()->create();
    PlayerProfile::factory()->for($user)->create(['grade' => 5]);
    Question::query()->where('key', 'sl-01')->update(['is_active' => false]);

    $this->actingAs($user)->get('/games/snakes-and-ladders')->assertInertia(fn (Assert $page) => $page
        ->has('practiceQuestions')
        ->where('practiceQuestions', fn ($questions): bool => collect($questions)->pluck('key')->doesntContain('sl-01')
            && collect($questions)->pluck('key')->contains('sl-03')
            && collect($questions)->every(fn (array $q): bool => count($q['options']) >= 3 && $q['answer'] < count($q['options']))));
});

it('gives signed-in players practice questions for their grade and sends guests to login', function (): void {
    $user = User::factory()->create();
    PlayerProfile::factory()->for($user)->create(['grade' => 8]);
    $bandKeys = Question::query()->active()->where('band', 2)->whereJsonContains('games', 'snakes-and-ladders')->pluck('key');

    $this->actingAs($user)->get('/games/snakes-and-ladders')->assertInertia(fn (Assert $page) => $page
        ->where('practiceQuestions', fn ($questions): bool => collect($questions)->pluck('key')->sort()->values()->all() === $bandKeys->sort()->values()->all()));

    auth()->logout();
    $this->get('/games/snakes-and-ladders')->assertRedirect(route('login'));
});
