<?php

namespace App\Models;

use Database\Factories\QuestionGenerationItemFactory;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * Progress of one subject/grade pair inside an AI generation request. Each
 * queued job owns exactly one row, so concurrent workers never write the
 * same record.
 */
class QuestionGenerationItem extends Model
{
    /** @use HasFactory<QuestionGenerationItemFactory> */
    use HasFactory;

    public const QUEUED = 'queued';

    public const RUNNING = 'running';

    public const DONE = 'done';

    public const FAILED = 'failed';

    /** Stopped by an admin: never started, or ended early keeping its questions. */
    public const CANCELLED = 'cancelled';

    /** @var list<string> */
    public const FINISHED = [self::DONE, self::FAILED, self::CANCELLED];

    protected $fillable = [
        'generation_id', 'subject', 'topic_id', 'grade', 'status', 'target', 'created_count', 'skipped_count', 'error', 'started_at', 'finished_at',
    ];

    /** @return array<string, string> */
    protected function casts(): array
    {
        return [
            'grade' => 'integer',
            'topic_id' => 'integer',
            'target' => 'integer',
            'created_count' => 'integer',
            'skipped_count' => 'integer',
            'started_at' => 'datetime',
            'finished_at' => 'datetime',
        ];
    }

    /** @return BelongsTo<QuestionGeneration, $this> */
    public function generation(): BelongsTo
    {
        return $this->belongsTo(QuestionGeneration::class, 'generation_id');
    }

    /** @return BelongsTo<SubjectTopic, $this> */
    public function topic(): BelongsTo
    {
        return $this->belongsTo(SubjectTopic::class, 'topic_id');
    }

    public function isFinished(): bool
    {
        return in_array($this->status, self::FINISHED, true);
    }

    /**
     * @return array{subject: string, topic: ?array{id: int, name_id: string, name_en: ?string}, grade: int, status: string, created: int, skipped: int, target: int, error: ?string}
     */
    public function toProgress(): array
    {
        return [
            'subject' => $this->subject,
            'topic' => $this->topic_id !== null ? $this->topic?->only(['id', 'name_id', 'name_en']) : null,
            'grade' => $this->grade,
            'status' => $this->status,
            'created' => $this->created_count,
            'skipped' => $this->skipped_count,
            'target' => $this->target,
            'error' => $this->error,
        ];
    }
}
