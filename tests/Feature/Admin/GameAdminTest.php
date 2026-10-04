<?php

use App\Models\GameHistory;
use App\Models\PlayerProfile;
use App\Models\Question;
use App\Models\User;
use Inertia\Testing\AssertableInertia as Assert;

const ADMIN_GAME_SECRET = 'admin-games-test-secret-with-32-chars!!';

beforeEach(function (): void {
    config(['scout.driver' => 'null', 'game-service.secret' => ADMIN_GAME_SECRET]);
    $this->withoutVite();
    $this->superadmin = User::factory()->create(['is_superadmin' => true]);
});

/**
 * @param  array<string, mixed>  $overrides
 */
function playedGame(User $user, array $overrides = []): GameHistory
{
    static $sequence = 0;
    $sequence++;

    return $user->gameHistories()->create([
        'game_key' => 'sky-quiz',
        'game_name' => 'Sky Quiz',
        'mission' => 'sky',
        'grade' => 5,
        'age' => 10,
        'school_name' => 'SDN 1 Bogor',
        'points' => 100,
        'correct' => 8,
        'wrong' => 2,
        'duration_seconds' => 120,
        'played_at' => now()->subHour(),
        'event_id' => 'sq-'.$user->id.'-sky-'.$sequence,
        ...$overrides,
    ]);
}

function signedBankRequest(mixed $test, ?string $secret = null, ?int $timestamp = null): \Illuminate\Testing\TestResponse
{
    $timestamp ??= now()->getTimestamp();

    return $test->withHeaders([
        'X-Game-Timestamp' => (string) $timestamp,
        'X-Game-Signature' => hash_hmac('sha256', $timestamp.'.', $secret ?? ADMIN_GAME_SECRET),
        'Accept' => 'application/json',
    ])->get('/api/internal/question-bank');
}

test('only super admins can open game statistics, leaderboard and questions', function (string $path): void {
    $admin = User::factory()->create();
    $admin->roles()->attach(\App\Models\Role::query()->firstOrCreate(['slug' => 'admin'], ['name' => 'Admin']));

    $this->get($path)->assertRedirect();
    $this->actingAs(User::factory()->create())->get($path)->assertForbidden();
    $this->actingAs($admin)->get($path)->assertForbidden();
    $this->actingAs($this->superadmin)->get($path)->assertOk();
})->with(['/admin/games', '/admin/games/sky-quiz', '/admin/leaderboard', '/admin/questions', '/admin/questions/create']);

test('game list shows plays, players and success rate per catalog game', function (): void {
    $alice = User::factory()->create();
    $bob = User::factory()->create();
    playedGame($alice, ['correct' => 9, 'wrong' => 1]);
    playedGame($alice, ['correct' => 5, 'wrong' => 5]);
    playedGame($bob, ['correct' => 8, 'wrong' => 2]);
    playedGame($bob, ['game_key' => 'flag-quest', 'mission' => 'lakeside', 'event_id' => 'fq-x-lakeside-1']);

    $this->actingAs($this->superadmin)->get('/admin/games')->assertInertia(fn (Assert $page) => $page
        ->component('admin/games/index')
        ->has('games', 3)
        ->where('games.2.key', 'sky-quiz')
        ->where('games.2.plays', 3)
        ->where('games.2.players', 2)
        ->where('games.2.success_rate', 66.7)
        ->where('games.2.accuracy', 73.3)
        ->where('games.0.key', 'flag-quest')
        ->where('games.0.plays', 1));
});

test('game detail breaks down by age, grade, level, school and players', function (): void {
    $young = User::factory()->create(['name' => 'Kecil']);
    PlayerProfile::factory()->for($young)->create(['grade' => 2]);
    $teen = User::factory()->create(['name' => 'Remaja']);
    PlayerProfile::factory()->for($teen)->create(['grade' => 8]);

    playedGame($young, ['age' => 7, 'grade' => 2, 'correct' => 10, 'wrong' => 0, 'school_name' => 'SDN 1 Bogor']);
    playedGame($teen, ['age' => 14, 'grade' => 8, 'correct' => 3, 'wrong' => 7, 'school_name' => 'SMPN 2 Bogor']);
    playedGame($teen, ['age' => 14, 'grade' => 8, 'correct' => 8, 'wrong' => 2, 'school_name' => 'SMPN 2 Bogor', 'played_at' => now()->subDays(40)]);

    $this->actingAs($this->superadmin)->get('/admin/games/sky-quiz')->assertInertia(fn (Assert $page) => $page
        ->component('admin/games/show')
        ->where('game.key', 'sky-quiz')
        ->where('stats.summary.plays', 3)
        ->where('stats.summary.players', 2)
        ->where('stats.summary.success_rate', 66.7)
        ->where('stats.byAge.1.label', '7–9')
        ->where('stats.byAge.1.plays', 1)
        ->where('stats.byAge.1.success_rate', 100)
        ->where('stats.byAge.3.label', '13–15')
        ->where('stats.byAge.3.plays', 2)
        ->where('stats.byLevel.0.label', 'sd')
        ->where('stats.byLevel.1.label', 'smp')
        ->where('stats.byLevel.1.plays', 2)
        ->has('stats.byGrade', 2)
        ->has('stats.bySchool', 2)
        ->has('stats.players', 2)
        ->where('stats.players.0.name', 'Remaja')
        ->has('stats.daily', 30)
        ->has('stats.outcomes', 4));

    $this->actingAs($this->superadmin)->get('/admin/games/sky-quiz?days=30')->assertInertia(fn (Assert $page) => $page
        ->where('days', 30)
        ->where('stats.summary.plays', 2));
});

