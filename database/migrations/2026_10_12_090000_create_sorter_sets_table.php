<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('sorter_sets', function (Blueprint $table): void {
            $table->id();
            $table->string('key', 40)->unique();
            $table->string('title_id', 120);
            $table->string('title_en', 120)->nullable();
            $table->string('description_id', 200)->nullable();
            $table->string('description_en', 200)->nullable();
            $table->json('bins');
            $table->json('items');
            $table->unsignedSmallInteger('sort_order')->default(0);
            $table->boolean('is_active')->default(true);
            $table->foreignId('created_by')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamps();

            $table->index(['is_active', 'sort_order']);
        });

        $now = now();
        foreach (require database_path('data/sorter_sets.php') as $index => $set) {
            DB::table('sorter_sets')->insert([
                ...$set,
                'bins' => json_encode($set['bins'], JSON_UNESCAPED_UNICODE),
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
        Schema::dropIfExists('sorter_sets');
    }
};
