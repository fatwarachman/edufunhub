<?php

return [
    // Shared HMAC secret with the Go chat service. Falls back to the game
    // secret so a fresh install needs no extra variable.
    'secret' => env('CHAT_SERVICE_SECRET') ?: env('GAME_SERVICE_SECRET'),
    'public_ws_url' => env('CHAT_SERVICE_PUBLIC_WS_URL', '/chat-ws/ws'),
    // Internal URL Laravel posts new messages to (fan-out to open sockets).
    'publish_url' => env('CHAT_SERVICE_PUBLISH_URL', 'http://edufunhub-chat:8091/internal/publish'),
    'token_ttl' => (int) env('CHAT_SERVICE_TOKEN_TTL', 3600),
    'timeout' => (float) env('CHAT_SERVICE_TIMEOUT', 2),
];
