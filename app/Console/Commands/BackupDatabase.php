<?php

namespace App\Console\Commands;

use App\Models\DatabaseBackup;
use App\Services\Backup\BackupRunner;
use App\Services\Backup\BackupSettings;
use Illuminate\Console\Command;

/**
 * Full database backup. The scheduler calls it every minute with
 * --trigger=scheduled; it only runs when the schedule on /admin/backups is
 * enabled and the configured slot has been reached and not yet backed up.
 */
class BackupDatabase extends Command
{
    protected $signature = 'backup:database
        {--trigger=manual : manual or scheduled}
        {--destination= : local, ftp or both (default: the saved setting)}
        {--force : Run even when the schedule is disabled or not due}';

    protected $description = 'Create a full gzip SQL backup of the database (local disk and/or FTP)';

    public function handle(BackupRunner $runner, BackupSettings $settings): int
    {
        $trigger = $this->option('trigger') === DatabaseBackup::SCHEDULED ? DatabaseBackup::SCHEDULED : DatabaseBackup::MANUAL;
        $force = (bool) $this->option('force');

        if ($trigger === DatabaseBackup::SCHEDULED && ! $force) {
            if (! $settings->enabled()) {
                $this->line('Scheduled backups are disabled on /admin/backups.', verbosity: 'v');

                return self::SUCCESS;
            }
            if (! $runner->scheduledDue()) {
                $this->line('No scheduled backup is due.', verbosity: 'v');

                return self::SUCCESS;
            }
        }

        $destination = (string) ($this->option('destination') ?: $settings->destination());
        if (! in_array($destination, DatabaseBackup::DESTINATIONS, true)) {
            $this->components->error('Destination must be local, ftp or both.');

            return self::FAILURE;
        }

        if ($runner->isRunning()) {
            $this->components->warn('Another backup is still running.');

            return self::FAILURE;
        }

        $backup = $runner->run($runner->start($trigger, $destination));

        if ($backup->status !== DatabaseBackup::SUCCESS) {
            $this->components->error('Backup failed: '.$backup->error);

            return self::FAILURE;
        }

        $this->components->info(sprintf('Backup %s created (%s bytes, sha256 %s).', $backup->filename, number_format((int) $backup->size_bytes), $backup->checksum));

        return self::SUCCESS;
    }
}
