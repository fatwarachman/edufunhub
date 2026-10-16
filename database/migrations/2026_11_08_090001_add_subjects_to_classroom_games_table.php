<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Subjects a classroom game is limited to (list of subject keys). Null or
 * empty means every subject. Picked questions still win over this list.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('classroom_games', function (Blueprint $table): void {
            $table->json('subjects')->nullable()->after('max_plays');
        });
    }

    public function down(): void
    {
        Schema::table('classroom_games', function (Blueprint $table): void {
            $table->dropColumn('subjects');
        });
    }
};
