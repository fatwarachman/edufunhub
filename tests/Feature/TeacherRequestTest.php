<?php

use App\Models\Role;
use App\Models\TeacherRequest;
use App\Models\TeacherSubject;
use App\Models\User;
use Illuminate\Foundation\Http\Middleware\PreventRequestForgery;
use Inertia\Testing\AssertableInertia as Assert;

beforeEach(function (): void {
    $this->withoutVite();
});

test('player can request teacher access for one subject', function (): void {
    $user = User::factory()->create();

    $this->actingAs($user)->withoutMiddleware(PreventRequestForgery::class)->post('/teacher-request', [
        'subject_key' => 'math',
        'message' => 'Saya ingin mengajar matematika.',
    ])->assertRedirect(route('teacher-request.create'));

    $this->assertDatabaseHas('teacher_requests', [
        'user_id' => $user->id,
        'subject_key' => 'math',
        'status' => TeacherRequest::PENDING,
    ]);
});

test('superadmin approval assigns teacher role and selected subjects', function (): void {
    $user = User::factory()->create();
    $admin = User::factory()->superadmin()->create();
    $request = TeacherRequest::query()->create(['user_id' => $user->id, 'subject_key' => 'math', 'status' => TeacherRequest::PENDING]);

    $response = $this->actingAs($admin)->withoutMiddleware(PreventRequestForgery::class)->patch("/admin/teacher-requests/{$request->id}", [
        'status' => TeacherRequest::APPROVED,
        'subjects' => ['math', 'science'],
    ]);
    $response->assertRedirect();

    expect($user->fresh()->hasRole(Role::TEACHER))->toBeTrue();
    expect(TeacherSubject::query()->where('user_id', $user->id)->pluck('subject_key')->all())->toBe(['math', 'science']);
});

test('teacher question form only returns assigned subjects', function (): void {
    $teacher = User::factory()->teacher()->create();
    TeacherSubject::query()->create(['user_id' => $teacher->id, 'subject_key' => 'math']);

    $this->actingAs($teacher)->get('/teacher/questions/create')->assertInertia(fn (Assert $page) => $page
        ->where('subjects', ['math']));
});

test('teacher cannot create question outside assigned subjects', function (): void {
    $teacher = User::factory()->teacher()->create();
    TeacherSubject::query()->create(['user_id' => $teacher->id, 'subject_key' => 'math']);

    $this->actingAs($teacher)->withoutMiddleware(PreventRequestForgery::class)->post('/teacher/questions', [
        'type' => 'choice', 'grades' => [1], 'subject' => 'science', 'prompt_id' => 'Question', 'options' => [['id' => 'A'], ['id' => 'B'], ['id' => 'C']], 'answer' => 0, 'games' => ['flag-quest'], 'is_active' => true, 'level' => 1,
    ])->assertForbidden();
});
