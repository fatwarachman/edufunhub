<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * One chat message. `system` messages describe group events (created,
 * member added, left) and have no author text of their own.
 */
class ChatMessage extends Model
{
    public const TEXT = 'text';

    public const SYSTEM = 'system';

    /** Longest message a player may send. */
    public const MAX_LENGTH = 1000;

    /** @var list<string> */
    protected $fillable = ['chat_conversation_id', 'user_id', 'type', 'body'];

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
