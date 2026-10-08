<?php

namespace App\Services\Chat;

use App\Models\User;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Str;
use Throwable;

/**
 * Talks to the Go chat service (own container): signs socket tokens for
 * players and pushes new events to the sockets of the given users. Delivery
 * is best effort; messages are already stored, clients resync on reconnect.
 */
class ChatServiceClient
{
    public function isConfigured(): bool
    {
        return strlen((string) config('chat-service.secret')) >= 32;
    }

    public function issueToken(User $user): string
    {
        $payload = $this->base64UrlEncode((string) json_encode([
            'sub' => $user->id,
            'aud' => 'chat',
            'exp' => now()->addSeconds((int) config('chat-service.token_ttl'))->getTimestamp(),
            'nonce' => Str::random(16),
        ]));

        return $payload.'.'.$this->base64UrlEncode(hash_hmac('sha256', $payload, $this->secret(), true));
    }

    /**
     * @param  list<int>  $userIds
     * @param  array<string, mixed>  $event
     */
    public function publish(array $userIds, array $event): bool
    {
        $userIds = array_values(array_unique(array_filter($userIds)));
        if ($userIds === [] || ! $this->isConfigured()) {
            return false;
        }

        $body = (string) json_encode(['users' => $userIds, 'event' => $event], JSON_UNESCAPED_UNICODE);
        $timestamp = (string) now()->getTimestamp();

        try {
            return Http::timeout((float) config('chat-service.timeout'))
                ->withHeaders([
                    'X-Chat-Timestamp' => $timestamp,
                    'X-Chat-Signature' => hash_hmac('sha256', $timestamp.'.'.$body, $this->secret()),
                ])
                ->withBody($body, 'application/json')
                ->post((string) config('chat-service.publish_url'))
                ->successful();
        } catch (Throwable $exception) {
            Log::warning('chat publish failed', ['error' => $exception->getMessage()]);

            return false;
        }
    }

    /**
     * Ids of every player with an open chat socket, or null when the chat
     * service is not configured or unreachable.
     *
     * @return list<int>|null
     */
    public function onlineUserIds(): ?array
    {
        if (! $this->isConfigured()) {
            return null;
        }

        $timestamp = (string) now()->getTimestamp();

        try {
            $response = Http::timeout((float) config('chat-service.timeout'))
                ->withHeaders([
                    'X-Chat-Timestamp' => $timestamp,
                    'X-Chat-Signature' => hash_hmac('sha256', $timestamp.'.', $this->secret()),
                ])
                ->acceptJson()
                ->get((string) config('chat-service.online_url'));
        } catch (Throwable $exception) {
            Log::warning('chat online lookup failed', ['error' => $exception->getMessage()]);

            return null;
        }

        $users = $response->successful() ? $response->json('users') : null;
        if (! is_array($users)) {
            return null;
        }

        return array_values(array_unique(array_filter(array_map('intval', $users), fn (int $id): bool => $id > 0)));
    }

    private function secret(): string
    {
        return (string) config('chat-service.secret');
    }

    private function base64UrlEncode(string $value): string
    {
        return rtrim(strtr(base64_encode($value), '+/', '-_'), '=');
    }
}
