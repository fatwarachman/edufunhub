<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('questions', function (Blueprint $table): void {
            $table->unsignedSmallInteger('points')->nullable()->after('answer');
            $table->foreignId('generation_id')->nullable()->after('source');
            $table->index('generation_id');
        });

        Schema::create('question_generations', function (Blueprint $table): void {
            $table->id();
            $table->foreignId('requested_by')->nullable()->constrained('users')->nullOnDelete();
            $table->string('model', 150);
            $table->json('subjects');
            $table->json('grades');
            $table->unsignedSmallInteger('per_combination');
            $table->json('games');
            $table->boolean('activate')->default(false);
            $table->string('status', 20)->default('queued');
            $table->unsignedInteger('total_jobs')->default(0);
            $table->unsignedInteger('done_jobs')->default(0);
            $table->unsignedInteger('created_count')->default(0);
            $table->unsignedInteger('skipped_count')->default(0);
            $table->text('error')->nullable();
            $table->timestamp('finished_at')->nullable();
            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('question_generations');
        Schema::table('questions', function (Blueprint $table): void {
            $table->dropIndex(['generation_id']);
            $table->dropColumn(['points', 'generation_id']);
        });
    }
};
