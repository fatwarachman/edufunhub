<?php

use App\Models\GameHistory;
use App\Models\Question;
use App\Models\QuestionAnswer;
use App\Models\QuestionCompensationRate;
use App\Models\Role;
use App\Models\User;
use Illuminate\Http\UploadedFile;
use Inertia\Testing\AssertableInertia as Assert;

const TEACHER_GAME_SECRET = 'teacher-games-test-secret-with-32-chars!';

beforeEach(function (): void {
    config(['scout.driver' => 'null', 'game-service.secret' => TEACHER_GAME_SECRET]);
    $this->withoutVite();
    $this->teacher = User::factory()->teacher()->create();
});

/**
 * @param  array<string, mixed>  $overrides
 * @return array<string, mixed>
 */
function teacherQuestionPayload(array $overrides = []): array
{
    return [
        'type' => 'choice',
        'grades' => [0, 1, 2],
        'subject' => 'math',
        'prompt_id' => 'Berapa 2 + 3?',
        'prompt_en' => 'What is 2 + 3?',
        'options' => [['id' => '5', 'en' => '5'], ['id' => '4', 'en' => '4'], ['id' => '6', 'en' => '6'], ['id' => '', 'en' => '']],
        'answer' => 0,
        'games' => ['flag-quest', 'sky-quiz'],
        'is_active' => true,
        ...$overrides,
    ];
}

/**
 * Post a signed game result like the Go service does.
 *
 * @param  list<array{key: string, correct: bool}>  $answers
 */
function postTeacherGameResult(mixed $test, User $player, int $grade, array $answers, string $game = 'sky-quiz'): void
{
    static $sequence = 0;
    $sequence++;
    $isSky = $game === 'sky-quiz';
    $payload = [
        'event_id' => $isSky ? "sq-{$player->id}-sky-{$sequence}" : "fq-{$player->id}-forest-{$sequence}",
        'user_id' => $player->id,
        'game_key' => $game,
        'mission' => $isSky ? 'sky' : 'forest',
        'grade' => $grade,
        'points' => 50,
        'correct' => collect($answers)->where('correct', true)->count(),
        'wrong' => collect($answers)->where('correct', false)->count(),
        'duration_seconds' => 60,
        'completed_at' => now()->toIso8601String(),
        'answers' => $answers,
    ];
    $body = json_encode($payload);
    $timestamp = now()->getTimestamp();

    $test->call('POST', '/api/internal/game-results', [], [], [], [
        'CONTENT_TYPE' => 'application/json', 'HTTP_ACCEPT' => 'application/json',
        'HTTP_X_GAME_TIMESTAMP' => (string) $timestamp,
        'HTTP_X_GAME_SIGNATURE' => hash_hmac('sha256', $timestamp.'.'.$body, TEACHER_GAME_SECRET),
    ], $body)->assertCreated();
}

function teacherCsvUpload(string $contents): UploadedFile
{
    return UploadedFile::fake()->createWithContent('soal.csv', $contents);
}

test('only users with the teacher role can open the teacher portal', function (string $path): void {
    $this->get($path)->assertRedirect();
    $this->actingAs(User::factory()->create())->get($path)->assertForbidden();
    $this->actingAs(User::factory()->superadmin()->create())->get($path)->assertForbidden();
    $this->actingAs($this->teacher)->get($path)->assertOk();
})->with(['/teacher/questions', '/teacher/questions/create', '/teacher/questions/import', '/teacher/questions/template']);

test('teacher creates a question for selected grades including kindergarten', function (): void {
    $this->actingAs($this->teacher)->post('/teacher/questions', teacherQuestionPayload())
        ->assertRedirect(route('teacher.questions.index'))
        ->assertSessionHasNoErrors();

    $question = Question::query()->where('source', 'teacher')->sole();

    expect($question)
        ->created_by->toBe($this->teacher->id)
        ->grades->toBe([0, 1, 2])
        ->band->toBe(0)
        ->source->toBe('teacher')
        ->and($question->options)->toHaveCount(3)
        ->and($question->toGamePayload()['grades'])->toBe([0, 1, 2]);
});

test('teacher question validation', function (array $payload, string $field): void {
    $this->actingAs($this->teacher)->post('/teacher/questions', teacherQuestionPayload($payload))->assertSessionHasErrors($field);
})->with([
    'no grades' => [['grades' => []], 'grades'],
    'grade out of range' => [['grades' => [13]], 'grades.0'],
    'too few options' => [['options' => [['id' => 'A'], ['id' => 'B']]], 'options'],
    'answer outside options' => [['answer' => 5], 'answer'],
    'true/false in sky quiz' => [['type' => 'true_false', 'answer' => 1, 'games' => ['sky-quiz']], 'games'],
    'duplicate options' => [['options' => [['id' => 'A'], ['id' => 'a'], ['id' => 'B']]], 'options'],
    'unknown subject' => [['subject' => 'art'], 'subject'],
]);

