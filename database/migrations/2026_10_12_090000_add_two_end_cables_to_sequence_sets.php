<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * Two-end cables for Order Rush: a set may name two connector ends (a patch
 * cable crimped on both sides) and holds end A followed by end B. Seeds the
 * straight (T568B ↔ T568B) and crossover (T568B ↔ T568A) sets, mirroring
 * Go orderrush.BuiltinSets.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('sequence_sets', function (Blueprint $table): void {
            $table->json('ends')->nullable()->after('items');
        });

        $now = now();
        foreach (require database_path('data/sequence_sets_two_end.php') as $set) {
            if (DB::table('sequence_sets')->where('key', $set['key'])->exists()) {
                continue;
            }
            DB::table('sequence_sets')->insert([
                ...$set,
                'items' => json_encode($set['items'], JSON_UNESCAPED_UNICODE),
                'ends' => json_encode($set['ends'], JSON_UNESCAPED_UNICODE),
                'is_active' => true,
                'created_at' => $now,
                'updated_at' => $now,
            ]);
        }
    }

    public function down(): void
    {
        $keys = array_column(require database_path('data/sequence_sets_two_end.php'), 'key');
        DB::table('sequence_sets')->whereIn('key', $keys)->delete();

        Schema::table('sequence_sets', function (Blueprint $table): void {
            $table->dropColumn('ends');
        });
    }
};
