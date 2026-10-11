<?php

namespace App\Models;

use Database\Factories\ClassroomMemberFactory;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * A student inside a classroom: when they joined, what they play right now
 * (heartbeat) and the personal report the teacher may share with them.
 */
class ClassroomMember extends Model
{
    /** @use HasFactory<ClassroomMemberFactory> */
    use HasFactory;

    /** @var list<string> */
    protected $fillable = [
        'classroom_id', 'user_id', 'joined_at', 'left_at', 'last_seen_at', 'current_game',
        'report', 'ai_feedback', 'report_shared_at',
    ];

    /** @return array<string, string> */
    protected function casts(): array
    {
        return [
            'classroom_id' => 'integer',
            'user_id' => 'integer',
            'joined_at' => 'datetime',
            'left_at' => 'datetime',
            'last_seen_at' => 'datetime',
            'report' => 'array',
            'report_shared_at' => 'datetime',
        ];
    }

    /** @return BelongsTo<Classroom, $this> */
    public function classroom(): BelongsTo
    {
        return $this->belongsTo(Classroom::class);
    }

    /** @return BelongsTo<User, $this> */
    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }

    /** Whether the student's page sent a heartbeat recently. */
    public function isOnline(): bool
    {
        return $this->left_at === null
            && $this->last_seen_at !== null
            && $this->last_seen_at->gt(now()->subSeconds(Classroom::ONLINE_SECONDS));
    }
}
