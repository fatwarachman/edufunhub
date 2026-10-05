<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\SequenceSet;
use App\Services\GameServiceSigner;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/**
 * Signed internal endpoint the Go game service polls to load the active
 * Order Rush sequence bank (TKJ material).
 */
class SequenceBankController extends Controller
{
    public function __invoke(Request $request, GameServiceSigner $signer): JsonResponse
    {
        abort_unless($signer->verifyRequest(
            (string) $request->header('X-Game-Timestamp'),
            (string) $request->header('X-Game-Signature'),
            '',
        ), 403);

        $sets = SequenceSet::query()->active()->ordered()->get();
        $version = sha1($sets->max('updated_at').'|'.$sets->count().'|'.$sets->pluck('id')->implode(','));

        return response()->json([
            'version' => $version,
            'sets' => $sets->map(fn (SequenceSet $set): array => $set->toGamePayload())->values(),
        ]);
    }
}
