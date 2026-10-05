<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * Membership of a user in a chat. `left_at` keeps history after leaving a
 * group; `last_read_message_id` drives unread counts.
 */
class ChatParticipant extends Model
{
    public const OWNER = 'owner';

    public const MEMBER = 'member';

    /** @var list<string> */
    protected $fillable = ['chat_conversation_id', 'user_id', 'role', 'last_read_message_id', 'left_at'];

    /** @return array<string, string> */
    protected function casts(): array
    {
        return ['last_read_message_id' => 'integer', 'left_at' => 'datetime'];
    }

    /** @return BelongsTo<ChatConversation, $this> */
    public function conversation(): BelongsTo
    {
        return $this->belongsTo(ChatConversation::class, 'chat_conversation_id');
    }

    /** @return BelongsTo<User, $this> */
    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }
}
