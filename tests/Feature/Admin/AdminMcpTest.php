<?php

use App\Mcp\ApplicationKnowledge;
use App\Mcp\Resources\ApplicationContext;
use App\Mcp\Servers\AdminServer;
use App\Mcp\Tools\AdminContext;
use App\Mcp\Tools\AdminDataQuery;
use App\Models\GameHistory;
use App\Models\PlayerProfile;
use App\Models\Role;
use App\Models\User;
use App\Services\Ai\AdminAssistantData;
use Illuminate\Testing\TestResponse;
use Laravel\Mcp\Facades\Mcp;

beforeEach(function (): void {
    config(['scout.driver' => 'null']);
    $this->admin = User::factory()->superadmin()->create();
});

function adminMcpRpc(string $method, array $params = []): TestResponse
{
    return test()->postJson('/mcp/admin', ['jsonrpc' => '2.0', 'id' => 1, 'method' => $method, 'params' => (object) $params]);
}

it('initializes and discovers explicit safe schemas through HTTP', function (): void {
    $this->actingAs($this->admin);
    adminMcpRpc('initialize', ['protocolVersion' => '2025-11-25', 'capabilities' => (object) [], 'clientInfo' => ['name' => 'test', 'version' => '1.0']])
        ->assertOk()->assertJsonPath('result.serverInfo.name', 'EduFunHub Admin')->assertJsonPath('result.protocolVersion', '2025-11-25');
    $response = adminMcpRpc('tools/list')->assertOk()->assertJsonCount(2, 'result.tools');
    $tools = collect($response->json('result.tools'))->keyBy('name');
    expect($tools->keys()->all())->toBe(['admin-context', 'admin-data-query']);
    foreach ($tools as $tool) {
        expect($tool['annotations']['readOnlyHint'])->toBeTrue()
            ->and($tool['annotations']['openWorldHint'])->toBeFalse()
            ->and($tool['inputSchema']['additionalProperties'])->toBeFalse();
    }
    expect($tools['admin-data-query']['inputSchema']['properties']['operation']['enum'])->toBe(AdminAssistantData::OPERATIONS);
    expect($tools['admin-data-query']['inputSchema']['required'])->toBe(['operation']);
    expect(Mcp::getLocalServer('admin'))->toBeNull();
});

it('reads matching context via tool resource and server helpers', function (): void {
    $this->actingAs($this->admin);
    adminMcpRpc('resources/list')->assertOk()->assertJsonCount(1, 'result.resources')
        ->assertJsonPath('result.resources.0.uri', 'edufunhub://admin/application-context');
    $resource = adminMcpRpc('resources/read', ['uri' => 'edufunhub://admin/application-context'])->assertOk();
    expect(json_decode($resource->json('result.contents.0.text'), true))->toBe(ApplicationKnowledge::context());
    $tool = adminMcpRpc('tools/call', ['name' => 'admin-context', 'arguments' => (object) []])->assertOk()->assertJsonPath('result.isError', false);
    expect(json_decode($tool->json('result.content.0.text'), true))->toBe(ApplicationKnowledge::context());
    AdminServer::actingAs($this->admin)->tool(AdminContext::class)->assertOk()->assertSee('Go services');
    AdminServer::actingAs($this->admin)->resource(ApplicationContext::class)->assertOk()->assertSee('PointLedger');
});

it('denies unauthenticated unverified ordinary disabled and revoked users', function (): void {
    adminMcpRpc('tools/list')->assertUnauthorized();
    $ordinary = User::factory()->create();
    $ordinary->roles()->attach(Role::firstOrCreate(['slug' => 'admin'], ['name' => 'Admin']));
    foreach ([User::factory()->create(), $ordinary, User::factory()->superadmin()->unverified()->create()] as $user) {
        $this->actingAs($user);
        adminMcpRpc('tools/list')->assertForbidden();
    }
    $this->actingAs($this->admin);
    User::query()->whereKey($this->admin->id)->update(['is_superadmin' => false]);
    adminMcpRpc('resources/list')->assertForbidden();
    User::query()->whereKey($this->admin->id)->update(['is_superadmin' => true, 'disabled_at' => now()]);
    adminMcpRpc('tools/list')->assertForbidden();
});

it('rechecks authorization inside every handler without route middleware', function (string $state): void {
    if ($state === 'deleted') {
        $this->admin->delete();
    } else {
        User::query()->whereKey($this->admin->id)->update(match ($state) {
            'disabled' => ['disabled_at' => now()],
            'revoked' => ['is_superadmin' => false],
            'unverified' => ['email_verified_at' => null],
        });
    }
    AdminServer::actingAs($this->admin)->tool(AdminContext::class)->assertHasErrors();
    AdminServer::actingAs($this->admin)->tool(AdminDataQuery::class, ['operation' => 'catalog'])->assertHasErrors();
    AdminServer::actingAs($this->admin)->resource(ApplicationContext::class)->assertHasErrors();
})->with(['disabled', 'revoked', 'unverified', 'deleted']);

