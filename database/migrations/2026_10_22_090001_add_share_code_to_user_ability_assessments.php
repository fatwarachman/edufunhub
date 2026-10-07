<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('user_ability_assessments', function (Blueprint $table): void {
            $table->string('share_code', 16)->nullable()->unique()->after('status');
        });
    }

    public function down(): void
    {
        Schema::table('user_ability_assessments', function (Blueprint $table): void {
            $table->dropUnique(['share_code']);
            $table->dropColumn('share_code');
        });
    }
};