test('unknown game returns not found', function (): void {
    $this->actingAs($this->superadmin)->get('/admin/games/chess')->assertNotFound();
});

test('leaderboard filters by game, level, grade, age and school', function (): void {
    $sd = User::factory()->create(['name' => 'Ani']);
    PlayerProfile::factory()->for($sd)->create(['grade' => 4, 'birth_date' => now()->subYears(10)->toDateString(), 'school_name' => 'SDN 1 Bogor']);
    $smp = User::factory()->create(['name' => 'Budi']);
    PlayerProfile::factory()->for($smp)->create(['grade' => 8, 'birth_date' => now()->subYears(14)->toDateString(), 'school_name' => 'SMPN 2 Bogor']);
    $disabled = User::factory()->create(['disabled_at' => now()]);

    playedGame($sd, ['points' => 120]);
    playedGame($smp, ['points' => 90, 'school_name' => 'SMPN 2 Bogor']);
    playedGame($smp, ['points' => 200, 'school_name' => 'SMPN 2 Bogor', 'game_key' => 'flag-quest', 'mission' => 'forest', 'event_id' => 'fq-b-forest-1']);
    playedGame($disabled, ['points' => 999]);

    $this->actingAs($this->superadmin)->get('/admin/leaderboard')->assertInertia(fn (Assert $page) => $page
        ->component('admin/leaderboard/index')
        ->has('entries', 2)
        ->where('entries.0.name', 'Budi')
        ->where('entries.0.points', 290)
        ->where('entries.1.name', 'Ani')
        ->has('schools', 2)
        ->where('schools.0.school', 'SMPN 2 Bogor')
        ->where('schools.1.points', 120));

    $this->actingAs($this->superadmin)->get('/admin/leaderboard?game=sky-quiz')->assertInertia(fn (Assert $page) => $page
        ->where('entries.0.name', 'Ani')->where('entries.0.points', 120));
    $this->actingAs($this->superadmin)->get('/admin/leaderboard?level=sd')->assertInertia(fn (Assert $page) => $page
        ->has('entries', 1)->where('entries.0.name', 'Ani'));
    $this->actingAs($this->superadmin)->get('/admin/leaderboard?grade=8')->assertInertia(fn (Assert $page) => $page
        ->has('entries', 1)->where('entries.0.name', 'Budi'));
    $this->actingAs($this->superadmin)->get('/admin/leaderboard?age=13%E2%80%9315')->assertInertia(fn (Assert $page) => $page
        ->has('entries', 1)->where('entries.0.age', 14));
    $this->actingAs($this->superadmin)->get('/admin/leaderboard?school=SMPN')->assertInertia(fn (Assert $page) => $page
        ->has('entries', 1)->where('entries.0.school_name', 'SMPN 2 Bogor'));
    $this->actingAs($this->superadmin)->get('/admin/leaderboard?game=chess&level=x&grade=99')->assertInertia(fn (Assert $page) => $page
        ->where('filters.game', null)->where('filters.level', null)->where('filters.grade', null)->has('entries', 2));
});

test('built-in question bank is seeded and served to the go service', function (): void {
    expect(Question::query()->count())->toBe(64);
    Question::factory()->inactive()->create(['key' => 'q-hidden']);

    $response = signedBankRequest($this)->assertOk();
    expect($response->json('questions'))->toHaveCount(64)
        ->and(collect($response->json('questions'))->pluck('key'))->not->toContain('q-hidden')
        ->and($response->json('questions.0'))->toMatchArray(['key' => 'mc-0-0', 'type' => 'choice', 'band' => 0, 'answer' => 0])
        ->and($response->json('questions.0.games'))->toBe(['flag-quest', 'sky-quiz'])
        ->and($response->json('version'))->toBeString();
});

