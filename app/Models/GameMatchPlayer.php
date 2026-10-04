<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * A seat of a recorded match. Local (pass-and-play) seats and bots have no user.
 */
class GameMatchPlayer extends Model
{
    /** @var list<string> */
    protected $fillable = ['game_match_id', 'user_id', 'game_history_id', 'seat', 'name', 'grade', 'is_local', 'is_bot', 'left_early', 'rank', 'score', 'correct', 'wrong'];

    /** @return array<string, string> */
    protected function casts(): array
    {
        return [
            'seat' => 'integer',
            'grade' => 'integer',
            'is_local' => 'boolean',
            'is_bot' => 'boolean',
            'left_early' => 'boolean',
            'rank' => 'integer',
            'score' => 'integer',
            'correct' => 'integer',
            'wrong' => 'integer',
        ];
    }

    /** @return BelongsTo<GameMatch, $this> */
    public function match(): BelongsTo
    {
        return $this->belongsTo(GameMatch::class, 'game_match_id');
    }

    /** @return BelongsTo<User, $this> */
    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }

    /** @return BelongsTo<GameHistory, $this> */
    public function gameHistory(): BelongsTo
    {
        return $this->belongsTo(GameHistory::class);
    }
}
