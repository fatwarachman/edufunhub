<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('player_profiles', function (Blueprint $table): void {
            $table->date('birth_date')->nullable()->after('grade');
            $table->string('school_name', 120)->nullable()->after('birth_date');
        });
    }

    public function down(): void
    {
        Schema::table('player_profiles', function (Blueprint $table): void {
            $table->dropColumn(['birth_date', 'school_name']);
        });
    }
};
