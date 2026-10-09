<?php

namespace App\Models;

use Database\Factories\UserBadgeFactory;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Support\Carbon;

/**
 * A badge a player has earned (definitions live in config/badges.php).
 *
 * @property int $id
 * @property int $user_id
 * @property string $badge
 * @property Carbon $earned_at
 */
class UserBadge extends Model
{
    /** @use HasFactory<UserBadgeFactory> */
    use HasFactory;

    protected $fillable = ['user_id', 'badge', 'earned_at'];

    protected function casts(): array
    {
        return [
            'earned_at' => 'datetime',
        ];
    }

    /** @return BelongsTo<User, $this> */
    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }
}
