<?php

namespace App\Services\Ads;

use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Str;

/**
 * Stores ad uploads on the public disk and serves them through Laravel
 * (`/ads/media/...`), so every container that runs the app can stream them
 * without a public storage symlink.
 */
class AdMedia
{
    public const FOLDERS = ['logos', 'images', 'audio'];

    public const PATH_PATTERN = '(logos|images|audio)/[A-Za-z0-9_-]{8,64}\.(png|jpe?g|webp|gif|mp3|ogg|wav|m4a)';

    public static function store(UploadedFile $file, string $folder): string
    {
        $extension = strtolower($file->getClientOriginalExtension() ?: $file->extension() ?: 'bin');

        return $file->storeAs('ads/'.$folder, Str::lower(Str::random(32)).'.'.$extension, 'public');
    }

    public static function delete(?string $path): void
    {
        if ($path) {
            Storage::disk('public')->delete($path);
        }
    }

    public static function url(?string $path): ?string
    {
        if (! $path || ! str_starts_with($path, 'ads/')) {
            return null;
        }

        return '/ads/media/'.substr($path, 4);
    }
}
