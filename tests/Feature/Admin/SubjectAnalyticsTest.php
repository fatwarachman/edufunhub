<?php

use App\Models\GameHistory;
use App\Models\Question;
use App\Models\QuestionAnswer;
use App\Models\Role;
use App\Models\Subject;
use App\Models\User;
use App\Services\SubjectAnalytics;
use Inertia\Testing\AssertableInertia as Assert;

beforeEach(function (): void {
    config(['scout.driver' => 'null']);
    $this->withoutVite();
    $this->subject = Subject::factory()->create();
    $this->admin = User::factory()->superadmin()->create();
});

function subjectAnalysisAnswers(Question $question, ?int $grade, int $correct, int $wrong, ?User $player = null, string $game = 'sky-quiz'): void
{
    $history = GameHistory::factory()->create([
        'user_id' => ($player ?? User::factory()->create())->id,
        'grade' => $grade,
        'correct' => 999,
        'wrong' => 999,
    ]);
    for ($i = 0; $i < $correct + $wrong; $i++) {
        QuestionAnswer::query()->create([
            'question_id' => $question->id,
            'game_history_id' => $history->id,
            'game_key' => $game,
            'correct' => $i < $correct,
        ]);
    }
}

test('subject analysis requires authentication', function (): void {
    $this->get(route('admin.subject-analysis.index'))->assertRedirect(route('login'));
    $this->get(route('admin.subject-analysis.show', $this->subject))->assertRedirect(route('login'));
});

test('subject analysis rejects players teachers and ordinary admins', function (): void {
    $admin = User::factory()->create();
    $role = Role::query()->firstOrCreate(['slug' => 'admin'], ['name' => 'Admin']);
    $admin->roles()->attach($role);
    foreach ([User::factory()->create(), User::factory()->teacher()->create(), $admin] as $user) {
        $this->actingAs($user)->get(route('admin.subject-analysis.index'))->assertForbidden();
        $this->get(route('admin.subject-analysis.show', $this->subject))->assertForbidden();
    }
});

test('index includes all subjects including inactive empty subjects', function (): void {
    $this->subject->update(['is_active' => false, 'name_en' => null]);
    $this->actingAs($this->admin)->get(route('admin.subject-analysis.index'))->assertOk()
        ->assertInertia(fn (Assert $page) => $page
            ->component('admin/subject-analysis/index', false)
            ->has('subjects', Subject::query()->count())
            ->has('totalsBySubject')
            ->where('subjects', fn ($rows): bool => collect($rows)->contains(fn ($row): bool => $row['id'] === $this->subject->id
                && $row['key'] === $this->subject->key
                && $row['name_id'] === $this->subject->name_id
                && $row['name_en'] === null
                && $row['detail_url'] === route('admin.subject-analysis.show', $this->subject)
                && $row['questions'] === 0 && $row['answered'] === 0 && $row['correct'] === 0
                && $row['wrong'] === 0 && $row['players'] === 0 && $row['success_rate'] === null)));
});

test('empty detail returns nullable accuracy and empty rankings', function (): void {
    $this->actingAs($this->admin)->get(route('admin.subject-analysis.show', $this->subject))->assertOk()
        ->assertInertia(fn (Assert $page) => $page->component('admin/subject-analysis/show', false)
            ->where('indexUrl', route('admin.subject-analysis.index'))
            ->where('subject.id', $this->subject->id)
            ->where('subject.detail_url', route('admin.subject-analysis.show', $this->subject))
            ->where('analysis.summary', ['questions' => 0, 'answered' => 0, 'correct' => 0, 'wrong' => 0, 'players' => 0, 'success_rate' => null])
            ->where('analysis.byGrade', [])->where('analysis.byLevel', [])->where('analysis.byGame', [])
            ->where('analysis.weakestQuestions', [])->where('analysis.topGrades', [])->where('analysis.minAnswers', 10));
    $this->get('/admin/subject-analysis/999999999')->assertNotFound();
    $this->get('/admin/subject-analysis/not-an-id')->assertNotFound();
});

test('SQL aggregates recorded answers only with subject isolation and distinct players', function (): void {
    $question = Question::factory()->create(['subject' => $this->subject->key, 'level' => 2, 'times_answered' => 1000, 'times_correct' => 1000]);
    Question::factory()->create(['subject' => $this->subject->key]);
    $other = Question::factory()->create(['subject' => Subject::factory()->create()->key]);
    $player = User::factory()->create();
    subjectAnalysisAnswers($question, 4, 1, 1, $player);
    subjectAnalysisAnswers($question, null, 0, 1, $player, 'duel');
    subjectAnalysisAnswers($other, 12, 20, 0);
    $detail = app(SubjectAnalytics::class)->detail($this->subject);
    expect($detail['summary'])->toBe(['questions' => 2, 'answered' => 3, 'correct' => 1, 'wrong' => 2, 'players' => 1, 'success_rate' => 33.3])
        ->and($detail['byGrade'])->toHaveCount(2)
        ->and(collect($detail['byGrade'])->firstWhere('label', '4')['answered'])->toBe(2)
        ->and(collect($detail['byGrade'])->firstWhere('label', null)['answered'])->toBe(1)
        ->and($detail['byLevel'][0]['label'])->toBe('2')
        ->and($detail['byGame'])->toHaveCount(2)
        ->and($detail['topGrades'])->toBe([])
        ->and($detail['weakestQuestions'])->toHaveCount(1)
        ->and($detail['weakestQuestions'][0])->toBe(['id' => $question->id, 'prompt' => $question->prompt_id, 'prompt_en' => $question->prompt_en, 'answered' => 3, 'correct' => 1, 'success_rate' => 33.3]);
    $rows = app(SubjectAnalytics::class)->index();
    $row = collect($rows['subjects'])->firstWhere('id', $this->subject->id);
    foreach ($detail['summary'] as $key => $value) {
        expect($row[$key])->toBe($value);
    }
});

test('best grades use snapshot rates with minimum sample and retain all exact ties', function (): void {
    $question = Question::factory()->create(['subject' => $this->subject->key, 'grades' => [12]]);
    subjectAnalysisAnswers($question, 1, 9, 0);
    subjectAnalysisAnswers($question, 2, 8, 2);
    subjectAnalysisAnswers($question, 3, 16, 4);
    subjectAnalysisAnswers($question, 4, 7, 3);
    subjectAnalysisAnswers($question, null, 10, 0);
    $this->actingAs($this->admin)->get(route('admin.subject-analysis.show', $this->subject))->assertOk()
        ->assertInertia(fn (Assert $page) => $page->component('admin/subject-analysis/show', false)
            ->has('analysis.topGrades', 2)
            ->where('analysis.topGrades.0.label', '2')->where('analysis.topGrades.1.label', '3')
            ->where('analysis.topGrades.0.success_rate', 80)->where('analysis.topGrades.1.success_rate', 80)
            ->where('analysis.minAnswers', 10));
});

test('weakest questions sort by accuracy and cap at ten without unanswered questions', function (): void {
    $questions = Question::factory()->count(12)->create(['subject' => $this->subject->key]);
    foreach ($questions as $index => $question) {
        subjectAnalysisAnswers($question, 5, $index, 12 - $index);
    }
    Question::factory()->create(['subject' => $this->subject->key]);
    $weakest = app(SubjectAnalytics::class)->detail($this->subject)['weakestQuestions'];
    expect($weakest)->toHaveCount(10)
        ->and(array_column($weakest, 'id'))->toBe($questions->take(10)->pluck('id')->all())
        ->and($weakest[0]['success_rate'])->toBe(0.0);
});
