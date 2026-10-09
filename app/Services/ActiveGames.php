<?php

namespace App\Services;

use App\Models\User;
use Illuminate\Support\Facades\Http;
use Throwable;

/**
 * Rooms and matches a player is still seated in on the Go game service, so
 * the portal can offer "continue playing" after the browser was closed by
 * accident. The game service stays the source of truth; an unreachable
 * service simply yields no rooms.
 */
class ActiveGames
{
    public function __construct(private GameServiceSigner $signer) {}

    /**
     * @return list<array{game_key: string, titleKey: string, icon: string, accent: string, pin: ?string, phase: string, host: bool, url: string}>
     */
    public function for(User $user): array
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
                ->get((string) config('game-service.presence_url'), ['user' => $user->id])
                ->throw()
                ->json('rooms');
        } catch (Throwable) {
            return [];
        }

        $catalog = collect(config('game-catalog.categories'))
            ->flatMap(fn (array $category): array => $category['games'])
            ->keyBy('key');

        return collect(is_array($rooms) ? $rooms : [])
            ->filter(fn (mixed $room): bool => is_array($room) && $catalog->has($room['game'] ?? null))
            ->map(function (array $room) use ($catalog): array {
                $game = $catalog[$room['game']];
                $pin = is_string($room['pin'] ?? null) && preg_match('/^\d{6}$/', $room['pin']) ? $room['pin'] : null;
                $host = (bool) ($room['host'] ?? false);

                return [
                    'game_key' => $game['key'],
                    'titleKey' => $game['titleKey'],
                    'icon' => $game['icon'] ?? 'gamepad',
                    'accent' => $game['accent'] ?? '#f5a623',
                    'pin' => $pin,
                    'phase' => strtolower((string) ($room['phase'] ?? '')),
                    'host' => $host,
                    'url' => $this->resumeUrl($game, $pin, $host),
                ];
            })
            ->values()
            ->all();
    }

    /**
     * Where the player rejoins: the game page with the room PIN; host screens
     * of projector games reopen their host view (the service resumes them).
     *
     * @param  array<string, mixed>  $game
     */
    private function resumeUrl(array $game, ?string $pin, bool $host): string
    {
        if ($game['key'] === 'turbo-trivia') {
            return $host
                ? route('games.turbo-trivia.arena', ['pin' => $pin], absolute: false)
                : route('games.turbo-trivia.play', ['pin' => $pin], absolute: false);
        }

        if ($game['key'] === 'block-battle') {
            return $host
                ? route('games.block-battle.arena', ['pin' => $pin], absolute: false)
                : route('games.block-battle.play', ['pin' => $pin], absolute: false);
        }

        if (in_array($game['key'], ['floor-drop', 'economy-heist', 'order-rush', 'monster-cafe'], true)) {
            return route($game['route'], array_filter(['role' => $host ? 'host' : 'player', 'pin' => $host ? null : $pin]), absolute: false);
        }

        return route($game['route'], array_filter(['pin' => $pin]), absolute: false);
    }
}
