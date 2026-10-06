<?php

use App\Models\GameHistory;
use App\Models\LoginActivity;
use App\Models\PlayerProfile;
use App\Models\Question;
use App\Models\Role;
use App\Models\User;
use App\Models\UserAbilityAssessment;
use Inertia\Testing\AssertableInertia as Assert;

beforeEach(function (): void {
    config(['scout.driver' => 'null']);
    $this->withoutVite();
    $this->superadmin = User::factory()->create(['is_superadmin' => true]);
});

/**
 * @param  array<string, mixed>  $profile
 */
function learner(array $profile): User
{
    $user = User::factory()->create();
    $user->playerProfile()->create([
        'grade' => $profile['grade'] ?? null,
        'birth_date' => array_key_exists('age', $profile) && $profile['age'] !== null ? now()->subYears($profile['age'])->subDays(10)->toDateString() : null,
        'school_name' => $profile['school'] ?? null,
    ]);

    return $user;
}

/**
 * @param  array<string, mixed>  $overrides
 */
function learnerPlay(User $user, array $overrides = []): GameHistory
{
    static $sequence = 0;
    $sequence++;

    $history = $user->gameHistories()->create([
        'game_key' => 'sky-quiz',
        'game_name' => 'Sky Quiz',
        'mission' => 'sky',
        'grade' => $user->playerProfile?->grade,
        'age' => $user->playerProfile?->age,
        'school_name' => $user->playerProfile?->school_name,
        'points' => 100,
        'correct' => 8,
        'wrong' => 2,
        'duration_seconds' => 90,
        'played_at' => now()->subHour(),
        'event_id' => 'us-'.$user->id.'-'.$sequence,
        ...$overrides,
    ]);
    $user->pointLedgers()->create(['points' => $history->points, 'reason' => "{$history->game_key}:test", 'event_id' => $history->event_id]);

    return $history;
}

test('user statistics are limited to super admins', function (): void {
    $admin = User::factory()->create();
    $admin->roles()->attach(Role::query()->firstOrCreate(['slug' => 'admin'], ['name' => 'Admin']));

    $this->get('/admin/user-statistics')->assertRedirect();
    $this->actingAs($admin)->get('/admin/user-statistics')->assertForbidden();
    $this->actingAs($this->superadmin)->get('/admin/user-statistics')->assertSuccessful();
});

test('user statistics group learners by school, grade and age', function (): void {
    $a = learner(['grade' => 5, 'age' => 10, 'school' => 'SDN 1 Bogor']);
    $b = learner(['grade' => 5, 'age' => 11, 'school' => '  sdn 1   bogor ']);
    $c = learner(['grade' => 8, 'age' => 13, 'school' => 'SMPN 2 Bogor']);
    learner(['grade' => null, 'age' => null, 'school' => null]);
    learnerPlay($a, ['correct' => 9, 'wrong' => 1, 'points' => 120]);
    learnerPlay($a, ['correct' => 5, 'wrong' => 5, 'points' => 60]);
    learnerPlay($c, ['correct' => 2, 'wrong' => 8, 'points' => 20]);

    $this->actingAs($this->superadmin)->get('/admin/user-statistics')->assertInertia(fn (Assert $page) => $page
        ->component('admin/user-statistics/index')
        ->where('stats.summary.users', 4)
        ->where('stats.summary.complete', 3)
        ->where('stats.summary.players', 2)
        ->where('stats.summary.schools', 2)
        ->where('stats.summary.plays', 3)
        ->where('stats.byLevel.0.label', 'sd')
        ->where('stats.byLevel.0.users', 2)
        ->where('stats.byLevel.1.users', 1)
        ->where('stats.byLevel.3.label', 'unknown')
        ->where('stats.byLevel.3.users', 1)
        ->where('stats.byGrade.4.label', '5')
        ->where('stats.byGrade.4.users', 2)
        ->where('stats.byGrade.4.players', 1)
        ->where('stats.byGrade.4.plays', 2)
        ->where('stats.byGrade.4.accuracy', 70)
        ->where('stats.bySchool.0.users', 2)
        ->where('stats.bySchool.0.grade_min', 5)
        ->where('stats.bySchool.0.levels.sd', 2)
        ->where('stats.matrix.rows.4.counts.2', 2)
        ->where('stats.matrix.rows.7.counts.3', 1));

    expect($b->fresh())->not->toBeNull();
});

