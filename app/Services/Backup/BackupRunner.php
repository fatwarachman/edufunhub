<?php

namespace App\Services\Backup;

use App\Models\DatabaseBackup;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Storage;
use RuntimeException;
use Throwable;

/**
 * Runs one backup end to end: dump to the local disk, checksum, optional
 * FTP upload, then local and remote retention. Only one backup runs at a
 * time (cache lock shared by the queue job and the scheduler command).
 */
class BackupRunner
{
    public const LOCK = 'database-backup:run';

    public function __construct(
        private BackupSettings $settings,
        private FtpUploader $ftp,
        private DatabaseDumper $dumper,
    ) {}

    /** Create the record for a new run (status running). */
    public function start(string $trigger, string $destination, ?int $userId = null): DatabaseBackup
    {
        $filename = DatabaseBackup::newFilename();

        return DatabaseBackup::query()->create([
            'filename' => $filename,
            'disk_path' => DatabaseBackup::DIRECTORY.'/'.$filename,
            'destination' => $destination,
            'status' => DatabaseBackup::RUNNING,
            'trigger' => $trigger,
            'created_by' => $userId,
            'started_at' => now(),
        ]);
    }

    public function isRunning(): bool
    {
        DatabaseBackup::failStale();

        return DatabaseBackup::query()->running()->exists();
    }

    public function run(DatabaseBackup $backup): DatabaseBackup
    {
        $lock = Cache::lock(self::LOCK, DatabaseBackup::STALE_MINUTES * 60);
        if (! $lock->get()) {
            $backup->markFailed(__('backups.already_running'));

            return $backup;
        }

        try {
            $this->perform($backup);
        } catch (Throwable $exception) {
            report($exception);
            $backup->markFailed($exception->getMessage());
        } finally {
            $lock->release();
        }

        return $backup->refresh();
    }

    private function perform(DatabaseBackup $backup): void
    {
        if (! DatabaseBackup::validFilename($backup->filename)) {
            throw new RuntimeException('Invalid backup file name.');
        }

        $disk = Storage::disk('local');
        $disk->makeDirectory(DatabaseBackup::DIRECTORY);
        $relative = DatabaseBackup::DIRECTORY.'/'.$backup->filename;
        $path = $disk->path($relative);

        $backup->forceFill(['started_at' => $backup->started_at ?? now()])->save();
        $this->dumper->dump($path);
        $backup->forceFill([
            'disk_path' => $relative,
            'size_bytes' => (int) filesize($path),
            'checksum' => (string) hash_file('sha256', $path),
            'local_kept' => true,
        ])->save();

        $error = null;
        if (in_array($backup->destination, ['ftp', 'both'], true)) {
            $error = $this->upload($backup, $path);
        }

        if ($backup->destination === 'ftp' && $backup->remote_uploaded) {
            $disk->delete($relative);
            $backup->local_kept = false;
        }

        $backup->forceFill([
            'status' => $error === null ? DatabaseBackup::SUCCESS : DatabaseBackup::FAILED,
            'error' => $error,
            'finished_at' => now(),
        ])->save();

        $this->pruneLocal();
    }

    /** Upload and prune the remote directory; returns an error message or null. */
    private function upload(DatabaseBackup $backup, string $path): ?string
    {
        $connection = $this->settings->ftpConnection();
        if ($connection === null) {
            return __('backups.ftp.not_configured');
        }

        try {
            $remote = $this->ftp->upload($connection, $path, $backup->filename);
            $backup->forceFill(['remote_uploaded' => true, 'remote_path' => $remote])->save();
        } catch (RuntimeException $exception) {
            return __('backups.ftp.upload_failed', ['error' => $exception->getMessage()]);
        }

        try {
            $this->pruneRemote($connection);
        } catch (RuntimeException $exception) {
            report($exception);
        }

        return null;
    }

    /** Keep the newest N local files; older records without a remote copy are removed. */
    public function pruneLocal(): int
    {
        $keep = $this->settings->keep();
        $old = DatabaseBackup::query()
            ->where('local_kept', true)
            ->where('status', '!=', DatabaseBackup::RUNNING)
            ->orderByDesc('id')
            ->get()
            ->slice($keep);

        foreach ($old as $backup) {
            if (DatabaseBackup::validFilename($backup->filename)) {
                Storage::disk('local')->delete(DatabaseBackup::DIRECTORY.'/'.$backup->filename);
            }
            if ($backup->remote_uploaded) {
                $backup->forceFill(['local_kept' => false])->save();
            } else {
                $backup->delete();
            }
        }

        return $old->count();
    }

    /** Keep the newest N backup files in the remote directory. */
    public function pruneRemote(FtpConnection $connection): int
    {
        $files = collect($this->ftp->list($connection))
            ->filter(fn (string $name): bool => DatabaseBackup::validFilename($name))
            ->sortDesc()
            ->values();
        $old = $files->slice($this->settings->keep());

        foreach ($old as $name) {
            $this->ftp->delete($connection, $name);
        }

        if ($old->isNotEmpty()) {
            DatabaseBackup::query()->whereIn('filename', $old->all())->update(['remote_uploaded' => false]);
            DatabaseBackup::query()->whereIn('filename', $old->all())->where('local_kept', false)->delete();
        }

        return $old->count();
    }

    /** Remove a backup: local file, optionally the remote copy, then the record. */
    public function delete(DatabaseBackup $backup, bool $remote): ?string
    {
        $warning = null;
        if ($remote && $backup->remote_uploaded) {
            $connection = $this->settings->ftpConnection();
            try {
                if ($connection === null) {
                    throw new RuntimeException(__('backups.ftp.not_configured'));
                }
                $this->ftp->delete($connection, $backup->filename);
            } catch (RuntimeException $exception) {
                $warning = $exception->getMessage();
            }
        }

        if (DatabaseBackup::validFilename($backup->filename)) {
            Storage::disk('local')->delete(DatabaseBackup::DIRECTORY.'/'.$backup->filename);
        }
        $backup->delete();

        return $warning;
    }

    /** Whether a scheduled run should start now (enabled, slot reached, not yet done). */
    public function scheduledDue(): bool
    {
        if (! $this->settings->enabled()) {
            return false;
        }

        $slot = $this->settings->previousSlot(now());
        if ($slot->diffInMinutes(now(), true) > (int) config('backup.schedule_window_minutes', 60)) {
            return false;
        }

        return ! DatabaseBackup::query()
            ->where('trigger', DatabaseBackup::SCHEDULED)
            ->where('started_at', '>=', $slot->utc())
            ->exists();
    }
}
