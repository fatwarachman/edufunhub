<?php

namespace App\Models;

use Database\Factories\SequenceAttemptFactory;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * One player's attempts on one Order Rush sequence set in one game, reported
 * by Go: solved and wrong orders, solve time and wrong-slot counts. Feeds
 * the "most misunderstood sequence" analytics.
 */
class SequenceAttempt extends Model
{
    /** @use HasFactory<SequenceAttemptFactory> */
    use HasFactory;

    /** @var list<string> */
    protected $fillable = [
        'game_history_id', 'user_id', 'set_key', 'category', 'attempts', 'solved', 'wrong', 'total_ms',
        'slot_errors', 'played_at',
    ];

    /** @return array<string, string> */
    protected function casts(): array
    {
        return [
            'attempts' => 'integer',
            'solved' => 'integer',
            'wrong' => 'integer',
            'total_ms' => 'integer',
            'slot_errors' => 'array',
            'played_at' => 'immutable_datetime',
        ];
    }

    /** @return BelongsTo<GameHistory, $this> */
    public function gameHistory(): BelongsTo
    {
        return $this->belongsTo(GameHistory::class);
    }

    /** @return BelongsTo<User, $this> */
    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }
}
