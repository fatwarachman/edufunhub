<?php

use App\Models\GameHistory;
use App\Models\Question;
use App\Models\QuestionAnswer;
use App\Models\QuestionCompensationRate;
use App\Models\Role;
use App\Models\SubjectTopic;
use App\Models\TeacherSubject;
use App\Models\User;
use App\Services\PointRules;
use App\Services\TeacherQuestionImporter;
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
        'level' => 1,
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
})->with(['/teacher/questions', '/teacher/questions/list', '/teacher/questions/create', '/teacher/questions/import', '/teacher/questions/template']);

test('teacher creates a question for selected grades including kindergarten', function (): void {
    $this->actingAs($this->teacher)->post('/teacher/questions', teacherQuestionPayload())
        ->assertRedirect(route('teacher.questions.create'))
        ->assertSessionHasNoErrors()
        ->assertSessionHas('success', __('questions.created'));

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
    'missing level' => [['level' => null], 'level'],
    'level out of range' => [['level' => 4], 'level'],
    'level not a number' => [['level' => 'impossible'], 'level'],
    'unknown topic' => [['topic_id' => 999999], 'topic_id'],
]);

test('teacher stores level and topic of the chosen subject', function (): void {
    $topic = SubjectTopic::factory()->create(['subject_key' => 'math', 'name_id' => 'Pecahan', 'name_en' => 'Fractions']);

    $this->actingAs($this->teacher)->post('/teacher/questions', teacherQuestionPayload(['level' => 3, 'topic_id' => $topic->id]))
        ->assertSessionHasNoErrors();

    $question = Question::query()->where('source', 'teacher')->sole();
    expect($question)->level->toBe(3)->topic_id->toBe($topic->id)
        ->and($question->worth())->toBe(PointRules::current()['per_correct'] * 3)
        ->and($question->toGamePayload()['level'])->toBe(3);

    $this->actingAs($this->teacher)->get("/teacher/questions/{$question->id}/edit")->assertInertia(fn (Assert $page) => $page
        ->where('question.level', 3)
        ->where('question.topic_id', $topic->id)
        ->where('question.topic.name_en', 'Fractions')
        ->where('topics', fn ($topics): bool => collect($topics)->pluck('id')->contains($topic->id))
        ->where('levels', [1, 2, 3]));

    $this->actingAs($this->teacher)->put("/teacher/questions/{$question->id}", teacherQuestionPayload(['level' => 2, 'topic_id' => null]))
        ->assertSessionHasNoErrors();
    expect($question->fresh())->level->toBe(2)->topic_id->toBeNull();
});

test('teacher cannot attach a topic of another subject or an inactive topic', function (): void {
    $english = SubjectTopic::factory()->create(['subject_key' => 'english']);
    $inactive = SubjectTopic::factory()->inactive()->create(['subject_key' => 'math']);

    $this->actingAs($this->teacher)->post('/teacher/questions', teacherQuestionPayload(['topic_id' => $english->id]))->assertSessionHasErrors('topic_id');
    $this->actingAs($this->teacher)->post('/teacher/questions', teacherQuestionPayload(['topic_id' => $inactive->id]))->assertSessionHasErrors('topic_id');

    expect(Question::query()->where('source', 'teacher')->count())->toBe(0);
});

test('teacher list filters by topic and level and exposes level and topic', function (): void {
    $topic = SubjectTopic::factory()->create(['subject_key' => 'math']);
    Question::factory()->byTeacher($this->teacher, [5])->create(['subject' => 'math', 'level' => 3, 'topic_id' => $topic->id, 'prompt_id' => 'Sulit bertopik']);
    Question::factory()->byTeacher($this->teacher, [5])->create(['subject' => 'math', 'level' => 1, 'prompt_id' => 'Mudah']);

    $this->actingAs($this->teacher)->get("/teacher/questions/list?topic={$topic->id}")->assertInertia(fn (Assert $page) => $page
        ->where('questions.total', 1)
        ->where('questions.data.0.prompt_id', 'Sulit bertopik')
        ->where('questions.data.0.level', 3)
        ->where('questions.data.0.topic.id', $topic->id)
        ->where('filters.topic', $topic->id));

    $this->actingAs($this->teacher)->get('/teacher/questions/list?level=1')->assertInertia(fn (Assert $page) => $page
        ->where('questions.total', 1)
        ->where('questions.data.0.prompt_id', 'Mudah')
        ->where('questions.data.0.topic', null));

    $this->actingAs($this->teacher)->get('/teacher/questions/list?level=9&topic=abc')->assertInertia(fn (Assert $page) => $page
        ->where('questions.total', 2)
        ->missing('filters.level')
        ->missing('filters.topic'));
});

