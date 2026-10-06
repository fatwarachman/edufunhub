<?php

return [
    'secret' => env('GAME_SERVICE_SECRET'),
    'public_ws_url' => env('GAME_SERVICE_PUBLIC_WS_URL', '/game-ws/ws'),
    'public_sky_ws_url' => env('GAME_SERVICE_PUBLIC_SKY_WS_URL', '/game-ws/sky'),
    'public_duel_ws_url' => env('GAME_SERVICE_PUBLIC_DUEL_WS_URL', '/game-ws/duel'),
    'public_train_ws_url' => env('GAME_SERVICE_PUBLIC_TRAIN_WS_URL', '/game-ws/train'),
    'public_port_sorter_ws_url' => env('GAME_SERVICE_PUBLIC_PORT_SORTER_WS_URL', '/game-ws/port-sorter'),
    'public_snakes_ws_url' => env('GAME_SERVICE_PUBLIC_SNAKES_WS_URL', '/game-ws/snakes'),
    'public_crossword_ws_url' => env('GAME_SERVICE_PUBLIC_CROSSWORD_WS_URL', '/game-ws/crossword'),
    // Room quiz games (market-math, number-garden, explore-indonesia, mini-lab): base + '/'.$game.
    'public_floor_drop_ws_url' => env('GAME_SERVICE_PUBLIC_FLOOR_DROP_WS_URL', '/game-ws/floor-drop'),
    'public_economy_heist_ws_url' => env('GAME_SERVICE_PUBLIC_ECONOMY_HEIST_WS_URL', '/game-ws/economy-heist'),
    'public_order_rush_ws_url' => env('GAME_SERVICE_PUBLIC_ORDER_RUSH_WS_URL', '/game-ws/order-rush'),
    'public_turbo_trivia_ws_url' => env('GAME_SERVICE_PUBLIC_TURBO_TRIVIA_WS_URL', '/game-ws/turbo-trivia'),
    'public_minigame_ws_base' => env('GAME_SERVICE_PUBLIC_MINIGAME_WS_BASE', '/game-ws'),
    /* Signed endpoint listing the rooms a player is seated in (portal "continue playing"). */
    'presence_url' => env('GAME_SERVICE_PRESENCE_URL', 'http://edufunhub-game:8090/internal/presence'),
    'presence_timeout' => (float) env('GAME_SERVICE_PRESENCE_TIMEOUT', 1.5),
    'token_ttl' => (int) env('GAME_SERVICE_TOKEN_TTL', 900),
    'signature_tolerance' => (int) env('GAME_SERVICE_SIGNATURE_TOLERANCE', 300),
];
