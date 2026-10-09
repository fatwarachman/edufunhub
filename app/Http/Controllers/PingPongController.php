<?php

namespace App\Http\Controllers;

use App\Models\PlayerProfile;
use App\Services\GameServiceSigner;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Inertia\Inertia;
use Inertia\Response;

class PingPongController extends Controller
{
    public const GAME_KEY = 'ping-pong';

    public function __construct(public GameServiceSigner $signer) {}

    public function show(Request $request): Response
    {
        $pin = $request->query('pin');

        return Inertia::render('games/ping-pong', [
            'player' => $this->player($request),
            'pin' => is_string($pin) && preg_match('/^[0-9]{6}$/', $pin) ? $pin : null,
            'points' => (int) $request->user()->pointLedgers()->sum('points'),
            'serviceReady' => $this->signer->isConfigured(),
            'wsUrl' => config('game-service.public_ping_pong_ws_url'),
        ]);
    }

    /**
     * The grade picks the question band; players without one still get a
     * token and draw from the lowest band.
     */
    public function token(Request $request): JsonResponse
    {
        abort_unless($this->signer->isConfigured(), 503);

        $player = $this->player($request);

        return response()->json([
            'token' => $this->signer->issueToken($request->user(), self::GAME_KEY, [
                ...$player,
                'grade' => $player['grade'] ?? PlayerProfile::MIN_GRADE,
            ]),
            'expires_in' => (int) config('game-service.token_ttl'),
        ]);
    }

    /**
     * @return array{id: int, name: string, grade: ?int, color: string, accessory: string, character: array<string, mixed>}
     */
    private function player(Request $request): array
    {
        $user = $request->user();
        $profile = $user->playerProfile()->first() ?? new PlayerProfile;

        return [
            'id' => $user->id,
            'name' => $profile->nickname ?: $user->name,
            'grade' => $profile->grade,
            'color' => $profile->color,
            'accessory' => $profile->accessory,
            'character' => $profile->look(),
        ];
    }
}
