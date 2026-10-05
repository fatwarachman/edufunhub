<?php

namespace App\Http\Controllers;

use App\Models\PlayerProfile;
use App\Services\GameServiceSigner;
use App\Services\PlayerPortal;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Inertia\Inertia;
use Inertia\Response;

class FlagQuestController extends Controller
{
    public const GAME_KEY = 'flag-quest';

    public function __construct(public GameServiceSigner $signer) {}

    public function show(Request $request): Response
    {
        $player = $this->player($request);

        return Inertia::render('games/flag-quest', [
            'player' => $player,
            'character' => ($request->user()->playerProfile()->first() ?? new PlayerProfile)->character(),
            'points' => app(PlayerPortal::class)->totalPoints($request->user()),
            'serviceReady' => $this->signer->isConfigured(),
            'wsUrl' => config('game-service.public_ws_url'),
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
