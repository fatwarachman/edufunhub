<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('subjects', function (Blueprint $table): void {
            $table->id();
            $table->string('key', 30)->unique();
            $table->string('name_id', 60);
            $table->string('name_en', 60)->nullable();
            $table->string('icon', 30)->default('book-open');
            $table->string('color', 7)->default('#ffd93d');
            $table->string('ai_hint', 200)->nullable();
            $table->unsignedSmallInteger('sort_order')->default(0);
            $table->boolean('is_active')->default(true);
            $table->boolean('is_system')->default(false);
            $table->foreignId('created_by')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamps();

            $table->index(['is_active', 'sort_order']);
        });

        $now = now();
        $subjects = [
            ['key' => 'math', 'name_id' => 'Matematika', 'name_en' => 'Maths', 'icon' => 'calculator', 'color' => '#ffd93d', 'ai_hint' => 'Matematika (mathematics)'],
            ['key' => 'science', 'name_id' => 'IPA', 'name_en' => 'Science', 'icon' => 'flask', 'color' => '#5ad1a6', 'ai_hint' => 'IPA (natural science)'],
            ['key' => 'language', 'name_id' => 'Bahasa Indonesia', 'name_en' => 'Indonesian', 'icon' => 'book-open', 'color' => '#ff9ecf', 'ai_hint' => 'Bahasa Indonesia'],
            ['key' => 'social', 'name_id' => 'IPS', 'name_en' => 'Social studies', 'icon' => 'globe', 'color' => '#8fb8ff', 'ai_hint' => 'IPS (social studies: history, geography, economy)'],
            ['key' => 'english', 'name_id' => 'Bahasa Inggris', 'name_en' => 'English', 'icon' => 'languages', 'color' => '#7dd3fc', 'ai_hint' => 'Bahasa Inggris (English as a foreign language)'],
            ['key' => 'civics', 'name_id' => 'PPKn', 'name_en' => 'Civics', 'icon' => 'landmark', 'color' => '#ff8a5c', 'ai_hint' => 'PPKn / Pancasila (civics)'],
        ];

        foreach ($subjects as $index => $subject) {
            DB::table('subjects')->insert([
                ...$subject,
                'sort_order' => ($index + 1) * 10,
                'is_active' => true,
                'is_system' => true,
                'created_at' => $now,
                'updated_at' => $now,
            ]);
        }
    }

    public function down(): void
    {
        Schema::dropIfExists('subjects');
    }
};
