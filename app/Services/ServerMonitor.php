<?php

namespace App\Services;

use Illuminate\Http\Client\Pool;
use Illuminate\Http\Client\Response;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Http;
use Throwable;

/**
 * Live resource usage for the super admin monitor: host CPU/memory/disk from
 * /proc, per-container usage from a read-only Docker API proxy and the Go
 * game runtime's own signed stats. Every source degrades independently:
 * an unreachable source yields `available: false` instead of an error page.
 */
class ServerMonitor
{
    public function __construct(private GameServiceSigner $signer) {}

    /**
     * @return array{host: array<string, mixed>, containers: array<string, mixed>, game: array<string, mixed>, sampled_at: string}
     */
    public function snapshot(): array
    {
        return Cache::remember('server-monitor.snapshot', max(1, (int) config('monitoring.cache_seconds')), fn (): array => [
            'host' => $this->host(),
            'containers' => $this->containers(),
            'game' => $this->gameRuntime(),
            'sampled_at' => now()->toIso8601String(),
        ]);
    }

    /** @return array<string, mixed> */
    public function host(): array
    {
        $proc = rtrim((string) config('monitoring.proc_path'), '/');
        $meminfo = $this->meminfo($proc.'/meminfo');

        if ($meminfo === null) {
            return ['available' => false];
        }

        $first = $this->cpuTimes($proc.'/stat');
        usleep(250_000);
        $second = $this->cpuTimes($proc.'/stat');
        $load = preg_split('/\s+/', trim((string) @file_get_contents($proc.'/loadavg'))) ?: [];
        $diskPath = (string) config('monitoring.disk_path');
        $diskTotal = @disk_total_space($diskPath) ?: 0;
        $diskFree = @disk_free_space($diskPath) ?: 0;
        $memTotal = $meminfo['MemTotal'] ?? 0;
        $memAvailable = $meminfo['MemAvailable'] ?? ($meminfo['MemFree'] ?? 0);
        $swapTotal = $meminfo['SwapTotal'] ?? 0;

        return [
            'available' => true,
            'hostname' => $this->hostname(),
            'cpus' => $this->cpuCount($proc.'/stat'),
            'cpu_percent' => $first !== null && $second !== null ? $this->cpuPercent($first, $second) : null,
            'load' => array_map('floatval', array_slice($load, 0, 3)),
            'uptime_seconds' => (int) (float) explode(' ', (string) @file_get_contents($proc.'/uptime'))[0],
            'memory' => $this->usage($memTotal, $memTotal - $memAvailable),
            'swap' => $this->usage($swapTotal, $swapTotal - ($meminfo['SwapFree'] ?? 0)),
            'disk' => $this->usage((int) $diskTotal, (int) ($diskTotal - $diskFree)),
        ];
    }

    /** @return array{available: bool, error?: string, items: list<array<string, mixed>>} */
    public function containers(): array
    {
        $base = rtrim((string) config('monitoring.docker_url'), '/');
        $project = (string) config('monitoring.compose_project');

        try {
            $list = Http::timeout((float) config('monitoring.timeout'))
                ->get($base.'/containers/json', [
                    'all' => 'true',
                    'filters' => json_encode(['label' => ['com.docker.compose.project='.$project]]),
                ])->throw()->json();
        } catch (Throwable $e) {
            return ['available' => false, 'error' => class_basename($e), 'items' => []];
        }

        $containers = collect(is_array($list) ? $list : [])->map(fn (array $c): array => [
            'id' => (string) $c['Id'],
            'name' => ltrim((string) ($c['Names'][0] ?? $c['Id']), '/'),
            'service' => (string) ($c['Labels']['com.docker.compose.service'] ?? ''),
            'image' => (string) ($c['Image'] ?? ''),
            'state' => (string) ($c['State'] ?? 'unknown'),
            'status' => (string) ($c['Status'] ?? ''),
        ]);

        $running = $containers->where('state', 'running')->values();
        $stats = $running->isEmpty() ? [] : Http::pool(fn (Pool $pool): array => $running
            ->map(fn (array $c) => $pool->as($c['id'])->timeout((float) config('monitoring.timeout'))
                ->get($base.'/containers/'.$c['id'].'/stats', ['stream' => 'false']))
            ->all());

        $items = $containers->map(function (array $container) use ($stats): array {
            $response = $stats[$container['id']] ?? null;
            $data = $response instanceof Response && $response->successful() ? (array) $response->json() : null;

            return [
                ...collect($container)->except('id')->all(),
                'id' => substr($container['id'], 0, 12),
                'is_game' => $this->isGame($container),
                ...$this->containerUsage($data),
            ];
        })->sortBy([['is_game', 'desc'], ['name', 'asc']])->values()->all();

        return ['available' => true, 'items' => $items];
    }

