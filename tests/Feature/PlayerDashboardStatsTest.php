<?php

use App\Models\GameHistory;
use App\Models\PlayerProfile;
use App\Models\PointLedger;
use App\Models\Question;
use App\Models\QuestionAnswer;
use App\Models\User;
use App\Models\UserAbilityAssessment;
use Illuminate\Support\Facades\Cache;
use Inertia\Testing\AssertableInertia as Assert;

beforeEach(function (): void {
    config(['scout.driver' => 'null']);
    $this->withoutVite();
    Cache::flush();
});

function schoolPlayer(string $school, ?string $city = null): User
{
    $user = User::factory()->create();
    PlayerProfile::factory()->for($user)->create(['school_name' => $school, 'school_city' => $city]);

    return $user;
}

describe('school suggestions', function (): void {
    test('groups spellings case and space insensitively with most common spelling and city', function (): void {
        schoolPlayer('SDN 1 Bogor', 'Kota Bogor');
        schoolPlayer('sdn 1  bogor', 'Kota Bogor');
        schoolPlayer('SDN 1 Bogor', 'kab bogor');
        schoolPlayer('SMPN 2 Bogor', null);
        schoolPlayer('SD Harapan', 'Depok');

        $response = $this->actingAs(User::factory()->create())
            ->getJson(route('player-details.schools', ['q' => '  Bogor ']))
            ->assertOk()
            ->assertJsonCount(2, 'schools');

        expect($response->json('schools.0'))->toBe(['name' => 'SDN 1 Bogor', 'city' => 'Kota Bogor', 'players' => 3])
            ->and($response->json('schools.1'))->toBe(['name' => 'SMPN 2 Bogor', 'city' => null, 'players' => 1]);
    });

    test('needs at least two characters and treats like wildcards literally', function (): void {
        schoolPlayer('SDN 1 Bogor', 'Kota Bogor');
        $user = User::factory()->create();

        $this->actingAs($user)->getJson(route('player-details.schools', ['q' => 'S']))->assertOk()->assertExactJson(['schools' => []]);
        $this->actingAs($user)->getJson(route('player-details.schools'))->assertOk()->assertExactJson(['schools' => []]);
        $this->actingAs($user)->getJson(route('player-details.schools', ['q' => '%%']))->assertOk()->assertExactJson(['schools' => []]);
        $this->actingAs($user)->getJson(route('player-details.schools', ['q' => str_repeat('a', 121)]))->assertUnprocessable();
    });

    test('returns at most fifteen schools and never user data', function (): void {
        foreach (range(1, 18) as $number) {
            schoolPlayer("SD Negeri {$number} Bekasi", 'Bekasi');
        }

        $response = $this->actingAs(User::factory()->create())
            ->getJson(route('player-details.schools', ['q' => 'negeri']))
            ->assertOk()
            ->assertJsonCount(15, 'schools');

        foreach ($response->json('schools') as $school) {
            expect(array_keys($school))->toBe(['name', 'city', 'players']);
        }
        expect($response->getContent())->not->toContain('@');
    });

    test('player route needs authentication and guests only see shared schools without counts', function (): void {
        schoolPlayer('SDN 9 Cimahi', 'Cimahi');
        schoolPlayer('SDN 9 Cimahi', 'Cimahi');
        schoolPlayer('SDN 9 Cimahi', 'Cimahi');
        schoolPlayer('SD Kecil Cimahi', 'Cimahi');

        $this->getJson(route('player-details.schools', ['q' => 'cimahi']))->assertUnauthorized();

        $this->getJson(route('register.schools', ['q' => 'cimahi']))
            ->assertOk()
            ->assertExactJson(['schools' => [['name' => 'SDN 9 Cimahi', 'city' => 'Cimahi']]]);
    });

    test('suggestion endpoint is throttled', function (): void {
        $user = User::factory()->create();
        foreach (range(1, 60) as $attempt) {
            $this->actingAs($user)->getJson(route('player-details.schools', ['q' => 'sd']))->assertOk();
        }
        $this->actingAs($user)->getJson(route('player-details.schools', ['q' => 'sd']))->assertTooManyRequests();
    });
});

