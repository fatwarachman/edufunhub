<?php

namespace App\Http\Middleware;

use App\Models\GameAccess;
use App\Services\Ads\AdServer;
use App\Services\Classrooms\ClassroomContext;
use App\Services\Classrooms\ClassroomPlayLimit;
use App\Services\DeviceDetector;
use App\Services\UserActivity;
use Closure;
use Illuminate\Http\RedirectResponse;
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

    public function __construct(private DeviceDetector $detector, private AdServer $ads, private UserActivity $activity, private ClassroomContext $classrooms, private ClassroomPlayLimit $playLimits) {}

    public function handle(Request $request, Closure $next, string $game): Response
    {
        $limitRedirect = $this->playLimitRedirect($request, $game);
        if ($limitRedirect !== null) {
            return $limitRedirect;
        }

        // Ad foundation: every game route uses this middleware, so every game
        // page receives the `ads` prop (placement => creative) for <AdSlot>.
        if ($request->isMethod('GET')) {
            Inertia::share('ads', fn (): array => $this->ads->forGame(
                $game,
                $request->user(),
                $this->detector->detect($request->userAgent(), $request->header('Sec-CH-UA-Mobile'), $request->header('Sec-CH-UA-Platform'))['device_type'],
            ));
            Inertia::share('adGame', $game);
            Inertia::share('gameReturn', fn (): ?array => $this->returnTarget($request, $game));
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

        $device = $this->detector->detect(
            $request->userAgent(),
            $request->header('Sec-CH-UA-Mobile'),
            $request->header('Sec-CH-UA-Platform'),
        );

        GameAccess::query()->create([
            'user_id' => $request->user()?->id,
            'game_key' => $game,
            ...$device,
            'user_agent' => Str::limit((string) $request->userAgent(), 497),
            'accessed_at' => now(),
        ]);

        if ($request->user() !== null) {
            $this->activity->gameOpened($request->user(), $game, $device['device_type']);
        }

        if ($request->hasSession()) {
            $request->session()->put($sessionKey, now()->getTimestamp());
        }

        return $response;
    }

    /**
     * Classroom play limit: a member who used every play of this classroom
     * game is sent back to the classroom page instead of opening the game.
     * Only page visits (GET, not JSON) are blocked.
     */
    private function playLimitRedirect(Request $request, string $game): ?RedirectResponse
    {
        $user = $request->user();
        if ($user === null || $game === '' || ! $request->isMethod('GET') || $request->expectsJson()) {
            return null;
        }

        $classroom = $this->classrooms->currentFor($user, $game);
        if ($classroom === null || $this->playLimits->remaining($classroom, $user, $game) !== 0) {
            return null;
        }

        return redirect()
            ->route('classrooms.show', ['pin' => $classroom->pin])
            ->with('error', __('classrooms.play_limit_reached', [
                'game' => $this->playLimits->gameTitle($game),
                'max' => (int) $this->playLimits->maxFor($classroom, $game),
            ]));
    }

    /**
     * Where "back" leads from this game: the classroom the player is
     * actively in when the teacher picked this game, else null (portal).
     * Built server-side from the membership, never from a query value.
     *
     * @return array{href: string, name: string}|null
     */
    private function returnTarget(Request $request, string $game): ?array
    {
        $user = $request->user();
        if ($user === null || $game === '') {
            return null;
        }

        $classroom = $this->classrooms->currentFor($user, $game);

        return $classroom === null ? null : [
            'href' => route('classrooms.show', ['pin' => $classroom->pin], absolute: false),
            'name' => $classroom->name,
        ];
    }
}
