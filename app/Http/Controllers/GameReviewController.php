<?php

namespace App\Http\Controllers;

use App\Models\GameHistory;
use App\Models\GameMatchPlayer;
use App\Models\Question;
use App\Models\QuestionAnswer;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Inertia\Inertia;
use Inertia\Response;

/**
 * The player's own review of one finished game: every question asked, the
 * answer they hit and the right one. Opened from the result screen (by
 * match key, since the result reaches Laravel a moment after the race ends)
 * or directly by play id. Only the owner can see a play.
 */
class GameReviewController extends Controller
{
    public function show(Request $request, GameHistory $play): Response
    {
        abort_unless($play->user_id === $request->user()->id, 404);

        $answers = QuestionAnswer::query()
            ->where('game_history_id', $play->id)
            ->with('question:id,key,subject,type,level,prompt_id,prompt_en,options,answer,hint_id,hint_en,visual')
            ->orderBy('id')
            ->get();

        return Inertia::render('games/review', [
            'play' => [
                'id' => $play->id,
                'game_key' => $play->game_key,
                'game_name' => $play->game_name,
                'points' => $play->points,
                'correct' => $play->correct,
                'wrong' => $play->wrong,
                'accuracy' => $play->accuracy(),
                'duration_seconds' => $play->duration_seconds,
                'played_at' => $play->played_at->toIso8601String(),
                'rank' => GameMatchPlayer::query()->where('game_history_id', $play->id)->value('rank'),
            ],
            'questions' => $answers->values()->map(fn (QuestionAnswer $answer, int $index): array => $this->question($answer, $index))->all(),
        ]);
    }

    /**
     * Finds the signed-in player's play of a match. The result is written by
     * the game service right after the race, so the page polls this until it
     * exists (`pending` = not recorded yet).
     */
    public function byMatch(Request $request, string $matchKey): RedirectResponse|Response
    {
        $playId = GameMatchPlayer::query()
            ->whereHas('match', fn ($query) => $query->where('match_key', $matchKey))
            ->where('user_id', $request->user()->id)
            ->whereNotNull('game_history_id')
            ->value('game_history_id');

        if ($playId !== null) {
            return redirect()->route('games.review', ['play' => $playId]);
        }

        return Inertia::render('games/review', [
            'play' => null,
            'questions' => [],
            'pending' => true,
        ]);
    }

    /** @return array<string, mixed> */
    private function question(QuestionAnswer $answer, int $index): array
    {
        $question = $answer->question;
        $options = $question?->type === Question::TYPE_CHOICE
            ? collect($question->options ?? [])->map(fn (array $option): array => [
                'id' => (string) ($option['id'] ?? ''),
                'en' => (string) ($option['en'] ?? ''),
                'media' => isset($option['media']['src']) ? $option['media'] : null,
            ])->values()->all()
            : [];

        return [
            'number' => $index + 1,
            'subject' => $question?->subject,
            'type' => $question?->type,
            'level' => Question::normalizeLevel($question?->level),
            'prompt' => ['id' => $question?->prompt_id, 'en' => $question?->prompt_en],
            'hint' => ['id' => $question?->hint_id, 'en' => $question?->hint_en],
            'media' => $question?->visual ?: null,
            'options' => $options,
            'answer' => $question?->answer,
            'choice' => $answer->choice,
            'correct' => $answer->correct,
        ];
    }
}
