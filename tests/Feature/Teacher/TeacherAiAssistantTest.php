<?php

use App\Ai\Agents\TeacherAssistant;
use App\Models\AgentConversation;
use App\Models\Classroom;
use App\Models\ClassroomMember;
use App\Models\User;
use App\Services\Ai\AiSettings;

beforeEach(function (): void {
    config(['scout.driver' => 'null']);
    $this->withoutVite();
    $this->teacher = User::factory()->teacher()->create();
    $this->otherTeacher = User::factory()->teacher()->create();
    app(AiSettings::class)->saveConnection('https://ai.invalid/v1', 'synthetic-test-key');
    app(AiSettings::class)->saveModel('synthetic-model');
});

it('renders teacher-only assistant and scopes context to owned classrooms', function (): void {
    $student = User::factory()->create(['name' => 'Own Student']);
    $owned = Classroom::factory()->for($this->teacher, 'teacher')->create(['name' => 'Own Class']);
    $other = Classroom::factory()->for($this->otherTeacher, 'teacher')->create(['name' => 'Other Class']);
    ClassroomMember::factory()->for($owned)->for($student, 'user')->create();

    TeacherAssistant::fake(['Teacher-scoped answer']);

    $this->actingAs($this->teacher)->get('/teacher/ai-assistant')
        ->assertOk()
        ->assertInertia(fn ($page) => $page->component('teacher/ai-assistant/index'));

    $this->actingAs($this->teacher)->postJson('/teacher/ai-assistant/messages', ['message' => 'Berapa nilai siswa di Own Class?'])
        ->assertOk()
        ->assertJsonPath('answer', 'Teacher-scoped answer');

    TeacherAssistant::assertPrompted(fn ($prompt): bool => str_contains($prompt->agent->instructions(), 'Own Class')
        && ! str_contains($prompt->agent->instructions(), 'Other Class'));
});

it('rejects non-teachers and isolates teacher conversation history', function (): void {
    TeacherAssistant::fake(['Jawaban']);
    $conversation = $this->actingAs($this->teacher)->postJson('/teacher/ai-assistant/messages', ['message' => 'Halo'])->assertOk()->json('conversation.id');

    $this->actingAs(User::factory()->create())->get('/teacher/ai-assistant')->assertForbidden();
    $this->actingAs($this->otherTeacher)->getJson("/teacher/ai-assistant/conversations/{$conversation}")->assertNotFound();
    expect(AgentConversation::query()->count())->toBe(1);
});

it('refuses unavailable provider without creating conversation', function (): void {
    app(AiSettings::class)->forgetKey();

    $this->actingAs($this->teacher)->postJson('/teacher/ai-assistant/messages', ['message' => 'Halo'])
        ->assertStatus(422);

    expect(AgentConversation::query()->count())->toBe(0);
});
