<?php

namespace App\Jobs;

use App\Models\QuestionBlueprint;
use App\Services\Ai\BlueprintIndexer;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Queue\Queueable;
use Illuminate\Support\Str;
use Throwable;

/**
 * Splits a question blueprint into sections and embeds them (RAG index).
 */
class IndexQuestionBlueprint implements ShouldQueue
{
    use Queueable;

    public int $tries = 1;

    public int $timeout = 300;

    public function __construct(public QuestionBlueprint $blueprint)
    {
        $this->onConnection(config('ai.question_generation.connection'));
        $this->onQueue('low');
    }

    public function handle(BlueprintIndexer $indexer): void
    {
        $this->blueprint->forceFill(['index_status' => QuestionBlueprint::INDEX_RUNNING, 'index_error' => null])->save();

        try {
            $indexer->index($this->blueprint->fresh() ?? $this->blueprint);
        } catch (Throwable $exception) {
            report($exception);
            $this->failed($exception);
        }
    }

    public function failed(?Throwable $exception): void
    {
        $this->blueprint->forceFill([
            'index_status' => QuestionBlueprint::INDEX_FAILED,
            'index_error' => Str::limit($exception?->getMessage() ?? 'job failed', 500),
        ])->save();
    }
}
