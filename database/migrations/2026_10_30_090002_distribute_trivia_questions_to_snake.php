<?php

use App\Models\Question;
use Illuminate\Database\Migrations\Migration;

return new class extends Migration
{
    /**
     * EduSnake plays on multiple choice trivia questions: every choice question
     * already distributed to Sky Quiz is also distributed to Snake.
     */
    public function up(): void
    {
        Question::query()->where('type', Question::TYPE_CHOICE)->whereJsonContains('games', 'sky-quiz')->lazyById()
            ->each(function (Question $question): void {
                $games = $question->games ?? [];
                if (! in_array('snake', $games, true)) {
                    $question->forceFill(['games' => [...$games, 'snake']])->saveQuietly();
                }
            });
    }

    public function down(): void
    {
        Question::query()->whereJsonContains('games', 'snake')->lazyById()
            ->each(function (Question $question): void {
                $question->forceFill(['games' => array_values(array_diff($question->games ?? [], ['snake']))])->saveQuietly();
            });
    }
};
