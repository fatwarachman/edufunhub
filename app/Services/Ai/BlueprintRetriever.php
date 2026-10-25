<?php

namespace App\Services\Ai;

use App\Models\QuestionBlueprint;
use App\Models\QuestionBlueprintChunk;
use Illuminate\Support\Collection;
use Throwable;

/**
 * Picks the blueprint sections that fit one question request (RAG): a
 * keyword score (BM25) mixed with embedding similarity when vectors exist,
 * boosted for sections that mention the requested grade, then cut to a
 * character budget and returned in document order.
 */
class BlueprintRetriever
{
    /** Characters of blueprint text placed in one AI prompt. */
    public const BUDGET = 7000;

    /** Small blueprints are sent whole instead of searched. */
    public const WHOLE_LIMIT = 7000;

    /** Sections always sent (best first), even when their score is low. */
    public const MIN_SECTIONS = 3;

    /** Other sections need at least this share of the best score. */
    public const MIN_RELATIVE_SCORE = 0.15;

    /** Words that carry no meaning for matching (Indonesian + English). */
    private const STOPWORDS = ['dan', 'atau', 'yang', 'di', 'ke', 'dari', 'untuk', 'dengan', 'pada', 'dalam', 'ini', 'itu', 'adalah', 'the', 'and', 'or', 'of', 'to', 'in', 'a', 'an', 'is', 'are', 'for', 'on', 'with', 'kelas', 'grade', 'soal', 'question', 'questions'];

    /** @var array<string, list<float>> query vectors per request text */
    private array $queryVectors = [];

    public function __construct(private EmbeddingClient $embeddings) {}

    /**
     * @return array{text: string, sections: list<int>, mode: string}
     */
    public function retrieve(QuestionBlueprint $blueprint, string $query, ?int $grade = null, int $budget = self::BUDGET): array
    {
        $chunks = $blueprint->chunks()->orderBy('position')->get();
        if ($chunks->isEmpty()) {
            $chunks = $this->transientChunks($blueprint);
        }
        if ($chunks->isEmpty()) {
            return ['text' => $blueprint->promptText(), 'sections' => [], 'mode' => 'whole'];
        }
        if ($chunks->sum(fn (QuestionBlueprintChunk $chunk): int => mb_strlen($chunk->content)) <= min($budget, self::WHOLE_LIMIT)) {
            return [
                'text' => $chunks->map(fn (QuestionBlueprintChunk $chunk): string => $chunk->promptText())->implode("\n\n"),
                'sections' => $chunks->pluck('position')->all(),
                'mode' => 'whole',
            ];
        }

        $keyword = $this->bm25($chunks, $query);
        $semantic = $this->semantic($chunks, $query);
        $mode = $semantic === [] ? 'keyword' : 'hybrid';

        $gradeMatches = $grade !== null && $chunks->contains(fn (QuestionBlueprintChunk $chunk): bool => in_array($grade, $chunk->grades ?? [], true));
        $scores = [];
        foreach ($chunks as $index => $chunk) {
            $score = $semantic === [] ? $keyword[$index] : 0.45 * $keyword[$index] + 0.55 * ($semantic[$index] ?? 0);
            $grades = $chunk->grades ?? [];
            if ($gradeMatches && $grades !== []) {
                if (! in_array($grade, $grades, true)) {
                    continue;
                }
                $score += count($grades) <= 3 ? 1.0 : 0.3;
            }
            $scores[$index] = $score;
        }
        arsort($scores);
        $top = max($scores ?: [0]);
        $picked = [];
        $used = 0;
        foreach (array_keys($scores) as $rank => $index) {
            if ($rank >= self::MIN_SECTIONS && $top > 0 && $scores[$index] < $top * self::MIN_RELATIVE_SCORE) {
                break;
            }
            $length = mb_strlen($chunks[$index]->promptText()) + 2;
            if ($used + $length > $budget) {
                if ($picked === []) {
                    $picked[] = $index;
                    $used = $budget;
                }

                continue;
            }
            $picked[] = $index;
            $used += $length;
        }
        sort($picked);

        return [
            'text' => collect($picked)->map(fn (int $index): string => mb_substr($chunks[$index]->promptText(), 0, $budget))->implode("\n\n"),
            'sections' => collect($picked)->map(fn (int $index): int => $chunks[$index]->position)->all(),
            'mode' => $mode,
        ];
    }

