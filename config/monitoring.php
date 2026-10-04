<?php

return [
    /*
    | Read-only Docker Engine API, exposed through a socket proxy that only
    | allows GET /containers and /info. Never mount the raw socket into the app.
    */
    'docker_url' => env('MONITOR_DOCKER_URL', 'http://edufunhub-docker-proxy:2375'),

    /* Only containers of this Compose project are listed. */
    'compose_project' => env('MONITOR_COMPOSE_PROJECT', 'edufunhub'),

    /* Containers whose name contains one of these markers are tagged as game runtimes. */
    'game_containers' => array_filter(explode(',', (string) env('MONITOR_GAME_CONTAINERS', 'game'))),

    /* Signed runtime stats endpoint of the Go game service. */
    'game_stats_url' => env('MONITOR_GAME_STATS_URL', 'http://edufunhub-game:8090/internal/stats'),

    /* Host proc filesystem; containers share the kernel, so /proc reports the host. */
    'proc_path' => env('MONITOR_PROC_PATH', '/proc'),

    'disk_path' => env('MONITOR_DISK_PATH', '/'),

    'timeout' => (float) env('MONITOR_TIMEOUT', 3),

    'cache_seconds' => (int) env('MONITOR_CACHE_SECONDS', 5),
];
