<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * When the classroom was shut down for students (game rooms closed, 3D world
 * disconnected, open pages told). Null = not processed yet.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('classrooms', function (Blueprint $table): void {
            $table->timestamp('closed_at')->nullable()->after('ends_at')->index();
        });
    }

    public function down(): void
    {
        Schema::table('classrooms', function (Blueprint $table): void {
            $table->dropIndex(['closed_at']);
            $table->dropColumn('closed_at');
        });
    }
};
