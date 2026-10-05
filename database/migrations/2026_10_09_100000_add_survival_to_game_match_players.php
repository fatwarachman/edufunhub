<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Elimination games (Floor Drop) report how long each player survived and
     * their answer accuracy.
     */
    public function up(): void
    {
        Schema::table('game_match_players', function (Blueprint $table): void {
            $table->unsignedInteger('survival_ms')->nullable()->after('wrong');
            $table->decimal('accuracy', 5, 1)->nullable()->after('survival_ms');
        });
    }

    public function down(): void
    {
        Schema::table('game_match_players', function (Blueprint $table): void {
            $table->dropColumn(['survival_ms', 'accuracy']);
        });
    }
};
