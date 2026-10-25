<?php

namespace App\Services\Ai;

use App\Models\Setting;
use Illuminate\Http\Client\ConnectionException;
use Illuminate\Http\Client\RequestException;
use Illuminate\Support\Facades\Http;
use RuntimeException;

/**
 * Embedding vectors from the admin's OpenAI-compatible server (POST
 * /embeddings) for semantic search in question blueprints. Optional: with
 * no embedding model set, blueprint retrieval uses keyword search only.
 */
class EmbeddingClient
{
    /** Inputs sent per request. */
    public const BATCH = 32;

    /** Characters of one input (models accept a few thousand tokens). */
    public const MAX_INPUT = 6000;

    public function __construct(private AiSettings $settings) {}

    public function model(): ?string
    {
        $model = trim((string) Setting::get('ai.embedding_model', ''));

        return $model !== '' ? $model : null;
    }

    public function saveModel(?string $model): void
    {
        Setting::set('ai.embedding_model', trim((string) $model), AiSettings::GROUP);
    }

    public function enabled(): bool
    {
        return $this->model() !== null && $this->settings->baseUrl() !== '' && $this->settings->hasKey();
    }

    /**
     * @param  list<string>  $inputs
     * @return list<list<float>> one vector per input, same order
     *
     * @throws RuntimeException
     */
    public function embed(array $inputs, ?string $model = null): array
    {
        $model ??= $this->model();
        if ($model === null || $this->settings->baseUrl() === '' || ! $this->settings->hasKey()) {
            throw new RuntimeException(__('blueprint.embedding_off'));
        }

        $vectors = [];
        foreach (array_chunk($inputs, self::BATCH) as $batch) {
            try {
                $response = Http::baseUrl($this->settings->baseUrl())
                    ->withToken((string) $this->settings->apiKey())
                    ->acceptJson()
                    ->timeout(60)
                    ->post('embeddings', [
                        'model' => $model,
                        'input' => array_map(fn (string $text): string => mb_substr($text, 0, self::MAX_INPUT), $batch),
                    ])
                    ->throw();
            } catch (ConnectionException) {
                throw new RuntimeException(__('ai.unreachable'));
            } catch (RequestException $exception) {
                throw new RuntimeException(__('blueprint.embedding_http', ['status' => $exception->response->status(), 'model' => $model]));
            }

            $rows = collect($response->json('data'))
                ->filter(fn ($row): bool => is_array($row) && is_array($row['embedding'] ?? null))
                ->sortBy(fn (array $row): int => (int) ($row['index'] ?? 0))
                ->values();
            if ($rows->count() !== count($batch)) {
                throw new RuntimeException(__('blueprint.embedding_bad', ['model' => $model]));
            }
            foreach ($rows as $row) {
                $vectors[] = array_map('floatval', $row['embedding']);
            }
        }

        return $vectors;
    }

    /** @param  list<float>  $a  @param  list<float>  $b */
    public static function cosine(array $a, array $b): float
    {
        $count = min(count($a), count($b));
        if ($count === 0 || count($a) !== count($b)) {
            return 0.0;
        }
        $dot = 0.0;
        $normA = 0.0;
        $normB = 0.0;
        for ($i = 0; $i < $count; $i++) {
            $dot += $a[$i] * $b[$i];
            $normA += $a[$i] * $a[$i];
            $normB += $b[$i] * $b[$i];
        }

        return $normA > 0 && $normB > 0 ? $dot / (sqrt($normA) * sqrt($normB)) : 0.0;
    }
}
