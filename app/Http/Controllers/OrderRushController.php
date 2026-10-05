<?php

namespace App\Http\Controllers;

use App\Models\PlayerProfile;
use App\Services\GameServiceSigner;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Inertia\Inertia;
use Inertia\Response;

/**
 * Order Rush / Sequence Masters (Edisi TKJ): tap-to-order race refereed by
 * the Go service (package orderrush). A host screen opens a room and picks
 * the mode and sequence sets; players join with the PIN or invite link and
 * order cable colours, fibre cores and protocol steps. Go owns validation,
 * scoring, combos, power-ups and timers; this controller renders the page
 * and signs the host or player token. Results arrive through the shared
 * signed webhook (`/api/internal/game-results`).
 */
class OrderRushController extends Controller
{
    public const GAME = 'order-rush';

    /** Token audience of the host screen (cannot submit orders). */
    public const HOST_GAME = 'order-rush-host';

    public function __construct(public GameServiceSigner $signer) {}

    public function show(Request $request): Response
    {
        $pin = $request->query('pin');
        $role = $request->query('role');

        return Inertia::render('games/order-rush', [
            'player' => $this->player($request),
            'points' => (int) $request->user()->pointLedgers()->sum('points'),
            'serviceReady' => $this->signer->isConfigured(),
            'wsUrl' => config('game-service.public_order_rush_ws_url'),
            'pin' => is_string($pin) && preg_match('/^\d{6}$/', $pin) ? $pin : null,
            'role' => in_array($role, ['host', 'player'], true) ? $role : null,
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
