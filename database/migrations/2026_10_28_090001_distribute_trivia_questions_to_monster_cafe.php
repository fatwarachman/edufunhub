<?php

use App\Models\Question;
use Illuminate\Database\Migrations\Migration;

return new class extends Migration
{
    /**
     * Monster Café plays on the general trivia bank: every
     * multiple choice question already distributed to Sky Quiz is also
     * distributed to the new game, so rooms do not fall back to generated
     * arithmetic.
     */
    public function up(): void
    {
        Question::query()->where('type', Question::TYPE_CHOICE)->whereJsonContains('games', 'sky-quiz')->lazyById()
            ->each(function (Question $question): void {
                $games = $question->games ?? [];
                if (! in_array('monster-cafe', $games, true)) {
                    $question->forceFill(['games' => [...$games, 'monster-cafe']])->saveQuietly();
                }
            });
    }

    public function down(): void
    {
        Question::query()->whereJsonContains('games', 'monster-cafe')->lazyById()
            ->each(function (Question $question): void {
                $question->forceFill(['games' => array_values(array_diff($question->games ?? [], ['monster-cafe']))])->saveQuietly();
            });
    }
};
