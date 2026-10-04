<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Track who authored each question and where it came from, so teacher uploads
     * can be attributed later. Existing built-in rows are marked as "system".
     */
    public function up(): void
    {
        Schema::table('questions', function (Blueprint $table): void {
            $table->string('source', 20)->default('admin')->after('is_active');
            $table->foreignId('created_by')->nullable()->after('source')->constrained('users')->nullOnDelete();
            $table->foreignId('updated_by')->nullable()->after('created_by')->constrained('users')->nullOnDelete();
            $table->index('source');
        });

        DB::table('questions')
            ->where(fn ($query) => $query->where('key', 'like', 'mc-%')->orWhere('key', 'like', 'tf-%'))
            ->update(['source' => 'system']);

        Schema::table('question_answers', function (Blueprint $table): void {
            $table->index(['question_id', 'correct']);
        });
    }

    public function down(): void
    {
        Schema::table('question_answers', function (Blueprint $table): void {
            $table->dropIndex(['question_id', 'correct']);
        });

        Schema::table('questions', function (Blueprint $table): void {
            $table->dropIndex(['source']);
            $table->dropConstrainedForeignId('updated_by');
            $table->dropConstrainedForeignId('created_by');
            $table->dropColumn('source');
        });
    }
};
