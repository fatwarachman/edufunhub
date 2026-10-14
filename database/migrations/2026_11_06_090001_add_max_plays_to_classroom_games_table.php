<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Per-game play limit of a classroom: how many times each student may play
 * the same game inside the classroom. Null means unlimited.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('classroom_games', function (Blueprint $table): void {
            $table->unsignedTinyInteger('max_plays')->nullable()->after('sort_order');
        });
    }

    public function down(): void
    {
        Schema::table('classroom_games', function (Blueprint $table): void {
            $table->dropColumn('max_plays');
        });
    }
};
