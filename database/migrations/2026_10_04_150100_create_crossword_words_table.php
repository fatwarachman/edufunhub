<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Admin-managed Teka-Teki Silang word bank. The Go service syncs it like
     * the question bank. Seeded with the words that used to be built into Go.
     */
    public function up(): void
    {
        Schema::create('crossword_words', function (Blueprint $table) {
            $table->id();
            $table->string('key', 60)->unique();
            $table->unsignedTinyInteger('level')->index();
            $table->string('answer', 15);
            $table->string('clue_id', 160);
            $table->string('clue_en', 160)->nullable();
            $table->boolean('is_active')->default(true);
            $table->unsignedInteger('times_used')->default(0);
            $table->unsignedInteger('times_solved')->default(0);
            $table->foreignId('created_by')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamps();

            $table->unique(['level', 'answer']);
        });

        $bank = json_decode((string) file_get_contents(database_path('data/crossword-words.json')), true);
        $now = now();

        DB::table('crossword_words')->insert(array_map(fn (array $word): array => [
            'key' => $word['key'],
            'level' => $word['level'],
            'answer' => $word['answer'],
            'clue_id' => $word['clue']['id'],
            'clue_en' => $word['clue']['en'] ?: null,
            'is_active' => true,
            'created_at' => $now,
            'updated_at' => $now,
        ], $bank['words']));
    }

    public function down(): void
    {
        Schema::dropIfExists('crossword_words');
    }
};
