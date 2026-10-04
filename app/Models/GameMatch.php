<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\HasMany;

/**
 * One finished room or matchmaking game: who played together, at which level
 * and how everyone ranked. Recorded from the Go results (upsert by match_key).
 */
class GameMatch extends Model
{
    public const MODES = ['solo', 'room', 'random', 'bot'];

    /** @var list<string> */
    protected $fillable = ['match_key', 'game_key', 'mode', 'pin', 'level', 'grade', 'players_count', 'finished', 'words', 'started_at', 'ended_at'];

    /** @return array<string, string> */
    protected function casts(): array
    {
        return [
            'level' => 'integer',
            'grade' => 'integer',
            'players_count' => 'integer',
            'finished' => 'boolean',
            'words' => 'array',
            'started_at' => 'datetime',
            'ended_at' => 'datetime',
        ];
    }

    /** @return HasMany<GameMatchPlayer, $this> */
    public function players(): HasMany
    {
        return $this->hasMany(GameMatchPlayer::class)->orderBy('seat');
    }
}
