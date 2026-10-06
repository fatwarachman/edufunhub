<?php

namespace App\Models;

use App\Services\PointRules;
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

    /** Games whose Go runtime draws from the bank. */
    public const GAMES = ['flag-quest', 'sky-quiz', 'quiz-duel', 'knowledge-train', 'snakes-and-ladders', 'market-math', 'number-garden', 'explore-indonesia', 'mini-lab', 'floor-drop', 'economy-heist', 'turbo-trivia'];

    /** Games that only use multiple choice questions. */
    public const CHOICE_ONLY_GAMES = ['sky-quiz', 'quiz-duel', 'knowledge-train', 'snakes-and-ladders', 'market-math', 'number-garden', 'explore-indonesia', 'mini-lab', 'floor-drop', 'economy-heist', 'turbo-trivia'];

    /** Where a question came from: built-in bank, admin panel, teacher portal or teacher import. */
    public const SOURCES = ['system', 'admin', 'teacher', 'import', 'ai'];

    /** Questions written by the AI generator. */
    public const SOURCE_AI = 'ai';

    /** Highest custom value of a bonus question (mirrors the Go points cap). */
    public const MAX_POINTS = 100;

    /** Grade band labels (band index => grade range). */
    public const BANDS = [0 => [1, 3], 1 => [4, 6], 2 => [7, 9], 3 => [10, 12]];

    /** Grade 0 is kindergarten (TK); 1-12 are school grades. */
    public const KINDERGARTEN = 0;

    public const GRADES = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];

    /** Sources that belong to a teacher and earn compensation. */
    public const TEACHER_SOURCES = ['teacher', 'import'];

    /** @var list<string> */
    protected $fillable = [
        'key', 'type', 'band', 'grades', 'subject', 'prompt_id', 'prompt_en', 'options', 'answer',
        'hint_id', 'hint_en', 'games', 'is_active', 'source', 'created_by', 'updated_by', 'points', 'generation_id',
    ];

    /** @return array<string, string> */
    protected function casts(): array
    {
        return [
            'band' => 'integer',
            'answer' => 'integer',
            'points' => 'integer',
            'options' => 'array',
            'games' => 'array',
            'grades' => 'array',
            'is_active' => 'boolean',
            'times_answered' => 'integer',
            'times_correct' => 'integer',
        ];
    }

    /** @return BelongsTo<Subject, $this> */
    public function subjectRecord(): BelongsTo
    {
        return $this->belongsTo(Subject::class, 'subject', 'key');
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

    /**
     * Questions a teacher authored through the teacher portal or an import.
     *
     * @param  Builder<Question>  $query
     */
    public function scopeAuthoredByTeacher(Builder $query, User $teacher): void
    {
        $query->where('created_by', $teacher->id)->whereIn('source', self::TEACHER_SOURCES);
    }

    public function isTeacherAuthored(): bool
    {
        return $this->created_by !== null && in_array($this->source, self::TEACHER_SOURCES, true);
    }

    /**
     * Band used for grouping when a question targets explicit grades.
     *
     * @param  list<int>  $grades
     */
    public static function bandForGrades(array $grades): int
    {
        return self::bandForGrade(max(1, min($grades)));
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
            'grades' => array_values(array_map('intval', $this->grades ?? [])),
            'subject' => $this->subject,
            'prompt' => ['id' => $this->prompt_id, 'en' => $this->prompt_en ?? ''],
            'options' => $this->type === self::TYPE_CHOICE
                ? collect($this->options ?? [])->map(fn (array $option): array => ['id' => $option['id'] ?? '', 'en' => $option['en'] ?? ''])->values()->all()
                : [],
            'answer' => $this->answer,
            'hint' => ['id' => $this->hint_id ?? '', 'en' => $this->hint_en ?? ''],
            'games' => array_values($this->games ?? []),
            'points' => $this->points ?? 0,
        ];
    }

    /** Whether the AI generator wrote this question. */
    public function isAiGenerated(): bool
    {
        return $this->source === self::SOURCE_AI;
    }

    /** What a correct answer earns: the bonus value or the standard rule. */
    public function worth(): int
    {
        return $this->points ?: PointRules::current()['per_correct'];
    }
}
