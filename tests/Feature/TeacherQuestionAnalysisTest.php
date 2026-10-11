<?php

use App\Models\GameHistory;
use App\Models\PlayerProfile;
use App\Models\Question;
use App\Models\QuestionAnswer;
use App\Models\SubjectTopic;
use App\Models\User;
use App\Services\QuestionAnalytics;
use Inertia\Testing\AssertableInertia as Assert;

beforeEach(function (): void {
    config(['scout.driver' => 'null']);
    $this->withoutVite();
    $this->teacher = User::factory()->teacher()->create();
});

/**
 * Seed answers: [choice => count] spread over separate players (one answer each).
 *
 * @param  array<int, int>  $distribution
 * @return list<User>
 */
function analysisSeed(Question $question, array $distribution, ?array $players = null): array
{
    $players ??= [];
    $index = 0;
    foreach ($distribution as $choice => $count) {
        for ($i = 0; $i < $count; $i++) {
            $player = $players[$index] ?? User::factory()->create(['email' => "player{$index}-".uniqid().'@example.test']);
            $players[$index] = $player;
            $index++;
            $history = GameHistory::factory()->create(['user_id' => $player->id, 'grade' => 5, 'school_name' => 'SD Nusantara']);
            QuestionAnswer::query()->create([
                'question_id' => $question->id,
                'game_history_id' => $history->id,
                'game_key' => 'sky-quiz',
                'correct' => (int) $choice === (int) $question->answer,
                'choice' => (int) $choice,
            ]);
        }
    }
    $question->forceFill([
        'times_answered' => array_sum($distribution),
        'times_correct' => $distribution[(int) $question->answer] ?? 0,
    ])->save();

    return $players;
}

test('owner sees the analysis of their question without personal data', function (): void {
    $question = Question::factory()->byTeacher($this->teacher, [5])->create(['subject' => 'math', 'level' => 2, 'answer' => 0]);
    $players = analysisSeed($question, [0 => 6, 1 => 4]);
    PlayerProfile::query()->where('user_id', $players[0]->id)->delete();
    PlayerProfile::factory()->create(['user_id' => $players[0]->id, 'nickname' => 'Bintang']);

    $response = $this->actingAs($this->teacher)->get("/teacher/questions/{$question->id}")->assertOk();

    $response->assertInertia(fn (Assert $page) => $page
        ->component('teacher/show')
        ->where('question.id', $question->id)
        ->where('question.level', 2)
        ->where('stats.summary.answered', 10)
        ->where('stats.summary.success_rate', 60)
        ->where('stats.summary.difficulty', 'medium')
        ->where('stats.understanding.level', 'misconception')
        ->has('stats.choices', 4)
        ->has('stats.players', 10)
        ->has('stats.players.0', fn (Assert $player) => $player
            ->hasAll(['number', 'nickname', 'grade', 'school_name', 'attempts', 'correct', 'wrong', 'first_correct', 'last_correct', 'last_answered_at'])
            ->missing('user_id')
            ->missing('account_name')
            ->missing('email'))
        ->where('stats.players', fn ($rows): bool => collect($rows)->pluck('nickname')->contains('Bintang'))
        ->where('stats.recent', fn ($rows): bool => collect($rows)->every(fn ($row): bool => ! array_key_exists('user_id', (array) $row)))
        ->where('stats.bySchool.0.label', 'SD Nusantara')
        ->has('stats.comparison'));

    $json = json_encode($response->viewData('page')['props']);
    foreach ($players as $player) {
        expect($json)->not->toContain($player->email);
    }
});

test('other teachers and players cannot open the analysis', function (): void {
    $question = Question::factory()->byTeacher($this->teacher, [5])->create();

    $this->actingAs(User::factory()->teacher()->create())->get("/teacher/questions/{$question->id}")->assertForbidden();
    $this->actingAs(User::factory()->create())->get("/teacher/questions/{$question->id}")->assertForbidden();
    $this->actingAs($this->teacher)->get('/teacher/questions/'.Question::query()->where('source', 'system')->value('id'))->assertForbidden();
    $this->get("/teacher/questions/{$question->id}")->assertRedirect();
});

