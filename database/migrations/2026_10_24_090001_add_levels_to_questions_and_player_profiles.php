<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Question levels per grade (1 easy, 2 medium, 3 expert). Existing
 * questions become easy. Players pick the level they play at; harder
 * levels pay twice (medium) or three times (expert) the points.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('questions', function (Blueprint $table): void {
            $table->unsignedTinyInteger('level')->default(1)->after('grades');
            $table->index(['subject', 'band', 'level']);
        });

        Schema::table('player_profiles', function (Blueprint $table): void {
            $table->unsignedTinyInteger('question_level')->default(1)->after('grade');
        });

        Schema::table('question_generations', function (Blueprint $table): void {
            $table->unsignedTinyInteger('level')->default(1)->after('grades');
        });
    }

    public function down(): void
    {
        Schema::table('questions', function (Blueprint $table): void {
            $table->dropIndex(['subject', 'band', 'level']);
            $table->dropColumn('level');
        });

        Schema::table('player_profiles', function (Blueprint $table): void {
            $table->dropColumn('question_level');
        });

        Schema::table('question_generations', function (Blueprint $table): void {
            $table->dropColumn('level');
        });
    }
};
