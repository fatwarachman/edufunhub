<?php

namespace App\Jobs;

use App\Models\QuestionGeneration;
use App\Services\Ai\QuestionGenerator;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Queue\Queueable;
use Illuminate\Support\Str;
use Throwable;

/**
 * Generates the questions of one subject and grade for an AI request.
 */
class GenerateQuestions implements ShouldQueue
{
    use Queueable;

    public int $tries = 1;

    public int $timeout = 600;

    public function __construct(public QuestionGeneration $generation, public string $subject, public int $grade)
    {
        $this->onQueue('low');
    }

    public function handle(QuestionGenerator $generator): void
    {
        try {
            $result = $generator->generate($this->generation, $this->subject, $this->grade, $this->generation->per_combination);
            $this->generation->jobFinished($result['created'], $result['skipped']);
        } catch (Throwable $exception) {
            report($exception);
            $this->generation->jobFinished(0, 0, Str::limit("{$this->subject}/{$this->grade}: ".$exception->getMessage(), 500));
        }
    }

    /**
     * The worker gave up (timeout, crash): still close this subject/grade so
     * the request does not stay "running" forever.
     */
    public function failed(?Throwable $exception): void
    {
        $this->generation->jobFinished(0, 0, Str::limit("{$this->subject}/{$this->grade}: ".($exception?->getMessage() ?? 'job failed'), 500));
    }
}