test('teachers can only edit and delete their own questions', function (): void {
    $other = User::factory()->teacher()->create();
    $mine = Question::factory()->byTeacher($this->teacher, [3])->create();
    $theirs = Question::factory()->byTeacher($other, [3])->create();
    $system = Question::query()->where('source', 'system')->first();

    $this->actingAs($this->teacher)->get("/teacher/questions/{$theirs->id}/edit")->assertForbidden();
    $this->actingAs($this->teacher)->get("/teacher/questions/{$system->id}/edit")->assertForbidden();
    $this->actingAs($this->teacher)->put("/teacher/questions/{$theirs->id}", teacherQuestionPayload())->assertForbidden();
    $this->actingAs($this->teacher)->delete("/teacher/questions/{$theirs->id}")->assertForbidden();

    $this->actingAs($this->teacher)->get("/teacher/questions/{$mine->id}/edit")
        ->assertInertia(fn (Assert $page) => $page->component('teacher/form')->where('question.grades', [3]));

    $this->actingAs($this->teacher)->put("/teacher/questions/{$mine->id}", teacherQuestionPayload(['grades' => [10, 11]]))
        ->assertRedirect(route('teacher.questions.index'));
    expect($mine->fresh())->grades->toBe([10, 11])->band->toBe(3);

    $this->actingAs($this->teacher)->delete("/teacher/questions/{$mine->id}")->assertRedirect(route('teacher.questions.index'));
    $this->assertModelMissing($mine);
    $this->assertModelExists($theirs);
});

test('teacher list only shows own questions and filters by grade', function (): void {
    Question::factory()->byTeacher($this->teacher, [0])->create(['prompt_id' => 'Soal TK']);
    Question::factory()->byTeacher($this->teacher, [7, 8])->create(['prompt_id' => 'Soal SMP']);
    Question::factory()->byTeacher(User::factory()->teacher()->create(), [0])->create();

    $this->actingAs($this->teacher)->get('/teacher/questions')->assertInertia(fn (Assert $page) => $page
        ->component('teacher/index')
        ->where('questions.total', 2)
        ->where('overview.summary.questions', 2));

    $this->actingAs($this->teacher)->get('/teacher/questions?grade=0')->assertInertia(fn (Assert $page) => $page
        ->where('questions.total', 1)
        ->where('questions.data.0.prompt_id', 'Soal TK'));
});

test('template download contains the documented columns and sample rows', function (): void {
    $response = $this->actingAs($this->teacher)->get('/teacher/questions/template')->assertOk();

    expect($response->headers->get('content-disposition'))->toContain('template-soal-edufunhub.csv');
    $lines = array_values(array_filter(explode("\n", $response->streamedContent())));
    expect($lines[0])->toStartWith("\u{FEFF}type,grades,subject,games,question_id")
        ->and($lines)->toHaveCount(4);
});

test('the downloaded template imports cleanly', function (): void {
    $template = $this->actingAs($this->teacher)->get('/teacher/questions/template')->streamedContent();

    $this->actingAs($this->teacher)->post('/teacher/questions/import', ['file' => teacherCsvUpload($template)])
        ->assertRedirect(route('teacher.questions.index'))
        ->assertSessionHasNoErrors();

    $imported = Question::query()->where('source', 'import')->orderBy('id')->get();
    expect($imported)->toHaveCount(3)
        ->and($imported[0]->grades)->toBe([0, 1])
        ->and($imported[0]->answer)->toBe(0)
        ->and($imported[0]->created_by)->toBe($this->teacher->id)
        ->and($imported[1]->grades)->toBe([4, 5, 6])
        ->and($imported[1]->band)->toBe(1)
        ->and($imported[2]->type)->toBe('true_false')
        ->and($imported[2]->answer)->toBe(1)
        ->and($imported[2]->games)->toBe(['flag-quest']);
});

