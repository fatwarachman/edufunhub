<?php

namespace App\Services\Backup;

use Illuminate\Container\Attributes\Bind;
use RuntimeException;

/**
 * Remote FTP operations used by database backups. Implementations throw
 * RuntimeException with a readable (translated) message on failure.
 */
#[Bind(CurlFtpUploader::class)]
interface FtpUploader
{
    /** Upload a local file into the remote directory (created when missing); returns the remote path. */
    public function upload(FtpConnection $connection, string $localPath, string $filename): string;

    /**
     * File names in the remote directory.
     *
     * @return list<string>
     *
     * @throws RuntimeException
     */
    public function list(FtpConnection $connection): array;

    public function delete(FtpConnection $connection, string $filename): void;

    /** Log in, write and remove a small probe file. */
    public function test(FtpConnection $connection): void;
}