describe('school city', function (): void {
    test('player details save squished school and city', function (): void {
        $user = User::factory()->create();

        $this->actingAs($user)->patch(route('player-details.update'), [
            'birth_date' => now()->subYears(11)->toDateString(),
            'school_name' => '  SDN   3 Bogor ',
            'school_city' => ' Kota   Bogor ',
        ])->assertSessionHasNoErrors();

        $profile = $user->playerProfile()->sole();
        expect($profile->school_name)->toBe('SDN 3 Bogor')->and($profile->school_city)->toBe('Kota Bogor');

        $this->actingAs($user)->get('/dashboard')->assertInertia(fn (Assert $page) => $page
            ->where('playerDetails.school_city', 'Kota Bogor'));
    });

    test('city stays optional but must be valid when given', function (): void {
        $user = User::factory()->create();
        $payload = ['birth_date' => now()->subYears(11)->toDateString(), 'school_name' => 'SDN 3 Bogor'];

        $this->actingAs($user)->patch(route('player-details.update'), [...$payload, 'school_city' => ''])->assertSessionHasNoErrors();
        expect($user->playerProfile()->sole()->school_city)->toBeNull();

        $this->actingAs($user)->patch(route('player-details.update'), [...$payload, 'school_city' => str_repeat('a', 101)])
            ->assertSessionHasErrors('school_city');
        $this->actingAs($user)->patch(route('player-details.update'), [...$payload, 'school_city' => 'ab'])
            ->assertSessionHasErrors('school_city');
    });

    test('registration stores the school city', function (): void {
        $this->post(route('register.store'), [
            'name' => 'Peserta Kota',
            'email' => 'kota@example.com',
            'birth_date' => now()->subYears(10)->toDateString(),
            'school_name' => 'SDN 1 Depok',
            'school_city' => 'Kota Depok',
            'password' => 'password',
            'password_confirmation' => 'password',
        ])->assertRedirect();

        expect(User::query()->where('email', 'kota@example.com')->sole()->playerProfile->school_city)->toBe('Kota Depok');
    });
});

describe('dashboard analytics', function (): void {
    test('leaderboards and stats are deferred and own stats come from own fixtures', function (): void {
        $user = User::factory()->withPlayerDetails()->create();
        $rival = User::factory()->withPlayerDetails()->create();
        PointLedger::factory()->for($user)->create(['points' => 40]);
        PointLedger::factory()->for($rival)->create(['points' => 90]);
        PointLedger::factory()->for($rival)->create(['points' => 500, 'created_at' => now()->subDays(40)]);

        $sky1 = GameHistory::factory()->for($user)->create([
            'game_key' => 'sky-quiz', 'game_name' => 'Sky Quiz', 'points' => 10,
            'correct' => 8, 'wrong' => 2, 'duration_seconds' => 120, 'played_at' => now()->subDays(2),
        ]);
        GameHistory::factory()->for($user)->create([
            'game_key' => 'sky-quiz', 'game_name' => 'Sky Quiz', 'points' => 30,
            'correct' => 4, 'wrong' => 6, 'duration_seconds' => 60, 'played_at' => now(),
        ]);
        GameHistory::factory()->for($user)->create([
            'game_key' => 'crossword', 'game_name' => 'Crossword', 'points' => 5,
            'correct' => null, 'wrong' => null, 'duration_seconds' => null, 'played_at' => now()->subDays(20),
        ]);
        GameHistory::factory()->for($rival)->create(['game_key' => 'sky-quiz', 'points' => 999, 'correct' => 0, 'wrong' => 50]);

        $math = Question::factory()->create(['subject' => 'math']);
        $science = Question::factory()->create(['subject' => 'science']);
        foreach ([true, true, true, false] as $correct) {
            QuestionAnswer::query()->create(['question_id' => $math->id, 'game_history_id' => $sky1->id, 'game_key' => 'sky-quiz', 'correct' => $correct]);
        }
        QuestionAnswer::query()->create(['question_id' => $science->id, 'game_history_id' => $sky1->id, 'game_key' => 'sky-quiz', 'correct' => false]);

        $this->actingAs($user)->get('/dashboard')->assertOk()->assertInertia(fn (Assert $page) => $page
            ->component('user/dashboard', false)
            ->where('rank', 2)
            ->where('playerDetails.school_city', null)
            ->missing('leaderboards')
            ->missing('stats')
            ->loadDeferredProps(fn (Assert $reload) => $reload
                ->has('leaderboards.week.entries', 2)
                ->has('leaderboards.month.entries', 2)
                ->has('leaderboards.all.entries', 2)
                ->where('leaderboards.week.entries.0.userId', $rival->id)
                ->where('leaderboards.week.entries.0.points', 90)
                ->where('leaderboards.all.entries.0.points', 590)
                ->where('leaderboards.week.entries.1.isMe', true)
                ->where('leaderboards.week.me', ['rank' => 2, 'points' => 40])
                ->where('stats.totals.plays', 3)
                ->where('stats.totals.points', 45)
                ->where('stats.totals.correct', 12)
                ->where('stats.totals.wrong', 8)
                ->where('stats.totals.accuracy', 60)
                ->where('stats.totals.seconds', 180)
                ->where('stats.totals.games', 2)
                ->where('stats.favouriteGame', 'sky-quiz')
                ->where('stats.games.0.key', 'sky-quiz')
                ->where('stats.games.0.plays', 2)
                ->where('stats.games.0.bestScore', 30)
                ->where('stats.games.0.accuracy', 60)
                ->where('stats.games.0.url', '/games/sky-quiz')
                ->where('stats.games.1.key', 'crossword')
                ->where('stats.games.1.accuracy', null)
                ->where('stats.subjects.0', ['subject' => 'math', 'answered' => 4, 'correct' => 3, 'accuracy' => 75])
                ->where('stats.subjects.1', ['subject' => 'science', 'answered' => 1, 'correct' => 0, 'accuracy' => 0])
                ->has('stats.activity', 14)
                ->where('stats.activity.13.plays', 1)
                ->where('stats.activity.13.points', 30)
                ->where('stats.activity.11.plays', 1)
                ->where('stats.activity.0.plays', 0)));
    });

    test('new player gets empty stats and boards', function (): void {
        $user = User::factory()->create();

        $this->actingAs($user)->get('/dashboard')->assertOk()->assertInertia(fn (Assert $page) => $page
            ->where('rank', null)
            ->loadDeferredProps(fn (Assert $reload) => $reload
                ->has('leaderboards.week.entries', 0)
                ->where('leaderboards.week.me', null)
                ->where('stats.totals.plays', 0)
                ->where('stats.totals.accuracy', null)
                ->where('stats.favouriteGame', null)
                ->has('stats.games', 0)
                ->has('stats.subjects', 0)
                ->has('stats.activity', 14)));
    });
});

