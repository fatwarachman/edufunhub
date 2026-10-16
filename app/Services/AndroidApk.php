<?php

namespace App\Services;

use Illuminate\Support\Facades\Cache;

/**
 * The sideloadable Android app (APK) offered on the dashboard "Install the
 * app" card. The file lives outside the web root (config android.apk_path)
 * and is streamed by AndroidApkController; replacing it is enough to publish
 * a new build (the cache key follows the file's size and modified time).
 */
class AndroidApk
{
    /**
     * @return array{url: string, size: int, updated_at: string, hash: string, sha256: string, version: string}|null
     */
    public function present(): ?array
    {
        $path = $this->path();
        if ($path === null) {
            return null;
        }

        $size = (int) filesize($path);
        $modified = (int) filemtime($path);
        $sha256 = Cache::remember(
            "android-apk-sha256:{$size}:{$modified}",
            now()->addDay(),
            fn (): string => (string) hash_file('sha256', $path),
        );
        $hash = substr($sha256, 0, 12);

        return [
            'url' => route('android.apk', ['v' => $hash]),
            'size' => $size,
            'updated_at' => date(DATE_ATOM, $modified),
            'hash' => $hash,
            'sha256' => $sha256,
            'version' => (string) config('android.apk_version'),
        ];
    }

    /** Absolute path of the APK, or null when no build has been published. */
    public function path(): ?string
    {
        $path = (string) config('android.apk_path');

        return $path !== '' && is_file($path) && is_readable($path) ? $path : null;
    }
}
