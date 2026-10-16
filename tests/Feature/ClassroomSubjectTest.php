<?php

use App\Models\Classroom;
use App\Models\ClassroomGame;
use App\Models\PlayerProfile;
use App\Models\Question;
use App\Models\User;
use Inertia\Testing\AssertableInertia as Assert;

const CLASSROOM_SUBJECT_SECRET = 'classroom-subject-test-secret-32-chars!!';

beforeEach(function (): void {
    $this->withoutVite();
    config(['scout.driver' => 'null', 'game-service.secret' => CLASSROOM_SUBJECT_SECRET]);

    $this->teacher = User::factory()->teacher()->create();
    $this->student = User::factory()->create();
    PlayerProfile::factory()->for($this->student)->create(['grade' => 5]);
    $this->classroom = Classroom::factory()->create([
        'teacher_id' => $this->teacher->id,
        'pin' => '864213',
        'starts_at' => now()->subMinutes(10),
        'ends_at' => now()->addHour(),
    ]);
    $this->classroom->members()->create(['user_id' => $this->student->id, 'joined_at' => now()]);
});

/** @return array<string, mixed> */
function classroomSubjectPayload(array $games): array
{
    return [
        'name' => 'Kelas Mapel',
        'starts_at' => now()->addMinutes(10)->toIso8601String(),
        'duration_minutes' => 60,
        'max_members' => 30,
        'games' => $games,
    ];
}

/** @return array<string, mixed> */
function classroomSubjectBank(): array
{
    $timestamp = (string) now()->getTimestamp();

    return test()->withHeaders([
        'X-Game-Timestamp' => $timestamp,
        'X-Game-Signature' => hash_hmac('sha256', $timestamp.'.', CLASSROOM_SUBJECT_SECRET),
        'Accept' => 'application/json',
    ])->get('/api/internal/question-bank')->assertOk()->json();
}

it('stores the subjects a teacher picks for an auto-question game', function (): void {
    $this->actingAs($this->teacher)->post('/teacher/classrooms', classroomSubjectPayload([
        ['game_key' => 'sky-quiz', 'subjects' => ['science', 'math', 'math'], 'question_ids' => []],
        ['game_key' => 'flag-quest', 'question_ids' => []],
    ]))->assertSessionHasErrors('games.0.subjects.1');

    $this->actingAs($this->teacher)->post('/teacher/classrooms', classroomSubjectPayload([
        ['game_key' => 'sky-quiz', 'subjects' => ['science', 'math'], 'question_ids' => []],
        ['game_key' => 'flag-quest', 'question_ids' => []],
    ]))->assertRedirect()->assertSessionHasNoErrors();

    $classroom = Classroom::query()->where('name', 'Kelas Mapel')->firstOrFail();

    expect($classroom->games()->where('game_key', 'sky-quiz')->first()->subjects)->toBe(['math', 'science'])
        ->and($classroom->games()->where('game_key', 'flag-quest')->first()->subjects)->toBeNull();

    $this->actingAs($this->teacher)->get("/teacher/classrooms/{$classroom->id}/edit")
        ->assertInertia(fn (Assert $page) => $page
            ->where('classroom.games.0.subjects', ['math', 'science'])
            ->where('classroom.games.1.subjects', [])
        );
});

it('rejects unknown subjects', function (): void {
    $this->actingAs($this->teacher)->post('/teacher/classrooms', classroomSubjectPayload([
        ['game_key' => 'sky-quiz', 'subjects' => ['not-a-subject'], 'question_ids' => []],
    ]))->assertSessionHasErrors([
        'games.0.subjects.0' => __('classrooms.validation.subject_invalid'),
    ]);
});

it('updates the subjects on edit', function (): void {
    $classroom = Classroom::factory()->create(['teacher_id' => $this->teacher->id, 'starts_at' => now()->addHour(), 'ends_at' => now()->addHours(2)]);
    ClassroomGame::query()->create(['classroom_id' => $classroom->id, 'game_key' => 'sky-quiz', 'sort_order' => 0, 'subjects' => ['math']]);

    $this->actingAs($this->teacher)->put("/teacher/classrooms/{$classroom->id}", classroomSubjectPayload([
        ['game_key' => 'sky-quiz', 'subjects' => ['english'], 'question_ids' => []],
    ]))->assertRedirect()->assertSessionHasNoErrors();

    expect($classroom->games()->first()->subjects)->toBe(['english']);
});

it('shares the classroom subjects with the game page so the picker is locked', function (): void {
    ClassroomGame::query()->create(['classroom_id' => $this->classroom->id, 'game_key' => 'sky-quiz', 'sort_order' => 0, 'subjects' => ['science', 'math']]);

    $this->actingAs($this->student)->get('/games/sky-quiz')
        ->assertOk()
        ->assertInertia(fn (Assert $page) => $page
            ->where('gameReturn.href', '/portal/classrooms/864213')
            ->where('gameReturn.subjects', ['math', 'science'])
        );
});