test('comparison block aggregates AI questions of the same subject, band and topic', function (): void {
    $topic = SubjectTopic::factory()->create(['subject_key' => 'math']);
    $question = Question::factory()->byTeacher($this->teacher, [5])->create(['subject' => 'math', 'level' => 2, 'topic_id' => $topic->id]);
    analysisSeed($question, [0 => 8, 1 => 2]);

    $ai = fn (array $attributes) => Question::factory()->create([
        'source' => Question::SOURCE_AI, 'subject' => 'math', 'band' => 1, 'topic_id' => $topic->id, ...$attributes,
    ]);
    $ai(['level' => 2, 'times_answered' => 10, 'times_correct' => 9]);
    $ai(['level' => 1, 'times_answered' => 10, 'times_correct' => 5]);
    $ai(['level' => 2, 'times_answered' => 10, 'times_correct' => 1]);
    $ai(['level' => 3, 'times_answered' => 0, 'times_correct' => 0]);
    $ai(['topic_id' => null, 'times_answered' => 50, 'times_correct' => 0]);
    Question::factory()->create(['source' => Question::SOURCE_AI, 'subject' => 'science', 'band' => 1, 'times_answered' => 40, 'times_correct' => 40]);
    Question::factory()->create(['source' => 'admin', 'subject' => 'math', 'band' => 1, 'topic_id' => $topic->id, 'times_answered' => 40, 'times_correct' => 40]);

    $this->actingAs($this->teacher)->get("/teacher/questions/{$question->id}")->assertInertia(fn (Assert $page) => $page
        ->where('stats.comparison.scope', ['subject' => 'math', 'band' => 1, 'topic_id' => $topic->id])
        ->where('stats.comparison.question.success_rate', 80)
        ->where('stats.comparison.question.difficulty', 'easy')
        ->where('stats.comparison.ai.questions', 4)
        ->where('stats.comparison.ai.rated_questions', 3)
        ->where('stats.comparison.ai.answered', 30)
        ->where('stats.comparison.ai.correct', 15)
        ->where('stats.comparison.ai.success_rate', 50)
        ->where('stats.comparison.ai.difficulty', ['easy' => 1, 'medium' => 1, 'hard' => 1])
        ->where('stats.comparison.ai.same_level.questions', 2)
        ->where('stats.comparison.ai.same_level.success_rate', 50)
        ->where('stats.comparison.delta', 30));
});

test('AI and teacher questions with identical answers get identical difficulty and understanding', function (): void {
    $teacherQuestion = Question::factory()->byTeacher($this->teacher, [5])->create(['subject' => 'math', 'level' => 3, 'answer' => 0]);
    $aiQuestion = Question::factory()->create(['source' => Question::SOURCE_AI, 'subject' => 'math', 'band' => 1, 'level' => 3, 'answer' => 0]);
    $players = analysisSeed($teacherQuestion, [0 => 5, 1 => 4, 2 => 3]);
    analysisSeed($aiQuestion, [0 => 5, 1 => 4, 2 => 3], $players);

    $analytics = app(QuestionAnalytics::class);
    $teacher = $analytics->detail($teacherQuestion->fresh(), forTeacher: true);
    $ai = $analytics->detail($aiQuestion->fresh());

    expect($teacher['summary']['difficulty'])->toBe($ai['summary']['difficulty'])->toBe('medium')
        ->and($teacher['summary']['success_rate'])->toBe($ai['summary']['success_rate'])
        ->and($teacher['understanding'])->toBe($ai['understanding'])
        ->and($teacher['choices'])->toBe($ai['choices'])
        ->and($teacherQuestion->fresh()->worth())->toBe($aiQuestion->fresh()->worth());
});

test('admin analysis output keeps account details and has no teacher comparison', function (): void {
    $question = Question::factory()->byTeacher($this->teacher, [5])->create();
    analysisSeed($question, [0 => 2]);

    $detail = app(QuestionAnalytics::class)->detail($question->fresh());

    expect($detail)->not->toHaveKey('comparison')
        ->and($detail['players'][0])->toHaveKeys(['user_id', 'account_name', 'name'])
        ->and($detail['recent'][0])->toHaveKey('user_id');
});
