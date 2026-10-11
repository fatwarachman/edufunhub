<?php

namespace App\Services;

use App\Models\Classroom;
use Illuminate\Support\Facades\Http;
use Throwable;

/**
 * Finds the game behind a room PIN on the Go game service, so a player can
 * type only the code and land in the right game. The game service stays the
 * source of truth; an unreachable service simply finds no rooms.
 */
class RoomPinLookup
{
    public function __construct(private GameServiceSigner $signer) {}

    /**
     * Open rooms first (lobby), then rooms that already started.
     *
     * @return list<array{game_key: string, titleKey: string, icon: string, accent: string, phase: string, open: bool, url: string}>
     */
    public function find(string $pin): array
    {
        if (! preg_match('/^\d{6}$/', $pin)) {
            return [];
        }

        $rooms = $this->findGameRooms($pin);

        $classroom = $this->findClassroom($pin);
        if ($classroom !== null) {
            $rooms[] = $classroom;
        }

        return $rooms;
    }

    /**
     * @return list<array{game_key: string, titleKey: string, icon: string, accent: string, phase: string, open: bool, url: string}>
     */
    private function findGameRooms(string $pin): array
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
                ->get((string) config('game-service.room_url'), ['pin' => $pin])
                ->throw()
                ->json('rooms');
        } catch (Throwable) {
            return [];
        }

        $catalog = collect(config('game-catalog.categories'))
            ->flatMap(fn (array $category): array => $category['games'])
            ->filter(fn (array $game): bool => (bool) ($game['multiplayer'] ?? false))
            ->keyBy('key');

        return collect(is_array($rooms) ? $rooms : [])
            ->filter(fn (mixed $room): bool => is_array($room) && $catalog->has($room['game'] ?? null))
            ->map(function (array $room) use ($catalog, $pin): array {
                $game = $catalog[$room['game']];

                return [
                    'game_key' => $game['key'],
                    'titleKey' => $game['titleKey'],
                    'icon' => $game['icon'] ?? 'gamepad',
                    'accent' => $game['accent'] ?? '#f5a623',
                    'phase' => strtolower((string) ($room['phase'] ?? '')),
                    'open' => (bool) ($room['open'] ?? false),
                    'url' => $this->playerUrl($game, $pin),
                ];
            })
            ->unique('game_key')
            ->sortByDesc('open')
            ->values()
            ->all();
    }

    /**
     * @return array{game_key: string, titleKey: string, icon: string, accent: string, phase: string, open: bool, url: string}|null
     */
    private function findClassroom(string $pin): ?array
    {
        $classroom = Classroom::query()
            ->where('pin', $pin)
            ->where(function ($q) {
                $now = now();
                $q->where(fn ($q) => $q->where('starts_at', '<=', $now)->where('ends_at', '>', $now))
                    ->orWhere('starts_at', '>', $now);
            })
            ->first();

        if ($classroom === null) {
            return null;
        }

        return [
            'game_key' => 'classroom',
            'titleKey' => 'classroom.title',
            'icon' => 'school',
            'accent' => '#5ad1a6',
            'phase' => $classroom->status(),
            'open' => $classroom->isActive(),
            'url' => route('classrooms.show', ['pin' => $pin], absolute: false),
        ];
    }

    /**
     * Player page of a game with the room PIN (same target as the invite link).
     *
     * @param  array<string, mixed>  $game
     */
    private function playerUrl(array $game, string $pin): string
    {
        if ($game['key'] === 'turbo-trivia') {
            return route('games.turbo-trivia.play', ['pin' => $pin], absolute: false);
        }

        if ($game['key'] === 'block-battle') {
            return route('games.block-battle.play', ['pin' => $pin], absolute: false);
        }

        return route($game['route'], ['pin' => $pin], absolute: false);
    }
}