test('question bank endpoint rejects unsigned, wrong or stale requests', function (): void {
    $this->getJson('/api/internal/question-bank')->assertForbidden();
    signedBankRequest($this, 'wrong-secret-wrong-secret-wrong-secret!!')->assertForbidden();
    signedBankRequest($this, null, now()->subHour()->getTimestamp())->assertForbidden();
});

test('bank version changes when a question is edited', function (): void {
    $before = signedBankRequest($this)->json('version');
    $this->travel(2)->seconds();
    Question::query()->where('key', 'mc-0-0')->first()->update(['prompt_id' => 'Soal baru?']);

    expect(signedBankRequest($this)->json('version'))->not->toBe($before);
});

test('super admin can create, edit, toggle and delete questions', function (): void {
    $this->actingAs($this->superadmin)->post('/admin/questions', [
        'type' => 'choice',
        'band' => 1,
        'subject' => 'science',
        'prompt_id' => 'Planet terbesar adalah…',
        'prompt_en' => 'The largest planet is…',
        'options' => [['id' => 'Jupiter', 'en' => 'Jupiter'], ['id' => 'Mars', 'en' => 'Mars'], ['id' => 'Bumi', 'en' => 'Earth'], ['id' => '', 'en' => '']],
        'answer' => 0,
        'games' => ['sky-quiz'],
        'is_active' => true,
    ])->assertRedirect(route('admin.questions.index', ['subject' => 'science']))->assertSessionHasNoErrors();

    $question = Question::query()->where('prompt_id', 'Planet terbesar adalah…')->sole();
    expect($question->options)->toHaveCount(3)->and($question->games)->toBe(['sky-quiz'])->and($question->key)->toStartWith('q-');

    $this->actingAs($this->superadmin)->get("/admin/questions/{$question->id}/edit")->assertInertia(fn (Assert $page) => $page
        ->component('admin/questions/form')->where('question.id', $question->id));

    $this->actingAs($this->superadmin)->put("/admin/questions/{$question->id}", [
        'type' => 'choice', 'band' => 2, 'subject' => 'science', 'prompt_id' => 'Planet terbesar di tata surya?',
        'options' => [['id' => 'Mars'], ['id' => 'Jupiter'], ['id' => 'Venus']], 'answer' => 1,
        'games' => ['flag-quest', 'sky-quiz'], 'is_active' => true,
    ])->assertSessionHasNoErrors();
    expect($question->fresh())->band->toBe(2)->answer->toBe(1)->games->toBe(['flag-quest', 'sky-quiz']);

    $this->actingAs($this->superadmin)->patch("/admin/questions/{$question->id}/toggle")->assertRedirect();
    expect($question->fresh()->is_active)->toBeFalse();

    $this->actingAs($this->superadmin)->delete("/admin/questions/{$question->id}")->assertRedirect(route('admin.questions.index', ['subject' => 'science']));
    $this->assertModelMissing($question);
});

test('question validation protects the game contract', function (array $payload, string $field): void {
    $base = ['type' => 'choice', 'band' => 1, 'subject' => 'science', 'prompt_id' => 'Soal valid?', 'options' => [['id' => 'A'], ['id' => 'B'], ['id' => 'C']], 'answer' => 0, 'games' => ['sky-quiz'], 'is_active' => true];

    $this->actingAs($this->superadmin)->post('/admin/questions', [...$base, ...$payload])->assertSessionHasErrors($field);
})->with([
    'two options' => [['options' => [['id' => 'A'], ['id' => 'B']]], 'options'],
    'answer out of range' => [['answer' => 5], 'answer'],
    'duplicate options' => [['options' => [['id' => 'A'], ['id' => 'a'], ['id' => 'C']]], 'options'],
    'unknown game' => [['games' => ['chess']], 'games.0'],
    'no game' => [['games' => []], 'games'],
    'true false in sky quiz' => [['type' => 'true_false', 'answer' => 1, 'games' => ['sky-quiz']], 'games'],
    'bad band' => [['band' => 9], 'band'],
    'bad subject' => [['subject' => 'magic'], 'subject'],
    'empty prompt' => [['prompt_id' => '  '], 'prompt_id'],
]);

