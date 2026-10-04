<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Http\Requests\StoreGameResultRequest;
use App\Models\GameHistory;
use App\Models\Question;
use App\Models\QuestionAnswer;
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

        $profile = $user->playerProfile;

        DB::transaction(function () use ($user, $data, $locale, $profile): void {
            $history = $user->gameHistories()->create([
                'game_key' => $data['game_key'],
                'game_name' => $this->historyName($data['game_key'], $data['mission'], $locale),
                'mission' => $data['mission'],
                'grade' => $data['grade'],
                'age' => $profile?->age,
                'school_name' => $profile?->school_name,
                'points' => $data['points'],
                'correct' => $data['correct'],
                'wrong' => $data['wrong'],
                'duration_seconds' => $data['duration_seconds'],
                'played_at' => Carbon::parse($data['completed_at']),
                'event_id' => $data['event_id'],
            ]);

            $this->recordAnswers($history, $data['answers'] ?? []);

            $user->pointLedgers()->create([
                'points' => $data['points'],
                'reason' => $data['game_key'].':'.$data['mission'],
                'event_id' => $data['event_id'],
            ]);
        });

        return response()->json(['status' => 'recorded'], 201);
    }

    /**
     * Store per-question outcomes for bank questions and bump their counters.
     *
     * @param  list<array{key: string, correct: bool}>  $answers
     */
    private function recordAnswers(GameHistory $history, array $answers): void
    {
        if ($answers === []) {
            return;
        }

        $questions = Question::query()->whereIn('key', array_column($answers, 'key'))->pluck('id', 'key');

        foreach ($answers as $answer) {
            $questionId = $questions[$answer['key']] ?? null;
            if ($questionId === null) {
                continue;
            }

            QuestionAnswer::query()->create([
                'question_id' => $questionId,
                'game_history_id' => $history->id,
                'game_key' => $history->game_key,
                'correct' => (bool) $answer['correct'],
            ]);

            Question::query()->whereKey($questionId)->incrementEach([
                'times_answered' => 1,
                'times_correct' => $answer['correct'] ? 1 : 0,
            ]);
        }
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
