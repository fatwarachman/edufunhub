<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\DB;

/**
 * TKJ (Teknik Komputer dan Jaringan, SMK grades 10–12) subject plus the
 * built-in TKJ questions with a visual (cables, topologies, console) from
 * database/data/tkj-visual-questions.php, distributed to every quiz game.
 */
return new class extends Migration
{
    private const SUBJECT = 'tkj';

    /** Mirrors App\Models\Question::GAMES at the time of writing. */
    private const GAMES = ['flag-quest', 'sky-quiz', 'quiz-duel', 'knowledge-train', 'snakes-and-ladders', 'market-math', 'number-garden', 'explore-indonesia', 'mini-lab', 'floor-drop', 'economy-heist', 'turbo-trivia', 'block-battle', 'monster-cafe', 'ping-pong', 'snake'];

    public function up(): void
    {
        $now = now();

        if (! DB::table('subjects')->where('key', self::SUBJECT)->exists()) {
            DB::table('subjects')->insert([
                'key' => self::SUBJECT,
                'name_id' => 'TKJ',
                'name_en' => 'Computer Networking (TKJ)',
                'icon' => 'laptop',
                'color' => '#14b8a6',
                'ai_hint' => 'TKJ / Teknik Komputer dan Jaringan (SMK computer & network engineering: cabling, topology, IP addressing, subnetting, routing, network services, MikroTik)',
                'sort_order' => ((int) DB::table('subjects')->max('sort_order')) + 10,
                'is_active' => true,
                'is_system' => true,
                'created_at' => $now,
                'updated_at' => $now,
            ]);
            Cache::forget('subjects.catalog');
        }

        foreach (require database_path('data/tkj-visual-questions.php') as $question) {
            if (DB::table('questions')->where('key', $question['key'])->exists()) {
                continue;
            }

            DB::table('questions')->insert([
                'key' => $question['key'],
                'type' => 'choice',
                'band' => 3,
                'grades' => json_encode([10, 11, 12]),
                'level' => $question['level'],
                'subject' => self::SUBJECT,
                'prompt_id' => $question['prompt']['id'],
                'prompt_en' => $question['prompt']['en'],
                'options' => json_encode($question['options'], JSON_UNESCAPED_UNICODE),
                'visual' => json_encode($question['visual'], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES),
                'answer' => $question['answer'],
                'hint_id' => $question['hint']['id'],
                'hint_en' => $question['hint']['en'],
                'games' => json_encode(self::GAMES),
                'is_active' => true,
                'source' => 'system',
                'created_at' => $now,
                'updated_at' => $now,
            ]);
        }
    }

    public function down(): void
    {
        $keys = array_column(require database_path('data/tkj-visual-questions.php'), 'key');
        DB::table('questions')->whereIn('key', $keys)->delete();

        if (! DB::table('questions')->where('subject', self::SUBJECT)->exists()) {
            DB::table('subjects')->where('key', self::SUBJECT)->delete();
            Cache::forget('subjects.catalog');
        }
    }
};