test('import reads optional level and topic columns', function (): void {
    SubjectTopic::factory()->create(['subject_key' => 'math', 'name_id' => 'Pecahan', 'name_en' => 'Fractions']);
    $csv = "type,grades,subject,question_id,option_1_id,option_2_id,option_3_id,answer,level,topic\n"
        ."choice,5,math,Soal pecahan?,A,B,C,1,sulit,pecahan\n"
        ."choice,5,math,Soal biasa?,A,B,C,1,2,\n"
        ."choice,5,math,Soal tanpa level?,A,B,C,1,,Fractions\n";

    $this->actingAs($this->teacher)->post('/teacher/questions/import', ['file' => teacherCsvUpload($csv)])->assertSessionHasNoErrors();

    $imported = Question::query()->where('source', 'import')->orderBy('id')->get();
    expect($imported->pluck('level')->all())->toBe([3, 2, 1])
        ->and($imported[0]->topic_id)->not->toBeNull()
        ->and($imported[1]->topic_id)->toBeNull()
        ->and($imported[2]->topic_id)->toBe($imported[0]->topic_id);
});

test('import rejects unknown topics and levels', function (): void {
    SubjectTopic::factory()->create(['subject_key' => 'english', 'name_id' => 'Pecahan']);
    $csv = "type,grades,subject,question_id,option_1_id,option_2_id,option_3_id,answer,level,topic\n"
        ."choice,5,math,Topik mapel lain?,A,B,C,1,1,Pecahan\n"
        ."choice,5,math,Level salah?,A,B,C,1,super,\n";

    $this->actingAs($this->teacher)->post('/teacher/questions/import', ['file' => teacherCsvUpload($csv)])
        ->assertSessionHasErrors('file')
        ->assertSessionHas('importErrors', fn (array $errors): bool => collect($errors)->pluck('row')->all() === [2, 3]);

    expect(Question::query()->where('source', 'import')->count())->toBe(0);
});

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
        ->assertRedirect(route('teacher.questions.list'));
    expect($mine->fresh())->grades->toBe([10, 11])->band->toBe(3);

    $this->actingAs($this->teacher)->from('/teacher/questions/list')->delete("/teacher/questions/{$mine->id}")->assertRedirect('/teacher/questions/list');
    $this->assertModelMissing($mine);
    $this->assertModelExists($theirs);
});

test('teacher list only shows own questions and filters by grade', function (): void {
    Question::factory()->byTeacher($this->teacher, [0])->create(['prompt_id' => 'Soal TK']);
    Question::factory()->byTeacher($this->teacher, [7, 8])->create(['prompt_id' => 'Soal SMP']);
    Question::factory()->byTeacher(User::factory()->teacher()->create(), [0])->create();

    $this->actingAs($this->teacher)->get('/teacher/questions')->assertInertia(fn (Assert $page) => $page
        ->component('teacher/index')
        ->has('recent', 2)
        ->where('overview.summary.questions', 2));

    $this->actingAs($this->teacher)->get('/teacher/questions/list')->assertInertia(fn (Assert $page) => $page
        ->component('teacher/questions')
        ->where('questions.total', 2));

    $this->actingAs($this->teacher)->get('/teacher/questions/list?grade=0')->assertInertia(fn (Assert $page) => $page
        ->where('questions.total', 1)
        ->where('questions.data.0.prompt_id', 'Soal TK'));
});

test('template download contains the documented columns and sample rows', function (): void {
    $response = $this->actingAs($this->teacher)->get('/teacher/questions/template')->assertOk();

    expect($response->headers->get('content-disposition'))->toContain('template-soal-edufunhub.csv');
    $lines = array_values(array_filter(explode("\n", $response->streamedContent())));
    expect($lines[0])->toBe("\u{FEFF}".implode(';', TeacherQuestionImporter::COLUMNS))
        ->and($lines[0])->not->toContain('games')
        ->and($lines)->toHaveCount(4)
        ->and($lines[1])->toStartWith('choice;TK,1;math;;mudah;');
});

test('template samples only use subjects the teacher is assigned to', function (): void {
    TeacherSubject::query()->create(['user_id' => $this->teacher->id, 'subject_key' => 'science']);

    $lines = array_values(array_filter(explode("\n", $this->actingAs($this->teacher)->get('/teacher/questions/template')->streamedContent())));
    expect($lines)->toHaveCount(2)
        ->and(str_getcsv($lines[1], ';', '"', '')[2])->toBe('science');

    $this->actingAs($this->teacher)->post('/teacher/questions/import', ['file' => teacherCsvUpload(implode("\n", $lines))])
        ->assertSessionHasNoErrors();
    expect(Question::query()->where('source', 'import')->pluck('subject')->all())->toBe(['science']);
});

