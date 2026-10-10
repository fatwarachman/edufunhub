<?php

namespace App\Services\Backup;

use CurlHandle;
use Illuminate\Support\Str;
use RuntimeException;

/**
 * FTP / explicit FTPS client on PHP curl (no ftp extension or Flysystem
 * adapter is installed in the app image).
 */
class CurlFtpUploader implements FtpUploader
{
    /** libcurl error codes (not all are exported as PHP constants). */
    private const RESOLVE_FAILED = 6;

    private const CONNECT_FAILED = 7;

    private const REMOTE_ACCESS_DENIED = 9;

    private const QUOTE_FAILED = 21;

    private const UPLOAD_FAILED = 25;

    private const TIMED_OUT = 28;

    private const TLS_HANDSHAKE_FAILED = 35;

    private const TLS_VERIFY_FAILED = 60;

    private const TLS_REQUIRED_FAILED = 64;

    private const LOGIN_DENIED = 67;

    public function upload(FtpConnection $connection, string $localPath, string $filename): string
    {
        $handle = fopen($localPath, 'rb');
        if ($handle === false) {
            throw new RuntimeException(__('backups.local_missing'));
        }

        try {
            $curl = $this->handle($connection, $this->url($connection, $filename));
            curl_setopt_array($curl, [
                CURLOPT_UPLOAD => true,
                CURLOPT_INFILE => $handle,
                CURLOPT_INFILESIZE => (int) filesize($localPath),
                CURLOPT_FTP_CREATE_MISSING_DIRS => CURLFTP_CREATE_DIR_RETRY,
            ]);
            $this->execute($curl, $connection);
        } finally {
            fclose($handle);
        }

        return $connection->remotePath($filename);
    }

    public function list(FtpConnection $connection): array
    {
        $curl = $this->handle($connection, $this->url($connection, null));
        curl_setopt($curl, CURLOPT_DIRLISTONLY, true);
        $output = (string) $this->execute($curl, $connection);

        return array_values(array_filter(
            array_map(fn (string $line): string => basename(trim($line)), preg_split('/\r?\n/', $output) ?: []),
            fn (string $name): bool => $name !== '' && $name !== '.' && $name !== '..',
        ));
    }

    public function delete(FtpConnection $connection, string $filename): void
    {
        $curl = $this->handle($connection, 'ftp://'.$connection->host.':'.$connection->port.'/');
        curl_setopt_array($curl, [
            CURLOPT_QUOTE => ['DELE '.$connection->remotePath(basename($filename))],
            CURLOPT_NOBODY => true,
        ]);
        $this->execute($curl, $connection);
    }

    public function test(FtpConnection $connection): void
    {
        $probe = '.edufunhub-probe-'.Str::lower(Str::random(10)).'.txt';
        $path = tempnam(sys_get_temp_dir(), 'efh-ftp');
        if ($path === false) {
            throw new RuntimeException(__('backups.local_missing'));
        }
        file_put_contents($path, 'EduFunHub backup connection test '.now()->toIso8601String());

        try {
            $this->upload($connection, $path, $probe);
            $this->delete($connection, $probe);
        } finally {
            @unlink($path);
        }
    }

    private function url(FtpConnection $connection, ?string $filename): string
    {
        $segments = array_filter(explode('/', $connection->directory()), fn (string $segment): bool => $segment !== '');
        $path = implode('/', array_map('rawurlencode', $segments));
        $path = $path === '' ? '/' : '/'.$path.'/';

        return 'ftp://'.$connection->host.':'.$connection->port.$path.($filename !== null ? rawurlencode($filename) : '');
    }

    private function handle(FtpConnection $connection, string $url): CurlHandle
    {
        $curl = curl_init();
        curl_setopt_array($curl, [
            CURLOPT_URL => $url,
            CURLOPT_USERNAME => $connection->username,
            CURLOPT_PASSWORD => $connection->password,
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_CONNECTTIMEOUT => (int) config('backup.ftp_connect_timeout', 15),
            CURLOPT_TIMEOUT => (int) config('backup.ftp_timeout', 900),
            CURLOPT_PROTOCOLS => CURLPROTO_FTP | CURLPROTO_FTPS,
            CURLOPT_FTP_USE_EPSV => true,
        ]);
        if (! $connection->passive) {
            curl_setopt($curl, CURLOPT_FTPPORT, '-');
        }
        if ($connection->tls) {
            curl_setopt_array($curl, [
                CURLOPT_USE_SSL => CURLUSESSL_ALL,
                CURLOPT_FTPSSLAUTH => CURLFTPAUTH_TLS,
            ]);
        }

        return $curl;
    }

    private function execute(CurlHandle $curl, FtpConnection $connection): string|bool
    {
        $result = curl_exec($curl);
        $errno = curl_errno($curl);
        $error = curl_error($curl);
        $code = (int) curl_getinfo($curl, CURLINFO_RESPONSE_CODE);

        if ($errno === 0) {
            return $result;
        }

        $message = match ($errno) {
            self::RESOLVE_FAILED => __('backups.ftp.resolve', ['host' => $connection->host]),
            self::CONNECT_FAILED, self::TIMED_OUT => __('backups.ftp.connect', ['host' => $connection->host, 'port' => $connection->port]),
            self::LOGIN_DENIED => __('backups.ftp.login'),
            self::TLS_REQUIRED_FAILED, self::TLS_HANDSHAKE_FAILED, self::TLS_VERIFY_FAILED => __('backups.ftp.tls'),
            self::REMOTE_ACCESS_DENIED, self::UPLOAD_FAILED, self::QUOTE_FAILED => __('backups.ftp.denied'),
            default => __('backups.ftp.failed'),
        };
        $detail = trim(str_replace($connection->password === '' ? "\0" : $connection->password, '***', $error));

        throw new RuntimeException(trim($message.' ('.$detail.($code > 0 ? ', FTP '.$code : '').')'));
    }
}
