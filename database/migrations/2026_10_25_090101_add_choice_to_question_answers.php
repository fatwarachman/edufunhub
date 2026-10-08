<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * The original bank option index the player picked (null for timeouts and
 * answers recorded before the game service reported choices), used by the
 * admin answer distribution and understanding analysis.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('question_answers', function (Blueprint $table): void {
            $table->unsignedTinyInteger('choice')->nullable()->after('correct');
            $table->index(['question_id', 'choice']);
        });
    }

    public function down(): void
    {
        Schema::table('question_answers', function (Blueprint $table): void {
            $table->dropIndex(['question_id', 'choice']);
            $table->dropColumn('choice');
        });
    }
};
