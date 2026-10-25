<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Question blueprints (kisi-kisi soal): uploaded documents whose text
     * guides the AI question writer.
     */
    public function up(): void
    {
        Schema::create('question_blueprints', function (Blueprint $table): void {
            $table->id();
            $table->string('title', 150);
            $table->string('subject_key', 30)->nullable()->index();
            $table->string('original_name');
            $table->string('path');
            $table->string('extension', 10);
            $table->unsignedInteger('size');
            $table->longText('content');
            $table->boolean('is_active')->default(true);
            $table->foreignId('uploaded_by')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamps();
        });

        Schema::table('question_generations', function (Blueprint $table): void {
            $table->foreignId('blueprint_id')->nullable()->after('topic_ids')->constrained('question_blueprints')->nullOnDelete();
        });
    }

    public function down(): void
    {
        Schema::table('question_generations', function (Blueprint $table): void {
            $table->dropConstrainedForeignId('blueprint_id');
        });
        Schema::dropIfExists('question_blueprints');
    }
};