describe('ability analysis on the player dashboard', function (): void {
    test('shows the latest finished analysis without admin-only data', function (): void {
        $player = User::factory()->create();
        PlayerProfile::factory()->for($player)->create();
        $admin = User::factory()->create(['is_superadmin' => true]);
        UserAbilityAssessment::factory()->for($player)->done(['summary' => 'Analisa lama yang sudah diganti.'])->create([
            'requested_by' => $admin->id, 'updated_at' => now()->subDays(3),
        ]);
        UserAbilityAssessment::factory()->for($player)->done(['summary' => 'Peserta unggul di matematika.'])->create([
            'requested_by' => $admin->id, 'model' => 'secret-model', 'input_snapshot' => ['player' => ['age' => 10]],
        ]);
        UserAbilityAssessment::factory()->for($player)->failed()->create(['updated_at' => now()->addMinute()]);

        $this->actingAs($player)->get(route('dashboard'))
            ->assertInertia(fn (Assert $page) => $page
                ->component('user/dashboard')
                ->missing('ability')
                ->loadDeferredProps('stats', fn (Assert $reload) => $reload
                    ->where('ability.summary', 'Peserta unggul di matematika.')
                    ->where('ability.strengths', ['Matematika dasar'])
                    ->where('ability.subject_scores', ['math' => 80, 'science' => 55])
                    ->where('ability.recommendations', ['Latih soal cerita 10 menit per hari.'])
                    ->has('ability.analyzed_at')
                    ->missing('ability.model')
                    ->missing('ability.input_snapshot')
                    ->missing('ability.requested_by')
                    ->missing('ability.game_insights')
                    ->missing('ability.confidence')
                )
            );
    });

    test('is null until an analysis has finished and never shows another player', function (): void {
        $player = User::factory()->create();
        PlayerProfile::factory()->for($player)->create();
        UserAbilityAssessment::factory()->for($player)->create();
        UserAbilityAssessment::factory()->done(['summary' => 'Milik pemain lain.'])->create();

        $this->actingAs($player)->get(route('dashboard'))
            ->assertInertia(fn (Assert $page) => $page
                ->loadDeferredProps('stats', fn (Assert $reload) => $reload->where('ability', null))
            );
    });
});
