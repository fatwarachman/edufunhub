<?php

use App\Models\Question;
use Illuminate\Database\Migrations\Migration;

return new class extends Migration
{
    /**
     * Tarik Tambang plays on the general trivia bank: every multiple choice
     * question already distributed to Sky Quiz is also distributed to
     * Tarik Tambang, so rounds do not fall back to generated arithmetic.
     */
    public function up(): void
    {
        Question::query()->where('type', Question::TYPE_CHOICE)->whereJsonContains('games', 'sky-quiz')->lazyById()
            ->each(function (Question $question): void {
                $games = $question->games ?? [];
                if (! in_array('tug-of-war', $games, true)) {
                    $question->forceFill(['games' => [...$games, 'tug-of-war']])->saveQuietly();
                }
            });
    }

    public function down(): void
    {
        Question::query()->whereJsonContains('games', 'tug-of-war')->lazyById()
            ->each(function (Question $question): void {
                $question->forceFill(['games' => array_values(array_diff($question->games ?? [], ['tug-of-war']))])->saveQuietly();
            });
    }
};
