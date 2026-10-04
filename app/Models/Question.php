<?php

namespace App\Models;

use Database\Factories\QuestionFactory;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

/**
 * Curated quiz question distributed to Go-run games. Go pulls the active bank
 * via the signed internal endpoint; Laravel only manages content and stats.
 */
class Question extends Model
{
    /** @use HasFactory<QuestionFactory> */
    use HasFactory;

    public const TYPE_CHOICE = 'choice';

    public const TYPE_TRUE_FALSE = 'true_false';

    public const TYPES = [self::TYPE_CHOICE, self::TYPE_TRUE_FALSE];

    public const SUBJECTS = ['math', 'science', 'language', 'social', 'english', 'civics'];

    /** Games whose Go runtime draws from the bank. */
    public const GAMES = ['flag-quest', 'sky-quiz'];

    /** Where a question came from: built-in bank, admin panel, or (future) teacher upload. */
    public const SOURCES = ['system', 'admin', 'teacher', 'import'];

    /** Grade band labels (band index => grade range). */
    public const BANDS = [0 => [1, 3], 1 => [4, 6], 2 => [7, 9], 3 => [10, 12]];

    /** @var list<string> */
    protected $fillable = [
        'key', 'type', 'band', 'subject', 'prompt_id', 'prompt_en', 'options', 'answer',
        'hint_id', 'hint_en', 'games', 'is_active', 'source', 'created_by', 'updated_by',
    ];

    /** @return array<string, string> */
    protected function casts(): array
    {
        return [
            'band' => 'integer',
            'answer' => 'integer',
            'options' => 'array',
            'games' => 'array',
            'is_active' => 'boolean',
            'times_answered' => 'integer',
            'times_correct' => 'integer',
        ];
    }

    /** @return HasMany<QuestionAnswer, $this> */
    public function answers(): HasMany
    {
        return $this->hasMany(QuestionAnswer::class);
    }

    /** @return BelongsTo<User, $this> */
    public function author(): BelongsTo
    {
        return $this->belongsTo(User::class, 'created_by');
    }

    /** @return BelongsTo<User, $this> */
    public function editor(): BelongsTo
    {
        return $this->belongsTo(User::class, 'updated_by');
    }

    /** @param  Builder<Question>  $query */
    public function scopeActive(Builder $query): void
    {
        $query->where('is_active', true);
    }

    /** Percentage of correct answers, or null when never answered. */
    public function successRate(): ?float
    {
        return $this->times_answered > 0 ? round($this->times_correct / $this->times_answered * 100, 1) : null;
    }

    public static function bandForGrade(int $grade): int
    {
        return match (true) {
            $grade <= 3 => 0,
            $grade <= 6 => 1,
            $grade <= 9 => 2,
            default => 3,
        };
    }

    /**
     * Shape consumed by the Go game service (questions.Item).
     *
     * @return array<string, mixed>
     */
    public function toGamePayload(): array
    {
        return [
            'key' => $this->key,
            'type' => $this->type,
            'band' => $this->band,
            'subject' => $this->subject,
            'prompt' => ['id' => $this->prompt_id, 'en' => $this->prompt_en ?? ''],
            'options' => $this->type === self::TYPE_CHOICE
                ? collect($this->options ?? [])->map(fn (array $option): array => ['id' => $option['id'] ?? '', 'en' => $option['en'] ?? ''])->values()->all()
                : [],
            'answer' => $this->answer,
            'hint' => ['id' => $this->hint_id ?? '', 'en' => $this->hint_en ?? ''],
            'games' => array_values($this->games ?? []),
        ];
    }
}
