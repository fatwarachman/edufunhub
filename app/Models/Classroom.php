<?php

namespace App\Models;

use Database\Factories\ClassroomFactory;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Support\Carbon;

/**
 * Teacher classroom (ruang kelas): PIN-protected and time-boxed. The teacher
 * picks the games, the questions each game draws, watches who plays live and
 * reads an analysis afterwards.
 */
class Classroom extends Model
{
    /** @use HasFactory<ClassroomFactory> */
    use HasFactory;

    public const STATUS_SCHEDULED = 'scheduled';

    public const STATUS_ACTIVE = 'active';

    public const STATUS_ENDED = 'ended';

    /** Shortest and longest active time, in minutes (up to 7 days). */
    public const MIN_DURATION = 5;

    public const MAX_DURATION = 10080;

    public const MAX_MEMBERS = 200;

    public const MAX_GAMES = 10;

    public const MAX_QUESTIONS_PER_GAME = 100;

    /** A member counts as online when the last heartbeat is this recent (seconds). */
    public const ONLINE_SECONDS = 90;

    /** Results that arrive this long after the end still belong to the classroom (minutes). */
    public const RESULT_GRACE = 30;

    /** @var list<string> */
    protected $fillable = [
        'teacher_id', 'name', 'description', 'pin', 'starts_at', 'ends_at', 'max_members',
        'report', 'report_generated_at', 'ai_status', 'ai_summary',
    ];

    /** @return array<string, string> */
    protected function casts(): array
    {
        return [
            'teacher_id' => 'integer',
            'max_members' => 'integer',
            'starts_at' => 'datetime',
            'ends_at' => 'datetime',
            'report' => 'array',
            'report_generated_at' => 'datetime',
        ];
    }

    /** @return BelongsTo<User, $this> */
    public function teacher(): BelongsTo
    {
        return $this->belongsTo(User::class, 'teacher_id');
    }

    /** @return HasMany<ClassroomGame, $this> */
    public function games(): HasMany
    {
        return $this->hasMany(ClassroomGame::class)->orderBy('sort_order')->orderBy('id');
    }

    /** @return HasMany<ClassroomMember, $this> */
    public function members(): HasMany
    {
        return $this->hasMany(ClassroomMember::class);
    }

    /** @return HasMany<GameHistory, $this> */
    public function gameHistories(): HasMany
    {
        return $this->hasMany(GameHistory::class);
    }

    /**
     * Classrooms whose active window contains the moment.
     *
     * @param  Builder<Classroom>  $query
     */
    public function scopeActiveAt(Builder $query, ?Carbon $moment = null): void
    {
        $moment ??= now();
        $query->where('starts_at', '<=', $moment)->where('ends_at', '>', $moment);
    }

    public function status(?Carbon $moment = null): string
    {
        $moment ??= now();

        return match (true) {
            $moment->lt($this->starts_at) => self::STATUS_SCHEDULED,
            $moment->lt($this->ends_at) => self::STATUS_ACTIVE,
            default => self::STATUS_ENDED,
        };
    }

    public function isActive(?Carbon $moment = null): bool
    {
        return $this->status($moment) === self::STATUS_ACTIVE;
    }

    /** Game keys the teacher picked, in order. */
    public function gameKeys(): array
    {
        return $this->games->pluck('game_key')->values()->all();
    }

    /**
     * A 6-digit PIN no other open (not yet ended) classroom uses.
     */
    public static function freshPin(): string
    {
        do {
            $pin = str_pad((string) random_int(0, 999999), 6, '0', STR_PAD_LEFT);
        } while (static::query()->where('pin', $pin)->where('ends_at', '>', now())->exists());

        return $pin;
    }
}
