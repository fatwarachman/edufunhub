<?php

namespace App\Services\Classrooms;

use App\Services\GameServiceSigner;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Log;
use Throwable;

/**
 * Best-effort signed call that disconnects a student (or everyone, user 0)
 * from the Go classroom world. Never throws.
 */
class ClassroomWorldKicker
{
    public const TIMEOUT_SECONDS = 1.5;

    public function __construct(private GameServiceSigner $signer) {}

    public function kick(int $classroomId, int $userId = 0): void
    {
        if (! $this->signer->isConfigured()) {
            return;
        }

        try {
            $body = (string) json_encode(['classroom' => $classroomId, 'user' => $userId]);
            $timestamp = (string) now()->getTimestamp();

            Http::timeout(self::TIMEOUT_SECONDS)
                ->connectTimeout(self::TIMEOUT_SECONDS)
                ->withHeaders([
                    'X-Game-Timestamp' => $timestamp,
                    'X-Game-Signature' => $this->signer->sign($timestamp, $body),
                ])
                ->withBody($body, 'application/json')
                ->post((string) config('game-service.classroom_kick_url'));
        } catch (Throwable $exception) {
            Log::warning('Classroom world kick failed.', [
                'classroom' => $classroomId,
                'user' => $userId,
                'error' => $exception->getMessage(),
            ]);
        }
    }
}
