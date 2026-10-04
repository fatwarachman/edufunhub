<?php

namespace App\Services;

use App\Models\Setting;

/**
 * Point guide set by the super admin and sent to the Go games with the bank:
 * a correct answer earns per_correct (bonus questions their own value), a win
 * adds win, a draw adds draw (0 = no points), wrong answers never cost points.
 */
class PointRules
{
    public const GROUP = 'points';

    /** @var array{per_correct: int, win: int, draw: int, participation: int} */
    public const DEFAULTS = ['per_correct' => 10, 'win' => 20, 'draw' => 0, 'participation' => 5];

    /** @var array<string, array{0: int, 1: int}> */
    public const BOUNDS = ['per_correct' => [1, 100], 'win' => [0, 100], 'draw' => [0, 100], 'participation' => [0, 50]];

    /** @return array{per_correct: int, win: int, draw: int, participation: int} */
    public static function current(): array
    {
        $rules = self::DEFAULTS;
        foreach ($rules as $key => $default) {
            [$min, $max] = self::BOUNDS[$key];
            $rules[$key] = max($min, min($max, (int) Setting::get("points.{$key}", $default)));
        }

        return $rules;
    }

    /** @param  array<string, int>  $rules */
    public static function save(array $rules): void
    {
        foreach (array_keys(self::DEFAULTS) as $key) {
            Setting::set("points.{$key}", (string) (int) $rules[$key], self::GROUP);
        }
    }
}
