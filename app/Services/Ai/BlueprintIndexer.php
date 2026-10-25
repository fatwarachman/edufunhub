<?php

namespace App\Services\Ai;

use App\Models\QuestionBlueprint;
use App\Models\QuestionBlueprintChunk;
use Illuminate\Support\Facades\DB;
use RuntimeException;
use Throwable;

/**
 * Builds the retrieval index of a blueprint: sections from BlueprintChunker,
 * plus embedding vectors when an embedding model is set. Embedding failures
 * keep the index usable with keyword search and record the reason.
 */
class BlueprintIndexer
{
    public function __construct(private BlueprintChunker $chunker, private EmbeddingClient $embeddings) {}

    public function index(QuestionBlueprint $blueprint): void
    {
        $chunks = $this->chunker->chunk($blueprint->content);
        $model = $this->embeddings->enabled() ? $this->embeddings->model() : null;
        $vectors = [];
        $error = null;

        if ($model !== null && $chunks !== []) {
            try {
                $vectors = $this->embeddings->embed(
                    array_map(fn (array $chunk): string => trim(($chunk['heading'] ?? '')."\n".$chunk['content']), $chunks),
                    $model,
                );
            } catch (RuntimeException $exception) {
                $error = $exception->getMessage();
                $model = null;
            } catch (Throwable $exception) {
                report($exception);
                $error = __('blueprint.embedding_bad', ['model' => $model]);
                $model = null;
            }
        }

        DB::transaction(function () use ($blueprint, $chunks, $vectors, $model, $error): void {
            $blueprint->chunks()->delete();
            $now = now();
            $rows = [];
            foreach ($chunks as $position => $chunk) {
                $rows[] = [
                    'blueprint_id' => $blueprint->id,
                    'position' => $position,
                    'heading' => $chunk['heading'],
                    'content' => $chunk['content'],
                    'grades' => json_encode($chunk['grades']),
                    'embedding' => isset($vectors[$position]) ? QuestionBlueprintChunk::packVector($vectors[$position]) : null,
                    'embedding_model' => isset($vectors[$position]) ? $model : null,
                    'created_at' => $now,
                    'updated_at' => $now,
                ];
            }
            foreach (array_chunk($rows, 100) as $batch) {
                QuestionBlueprintChunk::query()->insert($batch);
            }

            $blueprint->forceFill([
                'index_status' => QuestionBlueprint::INDEX_READY,
                'chunks_count' => count($rows),
                'embedding_model' => $model,
                'index_error' => $error,
                'indexed_at' => $now,
            ])->save();
        });
    }
}