it('executes every allowlisted projection through HTTP', function (string $operation): void {
    $this->actingAs($this->admin);
    $args = ['operation' => $operation];
    if ($operation === 'player') {
        $args['user_id'] = $this->admin->id;
    }
    $response = adminMcpRpc('tools/call', ['name' => 'admin-data-query', 'arguments' => $args])->assertOk()->assertJsonPath('result.isError', false);
    $data = json_decode($response->json('result.content.0.text'), true);
    expect($data)->toHaveKeys(['data', 'range', 'queried_at', 'source']);
    expect($data['source']['url'])->toStartWith('/admin/');
})->with(AdminAssistantData::OPERATIONS);

it('validates tool inputs and never accepts arbitrary queries', function (array $arguments): void {
    $this->actingAs($this->admin);
    adminMcpRpc('tools/call', ['name' => 'admin-data-query', 'arguments' => $arguments])->assertOk()->assertJsonPath('result.isError', true);
})->with([
    [[]],
    [['operation' => 'sql']],
    [['operation' => 'players', 'sql' => 'SELECT * FROM users']],
    [['operation' => 'players', 'fields' => ['email']]],
    [['operation' => 'players', 'search' => 'a']],
    [['operation' => 'players', 'search' => str_repeat('x', 101)]],
    [['operation' => 'player']],
    [['operation' => 'player', 'user_id' => 0]],
    [['operation' => 'ads', 'user_id' => 1]],
    [['operation' => 'results', 'game' => 'unknown']],
    [['operation' => 'results', 'from' => '2026-13-50']],
    [['operation' => 'results', 'from' => '2026-10-09', 'to' => '2026-10-08']],
    [['operation' => 'results', 'from' => '2020-01-01', 'to' => '2026-10-08']],
]);

it('returns protocol errors for unknown tools resources and methods', function (): void {
    $this->actingAs($this->admin);
    adminMcpRpc('tools/call', ['name' => 'sql'])->assertJsonPath('error.code', -32602);
    adminMcpRpc('resources/read', ['uri' => 'file:///app/.env'])->assertJsonPath('error.code', -32002);
    adminMcpRpc('database/query')->assertJsonPath('error.code', -32601);
    adminMcpRpc('tools/call', ['name' => 'admin-context', 'arguments' => ['sql' => 'anything']])->assertJsonPath('result.isError', true);
});

it('returns bounded private-field-free data and accurate date-filtered results', function (): void {
    $this->actingAs($this->admin);
    $player = User::factory()->create(['name' => 'Unique learner', 'email' => 'private@example.test']);
    PlayerProfile::factory()->for($player)->create(['birth_date' => '2016-01-01']);
    User::factory()->count(21)->create(['name' => 'Unique learner']);
    $response = adminMcpRpc('tools/call', ['name' => 'admin-data-query', 'arguments' => ['operation' => 'players', 'search' => 'Unique']])->assertOk();
    $data = json_decode($response->json('result.content.0.text'), true);
    expect($data['data']['players'])->toHaveCount(20)->and($data['data']['has_more'])->toBeTrue();
    expect($response->getContent())->not->toContain('private@example.test', 'birth_date', 'password', 'remember_token', 'two_factor_secret');
    GameHistory::factory()->create(['user_id' => $player->id, 'game_key' => 'sky-quiz', 'points' => 7, 'played_at' => '2026-10-08 12:00:00']);
    GameHistory::factory()->create(['user_id' => $player->id, 'points' => 99, 'played_at' => '2026-10-07 12:00:00']);
    $response = adminMcpRpc('tools/call', ['name' => 'admin-data-query', 'arguments' => ['operation' => 'results', 'user_id' => $player->id, 'from' => '2026-10-08', 'to' => '2026-10-08']])->assertOk();
    $data = json_decode($response->json('result.content.0.text'), true);
    expect($data['data']['count'])->toBe(1)->and($data['data']['points'])->toBe(7);
    AdminServer::actingAs($this->admin)->tool(AdminDataQuery::class, ['operation' => 'player', 'user_id' => $player->id])->assertOk()->assertDontSee(['private@example.test', 'birth_date', 'password']);
});

it('retains session CSRF protection for HTTP clients', function (): void {
    $this->actingAs($this->admin);
    $this->app['env'] = 'local';
    try {
        adminMcpRpc('tools/list')->assertStatus(419);
        $this->withSession(['_token' => 'mcp-test-csrf'])->withHeader('X-CSRF-TOKEN', 'mcp-test-csrf');
        adminMcpRpc('tools/list')->assertOk();
    } finally {
        $this->app['env'] = 'testing';
    }
});

it('throttles authenticated protocol calls', function (): void {
    $this->actingAs($this->admin);
    for ($i = 0; $i < 60; $i++) {
        adminMcpRpc('ping')->assertOk();
    }
    adminMcpRpc('ping')->assertTooManyRequests();
});
