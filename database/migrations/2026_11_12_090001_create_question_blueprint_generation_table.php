<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * An AI request may follow several question blueprints at once. The old
     * `question_generations.blueprint_id` stays as the first one picked.
     */
    public function up(): void
    {
        Schema::create('question_blueprint_generation', function (Blueprint $table): void {
            $table->foreignId('generation_id')->constrained('question_generations')->cascadeOnDelete();
            $table->foreignId('blueprint_id')->constrained('question_blueprints')->cascadeOnDelete();
            $table->unsignedTinyInteger('position')->default(0);
            $table->primary(['generation_id', 'blueprint_id']);
            $table->index('blueprint_id');
        });

        DB::table('question_generations')->whereNotNull('blueprint_id')->orderBy('id')->chunkById(500, function ($rows): void {
            DB::table('question_blueprint_generation')->insert($rows->map(fn (object $row): array => [
                'generation_id' => $row->id,
                'blueprint_id' => $row->blueprint_id,
                'position' => 0,
            ])->all());
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('question_blueprint_generation');
    }
};
