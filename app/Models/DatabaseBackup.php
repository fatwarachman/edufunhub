<?php

namespace App\Models;

use Database\Factories\DatabaseBackupFactory;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Support\Carbon;
use Illuminate\Support\Str;

/**
 * One full database backup run (gzip SQL dump), kept on the local disk
 * and/or uploaded to the configured FTP server.
 *
 * @property int $id
 * @property string $filename
 * @property string $disk_path
 * @property ?int $size_bytes
 * @property ?string $checksum
 * @property string $destination
 * @property string $status
 * @property bool $local_kept
 * @property bool $remote_uploaded
 * @property ?string $remote_path
 * @property ?string $error
 * @property string $trigger
 * @property ?int $created_by
 * @property ?Carbon $started_at
 * @property ?Carbon $finished_at
 */
class DatabaseBackup extends Model
{
    /** @use HasFactory<DatabaseBackupFactory> */
    use HasFactory;

    public const RUNNING = 'running';

    public const SUCCESS = 'success';

    public const FAILED = 'failed';

    public const STATUSES = [self::RUNNING, self::SUCCESS, self::FAILED];

    public const DESTINATIONS = ['local', 'ftp', 'both'];

    public const MANUAL = 'manual';

    public const SCHEDULED = 'scheduled';

    /** Directory on the `local` disk (storage/app/private/backups). */
    public const DIRECTORY = 'backups';

    /** The only file names the app ever writes, reads or deletes. */
    public const FILENAME_PATTERN = '/^edufunhub-db-\d{8}-\d{6}\.sql\.gz$/';

    /** A running backup older than this is treated as lost (process died). */
    public const STALE_MINUTES = 120;

    /** @var list<string> */
    protected $fillable = [
        'filename', 'disk_path', 'size_bytes', 'checksum', 'destination', 'status', 'local_kept',
        'remote_uploaded', 'remote_path', 'error', 'trigger', 'created_by', 'started_at', 'finished_at',
    ];

    /** @var array<string, mixed> */
    protected $attributes = ['status' => self::RUNNING, 'destination' => 'local', 'trigger' => self::MANUAL];

    /** @return array<string, string> */
    protected function casts(): array
    {
        return [
            'size_bytes' => 'integer',
            'local_kept' => 'boolean',
            'remote_uploaded' => 'boolean',
            'started_at' => 'datetime',
            'finished_at' => 'datetime',
        ];
    }

    /** @return BelongsTo<User, $this> */
    public function creator(): BelongsTo
    {
        return $this->belongsTo(User::class, 'created_by');
    }

    /** @param  Builder<self>  $query */
    public function scopeRunning(Builder $query): void
    {
        $query->where('status', self::RUNNING)->where('created_at', '>=', now()->subMinutes(self::STALE_MINUTES));
    }

    public static function newFilename(): string
    {
        return 'edufunhub-db-'.now()->format('Ymd-His').'.sql.gz';
    }

    public static function validFilename(string $filename): bool
    {
        return preg_match(self::FILENAME_PATTERN, $filename) === 1;
    }

    /** Mark running rows left behind by a crashed process as failed. */
    public static function failStale(): void
    {
        static::query()->where('status', self::RUNNING)
            ->where('created_at', '<', now()->subMinutes(self::STALE_MINUTES))
            ->update(['status' => self::FAILED, 'error' => 'The backup process stopped before it finished.', 'finished_at' => now()]);
    }

    public function markFailed(string $message): void
    {
        $this->forceFill(['status' => self::FAILED, 'error' => Str::limit(trim($message), 1000), 'finished_at' => now()])->save();
    }

    public function hasLocalFile(): bool
    {
        return $this->local_kept && self::validFilename($this->filename);
    }

    /**
     * @return array{id: int, filename: string, size_bytes: ?int, checksum: ?string, destination: string, status: string, local_kept: bool, remote_uploaded: bool, remote_path: ?string, error: ?string, trigger: string, created_by: ?array{id: int, name: string}, started_at: ?string, finished_at: ?string, duration_seconds: ?int}
     */
    public function toAdminArray(): array
    {
        return [
            'id' => $this->id,
            'filename' => $this->filename,
            'size_bytes' => $this->size_bytes,
            'checksum' => $this->checksum,
            'destination' => $this->destination,
            'status' => $this->status,
            'local_kept' => $this->hasLocalFile(),
            'remote_uploaded' => $this->remote_uploaded,
            'remote_path' => $this->remote_path,
            'error' => $this->error,
            'trigger' => $this->trigger,
            'created_by' => $this->creator ? ['id' => $this->creator->id, 'name' => $this->creator->name] : null,
            'started_at' => $this->started_at?->toIso8601String(),
            'finished_at' => $this->finished_at?->toIso8601String(),
            'duration_seconds' => $this->started_at && $this->finished_at ? (int) $this->started_at->diffInSeconds($this->finished_at) : null,
        ];
    }
}
