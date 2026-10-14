<?php

use App\Models\Classroom;
use App\Models\ClassroomGame;
use App\Models\GameHistory;
use App\Models\Question;
use App\Models\QuestionAnswer;
use App\Models\User;
use Inertia\Testing\AssertableInertia as Assert;

beforeEach(function (): void {
    $this->student = User::factory()->create();
    $this->classroom = Classroom::factory()->create(['name' => 'Kelas Saya']);
    $this->member = $this->classroom->members()->create(['user_id' => $this->student->id, 'joined_at' => now()]);
    $game = ClassroomGame::query()->create(['classroom_id' => $this->classroom->id, 'game_key' => 'floor-drop', 'sort_order' => 0]);
    $this->picked = Question::factory()->create(['prompt_id' => 'Soal pilihan guru?', 'hint_id' => 'Penjelasan rahasia']);
    $this->unanswered = Question::factory()->create(['prompt_id' => 'Soal belum dijawab?']);
    $game->questions()->attach([$this->picked->id => ['sort_order' => 0], $this->unanswered->id => ['sort_order' => 1]]);

    $history = GameHistory::factory()->create([
        'user_id' => $this->student->id, 'game_key' => 'floor-drop', 'classroom_id' => $this->classroom->id,
        'points' => 40, 'correct' => 3, 'wrong' => 1,
    ]);
    QuestionAnswer::query()->create(['question_id' => $this->picked->id, 'game_history_id' => $history->id, 'game_key' => 'floor-drop', 'correct' => false, 'choice' => 2]);

    $other = User::factory()->create();
    $this->classroom->members()->create(['user_id' => $other->id, 'joined_at' => now()]);
    GameHistory::factory()->create(['user_id' => $other->id, 'game_key' => 'floor-drop', 'classroom_id' => $this->classroom->id, 'points' => 90, 'correct' => 5, 'wrong' => 0]);
});

it('lists only the classrooms the student joined with their own score', function (): void {
    Classroom::factory()->create(['name' => 'Kelas Orang Lain']);

    $this->actingAs($this->student)->get('/my-classrooms')
        ->assertOk()
        ->assertInertia(fn (Assert $page) => $page
            ->component('portal/my-classrooms', false)
            ->has('classrooms', 1)
            ->where('classrooms.0.classroom.name', 'Kelas Saya')
            ->where('classrooms.0.totals.points', 40)
            ->where('classrooms.0.totals.plays', 1)
            ->where('classrooms.0.totals.accuracy', 75)
            ->where('classrooms.0.totals.rank', 2)
            ->where('classrooms.0.totals.members', 2));
});

it('shows an empty list to a student without classrooms', function (): void {
    $this->actingAs(User::factory()->create())->get('/my-classrooms')
        ->assertOk()
        ->assertInertia(fn (Assert $page) => $page->has('classrooms', 0));
});

it('hides answer keys and unanswered questions while the classroom is active', function (): void {
    $this->actingAs($this->student)->get("/my-classrooms/{$this->member->id}")
        ->assertOk()
        ->assertInertia(fn (Assert $page) => $page
            ->component('portal/my-classroom', false)
            ->where('detail.answers_revealed', false)
            ->where('detail.totals.points', 40)
            ->where('detail.questions.total', 2)
            ->where('detail.questions.hidden', 1)
            ->has('detail.questions.items', 1)
            ->where('detail.questions.items.0.prompt_id', 'Soal pilihan guru?')
            ->where('detail.questions.items.0.answer', null)
            ->where('detail.questions.items.0.hint_id', null)
            ->where('detail.questions.items.0.mine.wrong', 1)
            ->where('detail.questions.items.0.mine.last_choice', 2)
            ->where('detail.review.0.correct_text', null)
            ->has('detail.games', 1)
            ->has('detail.recent_plays', 1));
});

it('reveals every question with answers after the classroom ended', function (): void {
    $this->classroom->update(['starts_at' => now()->subHours(3), 'ends_at' => now()->subHour()]);

    $this->actingAs($this->student)->get("/my-classrooms/{$this->member->id}")
        ->assertOk()
        ->assertInertia(fn (Assert $page) => $page
            ->where('detail.answers_revealed', true)
            ->has('detail.questions.items', 2)
            ->where('detail.questions.hidden', 0)
            ->where('detail.questions.items.0.answer', 0)
            ->where('detail.questions.items.0.hint_id', 'Penjelasan rahasia')
            ->where('detail.review.0.correct_text', 'Benar'));
});

it('shows the AI analysis only after the teacher shared the report', function (): void {
    $this->member->update(['ai_feedback' => 'Kamu hebat di matematika.']);

    $this->actingAs($this->student)->get("/my-classrooms/{$this->member->id}")
        ->assertInertia(fn (Assert $page) => $page->where('detail.ai_feedback', null)->where('detail.report_shared', false));

    $this->member->update(['report_shared_at' => now(), 'report' => ['teacher_note' => 'Pertahankan!']]);

    $this->actingAs($this->student)->get("/my-classrooms/{$this->member->id}")
        ->assertInertia(fn (Assert $page) => $page
            ->where('detail.report_shared', true)
            ->where('detail.teacher_note', 'Pertahankan!')
            ->has('detail.ai_feedback.strengths', 1));
});

it('keeps classrooms the student left visible', function (): void {
    $this->member->update(['left_at' => now()]);

    $this->actingAs($this->student)->get('/my-classrooms')
        ->assertInertia(fn (Assert $page) => $page->has('classrooms', 1)->where('classrooms.0.left', true));
});

it('does not show another student their classmate detail', function (): void {
    $this->actingAs(User::factory()->create())->get("/my-classrooms/{$this->member->id}")->assertNotFound();
});

it('requires login', function (): void {
    $this->get('/my-classrooms')->assertRedirect();
    $this->get("/my-classrooms/{$this->member->id}")->assertRedirect();
});
