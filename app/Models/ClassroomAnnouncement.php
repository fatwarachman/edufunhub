<?php

namespace App\Models;

use Database\Factories\ClassroomAnnouncementFactory;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Support\Carbon;

/**
 * A teacher announcement shown as an undismissable popup on the screens of
 * the classroom's active members between `starts_at` and `ends_at`.
 *
 * @property int $id
 * @property int $classroom_id
 * @property int $teacher_id
 * @property string|null $title
 * @property string $body
 * @property int $display_seconds
 * @property Carbon $starts_at
 * @property Carbon $ends_at
 */
class ClassroomAnnouncement extends Model
{
    /** @use HasFactory<ClassroomAnnouncementFactory> */
    use HasFactory;

    /** Shortest and longest display time, in seconds. */
    public const MIN_SECONDS = 5;

    public const MAX_SECONDS = 600;

    public const MAX_BODY = 1000;

    public const MAX_TITLE = 120;

    /** @var list<string> */
    protected $fillable = [
        'classroom_id', 'teacher_id', 'title', 'body', 'display_seconds', 'starts_at', 'ends_at',
    ];

    /** @return array<string, string> */
    protected function casts(): array
    {
        return [
            'classroom_id' => 'integer',
            'teacher_id' => 'integer',
            'display_seconds' => 'integer',
            'starts_at' => 'datetime',
            'ends_at' => 'datetime',
        ];
    }

    /** @return BelongsTo<Classroom, $this> */
    public function classroom(): BelongsTo
    {
        return $this->belongsTo(Classroom::class);
    }

    /** @return BelongsTo<User, $this> */
    public function teacher(): BelongsTo
    {
        return $this->belongsTo(User::class, 'teacher_id');
    }

    /**
     * Announcements still on screen at the moment.
     *
     * @param  Builder<ClassroomAnnouncement>  $query
     */
    public function scopeActiveAt(Builder $query, ?Carbon $moment = null): void
    {
        $moment ??= now();
        $query->where('starts_at', '<=', $moment)->where('ends_at', '>', $moment);
    }

    public function isActive(?Carbon $moment = null): bool
    {
        $moment ??= now();

        return $this->starts_at->lte($moment) && $this->ends_at->gt($moment);
    }

    /** Whole seconds left on screen (0 once over). */
    public function remainingSeconds(?Carbon $moment = null): int
    {
        $moment ??= now();

        return max(0, (int) ceil($moment->diffInMilliseconds($this->ends_at, false) / 1000));
    }

    /**
     * Payload for students (popup) and live events.
     *
     * @return array{id: int, classroom_id: int, title: string|null, body: string, display_seconds: int, starts_at: string, ends_at: string, remaining_seconds: int}
     */
    public function toStudentPayload(): array
    {
        return [
            'id' => $this->id,
            'classroom_id' => $this->classroom_id,
            'title' => $this->title,
            'body' => $this->body,
            'display_seconds' => $this->display_seconds,
            'starts_at' => $this->starts_at->toIso8601String(),
            'ends_at' => $this->ends_at->toIso8601String(),
            'remaining_seconds' => $this->remainingSeconds(),
        ];
    }

    /**
     * Payload for the teacher's list.
     *
     * @return array{id: int, title: string|null, body: string, display_seconds: int, starts_at: string, ends_at: string, active: bool, remaining_seconds: int}
     */
    public function toTeacherPayload(): array
    {
        return [
            'id' => $this->id,
            'title' => $this->title,
            'body' => $this->body,
            'display_seconds' => $this->display_seconds,
            'starts_at' => $this->starts_at->toIso8601String(),
            'ends_at' => $this->ends_at->toIso8601String(),
            'active' => $this->isActive(),
            'remaining_seconds' => $this->remainingSeconds(),
        ];
    }
}
