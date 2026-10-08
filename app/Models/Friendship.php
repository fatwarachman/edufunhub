<?php

namespace App\Models;

use Database\Factories\FriendshipFactory;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * Friendship between two players. A pending row is a friend request from
 * `requester` to `addressee`; an accepted row makes both friends.
 */
class Friendship extends Model
{
    /** @use HasFactory<FriendshipFactory> */
    use HasFactory;

    public const PENDING = 'pending';

    public const ACCEPTED = 'accepted';

    /** Most friends one player can have (keeps presence watch lists small). */
    public const MAX_FRIENDS = 200;

    /** Most open requests a player may send at once. */
    public const MAX_PENDING_SENT = 30;

    protected $fillable = ['requester_id', 'addressee_id', 'status', 'responded_at'];

    /** @return array<string, string> */
    protected function casts(): array
    {
        return ['responded_at' => 'datetime'];
    }

    /** @return BelongsTo<User, $this> */
    public function requester(): BelongsTo
    {
        return $this->belongsTo(User::class, 'requester_id');
    }

    /** @return BelongsTo<User, $this> */
    public function addressee(): BelongsTo
    {
        return $this->belongsTo(User::class, 'addressee_id');
    }

    /** Rows between two users in either direction. */
    public function scopeBetween(Builder $query, int $a, int $b): void
    {
        $query->where(fn (Builder $q) => $q
            ->where(fn (Builder $w) => $w->where('requester_id', $a)->where('addressee_id', $b))
            ->orWhere(fn (Builder $w) => $w->where('requester_id', $b)->where('addressee_id', $a)));
    }

    /** Rows that involve the user on either side. */
    public function scopeInvolving(Builder $query, int $userId): void
    {
        $query->where(fn (Builder $q) => $q->where('requester_id', $userId)->orWhere('addressee_id', $userId));
    }

    public function otherId(int $userId): int
    {
        return $this->requester_id === $userId ? $this->addressee_id : $this->requester_id;
    }
}
