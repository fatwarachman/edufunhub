<?php

namespace App\Jobs;

use App\Models\DatabaseBackup;
use App\Services\Backup\BackupRunner;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Queue\Queueable;
use Throwable;

/**
 * Runs a manual database backup outside the request ("Backup now").
 */
class RunDatabaseBackup implements ShouldQueue
{
    use Queueable;

    public int $tries = 1;

    public int $timeout = 3600;

    public function __construct(public DatabaseBackup $backup)
    {
        $this->onConnection(config('backup.queue_connection'));
        $this->onQueue('low');
    }

    public function handle(BackupRunner $runner): void
    {
        $backup = $this->backup->fresh();
        if ($backup === null || $backup->status !== DatabaseBackup::RUNNING) {
            return;
        }

        $runner->run($backup);
    }

    public function failed(?Throwable $exception): void
    {
        $this->backup->fresh()?->markFailed($exception?->getMessage() ?? 'Backup failed.');
    }
}
