<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Room and matchmaking games: who played together, at which level and
     * how everyone ranked. One row per match, one row per seat.
     */
    public function up(): void
    {
        Schema::create('game_matches', function (Blueprint $table) {
            $table->id();
            $table->string('match_key', 80)->unique();
            $table->string('game_key', 40)->index();
            $table->string('mode', 10);
            $table->string('pin', 6)->nullable();
            $table->unsignedTinyInteger('level')->nullable();
            $table->unsignedTinyInteger('grade');
            $table->unsignedTinyInteger('players_count');
            $table->boolean('finished')->default(true);
            $table->json('words')->nullable();
            $table->timestamp('started_at');
            $table->timestamp('ended_at')->index();
            $table->timestamps();
        });

        Schema::create('game_match_players', function (Blueprint $table) {
            $table->id();
            $table->foreignId('game_match_id')->constrained()->cascadeOnDelete();
            $table->foreignId('user_id')->nullable()->constrained()->nullOnDelete();
            $table->foreignId('game_history_id')->nullable()->constrained()->nullOnDelete();
            $table->unsignedTinyInteger('seat');
            $table->string('name', 60);
            $table->unsignedTinyInteger('grade');
            $table->boolean('is_local')->default(false);
            $table->boolean('is_bot')->default(false);
            $table->boolean('left_early')->default(false);
            $table->unsignedTinyInteger('rank');
            $table->unsignedInteger('score')->default(0);
            $table->unsignedSmallInteger('correct')->default(0);
            $table->unsignedSmallInteger('wrong')->default(0);
            $table->timestamps();

            $table->unique(['game_match_id', 'seat']);
            $table->index(['user_id', 'created_at']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('game_match_players');
        Schema::dropIfExists('game_matches');
    }
};
