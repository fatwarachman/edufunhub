<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * AI generation targets become subject + optional topic + grade, so one
 * request can produce questions for several topics of a subject.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('question_generations', function (Blueprint $table): void {
            $table->json('topic_ids')->nullable()->after('topic_id');
        });

        Schema::table('question_generation_items', function (Blueprint $table): void {
            $table->foreignId('topic_id')->nullable()->after('subject')->constrained('subject_topics')->nullOnDelete();
            $table->unique(['generation_id', 'subject', 'topic_id', 'grade'], 'qgi_generation_target_unique');
        });

        Schema::table('question_generation_items', function (Blueprint $table): void {
            $table->dropUnique(['generation_id', 'subject', 'grade']);
        });
    }

    public function down(): void
    {
        Schema::table('question_generation_items', function (Blueprint $table): void {
            $table->unique(['generation_id', 'subject', 'grade']);
        });

        Schema::table('question_generation_items', function (Blueprint $table): void {
            $table->dropUnique('qgi_generation_target_unique');
            $table->dropConstrainedForeignId('topic_id');
        });

        Schema::table('question_generations', function (Blueprint $table): void {
            $table->dropColumn('topic_ids');
        });
    }
};
