<?php

return [

    /*
    |--------------------------------------------------------------------------
    | Healthy Daily Screen Time
    |--------------------------------------------------------------------------
    |
    | Minutes per day a player may spend in the app before the admin analytics
    | flag the day as over the limit. Healthy means under 5 hours per day.
    |
    */

    'daily_limit_minutes' => (int) env('SCREEN_TIME_DAILY_LIMIT_MINUTES', 300),

    /*
    |--------------------------------------------------------------------------
    | Reporting Timezone
    |--------------------------------------------------------------------------
    |
    | Day boundaries and the hour-of-day heatmap follow the players' local
    | time, not the server clock (UTC).
    |
    */

    'timezone' => env('SCREEN_TIME_TIMEZONE', 'Asia/Jakarta'),

    /*
    |--------------------------------------------------------------------------
    | Session Gap
    |--------------------------------------------------------------------------
    |
    | A beat continues the open session when the previous beat in the same
    | area arrived less than this many seconds ago; otherwise a new session
    | starts.
    |
    */

    'session_gap_seconds' => 120,

];
