<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Retrieval (RAG) index of question blueprints: the text is split into
     * sections, each optionally embedded, so the AI receives only the parts
     * that match the subject, grade and topic of every request.
     */
    public function up(): void
    {
        Schema::create('question_blueprint_chunks', function (Blueprint $table): void {
            $table->id();
            $table->foreignId('blueprint_id')->constrained('question_blueprints')->cascadeOnDelete();
            $table->unsignedInteger('position');
            $table->string('heading', 255)->nullable();
            $table->text('content');
            $table->json('grades')->nullable();
            $table->longText('embedding')->nullable();
            $table->string('embedding_model', 150)->nullable();
            $table->timestamps();
            $table->unique(['blueprint_id', 'position']);
        });

        Schema::table('question_blueprints', function (Blueprint $table): void {
            $table->string('index_status', 20)->default('ready')->after('is_active');
            $table->unsignedInteger('chunks_count')->default(0)->after('index_status');
            $table->string('embedding_model', 150)->nullable()->after('chunks_count');
            $table->text('index_error')->nullable()->after('embedding_model');
            $table->timestamp('indexed_at')->nullable()->after('index_error');
        });
    }

    public function down(): void
    {
        Schema::table('question_blueprints', function (Blueprint $table): void {
            $table->dropColumn(['index_status', 'chunks_count', 'embedding_model', 'index_error', 'indexed_at']);
        });
        Schema::dropIfExists('question_blueprint_chunks');
    }
};
