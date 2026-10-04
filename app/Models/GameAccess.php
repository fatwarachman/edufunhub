<?php

namespace App\Models;

use Database\Factories\GameAccessFactory;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class GameAccess extends Model
{
    /** @use HasFactory<GameAccessFactory> */
    use HasFactory;

    /** @var list<string> */
    protected $fillable = ['user_id', 'game_key', 'device_type', 'os', 'browser', 'user_agent', 'accessed_at'];

    /** @return array<string, string> */
    protected function casts(): array
    {
        return ['accessed_at' => 'immutable_datetime'];
    }

    /** @return BelongsTo<User, $this> */
    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }
}
