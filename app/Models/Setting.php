<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Support\Facades\Cache;

class Setting extends Model
{
    protected $fillable = ['group', 'key', 'value'];

    /**
     * Get a setting value with optional default.
     */
    public static function get(string $key, mixed $default = null): mixed
    {
        return Cache::rememberForever("setting.{$key}", function () use ($key, $default): mixed {
            $row = static::query()->where('key', $key)->first();

            return $row ? $row->value : $default;
        });
    }

    /**
     * Set (upsert) a setting value and bust the cache.
     */
    public static function set(string $key, mixed $value, string $group = 'general'): void
    {
        static::query()->updateOrInsert(
            ['key' => $key],
            ['group' => $group, 'value' => $value, 'updated_at' => now(), 'created_at' => now()],
        );

        Cache::forget("setting.{$key}");
    }

    /**
     * Return all settings in a group as key => value map.
     */
    public static function group(string $group): array
    {
        return static::query()
            ->where('group', $group)
            ->pluck('value', 'key')
            ->toArray();
    }
}
