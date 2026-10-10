<?php

use App\Models\DatabaseBackup;
use App\Models\Role;
use App\Models\Setting;
use App\Models\Subject;
use App\Models\User;
use App\Services\Backup\BackupRunner;
use App\Services\Backup\BackupSettings;
use App\Services\Backup\FtpConnection;
use App\Services\Backup\FtpUploader;
use Illuminate\Support\Facades\Crypt;
use Illuminate\Support\Facades\Storage;
use Inertia\Testing\AssertableInertia as Assert;
use Spatie\Activitylog\Models\Activity;

/** In-memory FTP server used instead of the curl uploader. */
class FakeFtpUploader implements FtpUploader
{
    /** @var array<string, string> */
    public array $files = [];

    public ?string $failWith = null;

    public function upload(FtpConnection $connection, string $localPath, string $filename): string
    {
        $this->guard();
        $this->files[$filename] = (string) file_get_contents($localPath);

        return $connection->remotePath($filename);
    }

    public function list(FtpConnection $connection): array
    {
        $this->guard();

        return array_keys($this->files);
    }

    public function delete(FtpConnection $connection, string $filename): void
    {
        $this->guard();
        unset($this->files[$filename]);
    }

    public function test(FtpConnection $connection): void
    {
        $this->guard();
    }

    private function guard(): void
    {
        if ($this->failWith !== null) {
            throw new RuntimeException($this->failWith);
        }
    }
}

beforeEach(function (): void {
    config(['scout.driver' => 'null', 'backup.queue_connection' => 'sync']);
    Storage::fake('local');
    $this->withoutVite();
    $this->ftp = new FakeFtpUploader;
    $this->app->instance(FtpUploader::class, $this->ftp);
    $this->admin = User::factory()->superadmin()->create();
});

/** @param  array<string, mixed>  $overrides */
function backupSettingsPayload(array $overrides = []): array
{
    return [
        'enabled' => true,
        'frequency' => 'daily',
        'time' => '02:00',
        'weekday' => 0,
        'destination' => 'local',
        'keep' => 7,
        'ftp_host' => '',
        'ftp_port' => 21,
        'ftp_username' => '',
        'ftp_password' => '',
        'ftp_directory' => '',
        'ftp_tls' => false,
        'ftp_passive' => true,
        ...$overrides,
    ];
}

function configureBackupFtp(): void
{
    app(BackupSettings::class)->save(backupSettingsPayload([
        'destination' => 'both', 'ftp_host' => 'ftp.example.test', 'ftp_username' => 'qa', 'ftp_password' => 'ftp-secret-123', 'ftp_directory' => 'efh',
    ]));
}

function gunzipBackup(DatabaseBackup $backup): string
{
    return (string) gzdecode(Storage::disk('local')->get($backup->disk_path));
}

test('only super admins can open and use the backups page', function (): void {
    $this->get('/admin/backups')->assertRedirect('/login');

    $admin = User::factory()->create();
    $admin->roles()->attach(Role::query()->firstOrCreate(['slug' => 'admin'], ['name' => 'Admin']));
    $this->actingAs($admin)->get('/admin/backups')->assertForbidden();
    $this->actingAs($admin)->post('/admin/backups', ['destination' => 'local'])->assertForbidden();
    $this->actingAs($admin)->put('/admin/backups/settings', backupSettingsPayload())->assertForbidden();
    $backup = DatabaseBackup::factory()->create();
    $this->actingAs($admin)->get("/admin/backups/{$backup->id}/download")->assertForbidden();
    $this->actingAs($admin)->delete("/admin/backups/{$backup->id}")->assertForbidden();

    $this->actingAs($this->admin)->get('/admin/backups')->assertOk()->assertInertia(fn (Assert $page) => $page
        ->component('admin/backups')
        ->has('backups', 1)
        ->where('settings.destination', 'local')
        ->where('settings.has_ftp_password', false)
        ->where('stats.running', false));
});

