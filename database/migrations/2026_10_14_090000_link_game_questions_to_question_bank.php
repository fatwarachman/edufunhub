<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

return new class extends Migration
{
    /** Games the Go built-in bank hands its multiple choice questions to. */
    private const BUILTIN_CHOICE_GAMES = ['flag-quest', 'sky-quiz', 'quiz-duel', 'knowledge-train', 'snakes-and-ladders', 'market-math', 'number-garden', 'explore-indonesia', 'mini-lab', 'floor-drop', 'economy-heist', 'turbo-trivia'];

    /**
     * Link every question the games use to the admin bank:
     * - the 30 Ular Tangga practice questions (until now only hard-coded in
     *   the browser) become bank questions distributed to Ular Tangga, so
     *   admins see, edit and analyse them;
     * - the built-in multiple choice questions (mc-*) get the same game list
     *   as the Go built-in bank, so the bank shows the games that really
     *   draw them instead of only Flag Quest, Sky Quiz and Turbo Trivia.
     */
    public function up(): void
    {
        $bank = json_decode((string) file_get_contents(database_path('data/snakes-practice-questions.json')), true);
        $now = now();

        foreach ($bank['questions'] as $question) {
            if (DB::table('questions')->where('key', $question['key'])->exists()) {
                continue;
            }

            DB::table('questions')->insert([
                'key' => $question['key'],
                'type' => 'choice',
                'band' => $question['band'],
                'subject' => $question['subject'],
                'prompt_id' => $question['prompt'],
                'prompt_en' => null,
                'options' => json_encode(array_map(fn (string $option): array => ['id' => $option, 'en' => ''], $question['options']), JSON_UNESCAPED_UNICODE),
                'answer' => $question['answer'],
                'hint_id' => $question['hint'] ?: null,
                'hint_en' => null,
                'games' => json_encode(['snakes-and-ladders']),
                'is_active' => true,
                'source' => 'system',
                'created_at' => $now,
                'updated_at' => $now,
            ]);
        }

        DB::table('questions')->where('source', 'system')->where('type', 'choice')->where('key', 'like', 'mc-%')->orderBy('id')
            ->each(function (object $question): void {
                $games = json_decode((string) $question->games, true) ?: [];
                $merged = array_values(array_unique([...$games, ...self::BUILTIN_CHOICE_GAMES]));
                if (count($merged) !== count($games)) {
                    DB::table('questions')->where('id', $question->id)->update(['games' => json_encode($merged)]);
                }
            });
    }

    public function down(): void
    {
        DB::table('questions')->where('source', 'system')->where('key', 'like', 'sl-%')->delete();
    }
};
