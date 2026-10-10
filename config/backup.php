<?php

return [

    /*
    |--------------------------------------------------------------------------
    | Database backups (/admin/backups)
    |--------------------------------------------------------------------------
    |
    | Queue connection for the manual "Backup now" job. "background" runs the
    | job in a separate PHP process after the response, so no queue worker is
    | needed. Schedule, destination and FTP credentials are admin settings.
    |
    */

    'queue_connection' => env('BACKUP_QUEUE_CONNECTION', 'background'),

    // Rows exported per SELECT while dumping a table.
    'chunk_size' => (int) env('BACKUP_CHUNK_SIZE', 1000),

    // FTP connect / total transfer timeouts in seconds.
    'ftp_connect_timeout' => (int) env('BACKUP_FTP_CONNECT_TIMEOUT', 15),
    'ftp_timeout' => (int) env('BACKUP_FTP_TIMEOUT', 900),

    // A scheduled run missed by more than this many minutes is skipped.
    'schedule_window_minutes' => (int) env('BACKUP_SCHEDULE_WINDOW_MINUTES', 60),

];
