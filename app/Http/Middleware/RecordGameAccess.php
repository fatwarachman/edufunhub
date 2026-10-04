<?php

namespace App\Http\Middleware;

use App\Models\GameAccess;
use App\Services\DeviceDetector;
use Closure;
use Illuminate\Http\Request;
use Illuminate\Support\Str;
use Symfony\Component\HttpFoundation\Response;

/**
 * Stores the device class, operating system and browser each time a game page
 * is opened. Reloads within the same session are counted once per window so a
 * refresh does not inflate the numbers; bots and failed responses are skipped.
 */
class RecordGameAccess
{
    public const DEDUPE_MINUTES = 10;

    public function __construct(private DeviceDetector $detector) {}

    public function handle(Request $request, Closure $next, string $game): Response
    {
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
