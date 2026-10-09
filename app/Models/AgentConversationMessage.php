<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/** Message saved by the Laravel AI SDK conversation store. */
class AgentConversationMessage extends Model
{
    use HasUuids;

    /** @var list<string> */
    protected $fillable = ['conversation_id', 'user_id', 'agent', 'role', 'content', 'meta'];

    /** @return array<string, string> */
    protected function casts(): array
    {
        return ['meta' => 'array'];
    }

    /** @return BelongsTo<AgentConversation, $this> */
    public function conversation(): BelongsTo
    {
        return $this->belongsTo(AgentConversation::class, 'conversation_id');
    }
}
