<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Teacher classrooms (ruang kelas): a PIN-protected, time-boxed space where
 * the teacher picks the games and the questions each game draws, watches who
 * plays live and reviews an analysis afterwards.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('classrooms', function (Blueprint $table): void {
            $table->id();
            $table->foreignId('teacher_id')->constrained('users')->cascadeOnDelete();
            $table->string('name', 120);
            $table->text('description')->nullable();
            $table->string('pin', 6);
            $table->dateTime('starts_at');
            $table->dateTime('ends_at');
            $table->unsignedSmallInteger('max_members')->default(100);
            $table->json('report')->nullable();
            $table->dateTime('report_generated_at')->nullable();
            $table->string('ai_status', 20)->nullable();
            $table->text('ai_summary')->nullable();
            $table->timestamps();

            $table->index(['pin', 'ends_at']);
            $table->index(['teacher_id', 'starts_at']);
            $table->index(['ends_at', 'report_generated_at']);
        });

        Schema::create('classroom_games', function (Blueprint $table): void {
            $table->id();
            $table->foreignId('classroom_id')->constrained('classrooms')->cascadeOnDelete();
            $table->string('game_key', 40);
            $table->unsignedSmallInteger('sort_order')->default(0);
            $table->timestamps();

            $table->unique(['classroom_id', 'game_key']);
        });

        Schema::create('classroom_game_questions', function (Blueprint $table): void {
            $table->id();
            $table->foreignId('classroom_game_id')->constrained('classroom_games')->cascadeOnDelete();
            $table->foreignId('question_id')->constrained('questions')->cascadeOnDelete();
            $table->unsignedSmallInteger('sort_order')->default(0);

            $table->unique(['classroom_game_id', 'question_id']);
        });

        Schema::create('classroom_members', function (Blueprint $table): void {
            $table->id();
            $table->foreignId('classroom_id')->constrained('classrooms')->cascadeOnDelete();
            $table->foreignId('user_id')->constrained('users')->cascadeOnDelete();
            $table->dateTime('joined_at');
            $table->dateTime('left_at')->nullable();
            $table->dateTime('last_seen_at')->nullable();
            $table->string('current_game', 40)->nullable();
            $table->json('report')->nullable();
            $table->text('ai_feedback')->nullable();
            $table->dateTime('report_shared_at')->nullable();
            $table->timestamps();

            $table->unique(['classroom_id', 'user_id']);
            $table->index(['user_id', 'left_at']);
        });

        Schema::table('game_histories', function (Blueprint $table): void {
            $table->foreignId('classroom_id')->nullable()->after('event_id')->constrained('classrooms')->nullOnDelete();
        });
    }

    public function down(): void
    {
        Schema::table('game_histories', function (Blueprint $table): void {
            $table->dropConstrainedForeignId('classroom_id');
        });
        Schema::dropIfExists('classroom_members');
        Schema::dropIfExists('classroom_game_questions');
        Schema::dropIfExists('classroom_games');
        Schema::dropIfExists('classrooms');
    }
};