it('shares an empty subject list for a mixed classroom game and none outside a classroom', function (): void {
    ClassroomGame::query()->create(['classroom_id' => $this->classroom->id, 'game_key' => 'sky-quiz', 'sort_order' => 0]);

    $this->actingAs($this->student)->get('/games/sky-quiz')
        ->assertInertia(fn (Assert $page) => $page->where('gameReturn.subjects', []));

    $this->actingAs($this->student)->get('/games/flag-quest')
        ->assertInertia(fn (Assert $page) => $page->where('gameReturn', null));
});

it('uses the picked questions subjects when the teacher picked questions', function (): void {
    $math = Question::factory()->create(['subject' => 'math', 'type' => Question::TYPE_CHOICE, 'is_active' => true]);
    $english = Question::factory()->create(['subject' => 'english', 'type' => Question::TYPE_CHOICE, 'is_active' => true]);
    $game = ClassroomGame::query()->create(['classroom_id' => $this->classroom->id, 'game_key' => 'sky-quiz', 'sort_order' => 0, 'subjects' => ['science']]);
    $game->questions()->sync([$math->id => ['sort_order' => 0], $english->id => ['sort_order' => 1]]);

    $this->actingAs($this->student)->get('/games/sky-quiz')
        ->assertInertia(fn (Assert $page) => $page->where('gameReturn.subjects', ['english', 'math']));
});

it('sends every open classroom game with its subjects to the game service', function (): void {
    ClassroomGame::query()->create(['classroom_id' => $this->classroom->id, 'game_key' => 'sky-quiz', 'sort_order' => 0, 'subjects' => ['math']]);
    ClassroomGame::query()->create(['classroom_id' => $this->classroom->id, 'game_key' => 'flag-quest', 'sort_order' => 1]);

    $bank = classroomSubjectBank();
    $classroom = collect($bank['classrooms'])->firstWhere('id', $this->classroom->id);

    expect($classroom)->not->toBeNull()
        ->and($classroom['games'])->toBe([
            ['game_key' => 'sky-quiz', 'subjects' => ['math'], 'questions' => []],
            ['game_key' => 'flag-quest', 'subjects' => [], 'questions' => []],
        ]);
});

it('changes the bank version when classroom subjects change', function (): void {
    $game = ClassroomGame::query()->create(['classroom_id' => $this->classroom->id, 'game_key' => 'sky-quiz', 'sort_order' => 0, 'subjects' => ['math']]);
    $before = classroomSubjectBank()['version'];

    $game->update(['subjects' => ['english']]);

    expect(classroomSubjectBank()['version'])->not->toBe($before);
});

it('renders the edit form with full picked questions and status', function (): void {
    $classroom = Classroom::factory()->create(['teacher_id' => $this->teacher->id, 'starts_at' => now()->addHour(), 'ends_at' => now()->addHours(2)]);
    $question = Question::factory()->create(['subject' => 'math', 'type' => Question::TYPE_CHOICE, 'is_active' => true, 'created_by' => $this->teacher->id]);
    $game = ClassroomGame::query()->create(['classroom_id' => $classroom->id, 'game_key' => 'sky-quiz', 'sort_order' => 0]);
    $game->questions()->sync([$question->id => ['sort_order' => 0]]);

    $this->actingAs($this->teacher)->get("/teacher/classrooms/{$classroom->id}/edit")
        ->assertOk()
        ->assertInertia(fn (Assert $page) => $page
            ->component('teacher/classrooms/form')
            ->where('classroom.status', 'scheduled')
            ->where('classroom.games.0.questions.0.id', $question->id)
            ->where('classroom.games.0.questions.0.subject', 'math')
            ->where('classroom.games.0.questions.0.is_mine', true)
            ->missing('classroom.games.0.question_ids')
        );
});

it('lets the teacher change subjects of a running classroom without moving its start', function (): void {
    $startsAt = now()->subMinutes(30)->startOfMinute();
    $classroom = Classroom::factory()->create(['teacher_id' => $this->teacher->id, 'starts_at' => $startsAt, 'ends_at' => $startsAt->copy()->addHours(2)]);
    ClassroomGame::query()->create(['classroom_id' => $classroom->id, 'game_key' => 'sky-quiz', 'sort_order' => 0, 'subjects' => ['science']]);

    $this->actingAs($this->teacher)->put("/teacher/classrooms/{$classroom->id}", [
        ...classroomSubjectPayload([['game_key' => 'sky-quiz', 'subjects' => ['math', 'science'], 'question_ids' => []]]),
        'starts_at' => $startsAt->toIso8601String(),
        'duration_minutes' => 120,
    ])->assertRedirect()->assertSessionHasNoErrors();

    $classroom->refresh();

    expect($classroom->games()->first()->subjects)->toBe(['math', 'science'])
        ->and($classroom->starts_at->equalTo($startsAt))->toBeTrue()
        ->and($classroom->ends_at->equalTo($startsAt->copy()->addHours(2)))->toBeTrue();
});

it('still rejects a past start for a scheduled classroom', function (): void {
    $classroom = Classroom::factory()->scheduled()->create(['teacher_id' => $this->teacher->id]);

    $this->actingAs($this->teacher)->put("/teacher/classrooms/{$classroom->id}", [
        ...classroomSubjectPayload([['game_key' => 'sky-quiz', 'question_ids' => []]]),
        'starts_at' => now()->subHour()->toIso8601String(),
    ])->assertSessionHasErrors('starts_at');
});
