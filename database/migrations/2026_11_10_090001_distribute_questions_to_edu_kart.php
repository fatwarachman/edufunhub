<?php

use App\Models\Question;
use Illuminate\Database\Migrations\Migration;

return new class extends Migration
{
    /**
     * EduKart question gates use both true/false (odd gates) and multiple
     * choice (even gates) questions: every choice question distributed to
     * Sky Quiz and every true/false question distributed to Flag Quest is
     * also distributed to EduKart.
     */
    public function up(): void
    {
        Question::query()
            ->where(fn ($query) => $query
                ->where(fn ($q) => $q->where('type', Question::TYPE_CHOICE)->whereJsonContains('games', 'sky-quiz'))
                ->orWhere(fn ($q) => $q->where('type', Question::TYPE_TRUE_FALSE)->whereJsonContains('games', 'flag-quest')))
            ->lazyById()
            ->each(function (Question $question): void {
                $games = $question->games ?? [];
                if (! in_array('edu-kart', $games, true)) {
                    $question->forceFill(['games' => [...$games, 'edu-kart']])->saveQuietly();
                }
            });
    }

    public function down(): void
    {
        Question::query()->whereJsonContains('games', 'edu-kart')->lazyById()
            ->each(function (Question $question): void {
                $question->forceFill(['games' => array_values(array_diff($question->games ?? [], ['edu-kart']))])->saveQuietly();
            });
    }
};
