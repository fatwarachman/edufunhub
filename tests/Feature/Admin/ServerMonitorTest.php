<?php

use App\Models\Role;
use App\Models\User;
use Illuminate\Support\Facades\Http;
use Inertia\Testing\AssertableInertia as Assert;

const MONITOR_GAME_SECRET = 'monitor-test-secret-with-32-chars!!';

beforeEach(function (): void {
    config([
        'scout.driver' => 'null',
        'game-service.secret' => MONITOR_GAME_SECRET,
        'monitoring.docker_url' => 'http://docker-proxy.test:2375',
        'monitoring.game_stats_url' => 'http://game.test:8090/internal/stats',
        'monitoring.cache_seconds' => 1,
    ]);
    $this->withoutVite();
    $this->superadmin = User::factory()->create(['is_superadmin' => true]);
});

/** @return array<string, mixed> */
function containerStats(int $cpuDelta, int $memoryUsage): array
{
    return [
        'cpu_stats' => ['cpu_usage' => ['total_usage' => 1_000 + $cpuDelta], 'system_cpu_usage' => 10_000, 'online_cpus' => 4],
        'precpu_stats' => ['cpu_usage' => ['total_usage' => 1_000], 'system_cpu_usage' => 8_000],
        'memory_stats' => ['usage' => $memoryUsage + 1_000, 'limit' => 8_000_000, 'stats' => ['inactive_file' => 1_000]],
        'networks' => ['eth0' => ['rx_bytes' => 500, 'tx_bytes' => 300]],
        'blkio_stats' => ['io_service_bytes_recursive' => [['op' => 'read', 'value' => 40], ['op' => 'write', 'value' => 60]]],
        'pids_stats' => ['current' => 7],
    ];
}

function fakeMonitorSources(): void
{
    Http::fake([
        'docker-proxy.test:2375/info' => Http::response(['Name' => 'mfrdev']),
        'docker-proxy.test:2375/containers/json*' => Http::response([
            ['Id' => str_repeat('a', 64), 'Names' => ['/edufunhub-app'], 'Image' => 'edufunhub-app:latest', 'State' => 'running', 'Status' => 'Up 2 hours', 'Labels' => ['com.docker.compose.service' => 'app']],
            ['Id' => str_repeat('b', 64), 'Names' => ['/edufunhub-game'], 'Image' => 'edufunhub-game:latest', 'State' => 'running', 'Status' => 'Up 2 hours', 'Labels' => ['com.docker.compose.service' => 'game']],
            ['Id' => str_repeat('c', 64), 'Names' => ['/edufunhub-old'], 'Image' => 'old:latest', 'State' => 'exited', 'Status' => 'Exited (0)', 'Labels' => []],
        ]),
        'docker-proxy.test:2375/containers/'.str_repeat('a', 64).'/stats*' => Http::response(containerStats(500, 2_000_000)),
        'docker-proxy.test:2375/containers/'.str_repeat('b', 64).'/stats*' => Http::response(containerStats(100, 4_000_000)),
        'game.test:8090/internal/stats' => Http::response([
            'service' => 'edufunhub-game', 'goroutines' => 12, 'heap_alloc_bytes' => 3_000_000,
            'games' => [['game' => 'flag-quest', 'connections' => 2, 'sessions' => 3], ['game' => 'sky-quiz', 'connections' => 1, 'sessions' => 1]],
        ]),
    ]);
}

test('only super admins can open the server monitor', function (): void {
    fakeMonitorSources();
    $admin = User::factory()->create();
    $admin->roles()->attach(Role::query()->firstOrCreate(['slug' => 'admin'], ['name' => 'Admin']));

    $this->get('/admin/server-monitor')->assertRedirect();
    $this->actingAs(User::factory()->create())->get('/admin/server-monitor')->assertForbidden();
    $this->actingAs($admin)->get('/admin/server-monitor')->assertForbidden();
    $this->actingAs($this->superadmin)->get('/admin/server-monitor')->assertOk();
});

test('server monitor reports host, per container usage and the game runtime', function (): void {
    fakeMonitorSources();

    $this->actingAs($this->superadmin)->get('/admin/server-monitor')
        ->assertOk()
        ->assertInertia(fn (Assert $page) => $page
            ->component('admin/server-monitor')
            ->where('monitor.host.available', true)
            ->where('monitor.host.hostname', 'mfrdev')
            ->has('monitor.host.memory.percent')
            ->where('monitor.containers.available', true)
            ->has('monitor.containers.items', 3)
            ->where('monitor.containers.items.0.name', 'edufunhub-game')
            ->where('monitor.containers.items.0.is_game', true)
            ->where('monitor.containers.items.0.cpu_percent', 20)
            ->where('monitor.containers.items.0.memory', ['total' => 8_000_000, 'used' => 4_000_000, 'percent' => 50])
            ->where('monitor.containers.items.0.network', ['rx_bytes' => 500, 'tx_bytes' => 300])
            ->where('monitor.containers.items.0.block', ['read_bytes' => 40, 'write_bytes' => 60])
            ->where('monitor.containers.items.0.pids', 7)
            ->where('monitor.containers.items.1.name', 'edufunhub-app')
            ->where('monitor.containers.items.1.cpu_percent', 100)
            ->where('monitor.containers.items.2.state', 'exited')
            ->where('monitor.containers.items.2.cpu_percent', null)
            ->where('monitor.game.available', true)
            ->where('monitor.game.games.0.connections', 2)
        );

    Http::assertSent(fn ($request) => $request->url() === 'http://game.test:8090/internal/stats'
        && hash_equals(hash_hmac('sha256', $request->header('X-Game-Timestamp')[0].'.', MONITOR_GAME_SECRET), $request->header('X-Game-Signature')[0]));
    Http::assertNotSent(fn ($request) => str_contains($request->url(), str_repeat('c', 64)));
});

test('server monitor degrades when docker and the game service are unreachable', function (): void {
    Http::fake(['*' => Http::failedConnection()]);

    $this->actingAs($this->superadmin)->get('/admin/server-monitor')
        ->assertOk()
        ->assertInertia(fn (Assert $page) => $page
            ->where('monitor.containers.available', false)
            ->where('monitor.containers.items', [])
            ->where('monitor.game.available', false)
            ->where('monitor.host.available', true)
            ->where('monitor.host.hostname', null)
        );
});
