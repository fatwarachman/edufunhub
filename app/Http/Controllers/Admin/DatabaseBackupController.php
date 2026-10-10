<?php

namespace App\Http\Controllers\Admin;

use App\Http\Controllers\Controller;
use App\Http\Requests\Admin\BackupSettingsRequest;
use App\Http\Requests\Admin\StartBackupRequest;
use App\Jobs\RunDatabaseBackup;
use App\Models\DatabaseBackup;
use App\Services\Backup\BackupRunner;
use App\Services\Backup\BackupSettings;
use App\Services\Backup\FtpUploader;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Storage;
use Inertia\Inertia;
use Inertia\Response;
use RuntimeException;
use Symfony\Component\HttpFoundation\StreamedResponse;

/**
 * Full database backups: manual "Backup now", schedule + FTP settings,
 * history with download and delete.
 */
class DatabaseBackupController extends Controller
{
    public const HISTORY_LIMIT = 50;

    public function __construct(private BackupSettings $settings, private BackupRunner $runner) {}

    public function index(): Response
    {
        $running = $this->runner->isRunning();
        $lastSuccess = DatabaseBackup::query()->where('status', DatabaseBackup::SUCCESS)->latest('id')->first();

        return Inertia::render('admin/backups', [
            'settings' => $this->settings->toArray(),
            'backups' => DatabaseBackup::query()
                ->with('creator:id,name')
                ->latest('id')
                ->limit(self::HISTORY_LIMIT)
                ->get()
                ->map(fn (DatabaseBackup $backup): array => $backup->toAdminArray())
                ->all(),
            'stats' => [
                'count' => DatabaseBackup::query()->where('status', DatabaseBackup::SUCCESS)->count(),
                'local_bytes' => (int) DatabaseBackup::query()->where('local_kept', true)->sum('size_bytes'),
                'last_success_at' => $lastSuccess?->finished_at?->toIso8601String(),
                'next_run_at' => $this->settings->nextRun(now())?->toIso8601String(),
                'running' => $running,
            ],
            'timezone' => (string) config('app.timezone'),
        ]);
    }

    public function store(StartBackupRequest $request): RedirectResponse
    {
        $destination = (string) $request->validated('destination');
        if ($destination !== 'local' && ! $this->settings->ftpConfigured()) {
            return back()->withErrors(['destination' => __('backups.ftp.not_configured')]);
        }

        $lock = Cache::lock('database-backup:start', 10);
        if (! $lock->get()) {
            return back()->withErrors(['backup' => __('backups.already_running')]);
        }

        try {
            if ($this->runner->isRunning()) {
                return back()->withErrors(['backup' => __('backups.already_running')]);
            }
            $backup = $this->runner->start(DatabaseBackup::MANUAL, $destination, $request->user()->id);
        } finally {
            $lock->release();
        }

        activity()->causedBy($request->user())->performedOn($backup)
            ->withProperties(['filename' => $backup->filename, 'destination' => $destination])
            ->log('Started database backup');
        RunDatabaseBackup::dispatch($backup);

        return back()->with('success', __('backups.started'));
    }

    public function update(BackupSettingsRequest $request): RedirectResponse
    {
        $data = $request->validated();
        $this->settings->save($data);
        unset($data['ftp_password']);
        activity()->causedBy($request->user())->withProperties($data)->log('Updated backup settings');

        return back()->with('success', __('backups.settings_saved'));
    }

    public function test(Request $request, FtpUploader $ftp): RedirectResponse
    {
        $connection = $this->settings->ftpConnection();
        if ($connection === null) {
            return back()->withErrors(['ftp' => __('backups.ftp.not_configured')]);
        }

        try {
            $ftp->test($connection);
        } catch (RuntimeException $exception) {
            return back()->withErrors(['ftp' => $exception->getMessage()]);
        }
        activity()->causedBy($request->user())->withProperties(['host' => $connection->host])->log('Tested backup FTP connection');

        return back()->with('success', __('backups.ftp.ok', ['host' => $connection->host]));
    }

    public function forgetPassword(Request $request): RedirectResponse
    {
        $this->settings->forgetFtpPassword();
        activity()->causedBy($request->user())->log('Removed backup FTP password');

        return back()->with('success', __('backups.ftp.password_removed'));
    }

    public function download(Request $request, DatabaseBackup $backup): StreamedResponse
    {
        $path = DatabaseBackup::DIRECTORY.'/'.$backup->filename;
        abort_unless($backup->hasLocalFile() && Storage::disk('local')->exists($path), 404);

        activity()->causedBy($request->user())->performedOn($backup)
            ->withProperties(['filename' => $backup->filename])
            ->log('Downloaded database backup');

        return Storage::disk('local')->download($path, $backup->filename, ['Content-Type' => 'application/gzip']);
    }

    public function destroy(Request $request, DatabaseBackup $backup): RedirectResponse
    {
        if ($backup->status === DatabaseBackup::RUNNING && $backup->created_at?->gt(now()->subMinutes(DatabaseBackup::STALE_MINUTES))) {
            return back()->withErrors(['backup' => __('backups.still_running')]);
        }

        $remote = $request->boolean('remote');
        $properties = ['filename' => $backup->filename, 'remote' => $remote && $backup->remote_uploaded];
        $warning = $this->runner->delete($backup, $remote);
        activity()->causedBy($request->user())->withProperties($properties)->log('Deleted database backup');

        if ($warning !== null) {
            return back()->with('success', __('backups.deleted'))->withErrors(['ftp' => __('backups.remote_delete_failed', ['error' => $warning])]);
        }

        return back()->with('success', __('backups.deleted'));
    }
}