test('user statistics filter by level and school and ignore bad input', function (): void {
    learner(['grade' => 5, 'age' => 10, 'school' => 'SDN 1 Bogor']);
    learner(['grade' => 8, 'age' => 13, 'school' => 'SMPN 2 Bogor']);
    learner(['grade' => 11, 'age' => 16, 'school' => 'SMAN 1 Depok']);

    $this->actingAs($this->superadmin)->get('/admin/user-statistics?level=smp')->assertInertia(fn (Assert $page) => $page
        ->where('stats.summary.users', 1)->where('filters.level', 'smp'));
    $this->actingAs($this->superadmin)->get('/admin/user-statistics?school=bogor')->assertInertia(fn (Assert $page) => $page
        ->where('stats.summary.users', 2));
    $this->actingAs($this->superadmin)->get('/admin/user-statistics?level=college&school=%25')->assertInertia(fn (Assert $page) => $page
        ->where('stats.summary.users', 0)->missing('filters.level'));
});

test('dashboard shows platform, game and demographic metrics', function (): void {
    $kid = learner(['grade' => 4, 'age' => 9, 'school' => 'SDN Polisi 1']);
    learnerPlay($kid, ['points' => 150]);
    learnerPlay($kid, ['points' => 50, 'played_at' => now()->subDays(10)]);

    $this->actingAs($this->superadmin)->get('/admin/dashboard')->assertInertia(fn (Assert $page) => $page
        ->component('admin/dashboard')
        ->where('kpis.plays', 2)
        ->where('kpis.plays_7d', 1)
        ->where('kpis.players', 1)
        ->where('kpis.points', 200)
        ->where('kpis.profiles', 1)
        ->where('kpis.profile_complete', 1)
        ->where('kpis.schools', 1)
        ->has('daily', 30)
        ->where('daily.29.plays', 1)
        ->where('levels.0.users', 1)
        ->where('grades.3.users', 1)
        ->missing('leaderboards')
        ->where('recentPlays.0.user_id', $kid->id)
        ->has('recentUsers')
        ->has('recentActivity')
        ->has('games')
        ->loadDeferredProps(fn (Assert $reload) => $reload
            ->where('leaderboards.all.players.0.user_id', $kid->id)
            ->where('leaderboards.all.schools.0.school', 'SDN Polisi 1')));
});

test('user detail shows profile, game history, logs and mastery', function (): void {
    $user = learner(['grade' => 6, 'age' => 11, 'school' => 'SDN 3 Bogor']);
    $other = learner(['grade' => 6, 'age' => 11, 'school' => 'SDN 3 Bogor']);
    learnerPlay($other, ['points' => 500]);
    $play = learnerPlay($user, ['correct' => 9, 'wrong' => 1, 'points' => 110]);
    learnerPlay($user, ['game_key' => 'flag-quest', 'game_name' => 'Flag Quest', 'mission' => 'forest', 'correct' => 3, 'wrong' => 7, 'points' => 30]);
    $question = Question::query()->where('subject', 'science')->firstOrFail();
    $play->questionAnswers()->create(['question_id' => $question->id, 'game_key' => 'sky-quiz', 'correct' => true]);
    LoginActivity::query()->create(['user_id' => $user->id, 'email' => $user->email, 'ip_address' => '10.0.0.5', 'user_agent' => 'Mozilla/5.0 Chrome/120', 'login_at' => now(), 'is_successful' => true]);
    activity()->causedBy($this->superadmin)->performedOn($user)->log('Updated user');

    $this->actingAs($this->superadmin)->get("/admin/users/{$user->id}")->assertInertia(fn (Assert $page) => $page
        ->component('admin/users/show')
        ->where('user.id', $user->id)
        ->where('user.player_profile.grade', 6)
        ->where('user.player_profile.school_name', 'SDN 3 Bogor')
        ->missing('user.password')
        ->where('stats.plays', 2)
        ->where('stats.points', 140)
        ->where('stats.accuracy', 60)
        ->where('stats.success_rate', 50)
        ->where('stats.rank', 2)
        ->where('stats.logins', 1)
        ->has('perGame', 2)
        ->where('subjects.0.subject', 'science')
        ->where('subjects.0.accuracy', 100)
        ->where('plays.total', 2)
        ->where('plays.data.0.game_key', 'flag-quest')
        ->where('logins.0.ip_address', '10.0.0.5')
        ->where('logins.0.device', fn (string $device): bool => str_contains($device, 'Chrome'))
        ->where('activityLog.0.description', 'Updated user')
        ->has('ledger', 2)
        ->has('trend', 2)
        ->has('impersonationLogs'));
});

