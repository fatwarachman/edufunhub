<?php

namespace App\Http\Controllers;

use App\Models\PlayerProfile;
use App\Services\GameServiceSigner;
use BaconQrCode\Renderer\Image\SvgImageBackEnd;
use BaconQrCode\Renderer\ImageRenderer;
use BaconQrCode\Renderer\RendererStyle\RendererStyle;
use BaconQrCode\Writer;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Response as HttpResponse;
use Inertia\Inertia;
use Inertia\Response;

/**
 * Block Battle / Tetris Kuis: live quiz falling-block game refereed by the Go
 * service (package blockbattle). The projector arena (`/arena/block-battle`)
 * opens a room and shows the PIN and a QR code; students scan it and play
 * from their phones (`/play/block-battle/{pin}`). Go owns the boards, gravity,
 * answers, garbage attacks, the fortress monster and points; this controller
 * renders the pages, signs the host or player token and draws the join QR code.
 * Results arrive through the shared signed webhook (`/api/internal/game-results`).
 */
class BlockBattleController extends Controller
{
    public const GAME = 'block-battle';

    /** Token audience of the projector arena (cannot answer or play). */
    public const HOST_GAME = 'block-battle-host';

    public function __construct(public GameServiceSigner $signer) {}

    /** Role picker; invite links (`?pin=`) go straight to the controller. */
    public function show(Request $request): Response
    {
        $pin = $this->pin($request->query('pin'));

        return $pin !== null
            ? $this->controllerPage($request, $pin)
            : Inertia::render('games/block-battle/index', $this->props($request, null));
    }

    /** Projector / smart TV arena of the host. */
    public function arena(Request $request, ?string $pin = null): Response
    {
        return Inertia::render('games/block-battle/arena', $this->props($request, $this->pin($pin)));
    }

    /** Student phone controller. */
    public function play(Request $request, ?string $pin = null): Response
    {
        return $this->controllerPage($request, $this->pin($pin));
    }

    /** Signed token: `role=host` for the arena, otherwise a player controller. */
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

    /** QR code (SVG) that opens the phone controller of a room. */
    public function qr(string $pin): HttpResponse
    {
        $writer = new Writer(new ImageRenderer(new RendererStyle(320, 1), new SvgImageBackEnd));

        return response($writer->writeString(route('games.block-battle.play', ['pin' => $pin])), 200, [
            'Content-Type' => 'image/svg+xml',
            'Cache-Control' => 'private, max-age=3600',
            'X-Content-Type-Options' => 'nosniff',
        ]);
    }

    private function controllerPage(Request $request, ?string $pin): Response
    {
        return Inertia::render('games/block-battle/controller', $this->props($request, $pin));
    }

    /**
     * @return array<string, mixed>
     */
    private function props(Request $request, ?string $pin): array
    {
        return [
            'player' => $this->player($request),
            'points' => (int) $request->user()->pointLedgers()->sum('points'),
            'serviceReady' => $this->signer->isConfigured(),
            'wsUrl' => config('game-service.public_block_battle_ws_url'),
            'pin' => $pin,
        ];
    }

    private function pin(mixed $value): ?string
    {
        return is_string($value) && preg_match('/^\d{6}$/', $value) ? $value : null;
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
