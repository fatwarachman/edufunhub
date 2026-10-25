<?php

namespace Database\Factories;

use App\Models\QuestionBlueprint;
use Illuminate\Database\Eloquent\Factories\Factory;

/**
 * @extends Factory<QuestionBlueprint>
 */
class QuestionBlueprintFactory extends Factory
{
    /**
     * @return array<string, mixed>
     */
    public function definition(): array
    {
        return [
            'title' => 'Kisi-kisi '.fake()->words(2, true),
            'subject_key' => null,
            'original_name' => 'kisi-kisi.txt',
            'path' => QuestionBlueprint::FOLDER.'/'.fake()->uuid().'.txt',
            'extension' => 'txt',
            'size' => 1200,
            'content' => "Indikator 1: menentukan ide pokok paragraf.\nIndikator 2: menyimpulkan isi teks.",
            'is_active' => true,
        ];
    }

    public function inactive(): static
    {
        return $this->state(['is_active' => false]);
    }
}
