<?php

use App\Models\Question;
use Illuminate\Database\Migrations\Migration;

return new class extends Migration
{
    /**
     * Ping Pong plays on the general trivia bank: every multiple choice
     * question already distributed to Sky Quiz is also distributed to
     * Ping Pong, so rallies do not fall back to generated arithmetic.
     */
    public function up(): void
    {
        Question::query()->where('type', Question::TYPE_CHOICE)->whereJsonContains('games', 'sky-quiz')->lazyById()
            ->each(function (Question $question): void {
                $games = $question->games ?? [];
                if (! in_array('ping-pong', $games, true)) {
                    $question->forceFill(['games' => [...$games, 'ping-pong']])->saveQuietly();
                }
            });
    }

    public function down(): void
    {
        Question::query()->whereJsonContains('games', 'ping-pong')->lazyById()
            ->each(function (Question $question): void {
                $question->forceFill(['games' => array_values(array_diff($question->games ?? [], ['ping-pong']))])->saveQuietly();
            });
    }
};
