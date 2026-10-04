<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Question;
use App\Services\GameServiceSigner;
use App\Services\PointRules;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/**
 * Signed internal endpoint the Go game service polls to load the active bank.
 */
class QuestionBankController extends Controller
{
    public function __invoke(Request $request, GameServiceSigner $signer): JsonResponse
    {
        abort_unless($signer->verifyRequest(
            (string) $request->header('X-Game-Timestamp'),
            (string) $request->header('X-Game-Signature'),
            '',
        ), 403);

        $questions = Question::query()->active()->orderBy('id')->get();
        $rules = PointRules::current();
        $version = sha1($questions->max('updated_at').'|'.$questions->count().'|'.$questions->pluck('id')->implode(',').'|'.implode(',', $rules));

        return response()->json([
            'version' => $version,
            'points' => $rules,
            'questions' => $questions->map(fn (Question $question): array => $question->toGamePayload())->values(),
        ]);
    }
}
