<?php

use App\Models\GameHistory;
use App\Models\PlayerProfile;
use App\Models\PointLedger;
use App\Models\Question;
use App\Models\QuestionAnswer;
use App\Models\User;
use App\Models\UserAbilityAssessment;
use App\Services\Ai\AdminAssistantData;
use Illuminate\Validation\ValidationException;
use Inertia\Testing\AssertableInertia as Assert;

beforeEach(function (): void {
    config(['scout.driver' => 'null']);
    $this->withoutVite();
    $this->admin = User::factory()->superadmin()->create();
});

function progressPlay(User $user, string $game, int $correct, int $wrong, int $points = 10, int $daysAgo = 0): GameHistory
{
    return GameHistory::factory()->for($user)->create([
        'game_key' => $game,
        'correct' => $correct,
        'wrong' => $wrong,
        'points' => $points,
        'duration_seconds' => 60,
        'played_at' => now()->subDays($daysAgo),
    ]);
}

it('is only for super admins', function (): void {
    $this->get('/admin/player-progress')->assertRedirect('/login');
    $this->actingAs(User::factory()->create())->get('/admin/player-progress')->assertForbidden();
    $this->actingAs($this->admin)->get('/admin/player-progress')->assertOk()
        ->assertInertia(fn (Assert $page) => $page->component('admin/player-progress/index'));
});

it('lists plays answers and AI analysis status per account', function (): void {
    $rani = User::factory()->create(['name' => 'Rani Account']);
    PlayerProfile::factory()->for($rani)->create(['nickname' => 'Rani', 'grade' => 5, 'school_name' => 'SD Satu']);
    progressPlay($rani, 'sky-quiz', 8, 2, 40, 1);
    progressPlay($rani, 'flag-quest', 3, 1, 20);
    PointLedger::factory()->create(['user_id' => $rani->id, 'points' => 60]);
    UserAbilityAssessment::factory()->done(['summary' => 'Rani kuat di matematika dasar.'])->create(['user_id' => $rani->id]);

    $budi = User::factory()->create(['name' => 'Budi Account']);
    progressPlay($budi, 'sky-quiz', 1, 4);
    UserAbilityAssessment::factory()->failed()->create(['user_id' => $budi->id]);

    $idle = User::factory()->create(['name' => 'Idle Account']);

    $this->actingAs($this->admin)->get('/admin/player-progress')->assertInertia(fn (Assert $page) => $page
        ->where('summary.accounts', 3)
        ->where('summary.played', 2)
        ->where('summary.never_played', 1)
        ->where('summary.analyzed', 1)
        ->where('summary.plays', 3)
        ->where('summary.answered', 19)
        ->where('summary.correct', 12)
        ->has('players.data', 3)
        ->where('players.data.0.id', $rani->id)
        ->where('players.data.0.nickname', 'Rani')
        ->where('players.data.0.plays', 2)
        ->where('players.data.0.games', 2)
        ->where('players.data.0.answered', 14)
        ->where('players.data.0.correct', 11)
        ->where('players.data.0.wrong', 3)
        ->where('players.data.0.accuracy', 78.6)
        ->where('players.data.0.game_points', 60)
        ->where('players.data.0.account_points', 60)
        ->where('players.data.0.ai.status', 'done')
        ->where('players.data.0.ai.summary', 'Rani kuat di matematika dasar.')
        ->where('players.data.1.id', $budi->id)
        ->where('players.data.1.ai.status', 'failed')
        ->where('players.data.2.id', $idle->id)
        ->where('players.data.2.plays', 0)
        ->where('players.data.2.accuracy', null)
        ->where('players.data.2.ai.status', 'none'));
});

it('filters by AI status, activity and search and sorts by answers', function (): void {
    $analyzed = User::factory()->create(['name' => 'Analyzed Kid']);
    progressPlay($analyzed, 'sky-quiz', 2, 0);
    UserAbilityAssessment::factory()->done()->create(['user_id' => $analyzed->id]);
    $busy = User::factory()->create(['name' => 'Busy Kid']);
    progressPlay($busy, 'sky-quiz', 20, 5);
    $idle = User::factory()->create(['name' => 'Idle Kid']);

    $ids = fn (string $query): array => collect($this->actingAs($this->admin)->get('/admin/player-progress'.$query)->viewData('page')['props']['players']['data'])->pluck('id')->all();

    expect($ids('?ai=analyzed'))->toBe([$analyzed->id])
        ->and($ids('?ai=not_analyzed&activity=played'))->toBe([$busy->id])
        ->and($ids('?activity=never_played'))->toBe([$idle->id])
        ->and($ids('?search=Busy'))->toBe([$busy->id])
        ->and($ids('?sort=answered&direction=desc'))->toBe([$busy->id, $analyzed->id, $idle->id]);
});