test('user detail works for a user without profile or games', function (): void {
    $user = User::factory()->create();

    $this->actingAs($this->superadmin)->get("/admin/users/{$user->id}")->assertInertia(fn (Assert $page) => $page
        ->where('user.player_profile', null)
        ->where('stats.plays', 0)
        ->where('stats.rank', null)
        ->where('stats.accuracy', null)
        ->has('perGame', 0)
        ->where('plays.total', 0));
});

test('user detail sends every played game for the all games tab, most played first', function (): void {
    $user = learner(['grade' => 4]);
    foreach (['g-1', 'g-2', 'g-3', 'g-4', 'g-5', 'g-6', 'g-7'] as $index => $key) {
        foreach (range(0, $index) as $_) {
            learnerPlay($user, ['game_key' => $key, 'game_name' => $key]);
        }
    }

    $this->actingAs($this->superadmin)->get("/admin/users/{$user->id}?tab=perGame")->assertInertia(fn (Assert $page) => $page
        ->component('admin/users/show')
        ->has('perGame', 7)
        ->where('perGame.0.key', 'g-7')
        ->where('perGame.0.plays', 7)
        ->where('perGame.6.key', 'g-1')
        ->missing('abilityAssessments'));
});

test('profile age helper stays consistent with demographics', function (): void {
    $user = learner(['grade' => 3, 'age' => 8, 'school' => 'SDN 4']);

    expect(PlayerProfile::query()->where('user_id', $user->id)->first()->age)->toBe(8);
});

test('user list shows sign-up method and filters by it', function (): void {
    $google = User::factory()->create(['name' => 'Google Learner']);
    $google->connectedAccounts()->create(['provider' => 'google', 'provider_id' => 'g-123', 'email' => $google->email]);
    $direct = User::factory()->create(['name' => 'Direct Learner']);

    $this->actingAs($this->superadmin)->get('/admin/users?signup=google')->assertInertia(fn (Assert $page) => $page
        ->component('admin/users/index')
        ->where('users.total', 1)
        ->where('users.data.0.id', $google->id)
        ->where('users.data.0.signed_up_with_google', true)
        ->where('filters.signup', 'google'));

    $this->actingAs($this->superadmin)->get('/admin/users?signup=email&search=Direct')->assertInertia(fn (Assert $page) => $page
        ->where('users.total', 1)
        ->where('users.data.0.id', $direct->id)
        ->where('users.data.0.signed_up_with_google', false));
});

test('empty admin filters are serialised as an object, not an array', function (string $path): void {
    $response = $this->actingAs($this->superadmin)->get($path)->assertSuccessful();

    expect(json_encode($response->viewData('page')['props']['filters']))->toBe('{}');
})->with(['/admin/users', '/admin/questions', '/admin/user-statistics', '/admin/activity-log']);

test('admin user edit page provides roles and saves changes', function (): void {
    $role = Role::query()->firstOrCreate(['slug' => 'peserta'], ['name' => 'Peserta']);
    $user = User::factory()->create(['name' => 'Old Name']);
    $user->roles()->attach($role);

    $this->actingAs($this->superadmin)->get("/admin/users/{$user->id}/edit")->assertInertia(fn (Assert $page) => $page
        ->component('admin/users/edit')
        ->where('user.id', $user->id)
        ->missing('user.password')
        ->where('userRoles', [$role->id])
        ->has('roles'));

    $this->actingAs($this->superadmin)->put("/admin/users/{$user->id}", [
        'name' => 'New Name',
        'email' => $user->email,
        'roles' => [],
    ])->assertRedirect("/admin/users/{$user->id}")->assertSessionHasNoErrors();

    expect($user->fresh()->name)->toBe('New Name')->and($user->fresh()->roles)->toHaveCount(0);
});