test('backup now writes a full gzip dump with schema and data', function (): void {
    Subject::factory()->create(['name_id' => "Matematika O'Brien"]);

    $this->actingAs($this->admin)->post('/admin/backups', ['destination' => 'local'])
        ->assertRedirect()->assertSessionHas('success');

    $backup = DatabaseBackup::query()->sole();
    expect($backup->status)->toBe(DatabaseBackup::SUCCESS)
        ->and($backup->filename)->toMatch(DatabaseBackup::FILENAME_PATTERN)
        ->and($backup->created_by)->toBe($this->admin->id)
        ->and($backup->trigger)->toBe(DatabaseBackup::MANUAL)
        ->and($backup->local_kept)->toBeTrue()
        ->and($backup->finished_at)->not->toBeNull();
    Storage::disk('local')->assertExists('backups/'.$backup->filename);
    expect($backup->size_bytes)->toBe(Storage::disk('local')->size($backup->disk_path))
        ->and($backup->checksum)->toBe(hash('sha256', Storage::disk('local')->get($backup->disk_path)));

    $sql = gunzipBackup($backup);
    expect($sql)->toContain('PRAGMA foreign_keys = OFF')
        ->toContain('CREATE TABLE "subjects"')
        ->toContain('CREATE TABLE "users"')
        ->toContain('INSERT INTO "subjects" VALUES')
        ->toContain("'Matematika O''Brien'")
        ->toContain('-- Dump completed');

    expect(Activity::query()->where('description', 'Started database backup')->where('causer_id', $this->admin->id)->exists())->toBeTrue();
});

test('the dump restores into an empty database with the same rows', function (): void {
    Subject::factory()->count(3)->create();
    $backup = app(BackupRunner::class)->run(app(BackupRunner::class)->start(DatabaseBackup::MANUAL, 'local'));

    $restore = new PDO('sqlite::memory:');
    $restore->exec(gunzipBackup($backup));

    expect((int) $restore->query('SELECT COUNT(*) FROM subjects')->fetchColumn())->toBe(Subject::query()->count())
        ->and((int) $restore->query('SELECT COUNT(*) FROM users')->fetchColumn())->toBe(User::query()->count());
});

test('a second backup is refused while one is running', function (): void {
    DatabaseBackup::factory()->running()->create(['created_at' => now()]);

    $this->actingAs($this->admin)->post('/admin/backups', ['destination' => 'local'])
        ->assertSessionHasErrors('backup');
    expect(DatabaseBackup::query()->count())->toBe(1);
});

test('ftp destinations need a configured server', function (): void {
    $this->actingAs($this->admin)->post('/admin/backups', ['destination' => 'ftp'])->assertSessionHasErrors('destination');
    $this->actingAs($this->admin)->post('/admin/backups', ['destination' => 'nas'])->assertSessionHasErrors('destination');
    expect(DatabaseBackup::query()->count())->toBe(0);
});

test('local retention keeps only the newest files', function (): void {
    app(BackupSettings::class)->save(backupSettingsPayload(['keep' => 2]));
    $kept = DatabaseBackup::factory()->create(['remote_uploaded' => true, 'filename' => 'edufunhub-db-20200101-000000.sql.gz', 'disk_path' => 'backups/edufunhub-db-20200101-000000.sql.gz']);
    $old = DatabaseBackup::factory()->count(3)->create();
    foreach ([$kept, ...$old] as $backup) {
        Storage::disk('local')->put($backup->disk_path, 'old');
    }

    $this->actingAs($this->admin)->post('/admin/backups', ['destination' => 'local']);

    $latest = DatabaseBackup::query()->latest('id')->first();
    expect(DatabaseBackup::query()->where('local_kept', true)->pluck('id')->all())->toEqualCanonicalizing([$latest->id, $old[2]->id]);
    Storage::disk('local')->assertMissing($old[0]->disk_path);
    Storage::disk('local')->assertMissing($old[1]->disk_path);
    expect(DatabaseBackup::query()->whereKey([$old[0]->id, $old[1]->id])->exists())->toBeFalse()
        ->and($kept->fresh()->local_kept)->toBeFalse();
    Storage::disk('local')->assertMissing($kept->disk_path);
});

test('both destination uploads to ftp and prunes old remote files', function (): void {
    configureBackupFtp();
    Setting::set('backup.keep', '2', BackupSettings::GROUP);
    $this->ftp->files = ['edufunhub-db-20200101-000000.sql.gz' => 'a', 'edufunhub-db-20200102-000000.sql.gz' => 'b', 'notes.txt' => 'keep me'];

    $this->actingAs($this->admin)->post('/admin/backups', ['destination' => 'both']);

    $backup = DatabaseBackup::query()->latest('id')->first();
    expect($backup->status)->toBe(DatabaseBackup::SUCCESS)
        ->and($backup->remote_uploaded)->toBeTrue()
        ->and($backup->remote_path)->toBe('efh/'.$backup->filename)
        ->and($backup->local_kept)->toBeTrue()
        ->and(array_keys($this->ftp->files))->toEqualCanonicalizing(['edufunhub-db-20200102-000000.sql.gz', $backup->filename, 'notes.txt'])
        ->and(gzdecode($this->ftp->files[$backup->filename]))->toContain('CREATE TABLE');
});

