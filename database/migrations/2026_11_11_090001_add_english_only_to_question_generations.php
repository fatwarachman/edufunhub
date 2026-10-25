<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * AI requests may ask English subject questions written fully in
     * English (question, options and explanation), instead of Indonesian
     * text with an English translation.
     */
    public function up(): void
    {
        Schema::table('question_generations', function (Blueprint $table): void {
            $table->boolean('english_only')->default(false)->after('activate');
        });
    }

    public function down(): void
    {
        Schema::table('question_generations', function (Blueprint $table): void {
            $table->dropColumn('english_only');
        });
    }
};
