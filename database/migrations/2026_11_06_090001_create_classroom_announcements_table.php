<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Classroom announcements: a short teacher message that pops up on every
 * active member's screen for a fixed number of seconds.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('classroom_announcements', function (Blueprint $table): void {
            $table->id();
            $table->foreignId('classroom_id')->constrained('classrooms')->cascadeOnDelete();
            $table->foreignId('teacher_id')->constrained('users')->cascadeOnDelete();
            $table->string('title', 120)->nullable();
            $table->text('body');
            $table->unsignedSmallInteger('display_seconds');
            $table->dateTime('starts_at');
            $table->dateTime('ends_at');
            $table->timestamps();

            $table->index(['classroom_id', 'ends_at']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('classroom_announcements');
    }
};
