<?php

use App\Models\GameHistory;
use App\Models\GameMatch;
use App\Models\Question;
use App\Models\QuestionAnswer;
use App\Models\User;
use Inertia\Testing\AssertableInertia as Assert;

function playWithAnswers(User $player): GameHistory
{
    $play = GameHistory::factory()->for($player)->create([
        'game_key' => 'sky-quiz',
        'mission' => 'sky',
        'grade' => 11,
        'points' => 45,
        'correct' => 2,
        'wrong' => 1,
        'duration_seconds' => 73,
        'played_at' => now()->subHour(),
    ]);

    $math = Question::factory()->create(['subject' => 'math', 'level' => 1, 'answer' => 0]);
    $science = Question::factory()->create(['subject' => 'science', 'level' => 3, 'answer' => 1]);
    $tf = Question::factory()->trueFalse()->create(['subject' => 'math', 'level' => 2]);

    foreach ([[$math, true, 0], [$science, false, 2], [$tf, true, null]] as [$question, $correct, $choice]) {
        QuestionAnswer::query()->create([
            'question_id' => $question->id,
            'game_history_id' => $play->id,
            'game_key' => 'sky-quiz',
            'correct' => $correct,
            'choice' => $choice,
        ]);
    }

    return $play;
}

it('shows the questions, subjects and statistics of one play', function () {
    $admin = User::factory()->create(['is_superadmin' => true]);
    $player = User::factory()->create();
    GameHistory::factory()->for($player)->create(['game_key' => 'sky-quiz', 'points' => 80, 'correct' => 4, 'wrong' => 0, 'played_at' => now()->subDays(2)]);
    $play = playWithAnswers($player);
    $later = GameHistory::factory()->for($player)->create(['game_key' => 'flag-quest', 'played_at' => now()]);

    $this->actingAs($admin)
        ->get("/admin/users/{$player->id}/plays/{$play->id}")
        ->assertOk()
        ->assertInertia(fn (Assert $page) => $page
            ->component('admin/users/play')
            ->where('user.id', $player->id)
            ->where('play.id', $play->id)
            ->where('play.points', 45)
            ->where('play.accuracy', 66.7)
            ->where('summary.recorded_questions', 3)
            ->where('summary.subjects', 2)
            ->where('summary.best_streak', 1)
            ->where('summary.passed', false)
            ->has('questions', 3)
            ->where('questions.0.subject', 'math')
            ->where('questions.0.correct', true)
            ->where('questions.1.choice', 2)
            ->where('questions.2.type', Question::TYPE_TRUE_FALSE)
            ->has('subjects', 2)
            ->where('subjects.0.subject', 'math')
            ->where('subjects.0.answered', 2)
            ->where('subjects.0.accuracy', 100)
            ->where('subjects.1.subject', 'science')
            ->where('subjects.1.wrong', 1)
            ->has('levels', 3)
            ->where('comparison.plays', 2)
            ->where('comparison.rank', 2)
            ->where('comparison.attempt', 2)
            ->where('comparison.best_points', 80)
            ->where('neighbours.next', $later->id)
            ->whereNot('neighbours.previous', null)
            ->where('match', null));
});

it('includes the match seats when the play belongs to a match', function () {
    $admin = User::factory()->create(['is_superadmin' => true]);
    $player = User::factory()->create(['name' => 'Rani']);
    $play = GameHistory::factory()->for($player)->create(['game_key' => 'quiz-duel']);
    $match = GameMatch::query()->create([
        'match_key' => 'qd-test-1', 'game_key' => 'quiz-duel', 'mode' => 'random', 'grade' => 5,
        'players_count' => 2, 'started_at' => now()->subMinutes(3), 'ended_at' => now(),
    ]);
    $match->players()->create(['user_id' => $player->id, 'game_history_id' => $play->id, 'seat' => 0, 'name' => 'Rani', 'grade' => 5, 'rank' => 1, 'score' => 30, 'correct' => 3, 'wrong' => 0]);
    $match->players()->create(['seat' => 1, 'name' => 'Bot', 'grade' => 5, 'is_bot' => true, 'rank' => 2, 'score' => 10, 'correct' => 1, 'wrong' => 2]);

    $this->actingAs($admin)
        ->get("/admin/users/{$player->id}/plays/{$play->id}")
        ->assertOk()
        ->assertInertia(fn (Assert $page) => $page
            ->where('match.id', $match->id)
            ->where('match.my_rank', 1)
            ->has('match.players', 2)
            ->has('questions', 0)
            ->has('subjects', 0));
});

it('returns 404 when the play belongs to another user', function () {
    $admin = User::factory()->create(['is_superadmin' => true]);
    $player = User::factory()->create();
    $other = GameHistory::factory()->create();

    $this->actingAs($admin)
        ->get("/admin/users/{$player->id}/plays/{$other->id}")
        ->assertNotFound();
});

it('keeps play details away from players', function () {
    $player = User::factory()->create();
    $play = GameHistory::factory()->for($player)->create();

    $this->actingAs($player)
        ->get("/admin/users/{$player->id}/plays/{$play->id}")
        ->assertForbidden();
});