test('import accepts semicolon separated files, letters and grade ranges', function (): void {
    $csv = "type;grades;subject;question_id;option_1_id;option_2_id;option_3_id;answer\n"
        ."pg;1-3;science;Hewan pemakan daun?;Herbivora;Karnivora;Omnivora;A\n"
        ."bs;TK;math;1 + 1 = 2;;;;benar\n";

    $this->actingAs($this->teacher)->post('/teacher/questions/import', ['file' => teacherCsvUpload($csv)])->assertSessionHasNoErrors();

    $imported = Question::query()->where('source', 'import')->orderBy('id')->get();
    expect($imported[0])->type->toBe('choice')->grades->toBe([1, 2, 3])->answer->toBe(0)->games->toBe(Question::GAMES)
        ->and($imported[1])->type->toBe('true_false')->grades->toBe([0])->answer->toBe(1);
});

test('import rejects the whole file and reports every bad row', function (): void {
    $csv = "type,grades,subject,question_id,option_1_id,option_2_id,option_3_id,answer\n"
        ."choice,5,math,Soal valid?,A,B,C,1\n"
        ."choice,14,math,Kelas salah?,A,B,C,1\n"
        ."choice,5,math,Jawaban salah?,A,B,C,9\n";

    $this->actingAs($this->teacher)->from('/teacher/questions/import')
        ->post('/teacher/questions/import', ['file' => teacherCsvUpload($csv)])
        ->assertRedirect('/teacher/questions/import')
        ->assertSessionHasErrors('file')
        ->assertSessionHas('importErrors', fn (array $errors): bool => collect($errors)->pluck('row')->all() === [3, 4]);

    expect(Question::query()->where('source', 'import')->count())->toBe(0);
});

test('import requires the template columns', function (): void {
    $this->actingAs($this->teacher)->post('/teacher/questions/import', ['file' => teacherCsvUpload("foo,bar\n1,2\n")])
        ->assertSessionHas('importErrors', fn (array $errors): bool => $errors[0]['row'] === 1);
});

test('correct answers to teacher questions earn the rate for the player grade', function (): void {
    QuestionCompensationRate::query()->create(['grade' => 0, 'amount' => 150]);
    QuestionCompensationRate::query()->create(['grade' => 5, 'amount' => 300]);

    $question = Question::factory()->byTeacher($this->teacher, [0, 5])->create(['key' => 'q-teacher-1']);
    $player = User::factory()->withPlayerDetails()->create();

    postTeacherGameResult($this, $player, 5, [['key' => 'q-teacher-1', 'correct' => true], ['key' => 'mc-1-0', 'correct' => true]]);
    postTeacherGameResult($this, $player, 0, [['key' => 'q-teacher-1', 'correct' => true]], 'flag-quest');
    postTeacherGameResult($this, $player, 5, [['key' => 'q-teacher-1', 'correct' => false]]);

    $answers = QuestionAnswer::query()->where('question_id', $question->id)->orderBy('id')->pluck('compensation')->all();
    expect($answers)->toBe([300, 150, 0])
        ->and(QuestionAnswer::query()->whereHas('question', fn ($q) => $q->where('key', 'mc-1-0'))->value('compensation'))->toBe(0);

    QuestionCompensationRate::query()->where('grade', 5)->update(['amount' => 999]);

    $this->actingAs($this->teacher)->get('/teacher/questions')->assertInertia(fn (Assert $page) => $page
        ->where('overview.summary.answered', 3)
        ->where('overview.summary.correct', 2)
        ->where('overview.summary.wrong', 1)
        ->where('overview.summary.compensation', 450)
        ->where('overview.summary.used_questions', 1)
        ->where('overview.byGame.0.label', 'flag-quest')
        ->where('overview.byGame.0.answered', 1)
        ->where('overview.byGame.1.answered', 2)
        ->where('overview.byGrade', fn ($rows): bool => collect($rows)->pluck('grade')->all() === [0, 5])
        ->where('overview.byLevel.0.label', 'tk')
        ->where('overview.byLevel.0.compensation', 150)
        ->where('overview.byLevel.1.compensation', 300)
        ->where('questions.data.0.stats.answered', 3)
        ->where('questions.data.0.stats.games', ['flag-quest', 'sky-quiz'])
        ->where('questions.data.0.stats.grades', [0, 5])
        ->where('rates.5', 999));
});

test('teacher stats exclude other teachers and built-in questions', function (): void {
    Question::factory()->byTeacher(User::factory()->teacher()->create(), [5])->create(['key' => 'q-other']);
    $player = User::factory()->withPlayerDetails()->create();

    postTeacherGameResult($this, $player, 5, [['key' => 'q-other', 'correct' => true], ['key' => 'mc-1-0', 'correct' => true]]);

    $this->actingAs($this->teacher)->get('/teacher/questions')->assertInertia(fn (Assert $page) => $page
        ->where('overview.summary.answered', 0)
        ->where('overview.summary.compensation', 0));
});

