<?php

namespace App\Models;

use Database\Factories\ChatConversationFactory;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\BelongsToMany;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\Relations\HasOne;

/**
 * A direct (two people) or group chat between players.
 */
class ChatConversation extends Model
{
    /** @use HasFactory<ChatConversationFactory> */
    use HasFactory;

    public const DIRECT = 'direct';

    public const GROUP = 'group';

    /** Most members a group can hold, including the owner. */
    public const MAX_GROUP_MEMBERS = 30;

    /** @var list<string> */
    protected $fillable = ['type', 'name', 'created_by', 'direct_key', 'last_message_at'];

    /** @return array<string, string> */
    protected function casts(): array
    {
        return ['last_message_at' => 'datetime'];
    }

    public static function directKey(int $a, int $b): string
    {
        return min($a, $b).':'.max($a, $b);
    }

    public function isGroup(): bool
    {
        return $this->type === self::GROUP;
    }

    /** @return HasMany<ChatParticipant, $this> */
    public function participants(): HasMany
    {
        return $this->hasMany(ChatParticipant::class);
    }

    /** @return HasMany<ChatParticipant, $this> */
    public function activeParticipants(): HasMany
    {
        return $this->participants()->whereNull('left_at');
    }

    /** @return BelongsToMany<User, $this> */
    public function members(): BelongsToMany
    {
        return $this->belongsToMany(User::class, 'chat_participants')
            ->withPivot(['role', 'last_read_message_id', 'left_at'])
            ->wherePivotNull('left_at')
            ->withTimestamps();
    }

    /** @return HasMany<ChatMessage, $this> */
    public function messages(): HasMany
    {
        return $this->hasMany(ChatMessage::class);
    }

    /** @return HasOne<ChatMessage, $this> */
    public function latestMessage(): HasOne
    {
        return $this->hasOne(ChatMessage::class)->latestOfMany();
    }

    /** @return BelongsTo<User, $this> */
    public function creator(): BelongsTo
    {
        return $this->belongsTo(User::class, 'created_by');
    }

    /**
     * Conversations the user currently belongs to.
     *
     * @param  Builder<ChatConversation>  $query
     */
    public function scopeFor(Builder $query, User $user): void
    {
        $query->whereHas('participants', fn (Builder $p) => $p->where('user_id', $user->id)->whereNull('left_at'));
    }

    public function participantFor(User $user): ?ChatParticipant
    {
        return $this->participants()->where('user_id', $user->id)->whereNull('left_at')->first();
    }
}
