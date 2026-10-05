<?php

namespace App\Http\Middleware;

use App\Models\GameAccess;
use App\Services\Ads\AdServer;
use App\Services\DeviceDetector;
use Closure;
use Illuminate\Http\Request;
use Illuminate\Support\Str;
use Inertia\Inertia;
use Symfony\Component\HttpFoundation\Response;

/**
 * Standard middleware of every game route. Shares the ads that fill the
 * game's placements, and stores the device class, operating system and
 * browser each time a game page is opened. Reloads within the same session are counted once per window so a
 * refresh does not inflate the numbers; bots and failed responses are skipped.
 */
class RecordGameAccess
{
    public const DEDUPE_MINUTES = 10;

    public function __construct(private DeviceDetector $detector, private AdServer $ads) {}

    public function handle(Request $request, Closure $next, string $game): Response
    {
        // Ad foundation: every game route uses this middleware, so every game
        // page receives the `ads` prop (placement => creative) for <AdSlot>.
        if ($request->isMethod('GET')) {
            Inertia::share('ads', fn (): array => $this->ads->forGame(
                $game,
                $request->user(),
                $this->detector->detect($request->userAgent(), $request->header('Sec-CH-UA-Mobile'), $request->header('Sec-CH-UA-Platform'))['device_type'],
            ));
            Inertia::share('adGame', $game);
        }

        $response = $next($request);

        if (! $request->isMethod('GET') || ! $response->isSuccessful() || $this->detector->isBot($request->userAgent())) {
            return $response;
        }

        $sessionKey = 'game_access.'.$game;
        $lastRecorded = $request->hasSession() ? (int) $request->session()->get($sessionKey, 0) : 0;
        if ($lastRecorded > now()->subMinutes(self::DEDUPE_MINUTES)->getTimestamp()) {
            return $response;
        }

        GameAccess::query()->create([
            'user_id' => $request->user()?->id,
            'game_key' => $game,
            ...$this->detector->detect(
                $request->userAgent(),
                $request->header('Sec-CH-UA-Mobile'),
                $request->header('Sec-CH-UA-Platform'),
            ),
            'user_agent' => Str::limit((string) $request->userAgent(), 497),
            'accessed_at' => now(),
        ]);

        if ($request->hasSession()) {
            $request->session()->put($sessionKey, now()->getTimestamp());
        }

        return $response;
    }
}
