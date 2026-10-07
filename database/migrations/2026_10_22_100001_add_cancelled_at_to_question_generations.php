<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('question_generations', function (Blueprint $table): void {
            $table->timestamp('cancelled_at')->nullable()->after('error');
        });
    }

    public function down(): void
    {
        Schema::table('question_generations', function (Blueprint $table): void {
            $table->dropColumn('cancelled_at');
        });
    }
};
