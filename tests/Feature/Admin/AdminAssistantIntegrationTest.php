<?php

use App\Ai\Agents\AdminAssistant;
use App\Mcp\AdminAssistantSession;
use App\Mcp\ApplicationKnowledge;
use App\Models\User;
use App\Services\Ai\AiSettings;
use Illuminate\Auth\Access\AuthorizationException;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Log;
use Laravel\Mcp\Request;
use Laravel\Mcp\Server\Methods\CallTool;

beforeEach(function (): void {
    config(['scout.driver' => 'null']);
    $this->admin = User::factory()->superadmin()->create();
});

it('dispatches real MCP tools with shared schemas and isolates actors sources and request bindings', function (): void {
    $this->actingAs(User::factory()->create());
    $session = new AdminAssistantSession($this->admin);
    $other = new AdminAssistantSession(User::factory()->superadmin()->create());
    $previous = new Request(['sentinel' => true]);
    app()->instance('mcp.request', $previous);
    $dispatcher = Mockery::mock(CallTool::class)->makePartial();
    $dispatcher->shouldReceive('handle')->times(3)->passthru();
    app()->instance(CallTool::class, $dispatcher);
    expect(json_decode($session->call('admin-context'), true))->toBe(ApplicationKnowledge::context());
    expect(json_decode($session->call('admin-data-query', ['operation' => 'results']), true)['data']['count'])->toBe(0);
    expect(app('mcp.request'))->toBe($previous)
        ->and($session->sources())->toHaveCount(1)
        ->and($other->sources())->toBe([]);
    expect(array_map(fn ($tool) => $tool->name(), (new AdminAssistant($session))->tools()))->toBe(['admin-context', 'admin-data-query']);
    User::query()->whereKey($this->admin->id)->update(['is_superadmin' => false]);
    expect(fn () => $session->call('admin-context'))->toThrow(AuthorizationException::class);
    expect($other->call('admin-context'))->toBeString();
});

it('does not attribute invalid MCP calls as successful retrievals', function (): void {
    $session = new AdminAssistantSession($this->admin);
    expect(json_decode($session->call('admin-data-query', ['operation' => 'sql']), true))->toHaveKey('error');
    expect($session->sources())->toBe([]);
    expect(app()->bound('mcp.request'))->toBeFalse();
});

it('keeps configured gateway alias across actual SDK tool continuations', function (): void {
    app(AiSettings::class)->saveConnection('https://ai.invalid/v1', 'synthetic-test-key');
    app(AiSettings::class)->saveModel('configured-alias');
    Http::preventStrayRequests();
    Http::fake(['ai.invalid/*' => Http::sequence()
        ->push(['id' => 'qa-first', 'model' => 'unroutable-upstream-model', 'choices' => [['message' => ['role' => 'assistant', 'content' => null, 'tool_calls' => [['id' => 'qa-call', 'type' => 'function', 'function' => ['name' => 'admin-data-query', 'arguments' => '{"operation":"results"}']]]], 'finish_reason' => 'tool_calls']]])
        ->push(['id' => 'qa-last', 'model' => 'unroutable-upstream-model', 'choices' => [['message' => ['role' => 'assistant', 'content' => 'Synthetic grounded answer'], 'finish_reason' => 'stop']]])]);
    $this->actingAs($this->admin)->postJson('/admin/ai-assistant/messages', ['message' => 'Synthetic results'])
        ->assertOk()->assertJsonPath('answer', 'Synthetic grounded answer')->assertJsonPath('sources.0.url', '/admin/games');
    Http::assertSentCount(2);
    foreach (Http::recorded() as [$request]) {
        expect($request['model'])->toBe('configured-alias');
    }
    $second = Http::recorded()[1][0]->data();
    $result = collect($second['messages'])->firstWhere('role', 'tool');
    expect(json_decode($result['content'], true)['data']['count'])->toBe(0);
});

it('logs only error class and reference without prompts or upstream payloads', function (): void {
    app(AiSettings::class)->saveConnection('https://ai.invalid/v1', 'synthetic-test-key');
    app(AiSettings::class)->saveModel('configured-alias');
    Log::spy();
    AdminAssistant::fake(fn () => throw new RuntimeException('SECRET UPSTREAM PAYLOAD'));
    $response = $this->actingAs($this->admin)->postJson('/admin/ai-assistant/messages', ['message' => 'PRIVATE PROMPT']);
    $response->assertStatus(503)->assertJsonStructure(['message', 'reference']);
    Log::shouldHaveReceived('warning')->once()->with('Admin assistant request failed', ['reference' => $response->json('reference'), 'exception_class' => RuntimeException::class]);
    expect($response->getContent())->not->toContain('SECRET', 'PRIVATE');
});