test('question statistics show outcomes, games, players and author', function (): void {
    $question = Question::query()->where('key', 'mc-1-0')->firstOrFail();
    $question->update(['created_by' => $this->superadmin->id, 'source' => 'admin']);
    $alice = learner(['grade' => 5, 'age' => 10, 'school' => 'SDN 1 Bogor']);
    $bob = learner(['grade' => 6, 'age' => 11, 'school' => 'SDN 2 Bogor']);

    $answer = function (User $user, string $game, bool $correct): void {
        $play = learnerPlay($user, ['game_key' => $game, 'game_name' => $game]);
        $play->questionAnswers()->create(['question_id' => Question::query()->where('key', 'mc-1-0')->value('id'), 'game_key' => $game, 'correct' => $correct]);
    };
    $answer($alice, 'sky-quiz', false);
    $answer($alice, 'flag-quest', true);
    $answer($bob, 'sky-quiz', false);

    $this->actingAs($this->superadmin)->get("/admin/questions/{$question->id}")->assertInertia(fn (Assert $page) => $page
        ->component('admin/questions/show')
        ->where('question.id', $question->id)
        ->where('question.author.id', $this->superadmin->id)
        ->where('question.source', 'admin')
        ->where('stats.summary.answered', 3)
        ->where('stats.summary.correct', 1)
        ->where('stats.summary.wrong', 2)
        ->where('stats.summary.success_rate', 33.3)
        ->where('stats.summary.players', 2)
        ->where('stats.summary.first_try_rate', 0)
        ->where('stats.summary.mastered_players', 1)
        ->where('stats.summary.difficulty', 'hard')
        ->where('stats.byGame.0.label', 'flag-quest')
        ->where('stats.byGame.0.correct', 1)
        ->where('stats.byGame.1.label', 'sky-quiz')
        ->where('stats.byGame.1.wrong', 2)
        ->has('stats.byGrade', 2)
        ->has('stats.players', 2)
        ->where('stats.players', fn ($players): bool => collect($players)->firstWhere('user_id', $alice->id)['last_correct'] === true
            && collect($players)->firstWhere('user_id', $alice->id)['first_correct'] === false
            && collect($players)->firstWhere('user_id', $bob->id)['last_correct'] === false));
});

test('new questions record their author and built-in questions are marked as system', function (): void {
    $this->actingAs($this->superadmin)->post('/admin/questions', [
        'type' => 'true_false', 'band' => 0, 'subject' => 'civics', 'prompt_id' => 'Pancasila punya lima sila.',
        'answer' => 1, 'games' => ['flag-quest'], 'is_active' => true,
    ])->assertSessionHasNoErrors();

    $created = Question::query()->where('prompt_id', 'Pancasila punya lima sila.')->sole();
    expect($created->created_by)->toBe($this->superadmin->id)
        ->and($created->source)->toBe('admin')
        ->and(Question::query()->where('key', 'mc-0-0')->value('source'))->toBe('system');

    $this->actingAs($this->superadmin)->get("/admin/questions/{$created->id}")->assertInertia(fn (Assert $page) => $page
        ->where('stats.summary.answered', 0)->where('stats.summary.difficulty', null)->where('question.author.name', $this->superadmin->name));
});

test('question statistics are limited to super admins', function (): void {
    $question = Question::query()->firstOrFail();

    $this->actingAs(User::factory()->create())->get("/admin/questions/{$question->id}")->assertForbidden();
});

test('user detail flags whether a finished AI ability analysis exists', function (): void {
    $user = User::factory()->create();
    $flag = fn (): bool => $this->actingAs($this->superadmin)->get("/admin/users/{$user->id}")->inertiaProps('hasAbilityAssessment');

    expect($flag())->toBeFalse();

    UserAbilityAssessment::factory()->for($user)->create();
    UserAbilityAssessment::factory()->for($user)->failed()->create();
    UserAbilityAssessment::factory()->done()->create();
    expect($flag())->toBeFalse();

    UserAbilityAssessment::factory()->for($user)->done()->create();
    $this->actingAs($this->superadmin)->get("/admin/users/{$user->id}")->assertInertia(fn (Assert $page) => $page
        ->component('admin/users/show')
        ->where('hasAbilityAssessment', true)
        ->missing('abilityAssessments'));
});
