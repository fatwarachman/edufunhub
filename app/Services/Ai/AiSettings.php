<?php

namespace App\Services\Ai;

use App\Models\Setting;
use Illuminate\Support\Facades\Crypt;
use Throwable;

/**
 * OpenAI-compatible connection managed by the super admin. The API key is
 * stored encrypted and never sent back to the browser.
 */
class AiSettings
{
    public const GROUP = 'ai';

    public function baseUrl(): string
    {
        return rtrim((string) Setting::get('ai.base_url', ''), '/');
    }

    public function model(): ?string
    {
        $model = (string) Setting::get('ai.model', '');

        return $model !== '' ? $model : null;
    }

    public function apiKey(): ?string
    {
        $encrypted = (string) Setting::get('ai.api_key', '');
        if ($encrypted === '') {
            return null;
        }

        try {
            return Crypt::decryptString($encrypted);
        } catch (Throwable) {
            return null;
        }
    }

    public function hasKey(): bool
    {
        return $this->apiKey() !== null;
    }

    public function configured(): bool
    {
        return $this->baseUrl() !== '' && $this->hasKey() && $this->model() !== null;
    }

    /** Last four characters of the key, for the settings page. */
    public function keyHint(): ?string
    {
        $key = $this->apiKey();

        return $key === null ? null : '…'.mb_substr($key, -4);
    }

    public function saveConnection(string $baseUrl, ?string $apiKey): void
    {
        $previous = $this->baseUrl();
        Setting::set('ai.base_url', rtrim($baseUrl, '/'), self::GROUP);
        if ($apiKey !== null && $apiKey !== '') {
            Setting::set('ai.api_key', Crypt::encryptString($apiKey), self::GROUP);
        }
        if ($previous !== rtrim($baseUrl, '/')) {
            Setting::set('ai.models', '', self::GROUP);
        }
    }

    public function forgetKey(): void
    {
        Setting::set('ai.api_key', '', self::GROUP);
    }

    public function saveModel(string $model): void
    {
        Setting::set('ai.model', $model, self::GROUP);
    }

    /** @param  list<array{id: string, owned_by: ?string}>  $models */
    public function cacheModels(array $models): void
    {
        Setting::set('ai.models', json_encode($models), self::GROUP);
        Setting::set('ai.models_at', now()->toIso8601String(), self::GROUP);
    }

    /** @return list<array{id: string, owned_by: ?string}> */
    public function cachedModels(): array
    {
        $models = json_decode((string) Setting::get('ai.models', ''), true);

        return is_array($models) ? array_values($models) : [];
    }

    public function modelsFetchedAt(): ?string
    {
        $at = (string) Setting::get('ai.models_at', '');

        return $at !== '' ? $at : null;
    }
}