    /**
     * Sections built in memory for a blueprint that has no stored index yet
     * (uploaded before RAG, or still indexing), so retrieval still works.
     *
     * @return Collection<int, QuestionBlueprintChunk>
     */
    private function transientChunks(QuestionBlueprint $blueprint): Collection
    {
        return collect(app(BlueprintChunker::class)->chunk($blueprint->content))
            ->values()
            ->map(fn (array $chunk, int $position): QuestionBlueprintChunk => new QuestionBlueprintChunk([...$chunk, 'position' => $position]));
    }

    /** @return list<string> */
    public static function terms(string $text): array
    {
        preg_match_all('/[\p{L}\p{N}]{3,}/u', mb_strtolower($text), $matches);

        return array_values(array_filter($matches[0], fn (string $term): bool => ! in_array($term, self::STOPWORDS, true)));
    }

    /**
     * BM25 per section, scaled to 0..1.
     *
     * @param  Collection<int, QuestionBlueprintChunk>  $chunks
     * @return array<int, float>
     */
    private function bm25(Collection $chunks, string $query): array
    {
        $queryTerms = array_unique(self::terms($query));
        $docs = $chunks->map(fn (QuestionBlueprintChunk $chunk): array => array_count_values(self::terms(($chunk->heading ?? '').' '.$chunk->content)))->all();
        $lengths = array_map('array_sum', $docs);
        $average = max(1, array_sum($lengths) / max(1, count($docs)));
        $total = count($docs);

        $scores = [];
        foreach ($docs as $index => $counts) {
            $score = 0.0;
            foreach ($queryTerms as $term) {
                $frequency = $counts[$term] ?? 0;
                if ($frequency === 0) {
                    continue;
                }
                $withTerm = count(array_filter($docs, fn (array $doc): bool => isset($doc[$term])));
                $idf = log(1 + ($total - $withTerm + 0.5) / ($withTerm + 0.5));
                $score += $idf * ($frequency * 2.2) / ($frequency + 1.2 * (0.25 + 0.75 * $lengths[$index] / $average));
            }
            $scores[$index] = $score;
        }
        $max = max($scores ?: [0]);

        return array_map(fn (float $score): float => $max > 0 ? $score / $max : 0.0, $scores);
    }

    /**
     * Cosine similarity per section, scaled to 0..1; empty when the
     * sections have no vectors or the query cannot be embedded.
     *
     * @param  Collection<int, QuestionBlueprintChunk>  $chunks
     * @return array<int, float>
     */
    private function semantic(Collection $chunks, string $query): array
    {
        $model = $chunks->first()?->embedding_model;
        if ($model === null || $model !== $this->embeddings->model() || $chunks->contains(fn (QuestionBlueprintChunk $chunk): bool => $chunk->embedding_model !== $model)) {
            return [];
        }

        $key = $model."\n".$query;
        try {
            $this->queryVectors[$key] ??= $this->embeddings->embed([$query], $model)[0] ?? [];
        } catch (Throwable) {
            return [];
        }
        $vector = $this->queryVectors[$key];
        if ($vector === []) {
            return [];
        }

        $scores = $chunks->map(fn (QuestionBlueprintChunk $chunk): float => EmbeddingClient::cosine($vector, $chunk->vector()))->all();
        $min = min($scores);
        $max = max($scores);

        return array_map(fn (float $score): float => $max > $min ? ($score - $min) / ($max - $min) : 0.0, $scores);
    }
}
