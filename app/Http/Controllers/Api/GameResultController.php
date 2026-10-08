<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Http\Controllers\MiniGameController;
use App\Http\Requests\StoreGameResultRequest;
use App\Models\GameHistory;
use App\Models\Question;
use App\Models\QuestionAnswer;
use App\Models\QuestionCompensationRate;
use App\Models\SequenceAttempt;
use App\Models\User;
use App\Services\MatchRecorder;
use App\Services\PlayerBadges;
use App\Services\PlayerNotifications;
use App\Services\PlayerPortal;
use App\Services\UserActivity;
use Illuminate\Http\JsonResponse;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;

class GameResultController extends Controller
{
    public function store(StoreGameResultRequest $request, MatchRecorder $matches, PlayerPortal $portal, PlayerNotifications $notifications, PlayerBadges $badges, UserActivity $activity): JsonResponse
    {
        $data = $request->validated();
        $user = User::query()->findOrFail($data['user_id']);

        if (GameHistory::query()->where('event_id', $data['event_id'])->exists()) {
            return response()->json(['status' => 'duplicate']);
        }

        $locale = in_array($user->locale, ['id', 'en'], true) ? $user->locale : config('app.locale');

        $profile = $user->playerProfile;
        $totalBefore = $portal->totalPoints($user);

        $history = DB::transaction(function () use ($user, $data, $locale, $profile, $matches): GameHistory {
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
            $this->recordSequences($history, $data['sequence_stats'] ?? []);

            if (! empty($data['match'])) {
                $matches->record($data['game_key'], $data['match'], $history);
            }

            $user->pointLedgers()->create([
                'points' => $data['points'],
                'reason' => $data['game_key'].':'.$data['mission'],
                'event_id' => $data['event_id'],
            ]);

            return $history;
        }, 3);

        $activity->gameFinished($user, $history);

        $notifications->gameFinished(
            $user,
            $this->historyName($data['game_key'], $data['mission'], $locale),
            (int) $data['points'],
            $totalBefore,
        );

        $badges->evaluate($user);

        return response()->json(['status' => 'recorded'], 201);
    }

    /**
     * Store per-question outcomes for bank questions and bump their counters.
     * Correct answers to teacher questions lock in the compensation rate for the
     * player's grade at that moment.
     *
     * The picked option (original bank index) is kept only when it exists on
     * that question: options for multiple choice, 0/1 for true/false.
     *
     * @param  list<array{key: string, correct: bool, choice?: ?int}>  $answers
     */
    private function recordAnswers(GameHistory $history, array $answers): void
    {
        if ($answers === []) {
            return;
        }

        $questions = Question::query()->whereIn('key', array_column($answers, 'key'))->get(['id', 'key', 'type', 'options', 'source', 'created_by'])->keyBy('key');
        $rate = null;

        foreach ($answers as $answer) {
            $question = $questions->get($answer['key']);
            if ($question === null) {
                continue;
            }
            $questionId = $question->id;

            $compensation = 0;
            if ($answer['correct'] && $question->isTeacherAuthored()) {
                $rate ??= (int) (QuestionCompensationRate::amounts()[$history->grade] ?? 0);
                $compensation = $rate;
            }

            QuestionAnswer::query()->create([
                'question_id' => $questionId,
                'game_history_id' => $history->id,
                'game_key' => $history->game_key,
                'correct' => (bool) $answer['correct'],
                'choice' => $this->validChoice($question, $answer['choice'] ?? null),
                'compensation' => $compensation,
            ]);

            Question::query()->whereKey($questionId)->incrementEach([
                'times_answered' => 1,
                'times_correct' => $answer['correct'] ? 1 : 0,
            ]);
        }
    }

    private function validChoice(Question $question, mixed $choice): ?int
    {
        if (! is_int($choice) && ! (is_string($choice) && ctype_digit($choice))) {
            return null;
        }

        $choice = (int) $choice;
        $count = $question->type === Question::TYPE_TRUE_FALSE ? 2 : count($question->options ?? []);

        return $choice >= 0 && $choice < $count ? $choice : null;
    }

    /**
     * Store Order Rush per-set attempts (solved, wrong, wrong slots) for the
     * "most misunderstood sequence" analytics.
     *
     * @param  list<array{set: string, category: string, attempts: int, solved: int, wrong: int, total_ms: int, slot_errors: ?list<int>}>  $stats
     */
    private function recordSequences(GameHistory $history, array $stats): void
    {
        foreach ($stats as $stat) {
            SequenceAttempt::query()->create([
                'game_history_id' => $history->id,
                'user_id' => $history->user_id,
                'set_key' => $stat['set'],
                'category' => $stat['category'],
                'attempts' => $stat['attempts'],
                'solved' => $stat['solved'],
                'wrong' => $stat['wrong'],
                'total_ms' => $stat['total_ms'],
                'slot_errors' => array_values(array_map('intval', $stat['slot_errors'] ?? [])),
                'played_at' => $history->played_at,
            ]);
        }
    }

    private function historyName(string $gameKey, string $mission, string $locale): string
    {
        if ($gameKey === 'sky-quiz') {
            return __('sky_quiz.history_name', [], $locale);
        }

        if ($gameKey === 'quiz-duel') {
            return __('quiz_duel.history_name', [], $locale);
        }

        if ($gameKey === 'knowledge-train') {
            return __('knowledge_train.history_name', [], $locale);
        }

        if ($gameKey === 'port-sorter') {
            return __('port_sorter.history_name', [], $locale);
        }

        if ($gameKey === 'snakes-and-ladders') {
            return __('snakes.history_name', [], $locale);
        }

        if ($gameKey === 'floor-drop') {
            return __('floor_drop.history_name', [], $locale);
        }

        if ($gameKey === 'economy-heist') {
            return __('economy_heist.history_name', [], $locale);
        }

        if ($gameKey === 'order-rush') {
            return __('order_rush.history_name', [], $locale);
        }

        if ($gameKey === 'turbo-trivia') {
            return __('turbo_trivia.history_name', [], $locale);
        }

        if ($gameKey === 'block-battle') {
            return __('block_battle.history_name', [], $locale);
        }

        if ($gameKey === 'crossword') {
            return __('crossword.history_name', ['level' => substr($mission, strlen('level-'))], $locale);
        }

        if (in_array($gameKey, MiniGameController::GAMES, true)) {
            return __('minigames.'.$gameKey, [], $locale);
        }

        return __('flag_quest.history_name', [
            'mission' => __('flag_quest.missions.'.$mission, [], $locale),
        ], $locale);
    }
}
