<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Official school list (Dapodik) for the school picker: players pick a
 * city/regency, then a level, then their school. Filled by `schools:import`
 * from database/data/schools.csv.gz. Profiles keep the picked NPSN and level.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('schools', function (Blueprint $table): void {
            $table->id();
            $table->string('npsn', 10)->unique();
            $table->string('name', 120);
            $table->string('regency', 100);
            $table->string('district', 80)->nullable();
            $table->string('level', 4);
            $table->string('form', 12);

            $table->index(['regency', 'level', 'name']);
        });

        Schema::table('player_profiles', function (Blueprint $table): void {
            $table->string('school_level', 4)->nullable()->after('school_city');
            $table->string('school_npsn', 10)->nullable()->after('school_level');
            $table->index('school_npsn');
        });
    }

    public function down(): void
    {
        Schema::table('player_profiles', function (Blueprint $table): void {
            $table->dropIndex(['school_npsn']);
            $table->dropColumn(['school_level', 'school_npsn']);
        });

        Schema::dropIfExists('schools');
    }
};
