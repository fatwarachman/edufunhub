<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('questions', function (Blueprint $table): void {
            $table->id();
            $table->string('key', 40)->unique();
            $table->string('type', 20);
            $table->unsignedTinyInteger('band');
            $table->string('subject', 30);
            $table->text('prompt_id');
            $table->text('prompt_en')->nullable();
            $table->json('options')->nullable();
            $table->unsignedTinyInteger('answer');
            $table->text('hint_id')->nullable();
            $table->text('hint_en')->nullable();
            $table->json('games');
            $table->boolean('is_active')->default(true);
            $table->unsignedInteger('times_answered')->default(0);
            $table->unsignedInteger('times_correct')->default(0);
            $table->timestamps();
            $table->index(['is_active', 'type', 'band']);
        });

        Schema::create('question_answers', function (Blueprint $table): void {
            $table->id();
            $table->foreignId('question_id')->constrained()->cascadeOnDelete();
            $table->foreignId('game_history_id')->constrained()->cascadeOnDelete();
            $table->string('game_key', 40);
            $table->boolean('correct');
            $table->timestamp('created_at')->nullable();
            $table->index(['question_id', 'game_key']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('question_answers');
        Schema::dropIfExists('questions');
    }
};
