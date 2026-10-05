<?php

namespace App\Http\Controllers;

use App\Models\PlayerProfile;
use App\Services\GameServiceSigner;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Inertia\Inertia;
use Inertia\Response;

/**
 * Ular Tangga Edukasi: solo or pass-and-play on one device runs in the
 * browser; online rooms (shared by PIN or link) are refereed by the Go
 * service, which owns dice, questions, turns and timers.
 */
class SnakesAndLaddersController extends Controller
{
    public const GAME_KEY = 'snakes-and-ladders';

    public function __construct(public GameServiceSigner $signer) {}

    public function show(Request $request): Response
    {
        $user = $request->user();
        $pin = $request->query('pin');

        return Inertia::render('games/snakes-and-ladders', [
            'player' => $user ? $this->player($request) : null,
            'online' => $user !== null && $this->signer->isConfigured(),
            'wsUrl' => $user ? config('game-service.public_snakes_ws_url') : null,
            'pin' => is_string($pin) && preg_match('/^\d{6}$/', $pin) ? $pin : null,
        ]);
    }

    public function token(Request $request): JsonResponse
    {
        $player = $this->player($request);

        abort_unless($this->signer->isConfigured(), 503);
        abort_if($player['grade'] === null, 422, __('character.grade_required'));

        return response()->json([
            'token' => $this->signer->issueToken($request->user(), self::GAME_KEY, $player),
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
