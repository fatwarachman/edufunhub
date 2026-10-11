<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Sub subjects (topics / materi) under a subject, e.g. "Descriptive text"
 * under English. Questions and AI generation runs may point at one topic.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('subject_topics', function (Blueprint $table): void {
            $table->id();
            $table->string('subject_key', 30);
            $table->string('name_id', 120);
            $table->string('name_en', 120)->nullable();
            $table->text('material')->nullable();
            $table->boolean('is_active')->default(true);
            $table->unsignedInteger('sort_order')->default(0);
            $table->foreignId('created_by')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamps();

            $table->foreign('subject_key')->references('key')->on('subjects')->cascadeOnUpdate()->cascadeOnDelete();
            $table->unique(['subject_key', 'name_id']);
            $table->index(['subject_key', 'is_active', 'sort_order']);
        });

        Schema::table('questions', function (Blueprint $table): void {
            $table->foreignId('topic_id')->nullable()->after('subject')->constrained('subject_topics')->nullOnDelete();
        });

        Schema::table('question_generations', function (Blueprint $table): void {
            $table->foreignId('topic_id')->nullable()->after('level')->constrained('subject_topics')->nullOnDelete();
        });
    }

    public function down(): void
    {
        Schema::table('question_generations', function (Blueprint $table): void {
            $table->dropConstrainedForeignId('topic_id');
        });
        Schema::table('questions', function (Blueprint $table): void {
            $table->dropConstrainedForeignId('topic_id');
        });
        Schema::dropIfExists('subject_topics');
    }
};
