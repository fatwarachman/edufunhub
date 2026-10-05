<?php

namespace App\Http\Controllers;

use App\Models\PlayerProfile;
use App\Services\GameServiceSigner;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Inertia\Inertia;
use Inertia\Response;

/**
 * Floor Drop: trivia battle royale refereed by the Go service (package
 * floordrop). A host screen (teacher, classroom projector) opens a room and
 * players join from their own devices with the PIN or invite link. Go owns
 * the room state machine, timers, eliminations and points; this controller
 * only renders the page and signs the host or player token.
 */
class FloorDropController extends Controller
{
    public const GAME = 'floor-drop';

    /** Token audience of the host screen (cannot answer questions). */
    public const HOST_GAME = 'floor-drop-host';

    public function __construct(public GameServiceSigner $signer) {}

    public function show(Request $request): Response
    {
        $pin = $request->query('pin');

        return Inertia::render('games/floor-drop', [
            'player' => $this->player($request),
            'points' => (int) $request->user()->pointLedgers()->sum('points'),
            'serviceReady' => $this->signer->isConfigured(),
            'wsUrl' => config('game-service.public_floor_drop_ws_url'),
            'pin' => is_string($pin) && preg_match('/^\d{6}$/', $pin) ? $pin : null,
            'role' => in_array($request->query('role'), ['host', 'player'], true) ? $request->query('role') : null,
        ]);
    }

    /** Signed token: `role=host` for the host screen, otherwise a player pad. */
    public function token(Request $request): JsonResponse
    {
        abort_unless($this->signer->isConfigured(), 503);

        $player = $this->player($request);
        $game = $request->input('role') === 'host' ? self::HOST_GAME : self::GAME;

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
