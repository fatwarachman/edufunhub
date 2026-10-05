<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('sequence_sets', function (Blueprint $table): void {
            $table->id();
            $table->string('key', 40)->unique();
            $table->string('category', 40);
            $table->string('kind', 10);
            $table->string('title_id', 120);
            $table->string('title_en', 120)->nullable();
            $table->string('description_id', 200)->nullable();
            $table->string('description_en', 200)->nullable();
            $table->json('items');
            $table->unsignedSmallInteger('sort_order')->default(0);
            $table->boolean('is_active')->default(true);
            $table->foreignId('created_by')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamps();

            $table->index(['is_active', 'sort_order']);
        });

        Schema::create('sequence_attempts', function (Blueprint $table): void {
            $table->id();
            $table->foreignId('game_history_id')->constrained()->cascadeOnDelete();
            $table->foreignId('user_id')->constrained()->cascadeOnDelete();
            $table->string('set_key', 40);
            $table->string('category', 40);
            $table->unsignedSmallInteger('attempts');
            $table->unsignedSmallInteger('solved');
            $table->unsignedSmallInteger('wrong');
            $table->unsignedInteger('total_ms');
            $table->json('slot_errors');
            $table->timestamp('played_at');
            $table->timestamps();

            $table->index(['set_key', 'played_at']);
            $table->index(['category', 'played_at']);
        });

        $now = now();
        foreach (require database_path('data/sequence_sets.php') as $index => $set) {
            DB::table('sequence_sets')->insert([
                ...$set,
                'items' => json_encode($set['items'], JSON_UNESCAPED_UNICODE),
                'sort_order' => ($index + 1) * 10,
                'is_active' => true,
                'created_at' => $now,
                'updated_at' => $now,
            ]);
        }
    }

    public function down(): void
    {
        Schema::dropIfExists('sequence_attempts');
        Schema::dropIfExists('sequence_sets');
    }
};