test('import rejects subjects the teacher is not assigned to', function (): void {
    TeacherSubject::query()->create(['user_id' => $this->teacher->id, 'subject_key' => 'math']);
    $csv = "type,grades,subject,question_id,option_1_id,option_2_id,option_3_id,answer\n"
        ."choice,5,science,Soal IPA?,A,B,C,1\n";

    $this->actingAs($this->teacher)->post('/teacher/questions/import', ['file' => teacherCsvUpload($csv)])
        ->assertSessionHasErrors('file')
        ->assertSessionHas('importErrors', fn (array $errors): bool => $errors[0]['row'] === 2);
    expect(Question::query()->where('source', 'import')->count())->toBe(0);
});

test('import ignores an old games column and sends every row to all matching games', function (): void {
    $csv = "type,grades,subject,games,question_id,option_1_id,option_2_id,option_3_id,answer\n"
        ."choice,5,math,flag-quest,Soal lama?,A,B,C,1\n"
        ."true_false,5,math,sky-quiz,Pernyataan lama.,,,,benar\n";

    $this->actingAs($this->teacher)->post('/teacher/questions/import', ['file' => teacherCsvUpload($csv)])->assertSessionHasNoErrors();

    $imported = Question::query()->where('source', 'import')->orderBy('id')->get();
    expect($imported[0]->games)->toBe(Question::GAMES)
        ->and($imported[1]->games)->toBe(Question::gamesForType(Question::TYPE_TRUE_FALSE));
});

test('import page lists the teacher subject codes and no games column', function (): void {
    TeacherSubject::query()->create(['user_id' => $this->teacher->id, 'subject_key' => 'math']);

    $this->actingAs($this->teacher)->get('/teacher/questions/import')->assertInertia(fn (Assert $page) => $page
        ->component('teacher/import')
        ->where('subjects', ['math'])
        ->where('columns', fn ($columns): bool => ! collect($columns)->contains('games') && collect($columns)->contains('level')));
});

