<?php

namespace App\Services;

use App\Models\User;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Str;

/**
 * Profile photos uploaded by players. Files live on the public disk under
 * `avatars/` with random names and are streamed through Laravel
 * (`/profile/photo/{file}`), so every app container can serve them without
 * a storage symlink.
 */
class ProfilePhoto
{
    public const FOLDER = 'avatars';

    public const FILE_PATTERN = '[A-Za-z0-9]{40}\.(jpg|png|webp)';

    public static function store(User $user, UploadedFile $file): string
    {
        $extension = match ($file->getMimeType()) {
            'image/png' => 'png',
            'image/webp' => 'webp',
            default => 'jpg',
        };
        $path = $file->storeAs(self::FOLDER, Str::random(40).'.'.$extension, 'public');

        self::deleteStored($user->getRawOriginal('avatar_url'));
        $user->forceFill(['avatar_url' => $path])->save();

        return $path;
    }

    public static function remove(User $user): void
    {
        self::deleteStored($user->getRawOriginal('avatar_url'));
        $user->forceFill(['avatar_url' => null])->save();
    }

    /** Public URL for a stored avatar value (remote URLs pass through). */
    public static function url(?string $value): ?string
    {
        if (! $value) {
            return null;
        }
        if (str_starts_with($value, 'http')) {
            return $value;
        }
        if (str_starts_with($value, self::FOLDER.'/')) {
            return '/profile/photo/'.substr($value, strlen(self::FOLDER) + 1);
        }

        return Storage::url($value);
    }

    private static function deleteStored(?string $value): void
    {
        if ($value && ! str_starts_with($value, 'http')) {
            Storage::disk('public')->delete($value);
        }
    }
}
