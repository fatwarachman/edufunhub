<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Http\Requests\StoreGameResultRequest;
use App\Models\GameHistory;
use App\Models\User;
use Illuminate\Http\JsonResponse;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;

class GameResultController extends Controller
{
    public function store(StoreGameResultRequest $request): JsonResponse
    {
        $data = $request->validated();
        $user = User::query()->findOrFail($data['user_id']);

        if (GameHistory::query()->where('event_id', $data['event_id'])->exists()) {
            return response()->json(['status' => 'duplicate']);
        }

        $locale = in_array($user->locale, ['id', 'en'], true) ? $user->locale : config('app.locale');

        DB::transaction(function () use ($user, $data, $locale): void {
            $user->gameHistories()->create([
                'game_key' => $data['game_key'],
                'game_name' => $this->historyName($data['game_key'], $data['mission'], $locale),
                'points' => $data['points'],
                'played_at' => Carbon::parse($data['completed_at']),
                'event_id' => $data['event_id'],
            ]);

            $user->pointLedgers()->create([
                'points' => $data['points'],
                'reason' => $data['game_key'].':'.$data['mission'],
                'event_id' => $data['event_id'],
            ]);
        });

        return response()->json(['status' => 'recorded'], 201);
    }

    private function historyName(string $gameKey, string $mission, string $locale): string
    {
        if ($gameKey === 'sky-quiz') {
            return __('sky_quiz.history_name', [], $locale);
        }

        return __('flag_quest.history_name', [
            'mission' => __('flag_quest.missions.'.$mission, [], $locale),
        ], $locale);
    }
}
