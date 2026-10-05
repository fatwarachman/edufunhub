<?php

namespace App\Http\Controllers;

use App\Models\PlayerProfile;
use App\Services\GameServiceSigner;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Inertia\Inertia;
use Inertia\Response;

/**
 * Port Sorter / Pilah Port & Protokol (Edisi TKJ): packets with a port
 * number fall above four protocol bins and the player slides each one into
 * the right bin. The Go referee (package portsorter) owns the answer key,
 * falling speed, lives and points; results arrive through the shared signed
 * webhook (`/api/internal/game-results`).
 */
class PortSorterController extends Controller
{
    public const GAME_KEY = 'port-sorter';

    public function __construct(public GameServiceSigner $signer) {}

    public function show(Request $request): Response
    {
        return Inertia::render('games/port-sorter', [
            'player' => $this->player($request),
            'points' => (int) $request->user()->pointLedgers()->sum('points'),
            'serviceReady' => $this->signer->isConfigured(),
            'wsUrl' => config('game-service.public_port_sorter_ws_url'),
        ]);
    }

    /** Ports do not depend on the school grade, so players without one still get a token. */
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
