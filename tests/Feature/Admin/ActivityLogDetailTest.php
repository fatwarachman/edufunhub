<?php

use App\Models\Question;
use App\Models\User;
use Inertia\Testing\AssertableInertia as Assert;
use Spatie\Activitylog\Models\Activity;

beforeEach(function (): void {
    config(['scout.driver' => 'null']);
    $this->withoutVite();
    $this->admin = User::factory()->superadmin()->create();
});

it('names the updated user and lists the changed fields without secrets', function (): void {
    $user = User::factory()->create(['name' => 'Budi Santoso', 'locale' => 'id'])->fresh();

    $user->update(['locale' => 'en', 'bio' => 'Halo', 'password' => 'new-secret-password']);

    $this->actingAs($this->admin)->get('/admin/activity-log?event=updated')->assertOk()->assertInertia(fn (Assert $page) => $page
        ->component('admin/activity-log')
        ->where('logs.data.0.subject.type', 'User')
        ->where('logs.data.0.subject.name', 'Budi Santoso')
        ->where('logs.data.0.subject.detail', $user->email)
        ->where('logs.data.0.changed_fields', ['locale', 'bio'])
        ->missing('logs.data.0.diff')
        ->missing('logs.data.0.properties.attributes'));
});

it('names a deleted user from the stored snapshot', function (): void {
    $user = User::factory()->create(['name' => 'Rani Hilang', 'email' => 'rani@hilang.test']);
    $user->forceDelete();

    $this->actingAs($this->admin)->get('/admin/activity-log?event=deleted')->assertOk()->assertInertia(fn (Assert $page) => $page
        ->where('logs.data.0.subject.name', 'Rani Hilang')
        ->where('logs.data.0.subject.detail', 'rani@hilang.test')
        ->where('logs.data.0.subject.exists', false));
});

it('records the changed question fields when an admin edits a question', function (): void {
    $question = Question::factory()->create(['subject' => 'math', 'band' => 1, 'prompt_id' => 'Berapa 2 + 2?', 'answer' => 0]);

    $this->actingAs($this->admin)->put('/admin/questions/'.$question->id, [
        'type' => $question->type,
        'band' => 1,
        'subject' => 'math',
        'prompt_id' => 'Berapa 3 + 3?',
        'prompt_en' => $question->prompt_en,
        'options' => $question->options,
        'answer' => 1,
        'games' => $question->games,
        'is_active' => true,
    ])->assertRedirect();

    $entry = Activity::query()->where('description', 'Updated question')->sole();

    expect($entry->properties['old'])->toMatchArray(['prompt_id' => 'Berapa 2 + 2?', 'answer' => 0])
        ->and($entry->properties['attributes'])->toMatchArray(['prompt_id' => 'Berapa 3 + 3?', 'answer' => 1]);

    $this->actingAs($this->admin)->get('/admin/activity-log')->assertInertia(fn (Assert $page) => $page
        ->where('logs.data.0.subject.type', 'Question')
        ->where('logs.data.0.subject.name', 'Berapa 3 + 3?')
        ->where('logs.data.0.changed_fields', fn ($fields): bool => collect($fields)->contains('prompt_id') && collect($fields)->contains('answer')));

    $this->actingAs($this->admin)->getJson('/admin/activity-log/'.$entry->id)->assertOk()
        ->assertJsonPath('subject.url', '/admin/questions/'.$question->id)
        ->assertJsonFragment(['field' => 'answer', 'before' => 0, 'after' => 1, 'masked' => false]);
});

it('keeps the question name after it is deleted', function (): void {
    $question = Question::factory()->create(['prompt_id' => 'Ibu kota Indonesia?']);

    $this->actingAs($this->admin)->delete('/admin/questions/'.$question->id)->assertRedirect();

    $this->actingAs($this->admin)->get('/admin/activity-log')->assertInertia(fn (Assert $page) => $page
        ->where('logs.data.0.description', 'Deleted question')
        ->where('logs.data.0.subject.name', 'Ibu kota Indonesia?')
        ->where('logs.data.0.subject.exists', false));
});

it('returns the field diff and masks secrets on the detail endpoint', function (): void {
    $user = User::factory()->create(['name' => 'Sinta']);
    $entry = activity('user')->performedOn($user)->causedBy($this->admin)->event('updated')->withProperties([
        'old' => ['name' => 'Sinta Lama', 'password' => 'old-hash', 'two_factor_secret' => 'abc'],
        'attributes' => ['name' => 'Sinta', 'password' => 'new-hash', 'two_factor_secret' => 'def'],
        'ip_address' => '10.0.0.9',
        'device' => 'Chrome · Android',
        'settings' => ['api_key' => 'sk-live-123', 'base_url' => 'https://ai.test'],
    ])->log('updated');

    $response = $this->actingAs($this->admin)->getJson('/admin/activity-log/'.$entry->id)->assertOk()
        ->assertJsonPath('event', 'updated')
        ->assertJsonPath('causer.id', $this->admin->id)
        ->assertJsonPath('subject.name', 'Sinta')
        ->assertJsonPath('subject.url', '/admin/users/'.$user->id)
        ->assertJsonPath('ip_address', '10.0.0.9')
        ->assertJsonPath('device', 'Chrome · Android')
        ->assertJsonPath('changed_fields', ['name'])
        ->assertJsonFragment(['field' => 'name', 'before' => 'Sinta Lama', 'after' => 'Sinta', 'masked' => false])
        ->assertJsonFragment(['field' => 'password', 'before' => null, 'after' => null, 'masked' => true])
        ->assertJsonPath('extra.0.value.api_key', '••••••')
        ->assertJsonPath('extra.0.value.base_url', 'https://ai.test');

    expect($response->getContent())->not->toContain('old-hash')
        ->not->toContain('new-hash')
        ->not->toContain('sk-live-123')
        ->not->toContain('"abc"');
});

it('shows game results on the detail endpoint', function (): void {
    $player = User::factory()->create();
    $entry = activity('player')->causedBy($player)->performedOn($player)->event('game_finished')
        ->withProperties(['game_key' => 'sky-quiz', 'mission' => 'room', 'points' => 30, 'correct' => 3, 'wrong' => 1])
        ->log('Finished game');

    $this->actingAs($this->admin)->getJson('/admin/activity-log/'.$entry->id)->assertOk()
        ->assertJsonPath('properties.points', 30)
        ->assertJsonPath('properties.mission', 'room')
        ->assertJsonPath('diff', [])
        ->assertJsonPath('extra', []);
});

it('forbids the detail endpoint to non-admins', function (): void {
    $entry = activity()->log('Updated general settings');
    $player = User::factory()->create();

    $this->actingAs($player)->getJson('/admin/activity-log/'.$entry->id)->assertForbidden();
    auth()->logout();
    $this->getJson('/admin/activity-log/'.$entry->id)->assertUnauthorized();
});
