<?php

namespace App\Http\Controllers;

use App\Models\PlayerProfile;
use App\Services\GameServiceSigner;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Inertia\Inertia;
use Inertia\Response;

/**
 * Duel Kuis Kelas: two players of the same grade band answer the same
 * questions live. The Go referee matches players, judges answers and awards
 * verified points; a bot joins when nobody else is waiting.
 */
class QuizDuelController extends Controller
{
    public const GAME_KEY = 'quiz-duel';

    public function __construct(public GameServiceSigner $signer) {}

    public function show(Request $request): Response
    {
        return Inertia::render('games/quiz-duel', [
            'player' => $this->player($request),
            'points' => (int) $request->user()->pointLedgers()->sum('points'),
            'serviceReady' => $this->signer->isConfigured(),
            'wsUrl' => config('game-service.public_duel_ws_url'),
            'pin' => $this->pin($request),
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

    private function pin(Request $request): ?string
    {
        $pin = $request->query('pin');

        return is_string($pin) && preg_match('/^\d{6}$/', $pin) ? $pin : null;
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
