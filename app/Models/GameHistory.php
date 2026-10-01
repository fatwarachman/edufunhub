<?php

namespace App\Models;

use Database\Factories\GameHistoryFactory;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class GameHistory extends Model
{
    /** @use HasFactory<GameHistoryFactory> */
    use HasFactory;

    /** @var list<string> */
    protected $fillable = ['game_key', 'game_name', 'points', 'played_at', 'event_id'];

    /** @return array<string, string> */
    protected function casts(): array
    {
        return ['points' => 'integer', 'played_at' => 'immutable_datetime'];
    }

    /** @return BelongsTo<User, $this> */
    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }
}
