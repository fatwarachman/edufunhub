<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('game_histories', function (Blueprint $table): void {
            $table->string('mission', 40)->nullable()->after('game_name');
            $table->unsignedTinyInteger('grade')->nullable()->after('mission');
            $table->unsignedSmallInteger('age')->nullable()->after('grade');
            $table->string('school_name', 120)->nullable()->after('age');
            $table->unsignedSmallInteger('correct')->nullable()->after('points');
            $table->unsignedSmallInteger('wrong')->nullable()->after('correct');
            $table->unsignedInteger('duration_seconds')->nullable()->after('wrong');
            $table->index(['game_key', 'played_at']);
        });
    }

    public function down(): void
    {
        Schema::table('game_histories', function (Blueprint $table): void {
            $table->dropIndex(['game_key', 'played_at']);
            $table->dropColumn(['mission', 'grade', 'age', 'school_name', 'correct', 'wrong', 'duration_seconds']);
        });
    }
};
