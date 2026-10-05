<?php

namespace App\Http\Controllers;

use App\Models\PlayerProfile;
use App\Services\GameServiceSigner;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Inertia\Inertia;
use Inertia\Response;

/**
 * Sukhoi Sky Quiz: guests play the offline demo; signed-in players fly against
 * the Go referee, which uses their profile grade and awards verified points.
 */
class SkyQuizController extends Controller
{
    public const GAME_KEY = 'sky-quiz';

    public function __construct(public GameServiceSigner $signer) {}

    public function show(Request $request): Response
    {
        $user = $request->user();

        if ($user === null) {
            return Inertia::render('games/sky-quiz', [
                'player' => null,
                'points' => 0,
                'serviceReady' => false,
                'wsUrl' => null,
            ]);
        }

        return Inertia::render('games/sky-quiz', [
            'player' => $this->player($request),
            'points' => (int) $user->pointLedgers()->sum('points'),
            'serviceReady' => $this->signer->isConfigured(),
            'wsUrl' => config('game-service.public_sky_ws_url'),
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
