<?php

return [
    'secret' => env('GAME_SERVICE_SECRET'),
    'public_ws_url' => env('GAME_SERVICE_PUBLIC_WS_URL', '/game-ws/ws'),
    'public_sky_ws_url' => env('GAME_SERVICE_PUBLIC_SKY_WS_URL', '/game-ws/sky'),
    'public_duel_ws_url' => env('GAME_SERVICE_PUBLIC_DUEL_WS_URL', '/game-ws/duel'),
    'public_train_ws_url' => env('GAME_SERVICE_PUBLIC_TRAIN_WS_URL', '/game-ws/train'),
    'public_snakes_ws_url' => env('GAME_SERVICE_PUBLIC_SNAKES_WS_URL', '/game-ws/snakes'),
    'public_crossword_ws_url' => env('GAME_SERVICE_PUBLIC_CROSSWORD_WS_URL', '/game-ws/crossword'),
    'token_ttl' => (int) env('GAME_SERVICE_TOKEN_TTL', 900),
    'signature_tolerance' => (int) env('GAME_SERVICE_SIGNATURE_TOLERANCE', 300),
];
