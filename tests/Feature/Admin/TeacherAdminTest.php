<?php

use App\Models\Classroom;
use App\Models\ClassroomMember;
use App\Models\GameHistory;
use App\Models\PlayerProfile;
use App\Models\PointLedger;
use App\Models\Question;
use App\Models\QuestionAnswer;
use App\Models\TeacherRequest;
use App\Models\TeacherSubject;
use App\Models\User;
use Inertia\Testing\AssertableInertia as Assert;

beforeEach(function (): void {
    config(['scout.driver' => 'null']);
    $this->withoutVite();
    $this->admin = User::factory()->superadmin()->create();
});

function teacherAnswer(Question $question, User $player, bool $correct, int $compensation = 0, ?Classroom $classroom = null): QuestionAnswer
{
    $history = GameHistory::factory()->for($player)->create(['grade' => 5, 'classroom_id' => $classroom?->id]);

    return QuestionAnswer::query()->create([
        'question_id' => $question->id,
        'game_history_id' => $history->id,
        'game_key' => 'sky-quiz',
        'correct' => $correct,
        'choice' => $correct ? $question->answer : 1,
        'compensation' => $compensation,
    ]);
}

/**
 * A teacher with questions, classrooms, members, plays, answers and points.
 *
 * @return array{teacher: User, players: list<User>, questions: list<Question>, classrooms: list<Classroom>}
 */
function seedTeacher(string $name = 'Bu Sari'): array
{
    $teacher = User::factory()->teacher()->create(['name' => $name, 'email' => strtolower(str_replace(' ', '.', $name)).'@school.test']);
    PlayerProfile::factory()->for($teacher)->create(['school_name' => 'SD Harapan '.$name]);
    TeacherSubject::query()->create(['user_id' => $teacher->id, 'subject_key' => 'math']);

    $first = Question::factory()->byTeacher($teacher)->create(['subject' => 'math']);
    $second = Question::factory()->byTeacher($teacher)->create(['subject' => 'math']);
    $inactive = Question::factory()->byTeacher($teacher)->inactive()->create(['subject' => 'science', 'source' => 'import']);
    Question::factory()->create(['source' => 'ai', 'created_by' => $teacher->id, 'subject' => 'math']);

    $active = Classroom::factory()->create(['teacher_id' => $teacher->id]);
    $ended = Classroom::factory()->ended()->create(['teacher_id' => $teacher->id]);
    Classroom::factory()->scheduled()->create(['teacher_id' => $teacher->id]);

    $players = User::factory()->count(3)->create()->all();
    ClassroomMember::factory()->create(['classroom_id' => $active->id, 'user_id' => $players[0]->id]);
    ClassroomMember::factory()->create(['classroom_id' => $active->id, 'user_id' => $players[1]->id]);
    ClassroomMember::factory()->create(['classroom_id' => $ended->id, 'user_id' => $players[0]->id]);
    ClassroomMember::factory()->create(['classroom_id' => $ended->id, 'user_id' => $players[2]->id]);

    teacherAnswer($first, $players[0], true, 100, $active);
    teacherAnswer($first, $players[1], true, 100, $active);
    teacherAnswer($first, $players[2], false);
    teacherAnswer($second, $players[0], true, 50, $ended);

    PointLedger::factory()->create(['user_id' => $teacher->id, 'points' => 80]);
    PointLedger::factory()->create(['user_id' => $teacher->id, 'points' => -30, 'reason' => 'shop_purchase']);

    return ['teacher' => $teacher, 'players' => $players, 'questions' => [$first, $second, $inactive], 'classrooms' => [$active, $ended]];
}

it('is only for super admins', function (): void {
    $this->get('/admin/teachers')->assertRedirect('/login');
    $this->actingAs(User::factory()->create())->get('/admin/teachers')->assertForbidden();
    $this->actingAs(User::factory()->teacher()->create())->get('/admin/teachers')->assertForbidden();

    $teacher = User::factory()->teacher()->create();
    $this->actingAs(User::factory()->create())->get("/admin/teachers/{$teacher->id}")->assertForbidden();

    $this->actingAs($this->admin)->get('/admin/teachers')->assertOk()
        ->assertInertia(fn (Assert $page) => $page->component('admin/teachers/index'));
});

it('lists only teachers with their counts', function (): void {
    $seeded = seedTeacher();
    $teacher = $seeded['teacher'];
    User::factory()->create(['name' => 'Plain Player']);
    TeacherRequest::query()->create(['user_id' => $seeded['players'][0]->id, 'subject_key' => 'math', 'status' => TeacherRequest::PENDING]);

    $this->actingAs($this->admin)->get('/admin/teachers')->assertOk()->assertInertia(fn (Assert $page) => $page
        ->component('admin/teachers/index')
        ->where('summary.teachers', 1)
        ->where('summary.questions', 3)
        ->where('summary.active_questions', 2)
        ->where('summary.classrooms', 3)
        ->where('summary.active_classrooms', 1)
        ->where('summary.participants', 3)
        ->where('summary.compensation', 250)
        ->where('summary.pending_requests', 1)
        ->has('teachers.data', 1)
        ->where('teachers.data.0.id', $teacher->id)
        ->where('teachers.data.0.school_name', 'SD Harapan Bu Sari')
        ->where('teachers.data.0.subjects', ['all' => false, 'keys' => ['math']])
        ->where('teachers.data.0.questions', ['total' => 3, 'active' => 2, 'manual' => 2, 'imported' => 1, 'ai' => 1])
        ->where('teachers.data.0.classrooms', ['total' => 3, 'active' => 1, 'scheduled' => 1, 'ended' => 1])
        ->where('teachers.data.0.participants', 3)
        ->where('teachers.data.0.classroom_plays', 3)
        ->where('teachers.data.0.answers', 4)
        ->where('teachers.data.0.success_rate', 75)
        ->where('teachers.data.0.compensation', 250)
        ->where('teachers.data.0.account_points', 50)
        ->where('teachers.data.0.pending_requests', 0));
});

