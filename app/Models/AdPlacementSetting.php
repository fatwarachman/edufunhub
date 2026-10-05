<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

/**
 * Serving rules for one placement: on/off, static (one creative per page
 * view) or rotating (cycles through several creatives every N seconds).
 */
class AdPlacementSetting extends Model
{
    public const MODES = ['static', 'rotate'];

    public const MAX_CREATIVES = 8;

    /** @var list<string> */
    protected $fillable = ['placement', 'is_enabled', 'mode', 'rotate_seconds', 'max_creatives'];

    /** @return array<string, string> */
    protected function casts(): array
    {
        return ['is_enabled' => 'boolean', 'rotate_seconds' => 'integer', 'max_creatives' => 'integer'];
    }

    /**
     * Settings for every configured placement, defaults filled in.
     *
     * @return array<string, array{is_enabled: bool, mode: string, rotate_seconds: int, max_creatives: int}>
     */
    public static function resolved(): array
    {
        $stored = static::query()->get()->keyBy('placement');

        return collect(array_keys((array) config('ads.placements')))->mapWithKeys(function (string $key) use ($stored): array {
            $row = $stored[$key] ?? null;
            $jingle = str_starts_with($key, 'jingle.') || $key === 'shop.item';

            return [$key => [
                'is_enabled' => $row?->is_enabled ?? true,
                'mode' => $jingle ? 'static' : ($row?->mode ?? 'static'),
                'rotate_seconds' => $row?->rotate_seconds ?? 10,
                'max_creatives' => $row?->max_creatives ?? 4,
            ]];
        })->all();
    }
}
