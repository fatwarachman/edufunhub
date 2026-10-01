<?php

return [
    'secret' => env('GAME_SERVICE_SECRET'),
    'public_ws_url' => env('GAME_SERVICE_PUBLIC_WS_URL', '/game-ws/ws'),
    'public_sky_ws_url' => env('GAME_SERVICE_PUBLIC_SKY_WS_URL', '/game-ws/sky'),
    'token_ttl' => (int) env('GAME_SERVICE_TOKEN_TTL', 900),
    'signature_tolerance' => (int) env('GAME_SERVICE_SIGNATURE_TOLERANCE', 300),
];
