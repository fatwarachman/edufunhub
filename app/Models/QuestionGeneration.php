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
