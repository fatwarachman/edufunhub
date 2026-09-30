<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('game_histories', function (Blueprint $table): void {
            $table->id();
            $table->foreignId('user_id')->constrained()->cascadeOnDelete();
            $table->string('game_key');
            $table->string('game_name');
            $table->integer('points');
            $table->timestamp('played_at');
            $table->string('event_id')->unique();
            $table->index(['user_id', 'played_at']);
            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('game_histories');
    }
};
