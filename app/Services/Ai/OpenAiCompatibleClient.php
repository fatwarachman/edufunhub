<?php

namespace App\Services\Ai;

use Illuminate\Http\Client\ConnectionException;
use Illuminate\Http\Client\RequestException;
use Illuminate\Support\Facades\Http;
use Laravel\Ai\AiManager;
use RuntimeException;

/**
 * Lists models of the admin's OpenAI-compatible endpoint (GET /models) and
 * registers it as the runtime provider used by the Laravel AI SDK.
 */
class OpenAiCompatibleClient
{
    /** Provider name registered in config('ai.providers'). */
    public const PROVIDER = 'edufunhub-ai';

    public function __construct(private AiSettings $settings) {}

    /**
     * @return list<array{id: string, owned_by: ?string}>
     *
     * @throws RuntimeException
     */
    public function listModels(): array
    {
        if ($this->settings->baseUrl() === '' || ! $this->settings->hasKey()) {
            throw new RuntimeException(__('ai.not_connected'));
        }

        try {
            $response = Http::baseUrl($this->settings->baseUrl())
                ->withToken((string) $this->settings->apiKey())
                ->acceptJson()
                ->timeout(20)
                ->get('models')
                ->throw();
        } catch (ConnectionException) {
            throw new RuntimeException(__('ai.unreachable'));
        } catch (RequestException $exception) {
            throw new RuntimeException(__('ai.http_error', ['status' => $exception->response->status()]));
        }

        $rows = $response->json('data');
        if (! is_array($rows)) {
            throw new RuntimeException(__('ai.bad_models_response'));
        }

        return collect($rows)
            ->filter(fn ($row): bool => is_array($row) && is_string($row['id'] ?? null) && $row['id'] !== '')
            ->map(fn (array $row): array => ['id' => $row['id'], 'owned_by' => is_string($row['owned_by'] ?? null) ? $row['owned_by'] : null])
            ->unique('id')
            ->sortBy('id', SORT_NATURAL | SORT_FLAG_CASE)
            ->values()
            ->all();
    }

    /**
     * Point the SDK provider at the admin endpoint (chat/completions API).
     *
     * @throws RuntimeException
     */
    public function register(): string
    {
        if (! $this->settings->configured()) {
            throw new RuntimeException(__('ai.not_configured'));
        }

        config(['ai.providers.'.self::PROVIDER => [
            'driver' => 'deepseek',
            'key' => $this->settings->apiKey(),
            'url' => $this->settings->baseUrl(),
        ]]);
        app(AiManager::class)->forgetInstance(self::PROVIDER);
        app(AiManager::class)->textProvider(self::PROVIDER)
            ->useTextGateway(app(OpenAiCompatibleGateway::class));

        return self::PROVIDER;
    }
}
