<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\CrosswordWord;
use App\Services\GameServiceSigner;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/**
 * Signed internal endpoint the Go game service polls to load the active
 * Teka-Teki Silang word bank.
 */
class CrosswordBankController extends Controller
{
    public function __invoke(Request $request, GameServiceSigner $signer): JsonResponse
    {
        abort_unless($signer->verifyRequest(
            (string) $request->header('X-Game-Timestamp'),
            (string) $request->header('X-Game-Signature'),
            '',
        ), 403);

        $words = CrosswordWord::query()->active()->orderBy('level')->orderBy('id')->get();
        $version = sha1($words->max('updated_at').'|'.$words->count().'|'.$words->pluck('id')->implode(','));

        return response()->json([
            'version' => $version,
            'words' => $words->map(fn (CrosswordWord $word): array => $word->toGamePayload())->values(),
        ]);
    }
}
