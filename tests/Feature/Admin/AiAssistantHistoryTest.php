<?php

use App\Ai\Agents\AdminAssistant;
use App\Models\AgentConversation;
use App\Models\AgentConversationMessage;
use App\Models\PlayerProfile;
use App\Models\PointLedger;
use App\Models\User;
use App\Services\Ai\AdminAssistantData;
use App\Services\Ai\AiSettings;
use Illuminate\Support\Facades\Http;
use Inertia\Testing\AssertableInertia as Assert;
use Laravel\Ai\Responses\Data\ToolCall;

beforeEach(function (): void {
    config(['scout.driver' => 'null']);
    $this->withoutVite();
    $this->admin = User::factory()->superadmin()->create();
    app(AiSettings::class)->saveConnection('https://ai.invalid/v1', 'synthetic-test-key');
    app(AiSettings::class)->saveModel('synthetic-model');
});

it('ranks top players by account points in one bounded query', function (): void {
    $top = User::factory()->create(['name' => 'Top learner', 'email' => 'top@example.test']);
    PlayerProfile::factory()->for($top)->create(['nickname' => 'Juara', 'birth_date' => '2015-01-01']);
    $second = User::factory()->create(['name' => 'Second learner']);
    $disabled = User::factory()->create(['name' => 'Disabled learner', 'disabled_at' => now()]);
    PointLedger::factory()->create(['user_id' => $top->id, 'points' => 900]);
    PointLedger::factory()->create(['user_id' => $top->id, 'points' => -100]);
    PointLedger::factory()->create(['user_id' => $second->id, 'points' => 500]);
    PointLedger::factory()->create(['user_id' => $disabled->id, 'points' => 9999]);
    $result = (new AdminAssistantData($this->admin))->query(['operation' => 'leaderboard']);
    expect($result['data']['scope'])->toBe('all_time')
        ->and($result['data']['players'][0]['player']['id'])->toBe($top->id)
        ->and($result['data']['players'][0]['net_points'])->toBe(800)
        ->and($result['data']['players'][0]['earned'])->toBe(900)
        ->and($result['data']['players'][1]['player']['id'])->toBe($second->id)
        ->and(collect($result['data']['players'])->pluck('player.id'))->not->toContain($disabled->id)
        ->and($result['source']['url'])->toBe('/admin/leaderboard');
    expect(json_encode($result))->not->toContain('top@example.test', 'birth_date');
});

it('saves conversations with sources and continues them from the server', function (): void {
    AdminAssistant::fake([new ToolCall('call-1', 'admin-data-query', ['operation' => 'leaderboard']), 'Pemain teratas **Juara**', 'Lanjutan jawaban']);
    $first = $this->actingAs($this->admin)->postJson('/admin/ai-assistant/messages', ['message' => 'Siapa pemain dengan poin tertinggi?'])
        ->assertOk()->assertJsonPath('sources.0.url', '/admin/leaderboard')->assertJsonStructure(['conversation' => ['id', 'title', 'updated_at']]);
    $id = $first->json('conversation.id');
    $this->postJson('/admin/ai-assistant/messages', ['message' => 'Lalu siapa kedua?', 'conversation_id' => $id])
        ->assertOk()->assertJsonPath('conversation.id', $id);
    AdminAssistant::assertPrompted(fn ($prompt): bool => $prompt->prompt === 'Lalu siapa kedua?' && $prompt->agent->currentConversation() === $id);
    expect(AgentConversation::query()->count())->toBe(1);
    $this->get('/admin/ai-assistant')->assertInertia(fn (Assert $page) => $page->has('conversations', 1)->where('conversations.0.id', $id));
    $this->getJson("/admin/ai-assistant/conversations/{$id}")
        ->assertOk()->assertJsonCount(4, 'messages')
        ->assertJsonPath('messages.0.role', 'user')
        ->assertJsonPath('messages.1.content', 'Pemain teratas **Juara**')
        ->assertJsonPath('messages.1.sources.0.url', '/admin/leaderboard')
        ->assertJsonPath('messages.0.sources', []);
});

