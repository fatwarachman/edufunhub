<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('teacher_subjects', function (Blueprint $table): void {
            $table->id();
            $table->foreignId('user_id')->constrained()->cascadeOnDelete();
            $table->string('subject_key', 30)->nullable();
            $table->timestamps();
            $table->unique(['user_id', 'subject_key']);
        });

        Schema::create('teacher_requests', function (Blueprint $table): void {
            $table->id();
            $table->foreignId('user_id')->constrained()->cascadeOnDelete();
            $table->string('subject_key', 30)->nullable();
            $table->string('status', 20)->default('pending');
            $table->text('message')->nullable();
            $table->foreignId('reviewed_by')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamp('reviewed_at')->nullable();
            $table->timestamps();
            $table->index(['status', 'created_at']);
            $table->index(['user_id', 'status']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('teacher_requests');
        Schema::dropIfExists('teacher_subjects');
    }
};