test('the downloaded template imports cleanly', function (): void {
    $template = $this->actingAs($this->teacher)->get('/teacher/questions/template')->streamedContent();

    $this->actingAs($this->teacher)->post('/teacher/questions/import', ['file' => teacherCsvUpload($template)])
        ->assertRedirect(route('teacher.questions.list'))
        ->assertSessionHasNoErrors();

    $imported = Question::query()->where('source', 'import')->orderBy('id')->get();
    expect($imported)->toHaveCount(3)
        ->and($imported->pluck('level')->all())->toBe([1, 2, 3])
        ->and($imported[0]->grades)->toBe([0, 1])
        ->and($imported[0]->answer)->toBe(0)
        ->and($imported[0]->created_by)->toBe($this->teacher->id)
        ->and($imported[1]->grades)->toBe([4, 5, 6])
        ->and($imported[1]->band)->toBe(1)
        ->and($imported[2]->type)->toBe('true_false')
        ->and($imported[2]->answer)->toBe(1)
        ->and($imported[0]->games)->toBe(Question::GAMES)
        ->and($imported[2]->games)->toBe(Question::gamesForType(Question::TYPE_TRUE_FALSE));
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
        ->where('rates.5', 999));

    $this->actingAs($this->teacher)->get('/teacher/questions/list')->assertInertia(fn (Assert $page) => $page
        ->where('questions.data.0.stats.answered', 3)
        ->where('questions.data.0.stats.games', ['flag-quest', 'sky-quiz'])
        ->where('questions.data.0.stats.grades', [0, 5]));
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

test('teacher form without games or level fields still saves the question to every matching game', function (): void {
    $payload = teacherQuestionPayload(['type' => 'true_false', 'answer' => 1, 'options' => null]);
    unset($payload['games']);

    $this->actingAs($this->teacher)->post('/teacher/questions', $payload)
        ->assertRedirect(route('teacher.questions.create'))
        ->assertSessionHasNoErrors();

    $question = Question::query()->where('source', 'teacher')->sole();
    expect($question->games)->toBe(Question::gamesForType(Question::TYPE_TRUE_FALSE))
        ->and(array_intersect($question->games, Question::CHOICE_ONLY_GAMES))->toBe([]);

    $choice = teacherQuestionPayload(['prompt_id' => 'Soal pilihan ganda tanpa game?']);
    unset($choice['games']);
    $this->actingAs($this->teacher)->post('/teacher/questions', $choice)->assertSessionHasNoErrors();
    expect(Question::query()->where('prompt_id', 'Soal pilihan ganda tanpa game?')->sole()->games)->toBe(Question::GAMES);
});

test('editing a question without games keeps the games picked in the list', function (): void {
    $question = Question::factory()->byTeacher($this->teacher, [3])->create(['type' => 'choice', 'games' => ['sky-quiz']]);
    $payload = teacherQuestionPayload();
    unset($payload['games']);

    $this->actingAs($this->teacher)->put("/teacher/questions/{$question->id}", $payload)
        ->assertRedirect(route('teacher.questions.list'))
        ->assertSessionHasNoErrors();

    expect($question->fresh()->games)->toBe(['sky-quiz']);
});

test('teacher question list page renders own questions with their games', function (): void {
    $mine = Question::factory()->byTeacher($this->teacher, [4])->create(['games' => ['flag-quest']]);
    Question::factory()->byTeacher(User::factory()->teacher()->create(), [4])->create();

    $this->actingAs($this->teacher)->get('/teacher/questions/list')->assertOk()->assertInertia(fn (Assert $page) => $page
        ->component('teacher/questions')
        ->where('questions.total', 1)
        ->where('questions.data.0.id', $mine->id)
        ->where('questions.data.0.games', ['flag-quest'])
        ->where('games', Question::GAMES)
        ->where('choiceOnlyGames', Question::CHOICE_ONLY_GAMES));

    $this->actingAs(User::factory()->create())->get('/teacher/questions/list')->assertForbidden();
});

test('teacher home links the question list and previews the latest questions', function (): void {
    Question::factory()->byTeacher($this->teacher, [2])->count(7)->create();

    $this->actingAs($this->teacher)->get('/teacher/questions')->assertInertia(fn (Assert $page) => $page
        ->component('teacher/index')
        ->has('recent', 5)
        ->missing('questions'));
});

test('teacher picks the games of a question from the list', function (): void {
    $question = Question::factory()->byTeacher($this->teacher, [3])->create(['type' => 'choice', 'games' => Question::GAMES]);

    $this->actingAs($this->teacher)->from('/teacher/questions/list')
        ->patch("/teacher/questions/{$question->id}/games", ['games' => ['sky-quiz', 'flag-quest']])
        ->assertRedirect('/teacher/questions/list')
        ->assertSessionHasNoErrors()
        ->assertSessionHas('success', __('questions.games_updated'));

    expect($question->fresh()->games)->toBe(['sky-quiz', 'flag-quest']);
    $this->assertDatabaseHas('activity_log', ['subject_id' => $question->id, 'description' => 'Teacher updated question games']);
});

test('question games validation', function (array $games, string $type, string $field): void {
    $question = Question::factory()->byTeacher($this->teacher, [3])->create(['type' => $type, 'answer' => $type === 'true_false' ? 1 : 0, 'games' => ['flag-quest']]);

    $this->actingAs($this->teacher)->patch("/teacher/questions/{$question->id}/games", ['games' => $games])->assertSessionHasErrors($field);
    expect($question->fresh()->games)->toBe(['flag-quest']);
})->with([
    'no games' => [[], 'choice', 'games'],
    'unknown game' => [['chess'], 'choice', 'games.0'],
    'duplicate game' => [['flag-quest', 'flag-quest'], 'choice', 'games.0'],
    'true/false in choice-only game' => [['sky-quiz'], 'true_false', 'games'],
]);

test('teachers cannot pick games for questions they do not own', function (): void {
    $theirs = Question::factory()->byTeacher(User::factory()->teacher()->create(), [3])->create(['games' => ['flag-quest']]);
    $system = Question::query()->where('source', 'system')->first();

    $this->actingAs($this->teacher)->patch("/teacher/questions/{$theirs->id}/games", ['games' => ['sky-quiz']])->assertForbidden();
    $this->actingAs($this->teacher)->patch("/teacher/questions/{$system->id}/games", ['games' => ['sky-quiz']])->assertForbidden();
    expect($theirs->fresh()->games)->toBe(['flag-quest']);
});

test('teacher question list paginates with 30, 50, 100 or 200 per page', function (int|string $perPage, int $expected): void {
    Question::factory()->byTeacher($this->teacher, [3])->count(35)->create();

    $this->actingAs($this->teacher)->get("/teacher/questions/list?per_page={$perPage}")->assertInertia(fn (Assert $page) => $page
        ->where('perPageOptions', [30, 50, 100, 200])
        ->where('questions.per_page', $expected)
        ->where('questions.total', 35)
        ->where('totalQuestions', 35)
        ->has('questions.data', min(35, $expected))
        ->has('questions.links'));
})->with([
    'default' => ['', 30],
    '50' => [50, 50],
    '200' => [200, 200],
    'not allowed falls back' => [7, 30],
]);

test('teacher question list search covers every own question, not only the current page', function (): void {
    $needle = Question::factory()->byTeacher($this->teacher, [3])->create(['prompt_id' => 'Ibu kota Kalimantan Timur?']);
    Question::factory()->byTeacher($this->teacher, [3])->count(40)->create(['prompt_id' => 'Soal pengisi']);
    Question::factory()->byTeacher(User::factory()->teacher()->create(), [3])->create(['prompt_id' => 'Ibu kota milik guru lain?']);

    expect($needle->id)->toBeLessThan(Question::query()->max('id'));

    $this->actingAs($this->teacher)->get('/teacher/questions/list?search=kalimantan')->assertInertia(fn (Assert $page) => $page
        ->where('questions.total', 1)
        ->where('questions.data.0.id', $needle->id)
        ->where('totalQuestions', 42 - 1)
        ->where('filters.search', 'kalimantan'));

    $this->actingAs($this->teacher)->get("/teacher/questions/list?search=%23{$needle->id}")->assertInertia(fn (Assert $page) => $page
        ->where('questions.data.0.id', $needle->id));
});

test('teacher question list search matches options and explanations and escapes wildcards', function (): void {
    $option = Question::factory()->byTeacher($this->teacher, [3])->create(['prompt_id' => 'Soal A', 'options' => [['id' => 'Samarinda', 'en' => ''], ['id' => 'Balikpapan', 'en' => ''], ['id' => 'Bontang', 'en' => '']]]);
    $hint = Question::factory()->byTeacher($this->teacher, [3])->create(['prompt_id' => 'Soal B', 'hint_id' => 'Fotosintesis butuh cahaya']);
    Question::factory()->byTeacher($this->teacher, [3])->create(['prompt_id' => 'Diskon 50% hari ini']);
    Question::factory()->byTeacher($this->teacher, [3])->create(['prompt_id' => 'Diskon 50 persen']);

    $ids = fn (string $search): array => collect($this->actingAs($this->teacher)->get('/teacher/questions/list?search='.urlencode($search))->viewData('page')['props']['questions']['data'])->pluck('id')->all();

    expect($ids('balikpapan'))->toBe([$option->id])
        ->and($ids('fotosintesis'))->toBe([$hint->id])
        ->and($ids('50%'))->toHaveCount(1);
});

test('teacher question list filters by type, status, game, picture and sort', function (): void {
    $tf = Question::factory()->byTeacher($this->teacher, [3])->create(['type' => 'true_false', 'answer' => 1, 'options' => null, 'games' => ['flag-quest'], 'prompt_id' => 'B benar salah', 'visual' => null]);
    $off = Question::factory()->byTeacher($this->teacher, [3])->create(['type' => 'choice', 'is_active' => false, 'games' => ['sky-quiz'], 'prompt_id' => 'A nonaktif', 'visual' => ['kind' => 'emoji', 'items' => ['🍎']]]);

    $get = fn (string $query): array => collect($this->actingAs($this->teacher)->get("/teacher/questions/list?{$query}")->viewData('page')['props']['questions']['data'])->pluck('id')->all();

    expect($get('type=true_false'))->toBe([$tf->id])
        ->and($get('status=inactive'))->toBe([$off->id])
        ->and($get('game=sky-quiz'))->toBe([$off->id])
        ->and($get('picture=with'))->toBe([$off->id])
        ->and($get('picture=without'))->toBe([$tf->id])
        ->and($get('sort=oldest'))->toBe([$tf->id, $off->id])
        ->and($get('sort=prompt'))->toBe([$off->id, $tf->id])
        ->and($get('type=bogus&status=bogus&game=chess'))->toHaveCount(2);
});

test('teacher question list sends the full question for the accordion detail', function (): void {
    $question = Question::factory()->byTeacher($this->teacher, [3])->create(['type' => 'choice', 'answer' => 1, 'hint_id' => 'Penjelasan']);

    $this->actingAs($this->teacher)->get('/teacher/questions/list')->assertInertia(fn (Assert $page) => $page
        ->where('questions.data.0.id', $question->id)
        ->where('questions.data.0.answer', 1)
        ->where('questions.data.0.hint_id', 'Penjelasan')
        ->has('questions.data.0.options')
        ->has('questions.data.0.stats'));
});