it('isolates history between superadmins and rejects foreign conversation ids', function (): void {
    AdminAssistant::fake(['Jawaban']);
    $id = $this->actingAs($this->admin)->postJson('/admin/ai-assistant/messages', ['message' => 'Halo'])->json('conversation.id');
    $other = User::factory()->superadmin()->create();
    $this->actingAs($other)->getJson("/admin/ai-assistant/conversations/{$id}")->assertNotFound();
    $this->deleteJson("/admin/ai-assistant/conversations/{$id}")->assertNotFound();
    $this->postJson('/admin/ai-assistant/messages', ['message' => 'Halo', 'conversation_id' => $id])->assertNotFound();
    $this->get('/admin/ai-assistant')->assertInertia(fn (Assert $page) => $page->has('conversations', 0));
    $plain = User::factory()->create();
    $this->actingAs($plain)->getJson("/admin/ai-assistant/conversations/{$id}")->assertForbidden();
    $this->postJson('/admin/ai-assistant/messages', ['message' => 'Halo', 'conversation_id' => 'not-a-uuid'])->assertForbidden();
    $this->actingAs($this->admin)->postJson('/admin/ai-assistant/messages', ['message' => 'Halo', 'conversation_id' => 'not-a-uuid'])->assertJsonValidationErrors('conversation_id');
});

it('renames and deletes owned conversations including messages', function (): void {
    AdminAssistant::fake(['Jawaban']);
    $id = $this->actingAs($this->admin)->postJson('/admin/ai-assistant/messages', ['message' => 'Halo'])->json('conversation.id');
    $this->patchJson("/admin/ai-assistant/conversations/{$id}", ['title' => str_repeat('x', 101)])->assertJsonValidationErrors('title');
    $this->patchJson("/admin/ai-assistant/conversations/{$id}", ['title' => 'Analisa poin'])->assertOk()->assertJsonPath('conversation.title', 'Analisa poin');
    $this->deleteJson("/admin/ai-assistant/conversations/{$id}")->assertOk();
    expect(AgentConversation::query()->count())->toBe(0)->and(AgentConversationMessage::query()->count())->toBe(0);
});

it('sends saved conversation turns to the model when continuing', function (): void {
    Http::preventStrayRequests();
    Http::fake(['ai.invalid/*' => Http::sequence()
        ->push(['id' => 'a', 'model' => 'synthetic-model', 'choices' => [['message' => ['role' => 'assistant', 'content' => 'Jawaban pertama'], 'finish_reason' => 'stop']]])
        ->push(['id' => 'b', 'model' => 'synthetic-model', 'choices' => [['message' => ['role' => 'assistant', 'content' => 'Jawaban kedua'], 'finish_reason' => 'stop']]])]);
    $id = $this->actingAs($this->admin)->postJson('/admin/ai-assistant/messages', ['message' => 'Pertanyaan pertama'])->assertOk()->json('conversation.id');
    $this->postJson('/admin/ai-assistant/messages', ['message' => 'Pertanyaan kedua', 'conversation_id' => $id])->assertOk();
    $sent = collect(Http::recorded()[1][0]->data()['messages'])->pluck('content')->filter()->values()->all();
    expect($sent)->toContain('Pertanyaan pertama', 'Jawaban pertama', 'Pertanyaan kedua');
});

it('retries a transient provider overload once before answering', function (): void {
    Http::preventStrayRequests();
    Http::fake(['ai.invalid/*' => Http::sequence()
        ->push(['error' => ['message' => 'overloaded']], 503)
        ->push(['id' => 'ok', 'model' => 'synthetic-model', 'choices' => [['message' => ['role' => 'assistant', 'content' => 'Berhasil setelah retry'], 'finish_reason' => 'stop']]])]);
    $this->actingAs($this->admin)->postJson('/admin/ai-assistant/messages', ['message' => 'Halo'])
        ->assertOk()->assertJsonPath('answer', 'Berhasil setelah retry');
    Http::assertSentCount(2);
});

it('does not save a conversation when the provider fails', function (): void {
    AdminAssistant::fake(fn () => throw new RuntimeException('upstream'));
    $this->actingAs($this->admin)->postJson('/admin/ai-assistant/messages', ['message' => 'Halo'])->assertStatus(503);
    expect(AgentConversation::query()->count())->toBe(0);
});