test('question bank opens on a subject overview with per-grade counts', function (): void {
    $science = Question::query()->where('subject', 'science')->get();
    expect($science)->not->toBeEmpty();

    $this->actingAs($this->superadmin)->get('/admin/questions')->assertInertia(fn (Assert $page) => $page
        ->component('admin/questions/index')
        ->where('mode', 'subjects')
        ->where('questions', null)
        ->has('subjectStats', count(Question::SUBJECTS))
        ->where('subjectStats.1.subject', 'science')
        ->where('subjectStats.1.total', $science->count())
        ->where('subjectStats.1.bands.0', $science->where('band', 0)->count())
        ->where('subjectStats.1.bands.3', $science->where('band', 3)->count()));

    $this->actingAs($this->superadmin)->get('/admin/questions?subject=science')->assertInertia(fn (Assert $page) => $page
        ->where('mode', 'list')
        ->where('questions.total', $science->count())
        ->where('questions.data.0.subject', 'science')
        ->where('questions.data.0.band', 0));

    $this->actingAs($this->superadmin)->get('/admin/questions?subject=science&band=2')->assertInertia(fn (Assert $page) => $page
        ->where('questions.total', $science->where('band', 2)->count()));

    $this->actingAs($this->superadmin)->get('/admin/questions?subject=magic')->assertInertia(fn (Assert $page) => $page
        ->where('mode', 'subjects'));

    $this->actingAs($this->superadmin)->get('/admin/questions/create?subject=civics')->assertInertia(fn (Assert $page) => $page
        ->where('defaultSubject', 'civics'));
});

test('question list filters by game, band and status', function (): void {
    Question::factory()->inactive()->create(['band' => 3, 'games' => ['sky-quiz'], 'prompt_id' => 'Soal nonaktif unik']);

    $this->actingAs($this->superadmin)->get('/admin/questions?subject=all&status=inactive')->assertInertia(fn (Assert $page) => $page
        ->component('admin/questions/index')->where('questions.total', 1)->where('questions.data.0.prompt_id', 'Soal nonaktif unik'));
    $this->actingAs($this->superadmin)->get('/admin/questions?subject=all&game=sky-quiz&band=0')->assertInertia(fn (Assert $page) => $page
        ->where('questions.total', 10)->where('summary.total', 65)->where('summary.active', 64));
    $this->actingAs($this->superadmin)->get('/admin/questions?search=Soal%20nonaktif')->assertInertia(fn (Assert $page) => $page
        ->where('questions.total', 1));
});

test('game results store player snapshot and per-question outcomes', function (): void {
    $user = User::factory()->create();
    PlayerProfile::factory()->for($user)->create(['grade' => 5, 'birth_date' => now()->subYears(11)->toDateString(), 'school_name' => 'SDN 3 Bogor']);
    $payload = [
        'event_id' => 'sq-'.$user->id.'-sky-1790000000000', 'user_id' => $user->id, 'game_key' => 'sky-quiz', 'mission' => 'sky',
        'grade' => 5, 'points' => 110, 'correct' => 9, 'wrong' => 1, 'duration_seconds' => 140, 'completed_at' => now()->toIso8601String(),
        'answers' => [['key' => 'mc-1-0', 'correct' => true], ['key' => 'mc-1-1', 'correct' => false], ['key' => 'unknown-key', 'correct' => true]],
    ];
    $body = json_encode($payload);
    $timestamp = now()->getTimestamp();

    $this->call('POST', '/api/internal/game-results', [], [], [], [
        'CONTENT_TYPE' => 'application/json', 'HTTP_ACCEPT' => 'application/json',
        'HTTP_X_GAME_TIMESTAMP' => (string) $timestamp,
        'HTTP_X_GAME_SIGNATURE' => hash_hmac('sha256', $timestamp.'.'.$body, ADMIN_GAME_SECRET),
    ], $body)->assertCreated();

    $history = GameHistory::query()->sole();
    expect($history)->age->toBe(11)->grade->toBe(5)->school_name->toBe('SDN 3 Bogor')->correct->toBe(9)->wrong->toBe(1)->duration_seconds->toBe(140)->mission->toBe('sky');
    $this->assertDatabaseCount('question_answers', 2);
    expect(Question::query()->where('key', 'mc-1-0')->first())->times_answered->toBe(1)->times_correct->toBe(1)
        ->and(Question::query()->where('key', 'mc-1-1')->first())->times_answered->toBe(1)->times_correct->toBe(0);

    $this->actingAs($this->superadmin)->get('/admin/games/sky-quiz')->assertInertia(fn (Assert $page) => $page
        ->where('stats.questions.total_answers', 2)
        ->where('stats.questions.hardest.0.key', 'mc-1-1'));
});
