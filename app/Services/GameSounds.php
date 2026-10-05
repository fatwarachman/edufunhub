<?php

namespace App\Services;

use App\Models\Setting;

/**
 * Game sound settings chosen by the super admin: which sound plays for a
 * correct and a wrong answer, the volume, and a global on/off switch. Shared
 * with every page as the `gameSounds` prop; the sounds are synthesised in the
 * browser (resources/js/lib/game-sounds.ts), so the keys must match there.
 */
class GameSounds
{
    public const GROUP = 'sounds';

    /** @var list<string> */
    public const CORRECT = ['bell', 'chime', 'coin', 'classic'];

    /** @var list<string> */
    public const WRONG = ['buzzer', 'boing', 'thud', 'classic'];

    /** @var array{enabled: bool, volume: int, correct: string, wrong: string} */
    public const DEFAULTS = ['enabled' => true, 'volume' => 70, 'correct' => 'bell', 'wrong' => 'buzzer'];

    /** @return array{enabled: bool, volume: int, correct: string, wrong: string} */
    public static function current(): array
    {
        $correct = (string) Setting::get('sounds.correct', self::DEFAULTS['correct']);
        $wrong = (string) Setting::get('sounds.wrong', self::DEFAULTS['wrong']);

        return [
            'enabled' => filter_var(Setting::get('sounds.enabled', '1'), FILTER_VALIDATE_BOOL),
            'volume' => max(0, min(100, (int) Setting::get('sounds.volume', self::DEFAULTS['volume']))),
            'correct' => in_array($correct, self::CORRECT, true) ? $correct : self::DEFAULTS['correct'],
            'wrong' => in_array($wrong, self::WRONG, true) ? $wrong : self::DEFAULTS['wrong'],
        ];
    }

    /** @param  array{enabled: bool, volume: int, correct: string, wrong: string}  $settings */
    public static function save(array $settings): void
    {
        Setting::set('sounds.enabled', $settings['enabled'] ? '1' : '0', self::GROUP);
        Setting::set('sounds.volume', (string) (int) $settings['volume'], self::GROUP);
        Setting::set('sounds.correct', $settings['correct'], self::GROUP);
        Setting::set('sounds.wrong', $settings['wrong'], self::GROUP);
    }
}
