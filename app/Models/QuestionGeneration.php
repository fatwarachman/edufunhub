<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

/**
 * One AI generation request: subjects x grades, processed by queued jobs.
 */
class QuestionGeneration extends Model
{
    public const STATUSES = ['queued', 'running', 'done', 'failed'];

    /** Most questions one request may ask per subject/grade pair. */
    public const MAX_PER_COMBINATION = 20;

    /** Questions asked from the model per call. */
    public const BATCH = 5;

    protected $fillable = [
        'requested_by', 'model', 'subjects', 'grades', 'per_combination', 'games', 'activate',
        'status', 'total_jobs', 'done_jobs', 'created_count', 'skipped_count', 'error', 'finished_at',
    ];

    /** @return array<string, string> */
    protected function casts(): array
    {
        return [
            'subjects' => 'array',
            'grades' => 'array',
            'games' => 'array',
            'activate' => 'boolean',
            'per_combination' => 'integer',
            'total_jobs' => 'integer',
            'done_jobs' => 'integer',
            'created_count' => 'integer',
            'skipped_count' => 'integer',
            'finished_at' => 'datetime',
        ];
    }

    /** @return BelongsTo<User, $this> */
    public function requester(): BelongsTo
    {
        return $this->belongsTo(User::class, 'requested_by');
    }

    /** @return HasMany<Question, $this> */
    public function questions(): HasMany
    {
        return $this->hasMany(Question::class, 'generation_id');
    }

    /** @return HasMany<QuestionGenerationItem, $this> */
    public function items(): HasMany
    {
        return $this->hasMany(QuestionGenerationItem::class, 'generation_id');
    }

    /** Create one queued progress row per subject/grade pair. */
    public function createItems(): void
    {
        $now = now();
        $rows = [];
        foreach ($this->subjects as $subject) {
            foreach ($this->grades as $grade) {
                $rows[] = [
                    'generation_id' => $this->id,
                    'subject' => $subject,
                    'grade' => (int) $grade,
                    'status' => QuestionGenerationItem::QUEUED,
                    'target' => $this->per_combination,
                    'created_at' => $now,
                    'updated_at' => $now,
                ];
            }
        }
        foreach (array_chunk($rows, 200) as $chunk) {
            QuestionGenerationItem::query()->insert($chunk);
        }
    }

    /** Progress row of one subject/grade; created on demand for requests made before progress tracking. */
    public function itemFor(string $subject, int $grade): QuestionGenerationItem
    {
        return QuestionGenerationItem::query()->firstOrCreate(
            ['generation_id' => $this->id, 'subject' => $subject, 'grade' => $grade],
            ['status' => QuestionGenerationItem::QUEUED, 'target' => $this->per_combination, 'created_count' => 0, 'skipped_count' => 0],
        );
    }

    /** The first job to start moves the request from queued to running. */
    public function markRunning(): void
    {
        $this->newQuery()->whereKey($this->id)->where('status', 'queued')->update(['status' => 'running']);
    }

    /** Record a finished subject/grade job; closes the request after the last one. */
    public function jobFinished(int $created, int $skipped, ?string $error = null): void
    {
        $this->newQuery()->whereKey($this->id)->incrementEach(
            ['done_jobs' => 1, 'created_count' => $created, 'skipped_count' => $skipped],
            array_filter(['status' => 'running', 'error' => $error]),
        );
        $fresh = $this->fresh();
        if ($fresh !== null && $fresh->done_jobs >= $fresh->total_jobs) {
            $fresh->update([
                'status' => $fresh->created_count === 0 && $fresh->error !== null ? 'failed' : 'done',
                'finished_at' => now(),
            ]);
        }
    }
}
