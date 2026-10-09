<?php

namespace App\Models;

use Database\Factories\SnakeRoomPlayerFactory;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class SnakeRoomPlayer extends Model
{
    /** @use HasFactory<SnakeRoomPlayerFactory> */
    use HasFactory;

    /** @var list<string> */
    protected $fillable = [
        'room_id',
        'user_id',
        'score',
        'final_rank',
        'tail_length',
        'is_alive',
    ];

    /** @return array<string, string> */
    protected function casts(): array
    {
        return [
            'room_id' => 'integer',
            'user_id' => 'integer',
            'score' => 'integer',
            'final_rank' => 'integer',
            'tail_length' => 'integer',
            'is_alive' => 'boolean',
        ];
    }

    /** @return BelongsTo<SnakeRoom, $this> */
    public function room(): BelongsTo
    {
        return $this->belongsTo(SnakeRoom::class, 'room_id');
    }

    /** @return BelongsTo<User, $this> */
    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class, 'user_id');
    }
}