test('ftp only destination removes the local copy and failures are recorded', function (): void {
    configureBackupFtp();
    $this->actingAs($this->admin)->post('/admin/backups', ['destination' => 'ftp']);
    $backup = DatabaseBackup::query()->latest('id')->first();
    expect($backup->remote_uploaded)->toBeTrue()->and($backup->local_kept)->toBeFalse();
    Storage::disk('local')->assertMissing($backup->disk_path);

    $this->ftp->failWith = 'Could not connect';
    $this->actingAs($this->admin)->post('/admin/backups', ['destination' => 'both']);
    $failed = DatabaseBackup::query()->latest('id')->first();
    expect($failed->status)->toBe(DatabaseBackup::FAILED)
        ->and($failed->error)->toContain('Could not connect')
        ->and($failed->local_kept)->toBeTrue();
});

test('settings are validated and ftp fields are required for ftp destinations', function (): void {
    $this->actingAs($this->admin)->put('/admin/backups/settings', backupSettingsPayload(['destination' => 'ftp']))
        ->assertSessionHasErrors(['ftp_host', 'ftp_username', 'ftp_password']);
    $this->actingAs($this->admin)->put('/admin/backups/settings', backupSettingsPayload([
        'time' => '25:00', 'frequency' => 'hourly', 'keep' => 0, 'weekday' => 9, 'ftp_directory' => '../etc', 'ftp_host' => 'ftp://x',
    ]))->assertSessionHasErrors(['time', 'frequency', 'keep', 'weekday', 'ftp_directory', 'ftp_host']);

    $this->actingAs($this->admin)->put('/admin/backups/settings', backupSettingsPayload(['destination' => 'local']))
        ->assertSessionHasNoErrors();
    expect(Activity::query()->where('description', 'Updated backup settings')->exists())->toBeTrue();
});

test('the ftp password is stored encrypted and never sent to the browser', function (): void {
    $this->actingAs($this->admin)->put('/admin/backups/settings', backupSettingsPayload([
        'destination' => 'both', 'ftp_host' => 'ftp.example.test', 'ftp_username' => 'qa', 'ftp_password' => 'super-secret-ftp',
    ]))->assertSessionHasNoErrors();

    $stored = (string) Setting::query()->where('key', 'backup.ftp_password')->value('value');
    expect($stored)->not->toContain('super-secret-ftp')
        ->and(Crypt::decryptString($stored))->toBe('super-secret-ftp');

    $response = $this->actingAs($this->admin)->get('/admin/backups');
    expect($response->getContent())->not->toContain('super-secret-ftp');
    $response->assertInertia(fn (Assert $page) => $page->where('settings.has_ftp_password', true)->missing('settings.ftp_password'));
    expect(json_encode(Activity::query()->pluck('properties')))->not->toContain('super-secret-ftp');

    $this->actingAs($this->admin)->put('/admin/backups/settings', backupSettingsPayload([
        'destination' => 'both', 'ftp_host' => 'ftp.example.test', 'ftp_username' => 'qa', 'ftp_password' => '',
    ]))->assertSessionHasNoErrors();
    expect(app(BackupSettings::class)->ftpPassword())->toBe('super-secret-ftp');

    $this->actingAs($this->admin)->post('/admin/backups/test-ftp')->assertSessionHas('success');
    $this->ftp->failWith = 'The FTP server rejected the username or password.';
    $this->actingAs($this->admin)->post('/admin/backups/test-ftp')->assertSessionHasErrors('ftp');
});

