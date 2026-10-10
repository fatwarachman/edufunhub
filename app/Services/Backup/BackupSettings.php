<?php

namespace App\Services\Backup;

use App\Models\Setting;
use Carbon\CarbonImmutable;
use Carbon\CarbonInterface;
use Illuminate\Support\Facades\Crypt;
use Throwable;

/**
 * Backup schedule, destination, retention and FTP target managed on
 * /admin/backups. Stored in the `settings` table; the FTP password is
 * encrypted and never sent back to the browser.
 */
class BackupSettings
{
    public const GROUP = 'backup';

    public const FREQUENCIES = ['daily', 'weekly'];

    public const DEFAULT_KEEP = 7;

    public function enabled(): bool
    {
        return (bool) Setting::get('backup.enabled', false);
    }

    public function frequency(): string
    {
        $frequency = (string) Setting::get('backup.frequency', 'daily');

        return in_array($frequency, self::FREQUENCIES, true) ? $frequency : 'daily';
    }

    /** Time of day (HH:MM) in the app timezone. */
    public function time(): string
    {
        $time = (string) Setting::get('backup.time', '02:00');

        return preg_match('/^([01]\d|2[0-3]):[0-5]\d$/', $time) === 1 ? $time : '02:00';
    }

    /** 0 = Sunday … 6 = Saturday (used by the weekly schedule). */
    public function weekday(): int
    {
        return max(0, min(6, (int) Setting::get('backup.weekday', 0)));
    }

    public function destination(): string
    {
        $destination = (string) Setting::get('backup.destination', 'local');

        return in_array($destination, ['local', 'ftp', 'both'], true) ? $destination : 'local';
    }

    public function keep(): int
    {
        return max(1, min(100, (int) Setting::get('backup.keep', self::DEFAULT_KEEP)));
    }

    public function ftpHost(): string
    {
        return (string) Setting::get('backup.ftp_host', '');
    }

    public function ftpPort(): int
    {
        return (int) Setting::get('backup.ftp_port', 21) ?: 21;
    }

    public function ftpUsername(): string
    {
        return (string) Setting::get('backup.ftp_username', '');
    }

    public function ftpPassword(): ?string
    {
        $encrypted = (string) Setting::get('backup.ftp_password', '');
        if ($encrypted === '') {
            return null;
        }

        try {
            return Crypt::decryptString($encrypted);
        } catch (Throwable) {
            return null;
        }
    }

    public function hasFtpPassword(): bool
    {
        return $this->ftpPassword() !== null;
    }

    public function ftpDirectory(): string
    {
        return (string) Setting::get('backup.ftp_directory', '');
    }

    public function ftpTls(): bool
    {
        return (bool) Setting::get('backup.ftp_tls', false);
    }

    public function ftpPassive(): bool
    {
        return (bool) Setting::get('backup.ftp_passive', true);
    }

    public function ftpConfigured(): bool
    {
        return $this->ftpHost() !== '' && $this->ftpUsername() !== '' && $this->hasFtpPassword();
    }

    public function ftpConnection(): ?FtpConnection
    {
        if (! $this->ftpConfigured()) {
            return null;
        }

        return new FtpConnection($this->ftpHost(), $this->ftpPort(), $this->ftpUsername(), (string) $this->ftpPassword(), $this->ftpDirectory(), $this->ftpTls(), $this->ftpPassive());
    }

    /**
     * Save validated settings. An empty password keeps the saved one.
     *
     * @param  array<string, mixed>  $data
     */
    public function save(array $data): void
    {
        Setting::set('backup.enabled', $data['enabled'] ? '1' : '0', self::GROUP);
        Setting::set('backup.frequency', (string) $data['frequency'], self::GROUP);
        Setting::set('backup.time', (string) $data['time'], self::GROUP);
        Setting::set('backup.weekday', (string) (int) ($data['weekday'] ?? 0), self::GROUP);
        Setting::set('backup.destination', (string) $data['destination'], self::GROUP);
        Setting::set('backup.keep', (string) (int) $data['keep'], self::GROUP);
        Setting::set('backup.ftp_host', trim((string) ($data['ftp_host'] ?? '')), self::GROUP);
        Setting::set('backup.ftp_port', (string) (int) ($data['ftp_port'] ?? 21), self::GROUP);
        Setting::set('backup.ftp_username', (string) ($data['ftp_username'] ?? ''), self::GROUP);
        Setting::set('backup.ftp_directory', trim((string) ($data['ftp_directory'] ?? ''), '/ '), self::GROUP);
        Setting::set('backup.ftp_tls', ! empty($data['ftp_tls']) ? '1' : '0', self::GROUP);
        Setting::set('backup.ftp_passive', ! empty($data['ftp_passive']) ? '1' : '0', self::GROUP);
        if (isset($data['ftp_password']) && $data['ftp_password'] !== '') {
            Setting::set('backup.ftp_password', Crypt::encryptString((string) $data['ftp_password']), self::GROUP);
        }
    }

    public function forgetFtpPassword(): void
    {
        Setting::set('backup.ftp_password', '', self::GROUP);
    }

    /** Most recent scheduled slot at or before `$now` (app timezone). */
    public function previousSlot(CarbonInterface $now): CarbonImmutable
    {
        $local = CarbonImmutable::instance($now)->setTimezone((string) config('app.timezone'));
        [$hour, $minute] = array_map('intval', explode(':', $this->time()));
        $slot = $local->setTime($hour, $minute);

        if ($this->frequency() === 'weekly') {
            $slot = $slot->subDays(($slot->dayOfWeek - $this->weekday() + 7) % 7);
            if ($slot->greaterThan($local)) {
                $slot = $slot->subWeek();
            }
        } elseif ($slot->greaterThan($local)) {
            $slot = $slot->subDay();
        }

        return $slot;
    }

    /** Next scheduled slot strictly after `$now`, or null when disabled. */
    public function nextRun(CarbonInterface $now): ?CarbonImmutable
    {
        if (! $this->enabled()) {
            return null;
        }

        return $this->previousSlot($now)->add($this->frequency() === 'weekly' ? '1 week' : '1 day');
    }

    /** @return array<string, mixed> */
    public function toArray(): array
    {
        return [
            'enabled' => $this->enabled(),
            'frequency' => $this->frequency(),
            'time' => $this->time(),
            'weekday' => $this->weekday(),
            'destination' => $this->destination(),
            'keep' => $this->keep(),
            'ftp_host' => $this->ftpHost(),
            'ftp_port' => $this->ftpPort(),
            'ftp_username' => $this->ftpUsername(),
            'ftp_directory' => $this->ftpDirectory(),
            'ftp_tls' => $this->ftpTls(),
            'ftp_passive' => $this->ftpPassive(),
            'has_ftp_password' => $this->hasFtpPassword(),
        ];
    }
}
