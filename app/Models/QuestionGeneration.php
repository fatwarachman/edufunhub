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
    public const STATUSES = ['queued', 'running', 'done', 'failed', 'cancelled'];

    /** Most questions one request may ask per subject/grade pair. */
    public const MAX_PER_COMBINATION = 20;

    /** Questions asked from the model per call. */
    public const BATCH = 5;

    protected $fillable = [
        'requested_by', 'model', 'subjects', 'grades', 'per_combination', 'games', 'activate',
        'status', 'total_jobs', 'done_jobs', 'created_count', 'skipped_count', 'error', 'cancelled_at', 'finished_at',
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
            'cancelled_at' => 'datetime',
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

    /**
     * Requests still generating, newest first, with per subject/grade progress
     * (shown again when an admin comes back to the question pages).
     *
     * @return list<array<string, mixed>>
     */
    public static function liveProgress(): array
    {
        return self::query()
            ->whereIn('status', ['queued', 'running'])
            ->with(['requester:id,name', 'items' => fn ($query) => $query->orderBy('id')])
            ->latest('id')
            ->limit(5)
            ->get()
            ->map(fn (QuestionGeneration $generation): array => $generation->toProgressPayload())
            ->all();
    }

    /**
     * Progress shape shared by the generate page and the live banner.
     *
     * @return array<string, mixed>
     */
    public function toProgressPayload(): array
    {
        return [
            ...$this->only(['id', 'model', 'subjects', 'grades', 'per_combination', 'activate', 'status', 'total_jobs', 'done_jobs', 'created_count', 'skipped_count', 'error']),
            'cancelled_at' => $this->cancelled_at?->toIso8601String(),
            'requested_by' => $this->requester?->name,
            'created_at' => $this->created_at?->toIso8601String(),
            'finished_at' => $this->finished_at?->toIso8601String(),
            'items' => $this->items->map(fn (QuestionGenerationItem $item): array => $item->toProgress())->values()->all(),
        ];
    }

    public function isLive(): bool
    {
        return in_array($this->status, ['queued', 'running'], true);
    }

    /** True once an admin stopped the request (re-read so running jobs see it). */
    public function stopRequested(): bool
    {
        return $this->newQuery()->whereKey($this->id)->whereNotNull('cancelled_at')->exists();
    }

    /**
     * Stop the request: subject/grade pairs still waiting in the queue are
     * closed without calling the model; running pairs stop after their
     * current batch and keep the questions already saved.
     */
    public function cancel(): void
    {
        $updated = $this->newQuery()->whereKey($this->id)->whereNull('cancelled_at')
            ->whereIn('status', ['queued', 'running'])
            ->update(['cancelled_at' => now()]);
        if ($updated === 0) {
            return;
        }

        $skipped = $this->items()->where('status', QuestionGenerationItem::QUEUED)
            ->update(['status' => QuestionGenerationItem::CANCELLED, 'finished_at' => now(), 'updated_at' => now()]);
        if ($skipped > 0) {
            $this->newQuery()->whereKey($this->id)->increment('done_jobs', $skipped);
        }
        $this->closeIfFinished();
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
        $this->closeIfFinished();
    }

    /** Close the request after its last subject/grade pair finished. */
    private function closeIfFinished(): void
    {
        $fresh = $this->fresh();
        if ($fresh === null || $fresh->done_jobs < $fresh->total_jobs || $fresh->finished_at !== null) {
            return;
        }

        $fresh->update([
            'status' => match (true) {
                $fresh->cancelled_at !== null => 'cancelled',
                $fresh->created_count === 0 && $fresh->error !== null => 'failed',
                default => 'done',
            },
            'finished_at' => now(),
        ]);
    }
}
