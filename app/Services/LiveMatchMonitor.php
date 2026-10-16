<?php

namespace App\Services;

use Illuminate\Support\Facades\Http;
use Throwable;

/**
 * Read-only view of live game rooms for admins: the room list and a
 * spectator snapshot of one room, both fetched from the Go service with a
 * signed request. Spectating never joins the room, so it cannot affect it.
 */
class LiveMatchMonitor
{
    public function __construct(private GameServiceSigner $signer) {}

    /** @return list<array{game: string, pin: string, phase: string, players: int}> */
    public function rooms(): array
    {
        if (! $this->signer->isConfigured()) {
            return [];
        }

        $timestamp = (string) now()->getTimestamp();

        try {
            $rooms = Http::timeout((float) config('game-service.presence_timeout'))
                ->withHeaders([
                    'X-Game-Timestamp' => $timestamp,
                    'X-Game-Signature' => $this->signer->sign($timestamp, ''),
                ])
                ->get((string) config('game-service.live_rooms_url'))
                ->throw()
                ->json('rooms');
        } catch (Throwable) {
            return [];
        }

        return collect(is_array($rooms) ? $rooms : [])
            ->filter(fn (mixed $room): bool => is_array($room) && preg_match('/^\d{6}$/', (string) ($room['pin'] ?? '')))
            ->map(fn (array $room): array => [
                'game' => (string) ($room['game'] ?? ''),
                'pin' => (string) $room['pin'],
                'phase' => (string) ($room['phase'] ?? ''),
                'players' => max(0, (int) ($room['players'] ?? 0)),
            ])->sortBy(['game', 'pin'])->values()->all();
    }

    /**
     * Spectator snapshot of one live room, or null when it is over, unknown or
     * the game service cannot be reached.
     *
     * @return array<string, mixed>|null
     */
    public function spectate(string $game, string $pin, string $locale): ?array
    {
        if (! $this->signer->isConfigured() || preg_match('/^\d{6}$/', $pin) !== 1 || preg_match('/^[a-z0-9-]{1,40}$/', $game) !== 1) {
            return null;
        }

        $timestamp = (string) now()->getTimestamp();

        try {
            $response = Http::timeout((float) config('game-service.presence_timeout'))
                ->withHeaders([
                    'X-Game-Timestamp' => $timestamp,
                    'X-Game-Signature' => $this->signer->sign($timestamp, ''),
                ])
                ->get((string) config('game-service.spectate_url'), ['game' => $game, 'pin' => $pin, 'locale' => $locale === 'en' ? 'en' : 'id']);
        } catch (Throwable) {
            return null;
        }

        $room = $response->successful() ? $response->json('room') : null;

        return is_array($room) ? $room : null;
    }
}
