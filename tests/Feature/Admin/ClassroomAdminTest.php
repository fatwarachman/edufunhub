<?php

use App\Models\Classroom;
use App\Models\ClassroomAnnouncement;
use App\Models\ClassroomMember;
use App\Models\GameHistory;
use App\Models\PlayerProfile;
use App\Models\User;
use App\Services\Ai\ClassroomAiText;
use Inertia\Testing\AssertableInertia as Assert;

beforeEach(function (): void {
    config(['scout.driver' => 'null']);
    $this->withoutVite();
    $this->admin = User::factory()->superadmin()->create();
});

it('is only for super admins', function (): void {
    $classroom = Classroom::factory()->create();

    $this->get('/admin/classrooms')->assertRedirect('/login');
    $this->get("/admin/classrooms/{$classroom->id}")->assertRedirect('/login');

    $player = User::factory()->create();
    $this->actingAs($player)->get('/admin/classrooms')->assertForbidden();
    $this->actingAs($player)->get("/admin/classrooms/{$classroom->id}")->assertForbidden();

    $this->actingAs($this->admin)->get('/admin/classrooms')->assertOk()
        ->assertInertia(fn (Assert $page) => $page->component('admin/classrooms/index'));
});

it('lists classrooms with KPIs, active ones first', function (): void {
    $ended = Classroom::factory()->ended()->create(['name' => 'Ended Class']);
    $scheduled = Classroom::factory()->scheduled()->create(['name' => 'Scheduled Class']);
    $active = Classroom::factory()->create(['name' => 'Active Class']);
    $active->games()->create(['game_key' => 'sky-quiz', 'sort_order' => 0]);

    ClassroomMember::factory()->create(['classroom_id' => $active->id, 'last_seen_at' => now()]);
    ClassroomMember::factory()->create(['classroom_id' => $active->id, 'last_seen_at' => now()->subMinutes(10)]);
    ClassroomMember::factory()->create(['classroom_id' => $active->id, 'left_at' => now()]);
    $member = ClassroomMember::factory()->create(['classroom_id' => $ended->id]);
    GameHistory::factory()->for($member->user)->create(['classroom_id' => $ended->id]);

    $this->actingAs($this->admin)->get('/admin/classrooms')->assertInertia(fn (Assert $page) => $page
        ->where('summary.total', 3)
        ->where('summary.scheduled', 1)
        ->where('summary.active', 1)
        ->where('summary.ended', 1)
        ->where('summary.members', 3)
        ->where('summary.online', 1)
        ->has('classrooms.data', 3)
        ->where('classrooms.data.0.id', $active->id)
        ->where('classrooms.data.0.status', 'active')
        ->where('classrooms.data.0.members_count', 2)
        ->where('classrooms.data.0.online_count', 1)
        ->where('classrooms.data.0.games', ['sky-quiz'])
        ->where('classrooms.data.1.id', $scheduled->id)
        ->where('classrooms.data.2.id', $ended->id)
        ->where('classrooms.data.2.plays', 1)
        ->has('teachers', 3));
});

it('filters classrooms by status', function (string $status): void {
    $classrooms = [
        'scheduled' => Classroom::factory()->scheduled()->create(),
        'active' => Classroom::factory()->create(),
        'ended' => Classroom::factory()->ended()->create(),
    ];

    $this->actingAs($this->admin)->get("/admin/classrooms?status={$status}")->assertInertia(fn (Assert $page) => $page
        ->where('filters.status', $status)
        ->has('classrooms.data', 1)
        ->where('classrooms.data.0.id', $classrooms[$status]->id)
        ->where('classrooms.data.0.status', $status));
})->with(['scheduled', 'active', 'ended']);

it('searches by classroom name, teacher name and PIN and filters by teacher', function (): void {
    $teacher = User::factory()->teacher()->create(['name' => 'Bu Sari Wulandari']);
    $math = Classroom::factory()->create(['teacher_id' => $teacher->id, 'name' => 'Matematika Seru', 'pin' => '111222']);
    $science = Classroom::factory()->create(['name' => 'IPA Asik', 'pin' => '333444']);

    $ids = fn (string $query): array => $this->actingAs($this->admin)->get('/admin/classrooms?'.$query)
        ->assertOk()
        ->inertiaProps('classrooms.data');

    expect(collect($ids('search=Matematika'))->pluck('id')->all())->toBe([$math->id])
        ->and(collect($ids('search=Wulandari'))->pluck('id')->all())->toBe([$math->id])
        ->and(collect($ids('search=333444'))->pluck('id')->all())->toBe([$science->id])
        ->and(collect($ids('teacher_id='.$teacher->id))->pluck('id')->all())->toBe([$math->id]);
});

