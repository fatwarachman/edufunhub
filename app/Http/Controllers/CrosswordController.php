<?php

namespace App\Http\Controllers;

use App\Models\PlayerProfile;
use App\Services\GameServiceSigner;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Inertia\Inertia;
use Inertia\Response;

/**
 * Teka-Teki Silang: solo or with friends in a PIN room. The Go referee
 * generates the grid per level, keeps the answers and awards points.
 */
class CrosswordController extends Controller
{
    public const GAME_KEY = 'crossword';

    public function __construct(public GameServiceSigner $signer) {}

    public function show(Request $request): Response
    {
        $pin = $request->query('pin');

        return Inertia::render('games/crossword', [
            'player' => $this->player($request),
            'points' => (int) $request->user()->pointLedgers()->sum('points'),
            'serviceReady' => $this->signer->isConfigured(),
            'wsUrl' => config('game-service.public_crossword_ws_url'),
            'pin' => is_string($pin) && preg_match('/^\d{6}$/', $pin) ? $pin : null,
        ]);
    }

    public function token(Request $request): JsonResponse
    {
        $player = $this->player($request);

        abort_unless($this->signer->isConfigured(), 503);

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
