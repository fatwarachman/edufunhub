<?php

namespace App\Http\Controllers;

use App\Models\PlayerProfile;
use App\Services\GameServiceSigner;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Inertia\Inertia;
use Inertia\Response;

/**
 * Room quiz games refereed by the Go service (package minigames): Market
 * Math, Number & Letter Garden, Explore Indonesia and Mini Lab. Rooms use the
 * standard PIN + link invite flow; Go owns questions, timers and points.
 */
class MiniGameController extends Controller
{
    /** Game keys served by this controller. */
    public const GAMES = ['market-math', 'number-garden', 'explore-indonesia', 'mini-lab'];

    public function __construct(public GameServiceSigner $signer) {}

    public function show(Request $request, string $game): Response
    {
        $pin = $request->query('pin');

        return Inertia::render('games/mini-game', [
            'game' => $game,
            'player' => $this->player($request),
            'points' => (int) $request->user()->pointLedgers()->sum('points'),
            'serviceReady' => $this->signer->isConfigured(),
            'wsUrl' => rtrim((string) config('game-service.public_minigame_ws_base'), '/').'/'.$game,
            'pin' => is_string($pin) && preg_match('/^\d{6}$/', $pin) ? $pin : null,
        ]);
    }

    public function token(Request $request, string $game): JsonResponse
    {
        $player = $this->player($request);

        abort_unless($this->signer->isConfigured(), 503);

        return response()->json([
            'token' => $this->signer->issueToken($request->user(), $game, [
                ...$player,
                'grade' => $player['grade'] ?? PlayerProfile::MIN_GRADE,
            ]),
            'expires_in' => (int) config('game-service.token_ttl'),
        ]);
    }

    /**
     * @return array{name: string, grade: ?int, color: string, accessory: string, character: array<string, mixed>}
     */
    private function player(Request $request): array
    {
        $user = $request->user();
        $profile = $user->playerProfile()->first() ?? new PlayerProfile;

        return [
            'name' => $profile->nickname ?: $user->name,
            'grade' => $profile->grade,
            'color' => $profile->color,
            'accessory' => $profile->accessory,
            'character' => $profile->look(),
        ];
    }
}