it('searches by name email or school and filters by subject', function (): void {
    seedTeacher('Bu Sari');
    $budi = User::factory()->teacher()->create(['name' => 'Pak Budi', 'email' => 'budi@guru.test']);
    TeacherSubject::query()->create(['user_id' => $budi->id, 'subject_key' => 'science']);
    $all = User::factory()->teacher()->create(['name' => 'Bu Any']);
    TeacherSubject::query()->create(['user_id' => $all->id, 'subject_key' => null]);

    $this->actingAs($this->admin);

    $this->get('/admin/teachers?search=budi@guru')->assertInertia(fn (Assert $page) => $page
        ->has('teachers.data', 1)->where('teachers.data.0.name', 'Pak Budi'));
    $this->get('/admin/teachers?search=Harapan')->assertInertia(fn (Assert $page) => $page
        ->has('teachers.data', 1)->where('teachers.data.0.name', 'Bu Sari'));
    $this->get('/admin/teachers?subject=science&sort=name&direction=asc')->assertInertia(fn (Assert $page) => $page
        ->where('filters.subject', 'science')
        ->has('teachers.data', 2)
        ->where('teachers.data.0.name', 'Bu Any')
        ->where('teachers.data.0.subjects.all', true)
        ->where('teachers.data.1.name', 'Pak Budi'));
});

it('sorts teachers', function (): void {
    seedTeacher('Bu Sari');
    User::factory()->teacher()->create(['name' => 'Ani Baru']);

    $this->actingAs($this->admin);

    $this->get('/admin/teachers')->assertInertia(fn (Assert $page) => $page
        ->where('filters.sort', 'questions')->where('teachers.data.0.name', 'Bu Sari'));
    $this->get('/admin/teachers?sort=compensation&direction=asc')->assertInertia(fn (Assert $page) => $page
        ->where('teachers.data.0.name', 'Ani Baru'));
    $this->get('/admin/teachers?sort=name')->assertInertia(fn (Assert $page) => $page
        ->where('filters.direction', 'asc')->where('teachers.data.0.name', 'Ani Baru'));
    $this->get('/admin/teachers?sort=participants&direction=desc')->assertInertia(fn (Assert $page) => $page
        ->where('teachers.data.0.name', 'Bu Sari'));
});

it('rejects invalid filters', function (): void {
    $this->actingAs($this->admin)
        ->get('/admin/teachers?sort=bogus&subject=nope&direction=up')
        ->assertSessionHasErrors(['sort', 'subject', 'direction']);
});

it('shows teacher details', function (): void {
    $seeded = seedTeacher();
    $teacher = $seeded['teacher'];
    [$first] = $seeded['questions'];
    TeacherRequest::query()->create(['user_id' => $teacher->id, 'subject_key' => 'math', 'status' => TeacherRequest::APPROVED, 'reviewed_by' => $this->admin->id, 'reviewed_at' => now()]);

    $this->actingAs($this->admin)->get("/admin/teachers/{$teacher->id}")->assertOk()->assertInertia(fn (Assert $page) => $page
        ->component('admin/teachers/show')
        ->where('teacher.id', $teacher->id)
        ->where('teacher.email', $teacher->email)
        ->where('teacher.school_name', 'SD Harapan Bu Sari')
        ->where('teacher.subjects.keys', ['math'])
        ->where('teacher.roles.0.slug', 'guru')
        ->where('questions.summary.questions', 3)
        ->where('questions.summary.active_questions', 2)
        ->where('questions.summary.inactive_questions', 1)
        ->where('questions.summary.answered', 4)
        ->where('questions.summary.correct', 3)
        ->where('questions.summary.success_rate', 75)
        ->where('questions.summary.players', 3)
        ->where('questions.summary.compensation', 250)
        ->has('questions.bySource', 3)
        ->where('questions.bySource.0', ['source' => 'teacher', 'total' => 2, 'active' => 2])
        ->where('questions.bySubject.0.subject', 'math')
        ->where('questions.bySubject.0.answered', 4)
        ->has('questions.top', 2)
        ->where('questions.top.0.id', $first->id)
        ->where('questions.top.0.answered', 3)
        ->where('questions.top.0.compensation', 200)
        ->where('classrooms.summary', ['total' => 3, 'scheduled' => 1, 'active' => 1, 'ended' => 1, 'memberships' => 4, 'participants' => 3, 'plays' => 3])
        ->has('classrooms.items', 3)
        ->where('points.balance', 50)
        ->where('points.earned', 80)
        ->where('points.spent', 30)
        ->has('points.recent', 2)
        ->has('requests', 1)
        ->where('requests.0.status', 'approved')
        ->where('requests.0.reviewer', $this->admin->name)
        ->has('activity'));
});

it('returns 404 for non teachers and missing users', function (): void {
    $player = User::factory()->create();

    $this->actingAs($this->admin)->get("/admin/teachers/{$player->id}")->assertNotFound();
    $this->actingAs($this->admin)->get('/admin/teachers/999999')->assertNotFound();
});
