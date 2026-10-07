<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('question_generation_items', function (Blueprint $table): void {
            $table->id();
            $table->foreignId('generation_id')->constrained('question_generations')->cascadeOnDelete();
            $table->string('subject', 50);
            $table->unsignedTinyInteger('grade');
            $table->string('status', 20)->default('queued');
            $table->unsignedSmallInteger('target')->default(0);
            $table->unsignedSmallInteger('created_count')->default(0);
            $table->unsignedSmallInteger('skipped_count')->default(0);
            $table->text('error')->nullable();
            $table->timestamp('started_at')->nullable();
            $table->timestamp('finished_at')->nullable();
            $table->timestamps();

            $table->unique(['generation_id', 'subject', 'grade']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('question_generation_items');
    }
};
