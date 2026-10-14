<?php

namespace App\Services\Classrooms;

use App\Models\Classroom;
use App\Models\ClassroomGame;
use App\Models\GameHistory;
use App\Models\User;

/**
 * Per-game play limit of a classroom. A play is one game history recorded
 * for the classroom, the student and the game; null limit means unlimited.
 */
class ClassroomPlayLimit
{
    /**
     * Plays left for the student in this classroom game: null when the game
     * has no limit (or is not part of the classroom), else 0..max.
     */
    public function remaining(Classroom $classroom, User $user, string $gameKey): ?int
    {
        $gameKey = self::baseGameKey($gameKey);
        $max = $this->maxFor($classroom, $gameKey);

        if ($max === null) {
            return null;
        }

        return max(0, $max - $this->plays($classroom, $user, $gameKey));
    }

    /**
     * Play count, limit and remaining plays of every classroom game.
     *
     * @return array<string, array{plays: int, max: int|null, remaining: int|null}>
     */
    public function usage(Classroom $classroom, User $user): array
    {
        $plays = GameHistory::query()
            ->where('classroom_id', $classroom->id)
            ->where('user_id', $user->id)
            ->selectRaw('game_key, COUNT(*) as plays')
            ->groupBy('game_key')
            ->pluck('plays', 'game_key');

        $usage = [];
        foreach ($classroom->games as $game) {
            $count = (int) ($plays[$game->game_key] ?? 0);
            $max = $game->max_plays;
            $usage[$game->game_key] = [
                'plays' => $count,
                'max' => $max,
                'remaining' => $max === null ? null : max(0, $max - $count),
            ];
        }

        return $usage;
    }

    /** Plays the student already recorded for this classroom game. */
    public function plays(Classroom $classroom, User $user, string $gameKey): int
    {
        return GameHistory::query()
            ->where('classroom_id', $classroom->id)
            ->where('user_id', $user->id)
            ->where('game_key', self::baseGameKey($gameKey))
            ->count();
    }

    /** Limit of the classroom game, null when unlimited or not in the classroom. */
    public function maxFor(Classroom $classroom, string $gameKey): ?int
    {
        $gameKey = self::baseGameKey($gameKey);

        $game = $classroom->relationLoaded('games')
            ? $classroom->games->firstWhere('game_key', $gameKey)
            : $classroom->games()->where('game_key', $gameKey)->first();

        return $game instanceof ClassroomGame ? $game->max_plays : null;
    }

    /**
     * Display title of a game for server messages, read from the game
     * catalog title key and the player locale catalog; falls back to the key.
     */
    public function gameTitle(string $gameKey, ?string $locale = null): string
    {
        $gameKey = self::baseGameKey($gameKey);
        $locale = in_array($locale ?? app()->getLocale(), ['id', 'en'], true) ? ($locale ?? app()->getLocale()) : 'id';

        $titleKey = collect((array) config('game-catalog.categories'))
            ->flatMap(fn (array $category): array => (array) ($category['games'] ?? []))
            ->firstWhere('key', $gameKey)['titleKey'] ?? null;

        if (! is_string($titleKey)) {
            return $gameKey;
        }

        $path = resource_path('js/locales/'.$locale.'-player.json');
        $catalog = is_file($path) ? (array) json_decode((string) file_get_contents($path), true) : [];
        $title = data_get($catalog, $titleKey);

        return is_string($title) && $title !== '' ? $title : $gameKey;
    }

    public static function baseGameKey(string $gameKey): string
    {
        return str_ends_with($gameKey, '-host') ? substr($gameKey, 0, -5) : $gameKey;
    }
}
