<?php

use App\Models\Question;
use App\Models\User;
use Inertia\Testing\AssertableInertia as Assert;

beforeEach(function (): void {
    config(['scout.driver' => 'null']);
    $this->withoutVite();
    $this->admin = User::factory()->superadmin()->create();
});

it('lists every AI-created question on one page without pagination', function (): void {
    Question::factory()->count(27)->create(['source' => Question::SOURCE_AI, 'is_active' => false]);
    Question::factory()->count(3)->create(['source' => 'admin']);

    $this->actingAs($this->admin)->get('/admin/questions?source=ai')->assertOk()->assertInertia(fn (Assert $page) => $page
        ->component('admin/questions/index')
        ->where('questions.total', 27)
        ->where('questions.last_page', 1)
        ->has('questions.data', 27));
});

it('keeps other question lists paginated', function (): void {
    Question::factory()->count(25)->create(['subject' => 'math']);

    $this->actingAs($this->admin)->get('/admin/questions?subject=math')->assertInertia(fn (Assert $page) => $page
        ->where('questions.per_page', 20)
        ->has('questions.data', 20));
});

it('activates and deactivates many questions at once', function (): void {
    $questions = Question::factory()->count(3)->create(['source' => Question::SOURCE_AI, 'is_active' => false]);
    $untouched = Question::factory()->create(['is_active' => false]);

    $this->actingAs($this->admin)->post('/admin/questions/bulk', ['action' => 'activate', 'ids' => $questions->pluck('id')->all()])
        ->assertRedirect()->assertSessionHas('success');

    expect(Question::query()->whereKey($questions->pluck('id'))->where('is_active', true)->count())->toBe(3)
        ->and($untouched->fresh()->is_active)->toBeFalse();

    $this->post('/admin/questions/bulk', ['action' => 'deactivate', 'ids' => [$questions[0]->id]])->assertSessionHas('success');

    expect($questions[0]->fresh()->is_active)->toBeFalse()->and($questions[1]->fresh()->is_active)->toBeTrue();
});

it('deletes many questions at once', function (): void {
    $questions = Question::factory()->count(2)->create();
    $kept = Question::factory()->create();

    $this->actingAs($this->admin)->post('/admin/questions/bulk', ['action' => 'delete', 'ids' => $questions->pluck('id')->all()])
        ->assertSessionHas('success');

    expect(Question::query()->whereKey($questions->pluck('id'))->exists())->toBeFalse()
        ->and($kept->fresh())->not->toBeNull();
});

it('rejects invalid bulk requests', function (array $payload, string $field): void {
    $question = Question::factory()->create();
    $payload['ids'] = array_map(fn ($id) => $id === 'real' ? $question->id : $id, $payload['ids'] ?? []);

    $this->actingAs($this->admin)->post('/admin/questions/bulk', $payload)->assertSessionHasErrors($field);
})->with([
    'unknown action' => [['action' => 'publish', 'ids' => ['real']], 'action'],
    'nothing selected' => [['action' => 'activate', 'ids' => []], 'ids'],
    'missing question' => [['action' => 'delete', 'ids' => [999999]], 'ids.0'],
]);

it('forbids bulk actions for non super admins', function (): void {
    $question = Question::factory()->create(['is_active' => false]);

    $this->actingAs(User::factory()->create())->post('/admin/questions/bulk', ['action' => 'activate', 'ids' => [$question->id]])
        ->assertForbidden();

    expect($question->fresh()->is_active)->toBeFalse();
});
