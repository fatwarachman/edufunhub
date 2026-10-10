<?php

namespace App\Services\Backup;

/**
 * FTP / FTPS target for backups. The password is plain text only in memory;
 * it is stored encrypted by BackupSettings and never sent to the browser.
 */
final readonly class FtpConnection
{
    public function __construct(
        public string $host,
        public int $port,
        public string $username,
        public string $password,
        public string $directory = '',
        public bool $tls = false,
        public bool $passive = true,
    ) {}

    /** Remote directory without leading/trailing slashes ('' = login home). */
    public function directory(): string
    {
        return trim($this->directory, '/');
    }

    public function remotePath(string $filename): string
    {
        return ($this->directory() === '' ? '' : $this->directory().'/').$filename;
    }
}