it('rejects invalid filters', function (): void {
    $this->actingAs($this->admin)->get('/admin/classrooms?status=archived')->assertSessionHasErrors('status');
    $this->actingAs($this->admin)->get('/admin/classrooms?teacher_id=999999')->assertSessionHasErrors('teacher_id');
});

it('shows teacher, games, members, announcements, AI and the deferred report', function (): void {
    $teacher = User::factory()->teacher()->create(['name' => 'Pak Budi']);
    $classroom = Classroom::factory()->create([
        'teacher_id' => $teacher->id,
        'name' => 'Kelas Bahasa',
        'pin' => '424242',
        'description' => 'Belajar bahasa',
        'ai_status' => 'done',
        'ai_summary' => ClassroomAiText::encode(['overview' => ['Kelas aktif.'], 'strengths' => [], 'weaknesses' => [], 'misconceptions' => [], 'actions' => []]),
    ]);
    $classroom->games()->create(['game_key' => 'sky-quiz', 'sort_order' => 0, 'max_plays' => 3, 'subjects' => ['math']]);

    $student = User::factory()->create(['name' => 'Rani Account']);
    PlayerProfile::factory()->for($student)->create(['nickname' => 'Rani']);
    ClassroomMember::factory()->create([
        'classroom_id' => $classroom->id,
        'user_id' => $student->id,
        'last_seen_at' => now(),
        'current_game' => 'sky-quiz',
        'report_shared_at' => now(),
        'ai_feedback' => ClassroomAiText::encode(['strengths' => ['Teliti.'], 'improve' => [], 'tips' => []]),
    ]);
    GameHistory::factory()->for($student)->create(['classroom_id' => $classroom->id, 'correct' => 4, 'wrong' => 1, 'points' => 30]);
    ClassroomAnnouncement::factory()->create(['classroom_id' => $classroom->id, 'body' => 'Mulai sekarang']);

    $this->actingAs($this->admin)->get("/admin/classrooms/{$classroom->id}")->assertInertia(fn (Assert $page) => $page
        ->component('admin/classrooms/show')
        ->where('classroom.name', 'Kelas Bahasa')
        ->where('classroom.pin', '424242')
        ->where('classroom.status', 'active')
        ->where('classroom.teacher.id', $teacher->id)
        ->where('classroom.teacher.name', 'Pak Budi')
        ->where('classroom.ai_summary.overview', ['Kelas aktif.'])
        ->has('games', 1)
        ->where('games.0.game_key', 'sky-quiz')
        ->where('games.0.max_plays', 3)
        ->where('games.0.subjects', ['math'])
        ->has('members', 1)
        ->where('members.0.name', 'Rani')
        ->where('members.0.online', true)
        ->where('members.0.current_game', 'sky-quiz')
        ->where('members.0.plays', 1)
        ->where('members.0.accuracy', 80)
        ->where('members.0.points', 30)
        ->where('members.0.ai_feedback.strengths', ['Teliti.'])
        ->whereNot('members.0.report_shared_at', null)
        ->has('announcements', 1)
        ->missing('report')
        ->loadDeferredProps(['report'], fn (Assert $reload) => $reload
            ->where('report.summary.plays', 1)
            ->where('report.summary.answered', 5)
            ->where('report.summary.points', 30)
            ->has('report.games', 1)
            ->has('report.insights')));
});

it('marks no one online once the classroom ended', function (): void {
    $classroom = Classroom::factory()->ended()->create();
    ClassroomMember::factory()->create(['classroom_id' => $classroom->id, 'last_seen_at' => now(), 'current_game' => 'sky-quiz']);

    $this->actingAs($this->admin)->get("/admin/classrooms/{$classroom->id}")->assertInertia(fn (Assert $page) => $page
        ->where('classroom.status', 'ended')
        ->where('members.0.online', false)
        ->where('members.0.current_game', null));
});

it('returns 404 for a missing classroom', function (): void {
    $this->actingAs($this->admin)->get('/admin/classrooms/999999')->assertNotFound();
});
