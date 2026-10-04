<?php

namespace App\Models;

use Database\Factories\CrosswordWordFactory;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * Teka-Teki Silang answer with its clue. Go pulls the active bank through the
 * signed internal endpoint; Laravel manages content and usage statistics.
 */
class CrosswordWord extends Model
{
    /** @use HasFactory<CrosswordWordFactory> */
    use HasFactory;

    /** Level number => [grid size, words per puzzle]; mirrors Go crossword.Levels. */
    public const LEVELS = [1 => [9, 5], 2 => [11, 7], 3 => [13, 9], 4 => [15, 11]];

    public const MIN_LENGTH = 3;

    /** The largest grid is 15 squares wide. */
    public const MAX_LENGTH = 15;

    /** @var list<string> */
    protected $fillable = ['key', 'level', 'answer', 'clue_id', 'clue_en', 'is_active', 'created_by'];

    /** @var array<string, mixed> */
    protected $attributes = ['is_active' => true, 'times_used' => 0, 'times_solved' => 0];

    /** @return array<string, string> */
    protected function casts(): array
    {
        return ['level' => 'integer', 'is_active' => 'boolean', 'times_used' => 'integer', 'times_solved' => 'integer'];
    }

    /** A level must keep at least twice its words per puzzle active so grids can vary. */
    public static function minimumActive(int $level): int
    {
        return (self::LEVELS[$level][1] ?? 5) * 2;
    }

    /** @param Builder<CrosswordWord> $query */
    public function scopeActive(Builder $query): void
    {
        $query->where('is_active', true);
    }

    /** @return BelongsTo<User, $this> */
    public function author(): BelongsTo
    {
        return $this->belongsTo(User::class, 'created_by');
    }

    public function solveRate(): ?float
    {
        return $this->times_used > 0 ? round($this->times_solved / $this->times_used * 100, 1) : null;
    }

    /** @return array{key: string, level: int, answer: string, clue: array{id: string, en: string}} */
    public function toGamePayload(): array
    {
        return [
            'key' => $this->key,
            'level' => $this->level,
            'answer' => $this->answer,
            'clue' => ['id' => $this->clue_id, 'en' => (string) $this->clue_en],
        ];
    }
}