    /** @return array<string, mixed> */
    public function gameRuntime(): array
    {
        if (! $this->signer->isConfigured()) {
            return ['available' => false, 'error' => 'not_configured'];
        }

        $timestamp = (string) now()->getTimestamp();

        try {
            $data = Http::timeout((float) config('monitoring.timeout'))
                ->withHeaders([
                    'X-Game-Timestamp' => $timestamp,
                    'X-Game-Signature' => $this->signer->sign($timestamp, ''),
                ])
                ->get((string) config('monitoring.game_stats_url'))
                ->throw()->json();
        } catch (Throwable $e) {
            return ['available' => false, 'error' => class_basename($e)];
        }

        return ['available' => true, ...(array) $data];
    }

    /**
     * @param  array<string, mixed>|null  $stats
     * @return array<string, mixed>
     */
    private function containerUsage(?array $stats): array
    {
        if ($stats === null || empty($stats['memory_stats'])) {
            return ['cpu_percent' => null, 'memory' => null, 'network' => null, 'block' => null, 'pids' => null];
        }

        $cpuDelta = ($stats['cpu_stats']['cpu_usage']['total_usage'] ?? 0) - ($stats['precpu_stats']['cpu_usage']['total_usage'] ?? 0);
        $systemDelta = ($stats['cpu_stats']['system_cpu_usage'] ?? 0) - ($stats['precpu_stats']['system_cpu_usage'] ?? 0);
        $onlineCpus = (int) ($stats['cpu_stats']['online_cpus'] ?? count($stats['cpu_stats']['cpu_usage']['percpu_usage'] ?? [1]));
        $memory = $stats['memory_stats'];
        $cache = (int) ($memory['stats']['inactive_file'] ?? $memory['stats']['total_inactive_file'] ?? 0);
        $network = collect($stats['networks'] ?? []);
        $block = collect($stats['blkio_stats']['io_service_bytes_recursive'] ?? []);

        return [
            'cpu_percent' => $systemDelta > 0 && $cpuDelta >= 0 ? round($cpuDelta / $systemDelta * max(1, $onlineCpus) * 100, 1) : 0.0,
            'memory' => $this->usage((int) ($memory['limit'] ?? 0), max(0, (int) ($memory['usage'] ?? 0) - $cache)),
            'network' => [
                'rx_bytes' => (int) $network->sum('rx_bytes'),
                'tx_bytes' => (int) $network->sum('tx_bytes'),
            ],
            'block' => [
                'read_bytes' => (int) $block->filter(fn (array $row): bool => strtolower((string) $row['op']) === 'read')->sum('value'),
                'write_bytes' => (int) $block->filter(fn (array $row): bool => strtolower((string) $row['op']) === 'write')->sum('value'),
            ],
            'pids' => isset($stats['pids_stats']['current']) ? (int) $stats['pids_stats']['current'] : null,
        ];
    }

    /** @param  array{name: string, service: string, image: string}  $container */
    private function isGame(array $container): bool
    {
        foreach ((array) config('monitoring.game_containers') as $marker) {
            if ($container['service'] === $marker || str_contains($container['name'], '-'.$marker)) {
                return true;
            }
        }

        return false;
    }

    /** @return array{total: int, used: int, percent: ?float} */
    private function usage(int $total, int $used): array
    {
        return [
            'total' => $total,
            'used' => max(0, $used),
            'percent' => $total > 0 ? round(max(0, $used) / $total * 100, 1) : null,
        ];
    }

    /** @return array<string, int>|null  Values in bytes. */
    private function meminfo(string $path): ?array
    {
        $raw = @file_get_contents($path);
        if ($raw === false || $raw === '') {
            return null;
        }

        preg_match_all('/^(\w+):\s+(\d+)\s*kB/m', $raw, $matches, PREG_SET_ORDER);

        return collect($matches)->mapWithKeys(fn (array $m): array => [$m[1] => (int) $m[2] * 1024])->all();
    }

    /** @return array{idle: int, total: int}|null */
    private function cpuTimes(string $path): ?array
    {
        $line = strtok((string) @file_get_contents($path), "\n");
        if (! is_string($line) || ! str_starts_with($line, 'cpu ')) {
            return null;
        }

        $values = array_map('intval', array_slice(preg_split('/\s+/', trim($line)) ?: [], 1));

        return ['idle' => ($values[3] ?? 0) + ($values[4] ?? 0), 'total' => array_sum($values)];
    }

    /**
     * @param  array{idle: int, total: int}  $first
     * @param  array{idle: int, total: int}  $second
     */
    private function cpuPercent(array $first, array $second): ?float
    {
        $total = $second['total'] - $first['total'];

        return $total > 0 ? round((1 - ($second['idle'] - $first['idle']) / $total) * 100, 1) : null;
    }

    private function cpuCount(string $path): int
    {
        return max(1, preg_match_all('/^cpu\d+\s/m', (string) @file_get_contents($path)));
    }

    /** Host name from the Docker engine; a container's own hostname is just its ID. */
    private function hostname(): ?string
    {
        try {
            $name = Http::timeout((float) config('monitoring.timeout'))
                ->get(rtrim((string) config('monitoring.docker_url'), '/').'/info')
                ->throw()->json('Name');
        } catch (Throwable) {
            return null;
        }

        return is_string($name) ? $name : null;
    }
}