test('only super admins manage compensation rates', function (): void {
    $admin = User::factory()->create();
    $admin->roles()->attach(Role::query()->firstOrCreate(['slug' => 'admin'], ['name' => 'Admin']));

    $this->actingAs($this->teacher)->get('/admin/compensation')->assertForbidden();
    $this->actingAs($admin)->get('/admin/compensation')->assertForbidden();
    $this->actingAs($admin)->put('/admin/compensation', ['rates' => [['grade' => 0, 'amount' => 1]]])->assertForbidden();
});

test('super admin sets compensation per grade', function (): void {
    $superadmin = User::factory()->superadmin()->create();

    $this->actingAs($superadmin)->get('/admin/compensation')->assertInertia(fn (Assert $page) => $page
        ->component('admin/compensation/index')
        ->has('rates', 13)
        ->where('rates.0', ['grade' => 0, 'amount' => 0]));

    $this->actingAs($superadmin)->put('/admin/compensation', ['rates' => [
        ['grade' => 0, 'amount' => 100],
        ['grade' => 12, 'amount' => 500],
    ]])->assertRedirect()->assertSessionHasNoErrors();

    expect(QuestionCompensationRate::amounts())->toMatchArray([0 => 100, 1 => 0, 12 => 500]);

    $this->actingAs($superadmin)->put('/admin/compensation', ['rates' => [['grade' => 13, 'amount' => 1]]])->assertSessionHasErrors('rates.0.grade');
    $this->actingAs($superadmin)->put('/admin/compensation', ['rates' => [['grade' => 1, 'amount' => -5]]])->assertSessionHasErrors('rates.0.amount');
});

test('admin compensation page lists earning teachers', function (): void {
    QuestionCompensationRate::query()->create(['grade' => 5, 'amount' => 250]);
    Question::factory()->byTeacher($this->teacher, [5])->create(['key' => 'q-earn']);
    postTeacherGameResult($this, User::factory()->withPlayerDetails()->create(), 5, [['key' => 'q-earn', 'correct' => true]]);

    $this->actingAs(User::factory()->superadmin()->create())->get('/admin/compensation')->assertInertia(fn (Assert $page) => $page
        ->where('totalPaid', 250)
        ->where('teachers.0.id', $this->teacher->id)
        ->where('teachers.0.total', 250));
});

test('question bank serves explicit grades to the game service', function (): void {
    Question::factory()->byTeacher($this->teacher, [0, 2])->create(['key' => 'q-grades']);
    $timestamp = now()->getTimestamp();

    $response = $this->withHeaders([
        'X-Game-Timestamp' => (string) $timestamp,
        'X-Game-Signature' => hash_hmac('sha256', $timestamp.'.', TEACHER_GAME_SECRET),
        'Accept' => 'application/json',
    ])->get('/api/internal/question-bank')->assertOk();

    $item = collect($response->json('questions'))->firstWhere('key', 'q-grades');
    expect($item['grades'])->toBe([0, 2])
        ->and(collect($response->json('questions'))->firstWhere('key', 'mc-0-0')['grades'])->toBe([]);
});

test('players can pick kindergarten as their grade', function (): void {
    $player = User::factory()->withPlayerDetails()->create();

    $this->actingAs($player)->patch('/grade', ['grade' => 0])->assertSessionHasNoErrors();
    expect($player->playerProfile()->first()->grade)->toBe(0);

    $this->actingAs($player)->patch('/grade', ['grade' => -1])->assertSessionHasErrors('grade');
});

test('teacher nav flag is shared with the frontend', function (): void {
    $this->actingAs($this->teacher)->get('/teacher/questions')->assertInertia(fn (Assert $page) => $page->where('auth.user.is_teacher', true));
    $this->actingAs(User::factory()->create())->get('/dashboard')->assertInertia(fn (Assert $page) => $page->where('auth.user.is_teacher', false));
});

test('game history is kept when a teacher question is deleted', function (): void {
    $question = Question::factory()->byTeacher($this->teacher, [5])->create(['key' => 'q-gone']);
    postTeacherGameResult($this, User::factory()->withPlayerDetails()->create(), 5, [['key' => 'q-gone', 'correct' => true]]);

    $this->actingAs($this->teacher)->delete("/teacher/questions/{$question->id}");

    expect(GameHistory::query()->count())->toBe(1)->and(QuestionAnswer::query()->count())->toBe(0);
});
