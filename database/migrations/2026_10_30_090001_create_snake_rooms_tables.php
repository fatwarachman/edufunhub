<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('snake_rooms', function (Blueprint $table): void {
            $table->id();
            $table->string('code', 6)->unique();
            $table->string('mode', 20)->default('shared_grid');
            $table->foreignId('subject_id')->nullable()->constrained('subjects')->nullOnDelete();
            $table->string('grade_level', 20)->default('SD');
            $table->unsignedSmallInteger('max_players')->default(4);
            $table->string('status', 20)->default('waiting');
            $table->foreignId('created_by')->constrained('users')->cascadeOnDelete();
            $table->timestamps();

            $table->index(['status', 'created_at']);
        });

        Schema::create('snake_room_players', function (Blueprint $table): void {
            $table->id();
            $table->foreignId('room_id')->constrained('snake_rooms')->cascadeOnDelete();
            $table->foreignId('user_id')->constrained('users')->cascadeOnDelete();
            $table->integer('score')->default(0);
            $table->unsignedSmallInteger('final_rank')->nullable();
            $table->integer('tail_length')->default(18);
            $table->boolean('is_alive')->default(true);
            $table->timestamps();

            $table->unique(['room_id', 'user_id']);
            $table->index(['room_id', 'score']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('snake_room_players');
        Schema::dropIfExists('snake_rooms');
    }
};
