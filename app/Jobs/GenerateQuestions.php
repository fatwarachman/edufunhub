<?php

namespace App\Jobs;

use App\Models\QuestionGeneration;
use App\Models\QuestionGenerationItem;
use App\Services\Ai\QuestionGenerator;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Queue\Queueable;
use Illuminate\Support\Str;
use Throwable;

/**
 * Generates the questions of one subject and grade for an AI request and
 * records its progress on the matching question_generation_items row.
 */
class GenerateQuestions implements ShouldQueue
{
    use Queueable;

    public int $tries = 1;

    public int $timeout = 600;

    public function __construct(public QuestionGeneration $generation, public string $subject, public int $grade)
    {
        $this->onConnection(config('ai.question_generation.connection'));
        $this->onQueue('low');
    }

    public function handle(QuestionGenerator $generator): void
    {
        $item = $this->generation->itemFor($this->subject, $this->grade);
        $claimed = QuestionGenerationItem::query()->whereKey($item->id)
            ->where('status', QuestionGenerationItem::QUEUED)
            ->update(['status' => QuestionGenerationItem::RUNNING, 'started_at' => now(), 'updated_at' => now()]);
        if ($claimed === 0) {
            return;
        }
        $item->refresh();
        $this->generation->markRunning();

        try {
            $result = $generator->generate(
                $this->generation,
                $this->subject,
                $this->grade,
                $this->generation->per_combination,
                fn (int $created, int $skipped) => $item->update(['created_count' => $created, 'skipped_count' => $skipped]),
                fn (): bool => $this->generation->stopRequested(),
            );
            $this->finish(
                $result['stopped'] ? QuestionGenerationItem::CANCELLED : QuestionGenerationItem::DONE,
                $result['created'],
                $result['skipped'],
            );
        } catch (Throwable $exception) {
            report($exception);
            $item->refresh();
            $this->finish(QuestionGenerationItem::FAILED, $item->created_count, $item->skipped_count, $this->describe($exception->getMessage()));
        }
    }

    /**
     * The worker gave up (timeout, crash): still close this subject/grade so
     * the request does not stay "running" forever.
     */
    public function failed(?Throwable $exception): void
    {
        $item = $this->generation->itemFor($this->subject, $this->grade);
        $this->finish(QuestionGenerationItem::FAILED, $item->created_count, $item->skipped_count, $this->describe($exception?->getMessage() ?? 'job failed'));
    }

    /**
     * Close the item once: the conditional update makes a late failed() after
     * handle() (or a retried job) a no-op so request totals are counted once.
     */
    private function finish(string $status, int $created, int $skipped, ?string $error = null): void
    {
        $closed = QuestionGenerationItem::query()
            ->where('generation_id', $this->generation->id)
            ->where('subject', $this->subject)
            ->where('grade', $this->grade)
            ->whereNotIn('status', QuestionGenerationItem::FINISHED)
            ->update([
                'status' => $status,
                'created_count' => $created,
                'skipped_count' => $skipped,
                'error' => $error,
                'finished_at' => now(),
                'updated_at' => now(),
            ]);

        if ($closed === 1) {
            $this->generation->jobFinished($created, $skipped, $error);
        }
    }

    private function describe(string $message): string
    {
        return Str::limit("{$this->subject}/{$this->grade}: {$message}", 500);
    }
}
