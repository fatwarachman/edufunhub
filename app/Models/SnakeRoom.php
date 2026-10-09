<?php

namespace App\Models;

use Database\Factories\SnakeRoomFactory;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Support\Str;

class SnakeRoom extends Model
{
    /** @use HasFactory<SnakeRoomFactory> */
    use HasFactory;

    public const STATUS_WAITING = 'waiting';

    public const STATUS_PLAYING = 'playing';

    public const STATUS_FINISHED = 'finished';

    public const STATUSES = [
        self::STATUS_WAITING,
        self::STATUS_PLAYING,
        self::STATUS_FINISHED,
    ];

    public const MODE_SOLO = 'solo';

    public const MODE_SHARED_GRID = 'shared_grid';

    public const MODE_SPLIT_GRID = 'split_grid';

    public const MODES = [
        self::MODE_SOLO,
        self::MODE_SHARED_GRID,
        self::MODE_SPLIT_GRID,
    ];

    /** @var list<string> */
    protected $fillable = [
        'code',
        'mode',
        'subject_id',
        'grade_level',
        'max_players',
        'status',
        'created_by',
    ];

    /** @return array<string, string> */
    protected function casts(): array
    {
        return [
            'subject_id' => 'integer',
            'max_players' => 'integer',
            'created_by' => 'integer',
        ];
    }

    public static function generateUniqueCode(): string
    {
        do {
            $code = Str::upper(Str::random(6));
        } while (static::query()->where('code', $code)->exists());

        return $code;
    }

    /** @return BelongsTo<User, $this> */
    public function creator(): BelongsTo
    {
        return $this->belongsTo(User::class, 'created_by');
    }

    /** @return BelongsTo<Subject, $this> */
    public function subject(): BelongsTo
    {
        return $this->belongsTo(Subject::class, 'subject_id');
    }

    /** @return HasMany<SnakeRoomPlayer, $this> */
    public function players(): HasMany
    {
        return $this->hasMany(SnakeRoomPlayer::class, 'room_id');
    }
}