test('the scheduled command runs once per slot and only when enabled', function (): void {
    $this->travelTo(now()->setTimezone(config('app.timezone'))->setDate(2026, 10, 5)->setTime(1, 59));
    app(BackupSettings::class)->save(backupSettingsPayload(['enabled' => false, 'time' => '02:00']));

    $this->artisan('backup:database --trigger=scheduled')->assertSuccessful();
    expect(DatabaseBackup::query()->count())->toBe(0);

    Setting::set('backup.enabled', '1', BackupSettings::GROUP);
    $this->artisan('backup:database --trigger=scheduled')->assertSuccessful();
    expect(DatabaseBackup::query()->count())->toBe(0);

    $this->travelTo(now()->setTime(2, 0));
    $this->artisan('backup:database --trigger=scheduled')->assertSuccessful();
    expect(DatabaseBackup::query()->where('trigger', DatabaseBackup::SCHEDULED)->count())->toBe(1);

    $this->travelTo(now()->setTime(2, 1));
    $this->artisan('backup:database --trigger=scheduled')->assertSuccessful();
    expect(DatabaseBackup::query()->count())->toBe(1);

    $this->travelTo(now()->setTime(5, 0));
    $this->artisan('backup:database --trigger=scheduled')->assertSuccessful();
    expect(DatabaseBackup::query()->count())->toBe(1);

    $this->travelTo(now()->addDay()->setTime(2, 3));
    $this->artisan('backup:database --trigger=scheduled')->assertSuccessful();
    expect(DatabaseBackup::query()->count())->toBe(2);

    Setting::set('backup.enabled', '0', BackupSettings::GROUP);
    $this->artisan('backup:database --trigger=scheduled --force')->assertSuccessful();
    expect(DatabaseBackup::query()->count())->toBe(3);
});

test('weekly schedule waits for the configured weekday', function (): void {
    app(BackupSettings::class)->save(backupSettingsPayload(['frequency' => 'weekly', 'weekday' => 3, 'time' => '23:30']));
    $settings = app(BackupSettings::class);

    $this->travelTo('2026-10-06 23:45:00');
    $this->artisan('backup:database --trigger=scheduled')->assertSuccessful();
    expect(DatabaseBackup::query()->count())->toBe(0)
        ->and($settings->nextRun(now())?->format('Y-m-d H:i'))->toBe('2026-10-07 23:30');

    $this->travelTo('2026-10-07 23:31:00');
    $this->artisan('backup:database --trigger=scheduled')->assertSuccessful();
    expect(DatabaseBackup::query()->count())->toBe(1)
        ->and($settings->nextRun(now())?->format('Y-m-d H:i'))->toBe('2026-10-14 23:30');
});

test('download streams the file by id only and logs it', function (): void {
    $backup = app(BackupRunner::class)->run(app(BackupRunner::class)->start(DatabaseBackup::MANUAL, 'local'));

    $response = $this->actingAs($this->admin)->get("/admin/backups/{$backup->id}/download");
    $response->assertOk()->assertDownload($backup->filename);
    expect(substr($response->streamedContent(), 0, 2))->toBe("\x1f\x8b");
    expect(Activity::query()->where('description', 'Downloaded database backup')->exists())->toBeTrue();

    $evil = DatabaseBackup::factory()->create(['filename' => '../../.env', 'disk_path' => '../../.env']);
    $this->actingAs($this->admin)->get("/admin/backups/{$evil->id}/download")->assertNotFound();
    $this->actingAs($this->admin)->get('/admin/backups/..%2F..%2F.env/download')->assertNotFound();
    $remoteOnly = DatabaseBackup::factory()->create(['local_kept' => false, 'remote_uploaded' => true]);
    $this->actingAs($this->admin)->get("/admin/backups/{$remoteOnly->id}/download")->assertNotFound();
});

test('delete removes the local file, optionally the remote copy, and the record', function (): void {
    configureBackupFtp();
    $backup = app(BackupRunner::class)->run(app(BackupRunner::class)->start(DatabaseBackup::MANUAL, 'both'));
    expect($this->ftp->files)->toHaveKey($backup->filename);

    $this->actingAs($this->admin)->delete("/admin/backups/{$backup->id}", ['remote' => true])->assertSessionHas('success');

    expect(DatabaseBackup::query()->whereKey($backup->id)->exists())->toBeFalse()
        ->and($this->ftp->files)->not->toHaveKey($backup->filename);
    Storage::disk('local')->assertMissing($backup->disk_path);
    expect(Activity::query()->where('description', 'Deleted database backup')->exists())->toBeTrue();

    $running = DatabaseBackup::factory()->running()->create(['created_at' => now()]);
    $this->actingAs($this->admin)->delete("/admin/backups/{$running->id}")->assertSessionHasErrors('backup');
    expect($running->fresh())->not->toBeNull();
});
