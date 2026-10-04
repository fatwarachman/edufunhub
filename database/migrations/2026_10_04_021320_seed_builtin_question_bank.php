<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

return new class extends Migration
{
    /**
     * Import the question bank that used to be hard-coded in the Go service so
     * admins can manage it. Keys match the Go built-in keys (mc-*, tf-*).
     */
    public function up(): void
    {
        $bank = json_decode((string) file_get_contents(database_path('data/question-bank.json')), true);
        $now = now();

        foreach ($bank['questions'] as $question) {
            if (DB::table('questions')->where('key', $question['key'])->exists()) {
                continue;
            }

            DB::table('questions')->insert([
                'key' => $question['key'],
                'type' => $question['type'],
                'band' => $question['band'],
                'subject' => $question['subject'],
                'prompt_id' => $question['prompt']['id'],
                'prompt_en' => $question['prompt']['en'] ?: null,
                'options' => isset($question['options']) ? json_encode($question['options'], JSON_UNESCAPED_UNICODE) : null,
                'answer' => $question['answer'],
                'hint_id' => ($question['hint']['id'] ?? '') ?: null,
                'hint_en' => ($question['hint']['en'] ?? '') ?: null,
                'games' => json_encode($question['games']),
                'is_active' => true,
                'created_at' => $now,
                'updated_at' => $now,
            ]);
        }
    }

    public function down(): void
    {
        DB::table('questions')->where(fn ($query) => $query->where('key', 'like', 'mc-%')->orWhere('key', 'like', 'tf-%'))->delete();
    }
};
