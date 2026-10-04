<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Teacher-authored questions target explicit grades (0 = kindergarten, 1-12),
     * and every correct answer to a teacher question stores the compensation
     * earned at that moment so later rate changes never rewrite history.
     */
    public function up(): void
    {
        Schema::table('questions', function (Blueprint $table): void {
            $table->json('grades')->nullable()->after('band');
        });

        Schema::table('question_answers', function (Blueprint $table): void {
            $table->unsignedInteger('compensation')->default(0)->after('correct');
        });

        Schema::create('question_compensation_rates', function (Blueprint $table): void {
            $table->id();
            $table->unsignedTinyInteger('grade')->unique();
            $table->unsignedInteger('amount')->default(0);
            $table->foreignId('updated_by')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('question_compensation_rates');

        Schema::table('question_answers', function (Blueprint $table): void {
            $table->dropColumn('compensation');
        });

        Schema::table('questions', function (Blueprint $table): void {
            $table->dropColumn('grades');
        });
    }
};