it('excludes super admins and rejects unknown filters', function (): void {
    progressPlay($this->admin, 'sky-quiz', 5, 0);
    $this->actingAs($this->admin)->get('/admin/player-progress')->assertInertia(fn (Assert $page) => $page->where('summary.accounts', 0)->has('players.data', 0));
    $this->actingAs($this->admin)->get('/admin/player-progress?sort=email')->assertSessionHasErrors('sort');
    $this->actingAs($this->admin)->get('/admin/player-progress?ai=maybe')->assertSessionHasErrors('ai');
});

it('gives the assistant the most wrongly answered questions with prompts and wrong options', function (): void {
    $player = User::factory()->create();
    $hard = Question::factory()->create(['prompt_id' => 'Alat untuk menggeser panah di layar?', 'options' => [['id' => 'Mouse', 'en' => 'Mouse'], ['id' => 'Printer', 'en' => 'Printer'], ['id' => 'Speaker', 'en' => 'Speaker']], 'answer' => 0]);
    $easy = Question::factory()->create(['prompt_id' => 'Satu tambah satu?']);
    $history = progressPlay($player, 'sky-quiz', 1, 3);
    foreach ([[false, 1], [false, 1], [false, 2], [true, 0]] as [$correct, $choice]) {
        QuestionAnswer::create(['question_id' => $hard->id, 'game_history_id' => $history->id, 'game_key' => 'sky-quiz', 'correct' => $correct, 'choice' => $choice]);
    }
    foreach ([true, true, true] as $correct) {
        QuestionAnswer::create(['question_id' => $easy->id, 'game_history_id' => $history->id, 'game_key' => 'sky-quiz', 'correct' => $correct, 'choice' => $easy->answer]);
    }

    $result = (new AdminAssistantData($this->admin))->query(['operation' => 'question_difficulty']);

    expect($result['range']['scope'])->toBe('all_time')
        ->and($result['source']['url'])->toBe('/admin/questions')
        ->and($result['data']['totals'])->toMatchArray(['answered' => 7, 'correct' => 4, 'wrong' => 3, 'distinct_questions' => 2])
        ->and($result['data']['most_wrong'][0])->toMatchArray([
            'question_id' => $hard->id,
            'prompt' => 'Alat untuk menggeser panah di layar?',
            'correct_answer' => 'Mouse',
            'answered' => 4,
            'wrong' => 3,
            'success_rate' => 25.0,
            'most_chosen_wrong_option' => ['text' => 'Printer', 'picks' => 2],
        ])
        ->and($result['data']['highest_success_rate'][0]['question_id'])->toBe($easy->id);
});

it('ranks the assistant score leaderboard by game score and covers new operations', function (): void {
    $top = User::factory()->create(['name' => 'Top Scorer']);
    progressPlay($top, 'sky-quiz', 9, 1, 300);
    $low = User::factory()->create(['name' => 'Low Scorer']);
    progressPlay($low, 'sky-quiz', 1, 1, 50);
    PointLedger::factory()->create(['user_id' => $low->id, 'points' => 999]);

    $data = new AdminAssistantData($this->admin);
    $scores = $data->query(['operation' => 'score_leaderboard'])['data']['players'];
    expect($scores[0]['player']['name'])->toBe('Top Scorer')
        ->and($scores[0]['total_score'])->toBe(300)
        ->and($scores[0]['accuracy'])->toBe(90.0);
    expect($data->query(['operation' => 'leaderboard'])['data']['players'][0]['player']['name'])->toBe('Low Scorer');

    $overview = $data->query(['operation' => 'overview'])['data'];
    expect($overview['accounts']['total'])->toBe(2)
        ->and($overview['activity_in_range']['plays'])->toBe(2)
        ->and($overview['activity_in_range']['answered'])->toBe(12);

    $progress = $data->query(['operation' => 'player_progress', 'search' => 'Top'])['data'];
    expect($progress['most_active'][0]['name'])->toBe('Top Scorer')
        ->and($progress['most_active'][0]['answered'])->toBe(10);

    expect($data->query(['operation' => 'ai_analyses'])['data']['played_but_not_analyzed'])->toHaveCount(2);
    expect($data->query(['operation' => 'game_ranking'])['data']['games'][0])->toMatchArray(['game_key' => 'sky-quiz', 'plays' => 2, 'players' => 2]);
    foreach (['subjects', 'classrooms', 'teachers', 'changelog'] as $operation) {
        expect($data->query(['operation' => $operation]))->toHaveKeys(['data', 'range', 'queried_at', 'source']);
    }
    expect(json_encode($progress))->not->toContain('email', 'birth_date');
});

it('rejects filters that an operation does not accept', function (array $input): void {
    (new AdminAssistantData($this->admin))->query($input);
})->with([
    [['operation' => 'teachers', 'search' => 'x1']],
    [['operation' => 'overview', 'user_id' => 1]],
    [['operation' => 'subjects', 'subject' => 'not-a-subject']],
    [['operation' => 'score_leaderboard', 'subject' => 'math']],
])->throws(ValidationException::class);
