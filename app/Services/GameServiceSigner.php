<?php

namespace App\Services;

use App\Models\User;
use Illuminate\Support\Str;
use RuntimeException;

/**
 * Issues player tokens for the Go game service and verifies results it reports back.
 *
 * Token: base64url(json) "." base64url(HMAC-SHA256(payload, secret)).
 * Result signature: hex(HMAC-SHA256(timestamp "." body, secret)).
 */
class GameServiceSigner
{
    public function isConfigured(): bool
    {
        return strlen((string) config('game-service.secret')) >= 32;
    }

    /**
     * @param  array{name: string, grade: int, color: string, accessory: string}  $player
     */
    public function issueToken(User $user, string $game, array $player): string
    {
        $payload = $this->base64UrlEncode((string) json_encode([
            'sub' => $user->id,
            'name' => $player['name'],
            'grade' => $player['grade'],
            'color' => $player['color'],
            'accessory' => $player['accessory'],
            'game' => $game,
            'exp' => now()->addSeconds((int) config('game-service.token_ttl'))->getTimestamp(),
            'nonce' => Str::random(16),
        ], JSON_UNESCAPED_UNICODE));

        return $payload.'.'.$this->base64UrlEncode(hash_hmac('sha256', $payload, $this->secret(), true));
    }

    public function verifyRequest(string $timestamp, string $signature, string $body): bool
    {
        if (! $this->isConfigured() || ! ctype_digit($timestamp) || $signature === '') {
            return false;
        }

        if (abs(now()->getTimestamp() - (int) $timestamp) > (int) config('game-service.signature_tolerance')) {
            return false;
        }

        return hash_equals(hash_hmac('sha256', $timestamp.'.'.$body, $this->secret()), $signature);
    }

    private function secret(): string
    {
        if (! $this->isConfigured()) {
            throw new RuntimeException('GAME_SERVICE_SECRET is not configured.');
        }

        return (string) config('game-service.secret');
    }

    private function base64UrlEncode(string $value): string
    {
        return rtrim(strtr(base64_encode($value), '+/', '-_'), '=');
    }
}
